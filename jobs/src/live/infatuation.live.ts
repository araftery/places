/**
 * Live test for Infatuation provider.
 * Calls the real Infatuation API — no DB writes.
 *
 * Usage: npx tsx src/live/infatuation.live.ts
 * Optional: OXYLABS_USERNAME, OXYLABS_PASSWORD for proxy
 */
import "dotenv/config";
import { createInfatuationClient } from "@places/clients";

async function main() {
  const proxyUrl = getProxyUrl();
  const client = createInfatuationClient({ proxyUrl });

  const query = "Di Fara Pizza";
  console.log(`\nSearching Infatuation for: "${query}"\n`);
  if (proxyUrl) console.log("(using Oxylabs proxy)\n");

  const results = await client.search(query, {
    canonicalPath: "/new-york",
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

function getProxyUrl(): string | undefined {
  const user = process.env.OXYLABS_USERNAME;
  const pass = process.env.OXYLABS_PASSWORD;
  if (!user || !pass) return undefined;
  return `http://customer-${user}-cc-us:${encodeURIComponent(pass)}@pr.oxylabs.io:7777`;
}

main().catch((err) => {
  console.error("Live test failed:", err);
  process.exit(1);
});
