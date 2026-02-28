import { detectReservationProvider, type PlaceInfo, type InfatuationReservationData } from "../jobs/src/providers/reservation-detect";
import { generateSessionId } from "../jobs/src/utils/clients";

async function runTest(
  label: string,
  place: PlaceInfo,
  infatuationData?: InfatuationReservationData
) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`TEST: ${label}`);
  console.log(`Place: ${place.name} (id=${place.id})`);
  console.log(`Website: ${place.websiteUrl || "(none)"}`);
  if (infatuationData) {
    console.log(`Infatuation: platform=${infatuationData.reservationPlatform}, url=${infatuationData.reservationUrl}`);
  }
  console.log("=".repeat(60));

  const sessionId = generateSessionId();
  const start = Date.now();

  try {
    const result = await detectReservationProvider(place, sessionId, infatuationData);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    console.log(`\nResult (${elapsed}s):`);
    console.log(`  provider: ${result.provider}`);
    console.log(`  externalId: ${result.externalId}`);
    console.log(`  url: ${result.url}`);
    console.log(`  openingWindowDays: ${result.openingWindowDays}`);
    console.log(`  openingPattern: ${result.openingPattern}`);
    console.log(`  openingTime: ${result.openingTime}`);
    console.log(`  lastAvailableDate: ${result.lastAvailableDate}`);
    console.log(`  source: ${result.source}`);
    console.log(`\nSignals:`);
    for (const signal of result.signals) {
      console.log(`  - ${signal}`);
    }
  } catch (err) {
    console.error(`\nFATAL ERROR (should never happen):`, err);
  }
}

async function main() {
  console.log("Reservation Detection Orchestrator — Test Suite\n");

  // Test 1: Resy restaurant — 4 Charles Prime Rib (NYC)
  await runTest("Resy — 4 Charles Prime Rib", {
    id: 1,
    name: "4 Charles Prime Rib",
    lat: 40.7353,
    lng: -74.0004,
    websiteUrl: "https://www.nycprimerib.com/",
  });

  // Test 2: OpenTable restaurant — Gramercy Tavern (NYC)
  await runTest("OpenTable — Gramercy Tavern", {
    id: 2,
    name: "Gramercy Tavern",
    lat: 40.7384,
    lng: -73.9884,
    websiteUrl: "https://www.gramercytavern.com/",
  });

  // Test 3: Lilia (NYC, Williamsburg)
  await runTest("Lilia", {
    id: 3,
    name: "Lilia",
    lat: 40.7174,
    lng: -73.9502,
    websiteUrl: "https://www.lilianewyork.com/",
  });

  // Test 4: Infatuation pre-seeded as Resy — Pasquale Jones (NYC)
  await runTest(
    "Infatuation pre-seeded (Resy) — Pasquale Jones",
    {
      id: 4,
      name: "Pasquale Jones",
      lat: 40.7195,
      lng: -73.9973,
      websiteUrl: null,
    },
    {
      reservationPlatform: "Resy",
      reservationUrl: "https://resy.com/cities/ny/pasquale-jones",
    }
  );

  // Test 5: Don Angie (NYC, West Village)
  await runTest("Don Angie", {
    id: 5,
    name: "Don Angie",
    lat: 40.7337,
    lng: -74.0028,
    websiteUrl: "https://www.donangie.com/",
  });

  // Test 6: No website, no infatuation data
  await runTest("No data — Unknown place", {
    id: 6,
    name: "Some Unknown Place",
    lat: 40.73,
    lng: -73.99,
    websiteUrl: null,
  });

  console.log("\n\nDone!");
}

main().catch(console.error);
