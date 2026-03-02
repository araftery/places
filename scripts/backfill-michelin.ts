/**
 * One-time script: Pull all Michelin restaurants for a city and match them
 * against existing places in the database. For matches, upserts a michelin
 * rating (same data that initiate-coverage would produce).
 *
 * Usage:
 *   pnpm tsx scripts/backfill-michelin.ts [--city-slug new-york] [--dry-run]
 *
 * Loads DATABASE_URL from apps/web/.env automatically.
 */

import dotenv from "dotenv";
dotenv.config({ path: "apps/web/.env" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, and } from "drizzle-orm";
import * as schema from "../packages/db/src/schema.js";
import { createMichelinClient } from "../packages/clients/src/michelin/index.js";

// ── Haversine distance ──────────────────────────────────────────
function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Normalize name for fuzzy matching ──────────────────────────
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return true;
  // One contains the other
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}

// ── Build distinction notes (mirrors initiate-coverage) ────────
function buildNotes(hit: {
  stars: number;
  distinction: string;
  greenStar: boolean;
}): string {
  const parts: string[] = [];
  if (hit.stars > 0) {
    parts.push(`${hit.stars} Michelin Star${hit.stars > 1 ? "s" : ""}`);
  } else if (hit.distinction === "BIB_GOURMAND" || hit.distinction === "bib_gourmand") {
    parts.push("Bib Gourmand");
  } else {
    parts.push("Michelin Selected");
  }
  if (hit.greenStar) parts.push("Green Star");
  return parts.join(", ");
}

const MAX_DISTANCE_METERS = 200;

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const citySlugIndex = args.indexOf("--city-slug");
  const citySlug =
    citySlugIndex >= 0 ? args[citySlugIndex + 1] : "new-york";

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);
  const db = drizzle(sql, { schema });
  const client = createMichelinClient();

  // 1. Find the city in our DB
  const allCities = await db.select().from(schema.cities);
  const city = allCities.find(
    (c) =>
      c.michelinCitySlug === citySlug ||
      c.name.toLowerCase().replace(/\s+/g, "-") === citySlug
  );

  if (!city) {
    console.error(
      `No city found with michelinCitySlug="${citySlug}". Available cities:`,
      allCities.map((c) => `${c.name} (michelin: ${c.michelinCitySlug})`).join(", ")
    );
    process.exit(1);
  }

  console.log(`City: ${city.name} (id=${city.id}, michelinSlug="${citySlug}")`);
  if (dryRun) console.log("DRY RUN — no database writes\n");

  // 2. Load all existing places for this city
  const existingPlaces = await db
    .select()
    .from(schema.places)
    .where(eq(schema.places.cityId, city.id));

  console.log(`Found ${existingPlaces.length} existing places in ${city.name}\n`);

  // Load existing michelin ratings to avoid duplicates
  const existingMichelinRatings = new Set<number>();
  const allRatings = await db
    .select()
    .from(schema.placeRatings)
    .where(eq(schema.placeRatings.source, "michelin"));

  for (const r of allRatings) {
    existingMichelinRatings.add(r.placeId);
  }

  // 3. Fetch ALL Michelin restaurants for this city, paginating
  console.log("Fetching Michelin restaurants...");
  let allRestaurants: Awaited<
    ReturnType<typeof client.listRestaurants>
  >["restaurants"] = [];
  let page = 0;
  let totalPages = 1;

  while (page < totalPages) {
    const result = await client.listRestaurants(citySlug, {
      page,
      hitsPerPage: 100,
    });
    allRestaurants = allRestaurants.concat(result.restaurants);
    totalPages = result.totalPages;
    page++;
    process.stdout.write(`  Page ${page}/${totalPages} (${allRestaurants.length} so far)\r`);
  }
  console.log(`\nFetched ${allRestaurants.length} Michelin restaurants\n`);

  // 4. Match each Michelin restaurant to existing places
  let matched = 0;
  let alreadyHadRating = 0;
  let noMatch = 0;

  const stats = {
    "3 Stars": 0,
    "2 Stars": 0,
    "1 Star": 0,
    "Bib Gourmand": 0,
    Selected: 0,
  };

  for (const mich of allRestaurants) {
    // Count distinctions
    if (mich.stars === 3) stats["3 Stars"]++;
    else if (mich.stars === 2) stats["2 Stars"]++;
    else if (mich.stars === 1) stats["1 Star"]++;
    else if (mich.distinction === "BIB_GOURMAND") stats["Bib Gourmand"]++;
    else stats["Selected"]++;

    if (mich.lat == null || mich.lng == null) continue;

    // Find closest place within MAX_DISTANCE_METERS with a name match
    let bestPlace: (typeof existingPlaces)[number] | null = null;
    let bestDist = Infinity;

    for (const place of existingPlaces) {
      const dist = haversineMeters(mich.lat, mich.lng, place.lat, place.lng);
      if (dist <= MAX_DISTANCE_METERS && dist < bestDist) {
        if (namesMatch(mich.name, place.name)) {
          bestPlace = place;
          bestDist = dist;
        }
      }
    }

    if (!bestPlace) {
      noMatch++;
      continue;
    }

    // Already has a michelin rating
    if (existingMichelinRatings.has(bestPlace.id)) {
      alreadyHadRating++;
      continue;
    }

    const notes = buildNotes(mich);
    const ratingUrl = `https://guide.michelin.com${mich.url}`;

    console.log(
      `  MATCH: "${mich.name}" → "${bestPlace.name}" (${Math.round(bestDist)}m) — ${notes}`
    );

    if (!dryRun) {
      // Upsert rating
      const existing = await db
        .select()
        .from(schema.placeRatings)
        .where(
          and(
            eq(schema.placeRatings.placeId, bestPlace.id),
            eq(schema.placeRatings.source, "michelin")
          )
        );

      const ratingData = {
        source: "michelin" as const,
        rating: mich.stars > 0 ? mich.stars : null,
        ratingMax: mich.stars > 0 ? 3 : null,
        notes,
        reviewCount: null,
        ratingUrl,
        reviewDate: null,
        externalId: mich.objectID,
        lastFetched: new Date(),
      };

      if (existing.length > 0) {
        await db
          .update(schema.placeRatings)
          .set(ratingData)
          .where(eq(schema.placeRatings.id, existing[0].id));
      } else {
        await db.insert(schema.placeRatings).values({
          placeId: bestPlace.id,
          ...ratingData,
        });
      }

      // Upsert audit record
      const existingAudit = await db
        .select()
        .from(schema.placeAudits)
        .where(
          and(
            eq(schema.placeAudits.placeId, bestPlace.id),
            eq(schema.placeAudits.provider, "michelin")
          )
        );

      const nextAuditAt = new Date();
      nextAuditAt.setDate(nextAuditAt.getDate() + 30);

      const auditData = {
        externalId: mich.objectID,
        lastAuditedAt: new Date(),
        nextAuditAt,
        status: "success",
        error: null,
      };

      if (existingAudit.length > 0) {
        await db
          .update(schema.placeAudits)
          .set(auditData)
          .where(eq(schema.placeAudits.id, existingAudit[0].id));
      } else {
        await db.insert(schema.placeAudits).values({
          placeId: bestPlace.id,
          provider: "michelin",
          ...auditData,
        });
      }
    }

    matched++;
    existingMichelinRatings.add(bestPlace.id);
  }

  console.log(`\n--- Summary ---`);
  console.log(`Michelin restaurants: ${allRestaurants.length}`);
  console.log(
    `  ${stats["3 Stars"]} × 3 Stars, ${stats["2 Stars"]} × 2 Stars, ${stats["1 Star"]} × 1 Star`
  );
  console.log(
    `  ${stats["Bib Gourmand"]} × Bib Gourmand, ${stats["Selected"]} × Selected`
  );
  console.log(`Matched to existing places: ${matched}`);
  console.log(`Already had Michelin rating: ${alreadyHadRating}`);
  console.log(`No match: ${noMatch}`);
  if (dryRun) console.log(`\n(Dry run — no changes written)`);
}

main().catch(console.error);
