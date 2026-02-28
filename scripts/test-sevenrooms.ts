import { createSevenRoomsClient } from "@places/clients";

const client = createSevenRoomsClient({});

async function main() {
  const venueSlug = process.argv[2];
  if (!venueSlug) {
    console.error("Usage: pnpm tsx scripts/test-sevenrooms.ts <venue-slug>");
    console.error(
      "Find slugs at: https://www.sevenrooms.com/reservations/<slug>"
    );
    process.exit(1);
  }

  // 1. Get availability for tomorrow
  console.log("=== AVAILABILITY (tomorrow) ===");
  const tomorrow = new Date(Date.now() + 86400000)
    .toISOString()
    .split("T")[0];
  const avail = await client.getAvailability(venueSlug, tomorrow, 2);
  for (const day of avail) {
    const bookable = day.slots.filter((s) => s.type === "book");
    const request = day.slots.filter((s) => s.type === "request");
    console.log(
      `${day.date}: ${bookable.length} bookable, ${request.length} request-only`
    );
    for (const s of bookable.slice(0, 5)) {
      console.log(`  ${s.time} (${s.shiftName}, ${s.duration ?? "?"}min)`);
    }
  }

  // 2. Get opening window
  console.log("\n=== OPENING WINDOW ===");
  const window = await client.getOpeningWindow(venueSlug, 2);
  console.log("Last available date:", window.lastAvailableDate);
  console.log("Opening window (days):", window.openingWindowDays);
}

main().catch(console.error);
