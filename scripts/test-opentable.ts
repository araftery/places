import { createOpenTableClient } from "../packages/clients/src/opentable/index.js";

const client = createOpenTableClient({});

async function main() {
  // Restaurant 1339957 was captured from the iOS app traffic
  const rid = "1339957";

  // 1. Get opening window
  console.log("=== OPENING WINDOW ===");
  const window = await client.getOpeningWindow(rid);
  console.log("Max days in advance:", window.maxDaysInAdvance);
  console.log("Last available date:", window.lastAvailableDate);

  // 2. Get availability for a date within the window
  console.log("\n=== AVAILABILITY (within window) ===");
  const inWindow = new Date();
  inWindow.setDate(inWindow.getDate() + 7);
  const dateStr = `${inWindow.toISOString().split("T")[0]}T19:00`;
  const avail = await client.getAvailability(rid, dateStr, 2);
  console.log("Date:", avail.dateTime);
  console.log("Has availability:", avail.hasAvailability);
  console.log("No times reasons:", avail.noTimesReasons);
  console.log("Slots:", avail.slots.length);
  if (avail.slots.length > 0) {
    console.log(
      "First 3 slots:",
      avail.slots.slice(0, 3).map((s) => `${s.dateTime} (${s.type})`)
    );
  }

  // 3. Get availability for a date beyond the window
  console.log("\n=== AVAILABILITY (beyond window) ===");
  const farDate = new Date();
  farDate.setDate(farDate.getDate() + 120);
  const farStr = `${farDate.toISOString().split("T")[0]}T19:00`;
  const farAvail = await client.getAvailability(rid, farStr, 2);
  console.log("Date:", farAvail.dateTime);
  console.log("Has availability:", farAvail.hasAvailability);
  console.log("No times reasons:", farAvail.noTimesReasons);

  // 4. Test Gramercy Tavern (rid 942)
  console.log("\n=== GRAMERCY TAVERN (rid 942) ===");
  const gt = await client.getOpeningWindow("942");
  console.log("Max days in advance:", gt.maxDaysInAdvance);
  console.log("Last available date:", gt.lastAvailableDate);
}

main().catch(console.error);
