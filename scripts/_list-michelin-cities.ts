import dotenv from "dotenv";
dotenv.config({ path: "apps/web/.env" });
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../packages/db/src/schema.js";

const ALGOLIA_APP_ID = "8NVHRD7ONV";
const ALGOLIA_SEARCH_KEY = "3222e669cf890dc73fa5f38241117ba5";
const ALGOLIA_ENDPOINT = `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/*/queries`;

async function main() {
  // Query Algolia for facet values on city.slug
  const res = await fetch(ALGOLIA_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Algolia-Application-Id": ALGOLIA_APP_ID,
      "X-Algolia-API-Key": ALGOLIA_SEARCH_KEY,
      Referer: "https://guide.michelin.com/",
      Origin: "https://guide.michelin.com",
    },
    body: JSON.stringify({
      requests: [
        {
          indexName: "prod-restaurants-en",
          params: "hitsPerPage=0&facets=city.slug&maxValuesPerFacet=1000&filters=status:Published",
        },
      ],
    }),
  });

  const data = await res.json();
  const facets: Record<string, number> = data.results[0]?.facets?.["city.slug"] || {};

  // Sort by count descending
  const sorted = Object.entries(facets).sort((a, b) => b[1] - a[1]);

  console.log(`Found ${sorted.length} Michelin city slugs:\n`);

  // Load our cities for matching
  if (process.env.DATABASE_URL) {
    const sql = neon(process.env.DATABASE_URL);
    const db = drizzle(sql, { schema });
    const cities = await db.select().from(schema.cities);

    console.log("Slug".padEnd(40) + "Count".padEnd(8) + "Our City?");
    console.log("-".repeat(70));

    for (const [slug, count] of sorted) {
      const match = cities.find(
        (c) => c.name.toLowerCase().replace(/\s+/g, "-") === slug ||
               c.michelinCitySlug === slug
      );
      const marker = match ? `✓ ${match.name} (id=${match.id})` : "";
      console.log(`${slug.padEnd(40)}${String(count).padEnd(8)}${marker}`);
    }
  } else {
    for (const [slug, count] of sorted) {
      console.log(`${slug.padEnd(40)}${count}`);
    }
  }
}

main().catch(console.error);
