import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { createInfatuationClient } from "@places/clients/infatuation";
import * as schema from "../packages/db/src/schema.js";

const CITIES = [
  {
    name: "New York",
    country: "US",
    lat: 40.7128,
    lng: -73.9997,
    providers: ["google", "infatuation", "beli", "nyt"],
  },
  {
    name: "Los Angeles",
    country: "US",
    lat: 34.0522,
    lng: -118.2437,
    providers: ["google", "infatuation", "beli", "nyt"],
  },
  {
    name: "Chicago",
    country: "US",
    lat: 41.8781,
    lng: -87.6298,
    providers: ["google", "infatuation", "beli", "nyt"],
  },
  {
    name: "San Francisco",
    country: "US",
    lat: 37.7749,
    lng: -122.4194,
    providers: ["google", "infatuation", "beli", "nyt"],
  },
  {
    name: "London",
    country: "GB",
    lat: 51.5074,
    lng: -0.1278,
    providers: ["google", "infatuation", "beli"],
  },
  {
    name: "Paris",
    country: "FR",
    lat: 48.8566,
    lng: 2.3522,
    providers: ["google", "infatuation", "beli"],
  },
  {
    name: "Austin",
    country: "US",
    lat: 30.2672,
    lng: -97.7431,
    providers: ["google", "infatuation", "beli"],
  },
  {
    name: "Nashville",
    country: "US",
    lat: 36.1627,
    lng: -86.7816,
    providers: ["google", "infatuation", "beli"],
  },
  {
    name: "Portland",
    country: "US",
    lat: 45.5152,
    lng: -122.6784,
    providers: ["google", "infatuation", "beli"],
  },
  {
    name: "Seattle",
    country: "US",
    lat: 47.6062,
    lng: -122.3321,
    providers: ["google", "infatuation", "beli"],
  },
  {
    name: "Miami",
    country: "US",
    lat: 25.7617,
    lng: -80.1918,
    providers: ["google", "infatuation", "beli"],
  },
  {
    name: "Boston",
    country: "US",
    lat: 42.3601,
    lng: -71.0589,
    providers: ["google", "infatuation", "beli"],
  },
  {
    name: "Philadelphia",
    country: "US",
    lat: 39.9526,
    lng: -75.1652,
    providers: ["google", "infatuation", "beli"],
  },
  {
    name: "Washington",
    country: "US",
    lat: 38.9072,
    lng: -77.0369,
    providers: ["google", "infatuation", "beli"],
  },
  {
    name: "Denver",
    country: "US",
    lat: 39.7392,
    lng: -104.9903,
    providers: ["google", "infatuation", "beli"],
  },
  {
    name: "New Orleans",
    country: "US",
    lat: 29.9511,
    lng: -90.0715,
    providers: ["google", "infatuation", "beli"],
  },
  {
    name: "Tokyo",
    country: "JP",
    lat: 35.6762,
    lng: 139.6503,
    providers: ["google"],
  },
  {
    name: "Rome",
    country: "IT",
    lat: 41.9028,
    lng: 12.4964,
    providers: ["google"],
  },
  {
    name: "Barcelona",
    country: "ES",
    lat: 41.3874,
    lng: 2.1686,
    providers: ["google"],
  },
  {
    name: "Mexico City",
    country: "MX",
    lat: 19.4326,
    lng: -99.1332,
    providers: ["google"],
  },
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);
  const db = drizzle(sql, { schema });

  // Fetch Infatuation city slugs so we can populate infatuationSlug
  console.log("Fetching Infatuation city list...");
  let infCities: { name: string; slug: string }[] = [];
  try {
    const infClient = createInfatuationClient();
    infCities = await infClient.listCities();
    console.log(`  Found ${infCities.length} Infatuation cities`);
  } catch (err) {
    console.warn("  Failed to fetch Infatuation cities, slugs will be null:", err);
  }

  console.log(`\nSeeding ${CITIES.length} cities...`);

  for (const city of CITIES) {
    // Match Infatuation slug by city name
    const infMatch = infCities.find(
      (c) => c.name.toLowerCase() === city.name.toLowerCase()
    );
    const infatuationSlug = infMatch?.slug ?? null;

    // If we have infatuation in providers but no slug, remove it
    let providers = city.providers;
    if (!infatuationSlug && providers.includes("infatuation")) {
      providers = providers.filter((p) => p !== "infatuation");
    }

    await db
      .insert(schema.cities)
      .values({ ...city, providers, infatuationSlug })
      .onConflictDoUpdate({
        target: [schema.cities.name, schema.cities.country],
        set: {
          lat: city.lat,
          lng: city.lng,
          providers,
          infatuationSlug,
        },
      });
    console.log(`  ${city.name}, ${city.country} → ${infatuationSlug ?? "(no slug)"}`);
  }

  console.log("\nDone!");
}

main().catch(console.error);
