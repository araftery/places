import { createResyClient } from "@places/clients";

const client = createResyClient({ apiKey: process.env.RESY_API_KEY! });

async function main() {
  // 1. Search for a known Resy restaurant
  console.log("=== SEARCH ===");
  const results = await client.search("4 Charles Prime Rib", { lat: 40.7352, lng: -74.0003 });
  console.log(JSON.stringify(results, null, 2));

  if (results.length === 0) {
    console.log("No results found");
    return;
  }

  const venueId = results[0].venueId;

  // 2. Get venue details
  console.log("\n=== VENUE DETAILS ===");
  const venue = await client.getVenue(venueId);
  console.log(JSON.stringify({ ...venue, raw: "[omitted]" }, null, 2));
  console.log("Content texts:", venue.content);

  // 3. Get calendar (next 60 days, party of 2)
  console.log("\n=== CALENDAR ===");
  const today = new Date().toISOString().split("T")[0];
  const endDate = new Date(Date.now() + 60 * 86400000).toISOString().split("T")[0];
  const calendar = await client.getCalendar(venueId, 2, today, endDate);
  console.log("Last calendar day:", calendar.lastCalendarDay);
  console.log("Opening window (days):", Math.round((new Date(calendar.lastCalendarDay).getTime() - Date.now()) / 86400000));
  console.log("Sample days:", calendar.days.slice(0, 5));

  // 4. Find availability for tomorrow
  console.log("\n=== AVAILABILITY ===");
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
  const slots = await client.findAvailability(venueId, tomorrow, 2);
  console.log(`${slots.length} slots found`);
  console.log("First 5:", slots.slice(0, 5));
}

main().catch(console.error);
