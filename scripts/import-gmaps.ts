/**
 * Bulk import places from a pre-processed JSON file.
 *
 * Input format: array of objects (see scripts/import-format-sample.json):
 *   { googlePlaceId, tags, cuisines, placeType, lists, skip }
 *
 * Usage:
 *   pnpm tsx scripts/import-gmaps.ts <input.json> [--skip-triggers]
 *   pnpm tsx scripts/import-gmaps.ts <input.json> --dry-run
 *   pnpm tsx scripts/import-gmaps.ts --triggers-only
 *   pnpm tsx scripts/import-gmaps.ts --check-triggers
 *   pnpm tsx scripts/import-gmaps.ts --watch-triggers
 *   pnpm tsx scripts/import-gmaps.ts --retry-failed
 *
 * Requires: DATABASE_URL, GOOGLE_PLACES_API_KEY (not required for --triggers-only, --check-triggers, --watch-triggers, --retry-failed)
 */

import fs from "fs";
import path from "path";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, inArray } from "drizzle-orm";
import { createGoogleClient, mapPriceLevel } from "@places/clients/google";
import type { GooglePlaceResult } from "@places/clients/google";
import { createInfatuationClient } from "@places/clients/infatuation";
import { tasks, runs } from "@trigger.dev/sdk";
import * as schema from "../packages/db/src/schema.js";

// ── Types ────────────────────────────────────────────────────────

interface InputPlace {
  googlePlaceId: string | null;
  tags?: string[];
  cuisines?: string[];
  placeType?: string | null;
  lists?: string[];
  skip?: boolean;
  gmapsLists?: string[]
}

interface ProgressFile {
  processedIds: string[];
  cityDecisions: Record<string, number | null>;
  importedPlaceIds: number[];
  triggerRunMap: Record<number, string>; // placeId → Trigger.dev runId
}

// ── Google → Place mapping (copied from apps/web/src/lib/google-places.ts
//    to avoid Next.js path alias issues) ──────────────────────────

const GOOGLE_TO_DEFAULT_PLACE_TYPE: Record<string, string> = {
  restaurant: "casual_dining",
  bar: "dive_bar",
  cafe: "cafe",
  bakery: "bakery",
  night_club: "night_club",
  coffee_shop: "cafe",
  pub: "pub",
  wine_bar: "wine_bar",
  brewery: "brewery",
  cocktail_bar: "cocktail_bar",
  tourist_attraction: "tourist_site",
  museum: "tourist_site",
  art_gallery: "tourist_site",
  amusement_park: "tourist_site",
  aquarium: "tourist_site",
  zoo: "tourist_site",
  landmark: "tourist_site",
  historical_landmark: "tourist_site",
  national_park: "tourist_site",
  performing_arts_theater: "tourist_site",
  store: "retail",
  shopping_mall: "retail",
  book_store: "retail",
  clothing_store: "retail",
  grocery_store: "retail",
  supermarket: "retail",
  ice_cream_shop: "casual_dining",
  sandwich_shop: "deli",
  pizza_restaurant: "casual_dining",
  steak_house: "casual_dining",
  seafood_restaurant: "casual_dining",
  meal_takeaway: "fast_casual",
  meal_delivery: "fast_casual",
};

function mapGoogleDetailsToPlace(details: GooglePlaceResult) {
  const components = details.addressComponents || [];
  const neighborhood =
    components.find((c) => c.types.includes("neighborhood"))?.longText || null;
  const sublocality =
    components.find((c) => c.types.includes("sublocality"))?.longText || null;
  const locality =
    components.find((c) => c.types.includes("locality"))?.longText || null;
  const postalTown =
    components.find((c) => c.types.includes("postal_town"))?.longText || null;
  const adminLevel1 =
    components.find((c) => c.types.includes("administrative_area_level_1"))
      ?.longText || null;
  const city =
    locality || postalTown || (sublocality ? adminLevel1 : null) || null;

  return {
    googlePlaceId: details.id,
    name: details.displayName.text,
    address: details.formattedAddress,
    lat: details.location.latitude,
    lng: details.location.longitude,
    websiteUrl: details.websiteUri || null,
    phone: details.nationalPhoneNumber || null,
    priceRange: mapPriceLevel(details.priceLevel),
    hoursJson: details.regularOpeningHours || null,
    googleRating: details.rating || null,
    googleRatingCount: details.userRatingCount || null,
    primaryType: details.primaryType || null,
    googlePlaceType: details.primaryType || null,
    types: details.types || [],
    neighborhood: neighborhood || sublocality || null,
    city,
    businessStatus: details.businessStatus || null,
  };
}

// ── Helpers ──────────────────────────────────────────────────────

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const PROGRESS_PATH = path.join(__dirname, ".import-progress.json");

function loadProgress(): ProgressFile {
  if (fs.existsSync(PROGRESS_PATH)) {
    const data = JSON.parse(fs.readFileSync(PROGRESS_PATH, "utf-8"));
    if (!data.triggerRunMap) data.triggerRunMap = {};
    return data;
  }
  return { processedIds: [], cityDecisions: {}, importedPlaceIds: [], triggerRunMap: {} };
}

let _dryRun = false;

function saveProgress(progress: ProgressFile) {
  if (_dryRun) return;
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2));
}

// ── Trigger-only modes ───────────────────────────────────────────

const FAILED_STATUSES = new Set([
  "FAILED",
  "CRASHED",
  "SYSTEM_FAILURE",
  "TIMED_OUT",
  "EXPIRED",
]);

const TERMINAL_STATUSES = new Set([
  "COMPLETED",
  "FAILED",
  "CRASHED",
  "SYSTEM_FAILURE",
  "TIMED_OUT",
  "EXPIRED",
  "CANCELED",
]);

const IN_FLIGHT_STATUSES = new Set([
  "PENDING_VERSION",
  "QUEUED",
  "DEQUEUED",
  "EXECUTING",
  "WAITING",
  "DELAYED",
]);

interface PollResult {
  statusCounts: Record<string, number>;
  failedRuns: { placeId: number; name: string; runId: string; status: string; error?: string }[];
  total: number;
  completed: number;
  failed: number;
  inFlight: number;
}

async function pollTriggerStatuses(
  entries: [string, string][],
  placeNameMap: Map<number, string>,
  showProgress = false
): Promise<PollResult> {
  const statusCounts: Record<string, number> = {};
  const failedRuns: PollResult["failedRuns"] = [];
  let checked = 0;

  const batchSize = 50;
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    for (const [placeIdStr, runId] of batch) {
      try {
        const run = await runs.retrieve(runId);
        const status = run.status;
        statusCounts[status] = (statusCounts[status] || 0) + 1;

        if (FAILED_STATUSES.has(status)) {
          failedRuns.push({
            placeId: Number(placeIdStr),
            name: placeNameMap.get(Number(placeIdStr)) || "?",
            runId,
            status,
            error: run.error?.message,
          });
        }
      } catch (err: any) {
        statusCounts["UNKNOWN"] = (statusCounts["UNKNOWN"] || 0) + 1;
      }
      checked++;
    }
    if (showProgress) {
      process.stdout.write(`\r  Fetching run statuses... ${checked}/${entries.length}`);
    }
    if (i + batchSize < entries.length) {
      await sleep(500);
    }
  }
  if (showProgress) {
    process.stdout.write("\r" + " ".repeat(60) + "\r");
  }

  const total = entries.length;
  const completed = statusCounts["COMPLETED"] || 0;
  const failed = Object.entries(statusCounts)
    .filter(([s]) => FAILED_STATUSES.has(s))
    .reduce((sum, [, c]) => sum + c, 0);
  const inFlight = Object.entries(statusCounts)
    .filter(([s]) => IN_FLIGHT_STATUSES.has(s))
    .reduce((sum, [, c]) => sum + c, 0);

  return { statusCounts, failedRuns, total, completed, failed, inFlight };
}

function printStatusReport(result: PollResult, elapsed?: string) {
  const { statusCounts, failedRuns, total } = result;
  const header = elapsed ? `Trigger Status Report (${elapsed})` : "Trigger Status Report";
  console.log(header);
  console.log("═".repeat(40));
  for (const [status, count] of Object.entries(statusCounts).sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`${status.padEnd(20)} ${count.toLocaleString()}`);
  }
  console.log("═".repeat(40));
  console.log(`TOTAL${" ".repeat(15)} ${total.toLocaleString()}`);

  if (failedRuns.length > 0) {
    console.log(`\nFailed runs:`);
    for (const f of failedRuns) {
      console.log(
        `  - placeId ${f.placeId} "${f.name}" — ${f.runId} — ${f.status}${f.error ? `: ${f.error}` : ""}`
      );
    }
  }
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

function progressBar(done: number, total: number, width = 30): string {
  const pct = total === 0 ? 1 : done / total;
  const filled = Math.round(pct * width);
  return "█".repeat(filled) + "░".repeat(width - filled) + ` ${(pct * 100).toFixed(1)}%`;
}

async function checkTriggers(progress: ProgressFile) {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const entries = Object.entries(progress.triggerRunMap);
  if (entries.length === 0) {
    console.log("No triggered runs found in progress file.");
    return;
  }

  const sql = neon(process.env.DATABASE_URL);
  const db = drizzle(sql, { schema });

  const placeIds = entries.map(([id]) => Number(id));
  const places = await db
    .select({ id: schema.places.id, name: schema.places.name })
    .from(schema.places)
    .where(inArray(schema.places.id, placeIds));
  const placeNameMap = new Map(places.map((p) => [p.id, p.name]));

  console.log(`\nChecking ${entries.length} triggered runs...\n`);

  const result = await pollTriggerStatuses(
    entries as [string, string][],
    placeNameMap
  );

  printStatusReport(result);
}

async function watchTriggers(progress: ProgressFile) {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const entries = Object.entries(progress.triggerRunMap);
  if (entries.length === 0) {
    console.log("No triggered runs found in progress file.");
    return;
  }

  const sql = neon(process.env.DATABASE_URL);
  const db = drizzle(sql, { schema });

  const placeIds = entries.map(([id]) => Number(id));
  const places = await db
    .select({ id: schema.places.id, name: schema.places.name })
    .from(schema.places)
    .where(inArray(schema.places.id, placeIds));
  const placeNameMap = new Map(places.map((p) => [p.id, p.name]));

  const total = entries.length;
  const pollIntervalMs = 15_000; // poll every 15s
  const startTime = Date.now();
  let pollCount = 0;

  console.log(`\nWatching ${total} triggered runs (polling every 15s, Ctrl+C to stop)...\n`);

  while (true) {
    pollCount++;
    const elapsed = formatDuration(Date.now() - startTime);

    const result = await pollTriggerStatuses(
      entries as [string, string][],
      placeNameMap,
      true
    );

    const done = result.completed + result.failed;
    const bar = progressBar(done, total);

    // Clear screen and reprint
    process.stdout.write("\x1B[2J\x1B[H");
    console.log(`Trigger Watch (poll #${pollCount}, elapsed ${elapsed})\n`);
    console.log(`  ${bar}  ${done}/${total} done`);
    console.log(
      `  ✓ ${result.completed} completed  ✗ ${result.failed} failed  ⋯ ${result.inFlight} in-flight\n`
    );

    // Per-status breakdown
    console.log("Status Breakdown");
    console.log("─".repeat(40));
    for (const [status, count] of Object.entries(result.statusCounts).sort(
      (a, b) => b[1] - a[1]
    )) {
      const icon = status === "COMPLETED" ? "✓" : FAILED_STATUSES.has(status) ? "✗" : "⋯";
      console.log(`  ${icon} ${status.padEnd(20)} ${count.toLocaleString()}`);
    }
    console.log("─".repeat(40));

    // Show recent failures
    if (result.failedRuns.length > 0) {
      console.log(`\nFailed (${result.failedRuns.length}):`);
      for (const f of result.failedRuns.slice(0, 10)) {
        console.log(
          `  - "${f.name}" (${f.placeId}) — ${f.status}${f.error ? `: ${f.error}` : ""}`
        );
      }
      if (result.failedRuns.length > 10) {
        console.log(`  ... and ${result.failedRuns.length - 10} more`);
      }
    }

    // ETA estimate based on completion rate
    if (result.inFlight > 0 && done > 0 && pollCount > 1) {
      const elapsedMs = Date.now() - startTime;
      const msPerItem = elapsedMs / done;
      const remaining = total - done;
      const etaMs = msPerItem * remaining;
      console.log(`\n  ETA: ~${formatDuration(etaMs)} remaining`);
    }

    // Done?
    if (result.inFlight === 0) {
      console.log(`\nAll runs finished in ${elapsed}.`);
      if (result.failedRuns.length > 0) {
        console.log(`Run --retry-failed to replay ${result.failedRuns.length} failures.`);
      }
      break;
    }

    await sleep(pollIntervalMs);
  }
}

async function retryFailed(progress: ProgressFile) {
  const entries = Object.entries(progress.triggerRunMap);
  if (entries.length === 0) {
    console.log("No triggered runs found in progress file.");
    return;
  }

  console.log(`\nChecking ${entries.length} runs for failures...\n`);

  const toReplay: { placeId: number; runId: string }[] = [];

  const batchSize = 50;
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    for (const [placeIdStr, runId] of batch) {
      try {
        const run = await runs.retrieve(runId);
        if (FAILED_STATUSES.has(run.status)) {
          toReplay.push({ placeId: Number(placeIdStr), runId });
        }
      } catch (err: any) {
        console.error(`  Error retrieving run ${runId}: ${err?.message}`);
      }
    }
    if (i + batchSize < entries.length) {
      await sleep(500);
    }
  }

  if (toReplay.length === 0) {
    console.log("No failed runs to retry.");
    return;
  }

  console.log(`Found ${toReplay.length} failed runs. Replaying...\n`);

  let replayed = 0;
  let replayErrors = 0;
  for (const { placeId, runId } of toReplay) {
    try {
      const result = await runs.replay(runId);
      progress.triggerRunMap[placeId] = result.id;
      replayed++;
    } catch (err: any) {
      console.error(`  Replay error for placeId ${placeId} (${runId}): ${err?.message}`);
      replayErrors++;
    }
  }

  saveProgress(progress);
  console.log(
    `\nReplayed ${replayed} runs, ${replayErrors} errors.`
  );
}

async function triggersOnly(progress: ProgressFile) {
  const untriggered = progress.importedPlaceIds.filter(
    (id) => !(id in progress.triggerRunMap)
  );

  if (untriggered.length === 0) {
    console.log("All imported places already have trigger runs.");
    return;
  }

  console.log(
    `\nTriggering initiate-coverage for ${untriggered.length} untriggered places...`
  );

  const batchSize = 20;
  let triggersSent = 0;
  let triggerErrors = 0;

  for (let i = 0; i < untriggered.length; i += batchSize) {
    const batch = untriggered.slice(i, i + batchSize);
    for (const placeId of batch) {
      try {
        const handle = await tasks.trigger(
          "initiate-coverage",
          { placeId },
          { tags: ["import:gmaps"] }
        );
        progress.triggerRunMap[placeId] = handle.id;
        triggersSent++;
      } catch (err: any) {
        console.error(
          `  Trigger error for placeId ${placeId}: ${err?.message}`
        );
        triggerErrors++;
      }
    }
    saveProgress(progress);
    if (i + batchSize < untriggered.length) {
      console.log(
        `  Sent ${Math.min(i + batchSize, untriggered.length)}/${untriggered.length}...`
      );
      await sleep(2000);
    }
  }

  console.log(
    `  Coverage triggers: ${triggersSent} sent, ${triggerErrors} errors`
  );
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();

  // Parse args
  const args = process.argv.slice(2);
  const skipTriggers = args.includes("--skip-triggers");
  const dryRun = args.includes("--dry-run");
  const checkTriggersMode = args.includes("--check-triggers");
  const watchTriggersMode = args.includes("--watch-triggers");
  const retryFailedMode = args.includes("--retry-failed");
  const triggersOnlyMode = args.includes("--triggers-only");
  const inputFile = args.find((a) => !a.startsWith("--"));

  // Handle trigger-management modes (no import needed)
  if (checkTriggersMode) {
    const progress = loadProgress();
    await checkTriggers(progress);
    return;
  }

  if (watchTriggersMode) {
    const progress = loadProgress();
    await watchTriggers(progress);
    return;
  }

  if (retryFailedMode) {
    const progress = loadProgress();
    await retryFailed(progress);
    return;
  }

  if (triggersOnlyMode) {
    const progress = loadProgress();
    await triggersOnly(progress);
    return;
  }

  if (!inputFile) {
    console.error(
      "Usage: pnpm tsx scripts/import-gmaps.ts <input.json> [--skip-triggers] [--dry-run]\n" +
        "       pnpm tsx scripts/import-gmaps.ts --triggers-only\n" +
        "       pnpm tsx scripts/import-gmaps.ts --check-triggers\n" +
        "       pnpm tsx scripts/import-gmaps.ts --watch-triggers\n" +
        "       pnpm tsx scripts/import-gmaps.ts --retry-failed"
    );
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    console.error("GOOGLE_PLACES_API_KEY is required");
    process.exit(1);
  }

  if (dryRun) {
    _dryRun = true;
    console.log("\n*** DRY RUN — no DB writes, no triggers ***\n");
  }

  // DB + Google client
  const sql = neon(process.env.DATABASE_URL);
  const db = drizzle(sql, { schema });
  const google = createGoogleClient({
    apiKey: process.env.GOOGLE_PLACES_API_KEY,
  });

  // Load input
  const inputPath = path.resolve(inputFile);
  if (!fs.existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    process.exit(1);
  }
  const inputPlaces: InputPlace[] = JSON.parse(
    fs.readFileSync(inputPath, "utf-8")
  );
  console.log(`Loaded ${inputPlaces.length} entries from ${inputFile}`);

  // Filter
  const validPlaces = inputPlaces.filter((p) => {
    if (p.skip) return false;
    if (!p.googlePlaceId) return false;
    return true;
  });
  const skippedCount = inputPlaces.length - validPlaces.length;
  const nullPlaceIdCount = inputPlaces.filter(
    (p) => !p.skip && !p.googlePlaceId
  ).length;
  const skipFlagCount = inputPlaces.filter((p) => p.skip).length;
  console.log(
    `  ${validPlaces.length} to process, ${skipFlagCount} skipped (skip flag), ${nullPlaceIdCount} skipped (null placeId)`
  );

  // Load progress
  const progress = loadProgress();
  const processedSet = new Set(progress.processedIds);
  console.log(`  ${processedSet.size} already processed (from progress file)`);

  // Load DB state
  const existingPlaces = await db.select({ googlePlaceId: schema.places.googlePlaceId }).from(schema.places);
  const existingIds = new Set(
    existingPlaces
      .map((p) => p.googlePlaceId)
      .filter((id): id is string => id !== null)
  );
  console.log(`  ${existingIds.size} places already in DB`);

  let allCities = await db.select().from(schema.cities);
  const allTags = await db.select().from(schema.tags);
  const allCuisines = await db.select().from(schema.cuisines);
  const allLists = await db.select().from(schema.lists);

  const tagMap = new Map(allTags.map((t) => [t.name, t.id]));
  const cuisineMap = new Map(allCuisines.map((c) => [c.name, c.id]));
  const listMap = new Map(allLists.map((l) => [l.name, l.id]));

  // Collect all unique tags/cuisines/lists needed
  const neededTags = new Set<string>();
  const neededCuisines = new Set<string>();
  const neededLists = new Set<string>();
  for (const p of validPlaces) {
    for (const t of p.tags || []) neededTags.add(t);
    for (const c of p.cuisines || []) neededCuisines.add(c);
    for (const l of p.lists || []) neededLists.add(l);
  }

  // Create missing tags
  if (!dryRun) {
    for (const name of neededTags) {
      if (!tagMap.has(name)) {
        const [created] = await db
          .insert(schema.tags)
          .values({ name })
          .onConflictDoNothing()
          .returning();
        if (created) {
          tagMap.set(name, created.id);
          console.log(`  Created tag: ${name}`);
        } else {
          const [existing] = await db
            .select()
            .from(schema.tags)
            .where(eq(schema.tags.name, name));
          if (existing) tagMap.set(name, existing.id);
        }
      }
    }

    // Create missing cuisines
    for (const name of neededCuisines) {
      if (!cuisineMap.has(name)) {
        const [created] = await db
          .insert(schema.cuisines)
          .values({ name })
          .onConflictDoNothing()
          .returning();
        if (created) {
          cuisineMap.set(name, created.id);
          console.log(`  Created cuisine: ${name}`);
        } else {
          const [existing] = await db
            .select()
            .from(schema.cuisines)
            .where(eq(schema.cuisines.name, name));
          if (existing) cuisineMap.set(name, existing.id);
        }
      }
    }

    // Create missing lists
    for (const name of neededLists) {
      if (!listMap.has(name)) {
        const [created] = await db
          .insert(schema.lists)
          .values({ name })
          .onConflictDoNothing()
          .returning();
        if (created) {
          listMap.set(name, created.id);
          console.log(`  Created list: ${name}`);
        } else {
          const [existing] = await db
            .select()
            .from(schema.lists)
            .where(eq(schema.lists.name, name));
          if (existing) listMap.set(name, existing.id);
        }
      }
    }
  } else {
    const missingTags = [...neededTags].filter((n) => !tagMap.has(n));
    const missingCuisines = [...neededCuisines].filter((n) => !cuisineMap.has(n));
    const missingLists = [...neededLists].filter((n) => !listMap.has(n));
    if (missingTags.length) console.log(`  Would create ${missingTags.length} tags: ${missingTags.join(", ")}`);
    if (missingCuisines.length) console.log(`  Would create ${missingCuisines.length} cuisines: ${missingCuisines.join(", ")}`);
    if (missingLists.length) console.log(`  Would create ${missingLists.length} lists: ${missingLists.join(", ")}`);
  }

  // Fetch Infatuation cities (for new city creation)
  let infCities: { name: string; slug: string }[] = [];
  if (!dryRun) {
    try {
      console.log("\nFetching Infatuation city list...");
      const infClient = createInfatuationClient();
      infCities = await infClient.listCities();
      console.log(`  Found ${infCities.length} Infatuation cities`);
    } catch (err) {
      console.warn("  Failed to fetch Infatuation cities:", err);
    }
  }

  // Stats
  const stats = {
    imported: 0,
    skippedProgress: 0,
    skippedExisting: 0,
    skippedClosed: 0,
    skippedGoogleError: 0,
    withTags: 0,
    withCuisines: 0,
    newCities: 0,
  };
  const closedPlaces: { name: string; id: string; city: string | null }[] = [];
  const errors: { id: string; name: string; error: string }[] = [];

  // ── Main loop ──────────────────────────────────────────────────

  console.log(`\nProcessing ${validPlaces.length} places...\n`);

  for (let i = 0; i < validPlaces.length; i++) {
    const entry = validPlaces[i];
    const googlePlaceId = entry.googlePlaceId!;
    const prefix = `[${i + 1}/${validPlaces.length}]`;

    // Skip if already processed in prior run
    if (processedSet.has(googlePlaceId)) {
      stats.skippedProgress++;
      continue;
    }

    // Skip if already in DB
    if (existingIds.has(googlePlaceId)) {
      console.log(`${prefix} SKIP (already in DB) ${googlePlaceId}`);
      stats.skippedExisting++;
      progress.processedIds.push(googlePlaceId);
      processedSet.add(googlePlaceId);
      saveProgress(progress);
      continue;
    }

    // Google Places API lookup
    let details: ReturnType<typeof mapGoogleDetailsToPlace>;
    try {
      const raw = await google.getPlaceDetails(googlePlaceId);
      details = mapGoogleDetailsToPlace(raw);
      await sleep(200); // rate limit ~5 req/s
    } catch (err: any) {
      const msg = err?.message || String(err);
      // Retry with backoff on 429
      if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
        console.log(`${prefix} Rate limited, backing off...`);
        await sleep(5000);
        try {
          const raw = await google.getPlaceDetails(googlePlaceId);
          details = mapGoogleDetailsToPlace(raw);
          await sleep(500);
        } catch (retryErr: any) {
          console.error(`${prefix} ERROR (retry failed) ${googlePlaceId}: ${retryErr?.message}`);
          errors.push({ id: googlePlaceId, name: "?", error: retryErr?.message || String(retryErr) });
          stats.skippedGoogleError++;
          progress.processedIds.push(googlePlaceId);
          processedSet.add(googlePlaceId);
          saveProgress(progress);
          continue;
        }
      } else {
        console.error(`${prefix} ERROR ${googlePlaceId}: ${msg}`);
        errors.push({ id: googlePlaceId, name: "?", error: msg });
        stats.skippedGoogleError++;
        progress.processedIds.push(googlePlaceId);
        processedSet.add(googlePlaceId);
        saveProgress(progress);
        continue;
      }
    }

    // Skip permanently closed
    if (details.businessStatus === "CLOSED_PERMANENTLY") {
      console.log(`${prefix} CLOSED ${details.name}`);
      closedPlaces.push({
        name: details.name,
        id: googlePlaceId,
        city: details.city,
      });
      stats.skippedClosed++;
      progress.processedIds.push(googlePlaceId);
      processedSet.add(googlePlaceId);
      saveProgress(progress);
      continue;
    }

    // Find closest city
    let cityId: number | null = null;
    let closestDist = Infinity;
    let closestCity: (typeof allCities)[number] | null = null;

    for (const city of allCities) {
      const d = haversineKm(details.lat, details.lng, city.lat, city.lng);
      if (d < closestDist) {
        closestDist = d;
        closestCity = city;
      }
    }

    if (closestCity && closestDist <= 50) {
      cityId = closestCity.id;
    } else if (dryRun) {
      const cityName = details.city || "Unknown";
      console.log(
        `${prefix} NOTE: no city within 50km for "${details.name}" in "${cityName}" — would auto-create`
      );
      cityId = null;
    } else {
      const cityName = details.city || "Unknown";
      // Check if we already created/resolved this city name
      if (cityName in progress.cityDecisions) {
        cityId = progress.cityDecisions[cityName];
      } else {
        // Auto-create the city
        const infMatch = infCities.find(
          (c) => c.name.toLowerCase() === cityName.toLowerCase()
        );
        const infatuationSlug = infMatch?.slug ?? null;

        const providers: string[] = ["google"];
        if (infatuationSlug) providers.push("infatuation");
        // Rough US check: lng between -130 and -60
        if (details.lng >= -130 && details.lng <= -60 && details.lat >= 24 && details.lat <= 50) {
          providers.push("beli");
        }

        const [newCity] = await db
          .insert(schema.cities)
          .values({
            name: cityName,
            country: "US", // will need manual fix for non-US
            lat: details.lat,
            lng: details.lng,
            providers,
            infatuationSlug,
          })
          .onConflictDoNothing()
          .returning();

        if (newCity) {
          cityId = newCity.id;
          allCities.push(newCity);
          stats.newCities++;
          console.log(`${prefix} Created city: ${cityName} (id=${newCity.id})`);
        } else {
          // Conflict — re-fetch
          const [existing] = await db
            .select()
            .from(schema.cities)
            .where(eq(schema.cities.name, cityName));
          if (existing) {
            cityId = existing.id;
          }
        }

        progress.cityDecisions[cityName] = cityId;
      }
    }

    // Determine place type: use input override, else derive from Google
    const placeType =
      entry.placeType ||
      (details.primaryType
        ? GOOGLE_TO_DEFAULT_PLACE_TYPE[details.primaryType] || null
        : null);

    const entryTags = entry.tags || [];
    const entryCuisines = entry.cuisines || [];
    const listNames = entry.gmapsLists || [];

    // ── Dry run: log what would happen, skip all writes ──
    if (dryRun) {
      stats.imported++;
      if (entryTags.length) stats.withTags++;
      if (entryCuisines.length) stats.withCuisines++;
      console.log(
        `${prefix} WOULD IMPORT ${details.name}` +
          (cityId ? ` (${allCities.find((c) => c.id === cityId)?.name})` : " (no city)") +
          (placeType ? ` [${placeType}]` : "") +
          (entryTags.length ? ` tags:[${entryTags.join(", ")}]` : "") +
          (entryCuisines.length ? ` cuisines:{${entryCuisines.join(", ")}}` : "") +
          (listNames.length ? ` lists:(${listNames.join(", ")})` : "") +
          (details.googleRating ? ` ★${details.googleRating}` : "")
      );
      continue;
    }

    // Build source string
    const source =
      listNames.length === 0
        ? "Imported from Google Maps"
        : listNames.length === 1
          ? `Imported from Maps list: ${listNames[0]}`
          : `Imported from Maps lists: ${listNames.join(", ")}`;

    // Insert place
    const [place] = await db
      .insert(schema.places)
      .values({
        name: details.name,
        address: details.address,
        lat: details.lat,
        lng: details.lng,
        cityId,
        neighborhood: details.neighborhood,
        placeType,
        googlePlaceType: details.googlePlaceType,
        priceRange: details.priceRange,
        websiteUrl: details.websiteUrl,
        phone: details.phone,
        hoursJson: details.hoursJson,
        source,
        googlePlaceId,
      })
      .onConflictDoNothing()
      .returning();

    if (!place) {
      // Race condition: place was inserted between our check and now
      console.log(`${prefix} SKIP (conflict) ${details.name}`);
      stats.skippedExisting++;
      progress.processedIds.push(googlePlaceId);
      processedSet.add(googlePlaceId);
      saveProgress(progress);
      continue;
    }

    // Insert tags
    if (entryTags.length > 0) {
      const tagRows = entryTags
        .map((name) => {
          const tagId = tagMap.get(name);
          return tagId ? { placeId: place.id, tagId } : null;
        })
        .filter((r): r is { placeId: number; tagId: number } => r !== null);

      if (tagRows.length > 0) {
        await db.insert(schema.placeTags).values(tagRows).onConflictDoNothing();
        stats.withTags++;
      }
    }

    // Insert cuisines
    if (entryCuisines.length > 0) {
      const cuisineRows = entryCuisines
        .map((name) => {
          const cuisineId = cuisineMap.get(name);
          return cuisineId ? { placeId: place.id, cuisineId } : null;
        })
        .filter(
          (r): r is { placeId: number; cuisineId: number } => r !== null
        );

      if (cuisineRows.length > 0) {
        await db
          .insert(schema.placeCuisines)
          .values(cuisineRows)
          .onConflictDoNothing();
        stats.withCuisines++;
      }
    }

    // Insert list memberships
    if (listNames.length > 0) {
      const listRows = listNames
        .map((name) => {
          const listId = listMap.get(name);
          return listId ? { placeId: place.id, listId } : null;
        })
        .filter(
          (r): r is { placeId: number; listId: number } => r !== null
        );

      if (listRows.length > 0) {
        await db
          .insert(schema.placeLists)
          .values(listRows)
          .onConflictDoNothing();
      }
    }

    // Insert Google rating
    if (details.googleRating !== null) {
      await db
        .insert(schema.placeRatings)
        .values({
          placeId: place.id,
          source: "google",
          externalId: googlePlaceId,
          rating: details.googleRating,
          ratingMax: 5,
          reviewCount: details.googleRatingCount,
          lastFetched: new Date(),
        })
        .onConflictDoNothing();
    }

    stats.imported++;
    progress.processedIds.push(googlePlaceId);
    progress.importedPlaceIds.push(place.id);
    processedSet.add(googlePlaceId);
    existingIds.add(googlePlaceId);
    saveProgress(progress);

    console.log(
      `${prefix} OK ${details.name}` +
        (cityId ? ` (${allCities.find((c) => c.id === cityId)?.name})` : "") +
        (entryTags.length ? ` [${entryTags.join(", ")}]` : "") +
        (entryCuisines.length ? ` {${entryCuisines.join(", ")}}` : "")
    );
  }

  // ── Trigger coverage jobs ────────────────────────────────────

  if (!skipTriggers && !dryRun && progress.importedPlaceIds.length > 0) {
    // Only trigger places that don't already have a run
    const untriggered = progress.importedPlaceIds.filter(
      (id) => !(id in progress.triggerRunMap)
    );

    if (untriggered.length > 0) {
      console.log(
        `\nTriggering initiate-coverage for ${untriggered.length} places...`
      );
      const batchSize = 20;
      let triggersSent = 0;
      let triggerErrors = 0;

      for (let i = 0; i < untriggered.length; i += batchSize) {
        const batch = untriggered.slice(i, i + batchSize);
        for (const placeId of batch) {
          try {
            const handle = await tasks.trigger(
              "initiate-coverage",
              { placeId },
              { tags: ["import:gmaps"] }
            );
            progress.triggerRunMap[placeId] = handle.id;
            triggersSent++;
          } catch (err: any) {
            console.error(
              `  Trigger error for placeId ${placeId}: ${err?.message}`
            );
            triggerErrors++;
          }
        }
        saveProgress(progress);
        if (i + batchSize < untriggered.length) {
          console.log(
            `  Sent ${Math.min(i + batchSize, untriggered.length)}/${untriggered.length}...`
          );
          await sleep(2000);
        }
      }

      console.log(
        `  Coverage triggers: ${triggersSent} sent, ${triggerErrors} errors`
      );
    } else {
      console.log("\nAll imported places already triggered.");
    }
  } else if (dryRun) {
    console.log("\n--dry-run: skipping triggers");
  } else if (skipTriggers) {
    console.log("\n--skip-triggers: skipping coverage jobs");
  }

  // ── Summary ────────────────────────────────────────────────────

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  const minutes = Math.floor(Number(elapsed) / 60);
  const seconds = Number(elapsed) % 60;

  console.log(`
${"═".repeat(48)}
${dryRun ? "DRY RUN" : "IMPORT"} COMPLETE (${minutes}m ${seconds}s)
${"═".repeat(48)}
Total entries:              ${inputPlaces.length.toLocaleString()}
Skipped (skip flag):        ${skipFlagCount.toLocaleString()}
Skipped (null placeId):     ${nullPlaceIdCount.toLocaleString()}
Skipped (prior run):        ${stats.skippedProgress.toLocaleString()}
Skipped (already in DB):    ${stats.skippedExisting.toLocaleString()}
Skipped (permanently closed): ${stats.skippedClosed.toLocaleString()}
Skipped (Google error):     ${stats.skippedGoogleError.toLocaleString()}

${dryRun ? "Would import" : "Imported"}:             ${stats.imported.toLocaleString()}
  With tags:                ${stats.withTags.toLocaleString()}
  With cuisines:            ${stats.withCuisines.toLocaleString()}

New cities created:         ${stats.newCities.toLocaleString()}
${"═".repeat(48)}`);

  if (closedPlaces.length > 0) {
    console.log("\nClosed places:");
    for (const p of closedPlaces) {
      console.log(`  - "${p.name}" (${p.id}) — ${p.city ?? "unknown city"}`);
    }
  }

  if (errors.length > 0) {
    console.log("\nErrors:");
    for (const e of errors) {
      console.log(`  - ${e.id} "${e.name}" — ${e.error}`);
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
