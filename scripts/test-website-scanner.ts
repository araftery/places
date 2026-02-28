import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { scanWebsiteForReservation } from "@places/clients";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env files — later files override earlier ones
for (const p of [
  resolve(__dirname, "../.env"),
  resolve(__dirname, "../apps/web/.env"),
  resolve(__dirname, "../apps/web/.env.local"),
  resolve(__dirname, "../jobs/.env"),
]) {
  config({ path: p, override: true });
}

const geminiApiKey = process.env.GEMINI_API_KEY;
if (!geminiApiKey) {
  console.error("GEMINI_API_KEY env var required");
  process.exit(1);
}

function getProxyUrl(): string | undefined {
  const user = process.env.OXYLABS_USERNAME;
  const pass = process.env.OXYLABS_PASSWORD;
  if (!user || !pass) return undefined;
  const sessionId = Math.random().toString().slice(2, 12);
  const proxyUser = `customer-${user}-cc-us-sessid-${sessionId}-sesstime-10`;
  return `http://${proxyUser}:${encodeURIComponent(pass)}@pr.oxylabs.io:7777`;
}

async function main() {
  const proxyUrl = getProxyUrl();
  console.log(`Proxy: ${proxyUrl ? "enabled" : "disabled (no OXYLABS creds)"}`);

  const urls = [
    // OpenTable — banner says "exclusively on OpenTable", 7-day window
    "https://www.donangie.com",
    // SevenRooms — /reservations/ page has two SevenRooms links, 28-day window
    "https://www.gramercytavern.com",
    // Tock (Alinea)
    "https://www.alinearestaurant.com",
    // Phone only — Italian restaurant in Capri, "Book" → contact page with phone number
    "https://dagemma.com/en/home-en/",
  ];

  for (const url of urls) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Scanning: ${url}`);
    console.log("=".repeat(60));
    const result = await scanWebsiteForReservation(url, { geminiApiKey, proxyUrl });
    console.log("Provider:   ", result.provider ?? "(none)");
    console.log("URL:        ", result.url ?? "(none)");
    console.log("External ID:", result.externalId ?? "(none)");
    console.log("Window:     ", result.openingWindowDays ? `${result.openingWindowDays} days` : "(none)");
    console.log("Pattern:    ", result.openingPattern ?? "(none)");
    console.log("Signals:");
    for (const s of result.signals) {
      console.log(`  - ${s}`);
    }
  }
}

main().catch(console.error);
