# OpenTable Client

## Goal

Create an OpenTable client at `packages/clients/src/opentable/index.ts` that can query availability for a restaurant by its `rid` (restaurant ID) and determine the opening window. OpenTable doesn't have a public API — detection of whether a restaurant uses OT happens via the website scanner (separate module). This client handles availability/window queries once we have the `rid`.

## Context

This is part of a larger reservation provider detection system. The OpenTable client will be used by the detection orchestrator after the website scanner finds an OpenTable `rid` on the restaurant's website (via widget embed or link).

OpenTable does NOT have a public or undocumented API like Resy. The approach is:
1. **Manual research step (MUST DO FIRST):** Open the OT widget in a browser, inspect network requests to find the internal availability API endpoint
2. **Implement the client** calling that endpoint directly

## Pre-Implementation Research

Before writing any code, you must reverse-engineer the OT widget's availability API:

1. Open Chrome and navigate to: `https://www.opentable.com/widget/reservation/preview/canvas?rid=1180&domain=com&type=standard&theme=standard&lang=en-US&overlay=false&iframe=true`
   (rid=1180 is Gramercy Tavern, a well-known OT restaurant)

2. Open Chrome DevTools → Network tab → filter to XHR/Fetch requests

3. On the widget, change the date (use the date picker to select dates further and further out). Watch for network requests that fetch availability data.

4. Record:
   - The full URL of the availability request
   - Query parameters (rid, date format, party size, etc.)
   - Response JSON structure (what does available vs unavailable look like?)
   - Any required headers (cookies, tokens, CORS)
   - What happens when you pick a date far in the future (90+ days) — does it return empty? An error?

5. Try the same with a few different `rid` values to confirm the pattern is consistent.

**If the widget API requires authentication tokens or cookies that are generated client-side**, we may need to fall back to: fetching the widget HTML page, extracting tokens from it, then calling the API. Document what you find.

## Client Pattern

Follow the same factory pattern as other clients (see `packages/clients/src/google/index.ts`):

```ts
import { createFetch } from "../proxy";

export interface OpenTableClientConfig {
  proxyUrl?: string;
}

export function createOpenTableClient(config: OpenTableClientConfig) {
  const fetchFn = createFetch(config.proxyUrl);
  // ...methods...
  return { getAvailability, getOpeningWindow };
}

export type OpenTableClient = ReturnType<typeof createOpenTableClient>;
```

## File to Create

### `packages/clients/src/opentable/index.ts`

```ts
export interface OpenTableClientConfig {
  proxyUrl?: string;
}

export interface OpenTableAvailability {
  date: string;              // YYYY-MM-DD
  hasAvailability: boolean;
  slots: OpenTableSlot[];
}

export interface OpenTableSlot {
  time: string;              // e.g. "19:00"
  // ... other fields TBD based on research
}

export interface OpenTableOpeningWindow {
  lastAvailableDate: string | null;   // furthest date with availability data
  openingWindowDays: number | null;   // lastAvailableDate - today
}
```

**Methods to implement:**

1. **`getAvailability(rid, date, partySize, time?)`** — query the OT availability API for a specific date. Returns whether slots exist and what they are.

2. **`getOpeningWindow(rid, partySize?)`** — probe dates forward to find the furthest date with availability data (vs. not-yet-released). Strategy:
   - Start by checking today+30, today+60, today+90
   - Binary search between the last date with data and the first date without to narrow down `lastAvailableDate`
   - Distinguish between "sold out" (reservations existed but are taken) and "not available" (reservations not released yet) if the API differentiates them
   - Return `lastAvailableDate` and derived `openingWindowDays`

## Files to Modify

### `packages/clients/src/index.ts`

Add exports:
```ts
export { createOpenTableClient } from "./opentable/index.js";
export type { OpenTableClient, OpenTableClientConfig, OpenTableAvailability, OpenTableSlot, OpenTableOpeningWindow } from "./opentable/index.js";
```

### `packages/clients/package.json`

Add to `exports`:
```json
"./opentable": "./src/opentable/index.ts"
```

### `jobs/src/utils/clients.ts`

Add (import from `@places/clients`):
```ts
export function getOpenTableClient(sessionId: string) {
  return createOpenTableClient({ proxyUrl: getProxyUrl(sessionId) });
}
```

## Important Notes

- The OT `rid` is a numeric restaurant ID. It can be found in:
  - Widget embeds: `rid=12345` in the widget URL
  - Restaurant page URLs: `opentable.com/r/restaurant-name-city` (the rid is NOT in the URL slug — it's a separate numeric ID)
  - The website scanner will extract it from `<iframe>` or `<script>` tags pointing to `opentable.com/widget/...?rid=...`
- If the reverse-engineered API has rate limits or requires rotating sessions, use the proxy support (`createFetch(proxyUrl)`)
- Provider value in our system: `"opentable"` (matching `apps/web/src/lib/types.ts` RESERVATION_PROVIDERS)
- Booking URL format: typically `https://www.opentable.com/r/{slug}` or `https://www.opentable.com/restref/client/?rid={rid}`

## Testing

Create a test script at `scripts/test-opentable.ts`:

```ts
import { createOpenTableClient } from "@places/clients";

const client = createOpenTableClient({});

async function main() {
  // Use Gramercy Tavern (rid to be determined from research)
  const rid = "1180"; // or whatever the actual format is

  // 1. Get availability for a specific date
  console.log("=== AVAILABILITY ===");
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
  const avail = await client.getAvailability(rid, tomorrow, 2);
  console.log(JSON.stringify(avail, null, 2));

  // 2. Get opening window
  console.log("\n=== OPENING WINDOW ===");
  const window = await client.getOpeningWindow(rid, 2);
  console.log("Last available date:", window.lastAvailableDate);
  console.log("Opening window (days):", window.openingWindowDays);
}

main().catch(console.error);
```

Run with: `npx tsx scripts/test-opentable.ts`

**Expected output:**
- Availability for tomorrow returns a result (either available with slots or sold-out)
- Opening window returns a `lastAvailableDate` that's 30-90 days in the future
- Dates beyond the window return no data / empty results
