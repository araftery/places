/**
 * Live test for Google Places provider.
 * Calls the real Google Places API — no DB writes.
 *
 * Usage: npx tsx src/live/google.live.ts
 * Requires: GOOGLE_PLACES_API_KEY env var
 */
import "dotenv/config";
import { createGoogleClient } from "@places/clients";

async function main() {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.error("Missing GOOGLE_PLACES_API_KEY");
    process.exit(1);
  }

  const client = createGoogleClient({ apiKey });

  // Step 1: Search to get a fresh place ID
  const query = "Joe's Pizza New York";
  console.log(`\nSearching Google Places for: "${query}"\n`);

  const results = await client.search(query, { lat: 40.7308, lng: -73.9973 });
  console.log(`Found ${results.length} results:`);
  for (const r of results) {
    console.log(`  - ${r.name} (id: ${r.externalId})`);
  }

  if (results.length === 0) {
    console.error("No results found, cannot test getPlaceDetails");
    process.exit(1);
  }

  // Step 2: Look up the first result
  const placeId = results[0].externalId;
  console.log(`\nLooking up Google Place: ${placeId}\n`);

  const details = await client.getPlaceDetails(placeId);

  console.log("Result:", JSON.stringify(details, null, 2));
  console.log("\nSummary:");
  console.log("  Name:", details.displayName?.text ?? "N/A");
  console.log("  Rating:", details.rating ?? "N/A");
  console.log("  Reviews:", details.userRatingCount ?? 0);
  console.log("  Status:", details.businessStatus ?? "N/A");
  console.log("  Has hours:", !!details.regularOpeningHours);
}

main().catch((err) => {
  console.error("Live test failed:", err);
  process.exit(1);
});
