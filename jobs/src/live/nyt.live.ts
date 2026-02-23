/**
 * Live test for NYT provider.
 * Calls the real NYT scraper — no DB writes.
 *
 * Usage: npx tsx src/live/nyt.live.ts
 * Optional: OXYLABS_USERNAME, OXYLABS_PASSWORD for proxy
 */
import "dotenv/config";
import { createNytClient } from "@places/clients";

async function main() {
  const proxyUrl = getProxyUrl();
  const client = createNytClient({ proxyUrl });

  const query = "Di Fara Pizza";
  console.log(`\nSearching NYT for: "${query}"\n`);
  if (proxyUrl) console.log("(using Oxylabs proxy)\n");

  const results = await client.search(query, { limit: 3 });

  console.log(`Found ${results.length} results:`);
  for (const r of results) {
    console.log(`  - ${r.name} (id: ${r.externalId}, rating: ${r.rating})`);
    if (r.summary) console.log(`    Summary: ${r.summary}`);
    if (r.url) console.log(`    URL: ${r.url}`);
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
