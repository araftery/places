# SevenRooms Client

## Goal

Create a SevenRooms client at `packages/clients/src/sevenrooms/index.ts` that can query availability for a restaurant by its venue slug and determine the opening window. SevenRooms has a public (undocumented) widget API that returns availability data. Detection of whether a restaurant uses SevenRooms happens via the website scanner (separate module); this client handles availability/window queries once we have the venue slug.

## Context

This is part of a larger reservation provider detection system. The SevenRooms client will be used by the detection orchestrator after the website scanner finds a SevenRooms link or widget embed on the restaurant's website.

## SevenRooms Widget API

The SevenRooms booking widget calls a public API endpoint:

```
GET https://www.sevenrooms.com/api-yoa/availability/widget/range
```

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `venue` | string | Venue identifier (slug) |
| `time_slot` | string | Desired time (e.g., `"19:00"`) |
| `party_size` | number | Number of guests |
| `start_date` | string | Start date (format to be confirmed — likely `MM/DD/YYYY` or `YYYY-MM-DD`) |
| `num_days` | number | Number of days to check (e.g., 1, 7, 30) |
| `halo_size_interval` | number | Time window around requested slot (e.g., 16 = +/- minutes) |
| `channel` | string | `"SEVENROOMS_WIDGET"` |

**Response structure** (based on community implementations):
The response contains availability data per date. Slots have a `type` field — filter to `type === "book"` for bookable slots. Empty results / no bookable slots for a date means either sold out or not yet released.

**No authentication required** — this is the same endpoint the public widget uses.

## Client Pattern

Follow the same factory pattern as other clients (see `packages/clients/src/google/index.ts`):

```ts
import { createFetch } from "../proxy";

export interface SevenRoomsClientConfig {
  proxyUrl?: string;
}

export function createSevenRoomsClient(config: SevenRoomsClientConfig) {
  const fetchFn = createFetch(config.proxyUrl);
  // ...methods...
  return { getAvailability, getOpeningWindow };
}

export type SevenRoomsClient = ReturnType<typeof createSevenRoomsClient>;
```

## File to Create

### `packages/clients/src/sevenrooms/index.ts`

```ts
export interface SevenRoomsClientConfig {
  proxyUrl?: string;
}

export interface SevenRoomsAvailability {
  date: string;               // YYYY-MM-DD
  slots: SevenRoomsSlot[];
}

export interface SevenRoomsSlot {
  time: string;               // e.g. "19:00"
  type: string;               // "book", etc.
  // ... other fields from API response
}

export interface SevenRoomsOpeningWindow {
  lastAvailableDate: string | null;
  openingWindowDays: number | null;
}
```

**Methods to implement:**

1. **`getAvailability(venueSlug, date, partySize, timeSlot?)`** — call the widget API with `num_days=1` for a specific date. Parse response to extract bookable slots (where `type === "book"`). Default `timeSlot` to `"19:00"`, default `halo_size_interval` to `16`.

2. **`getOpeningWindow(venueSlug, partySize?)`** — probe forward to find the furthest bookable date:
   - Query with `num_days=30` starting from today
   - If bookable slots exist in the last few days of the range, shift forward another 30 days
   - Repeat until we find a range with no bookable slots
   - The last date with bookable slots = `lastAvailableDate`
   - `openingWindowDays = lastAvailableDate - today`
   - Default `partySize` to 2

**Implementation notes:**
- The `num_days` parameter lets us query a range efficiently (e.g., 30 days at once instead of 1 day at a time)
- Be mindful that some dates may show no slots because the restaurant is closed that day (not because reservations aren't released). The opening window is about the *furthest* date with ANY data, not necessarily every date having slots.
- Use `time_slot=19:00` as a reasonable dinner default
- Use `channel=SEVENROOMS_WIDGET` always

## Files to Modify

### `packages/clients/src/index.ts`

Add exports:
```ts
export { createSevenRoomsClient } from "./sevenrooms/index.js";
export type { SevenRoomsClient, SevenRoomsClientConfig, SevenRoomsAvailability, SevenRoomsSlot, SevenRoomsOpeningWindow } from "./sevenrooms/index.js";
```

### `packages/clients/package.json`

Add to `exports`:
```json
"./sevenrooms": "./src/sevenrooms/index.ts"
```

### `jobs/src/utils/clients.ts`

Add (import from `@places/clients`):
```ts
export function getSevenRoomsClient(sessionId: string) {
  return createSevenRoomsClient({ proxyUrl: getProxyUrl(sessionId) });
}
```

## Important Notes

- The venue slug comes from SevenRooms URLs: `sevenrooms.com/reservations/{slug}`. The website scanner extracts this.
- No API key or auth token needed — this is a public widget endpoint
- Provider value in our system: `"sevenrooms"` (matching `apps/web/src/lib/types.ts` RESERVATION_PROVIDERS)
- Booking URL format: `https://www.sevenrooms.com/reservations/{venueSlug}`
- If the API response format is unclear, fetch a few responses manually first to understand the structure. Use a known SevenRooms restaurant to test (e.g., search "sevenrooms.com/reservations" on Google to find examples).

## Testing

Create a test script at `scripts/test-sevenrooms.ts`:

```ts
import { createSevenRoomsClient } from "@places/clients";

const client = createSevenRoomsClient({});

async function main() {
  // Find a known SevenRooms venue slug by googling "sevenrooms.com/reservations/"
  // Example: const venueSlug = "some-known-venue";
  const venueSlug = process.argv[2];
  if (!venueSlug) {
    console.error("Usage: npx tsx scripts/test-sevenrooms.ts <venue-slug>");
    console.error("Find slugs at: https://www.sevenrooms.com/reservations/<slug>");
    process.exit(1);
  }

  // 1. Get availability for tomorrow
  console.log("=== AVAILABILITY ===");
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
  const avail = await client.getAvailability(venueSlug, tomorrow, 2);
  console.log(JSON.stringify(avail, null, 2));

  // 2. Get opening window
  console.log("\n=== OPENING WINDOW ===");
  const window = await client.getOpeningWindow(venueSlug, 2);
  console.log("Last available date:", window.lastAvailableDate);
  console.log("Opening window (days):", window.openingWindowDays);
}

main().catch(console.error);
```

Run with: `npx tsx scripts/test-sevenrooms.ts <venue-slug>`

**Expected output:**
- Availability returns slot data for the queried date (may be empty if restaurant is closed/sold out that day)
- Slots with `type === "book"` indicate bookable times
- Opening window returns a `lastAvailableDate` and reasonable `openingWindowDays` (typically 14-90)
- Dates far in the future return no bookable slots

**Verify:**
- The widget API URL is correct and returns JSON without auth
- `num_days` parameter works for batch queries (e.g., 30 days at once)
- The response differentiates between no availability (closed/sold out) and bookable slots
