/**
 * Live test for Beli provider.
 * Calls the real Beli API — no DB writes.
 *
 * Usage: npx tsx src/live/beli.live.ts
 * Requires: BELI_PHONE_NUMBER, BELI_PASSWORD, BELI_USER_ID env vars
 */
import "dotenv/config";
import { createBeliClient } from "@places/clients";

async function main() {
  const { BELI_PHONE_NUMBER, BELI_PASSWORD, BELI_USER_ID } = process.env;
  if (!BELI_PHONE_NUMBER || !BELI_PASSWORD || !BELI_USER_ID) {
    console.error("Missing BELI_PHONE_NUMBER, BELI_PASSWORD, or BELI_USER_ID");
    process.exit(1);
  }

  const client = createBeliClient({
    phoneNumber: BELI_PHONE_NUMBER,
    password: BELI_PASSWORD,
    userId: BELI_USER_ID,
  });

  const query = "Di Fara Pizza";
  console.log(`\nSearching Beli for: "${query}"\n`);

  const results = await client.search(query, {
    city: "New York",
    lat: 40.625,
    lng: -73.9614,
  });

  console.log(`Found ${results.length} results:`);
  for (const r of results) {
    console.log(`  - ${r.name} (id: ${r.externalId}, rating: ${r.rating})`);
  }

  if (results.length > 0) {
    const first = results[0];
    console.log(`\nLooking up: ${first.externalId}\n`);
    const details = await client.lookup(first.externalId);
    console.log("Details:", JSON.stringify(details, null, 2));
  }
}

main().catch((err) => {
  console.error("Live test failed:", err);
  process.exit(1);
});
