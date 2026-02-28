# OpenTable Client

## Goal

Create an OpenTable client at `packages/clients/src/opentable/index.ts` that can query availability for a restaurant by its `rid` (restaurant ID) and determine the opening window. OpenTable doesn't have a public API — detection of whether a restaurant uses OT happens via the website scanner (separate module). This client handles availability/window queries once we have the `rid`.

## Context

This is part of a larger reservation provider detection system. The OpenTable client will be used by the detection orchestrator after the website scanner finds an OpenTable `rid` on the restaurant's website (via widget embed or link).

OpenTable does NOT have a public API. Research revealed two internal APIs:
1. **Web GraphQL API** (`/dapi/fe/gql`) — blocked by Akamai Bot Manager, requires JS execution
2. **Mobile REST API** (`mobile-api.opentable.com`) — discovered via iOS mitmproxy, works with a static Bearer token, no cookies/sessions needed ← **this is what the client uses**

## Research Findings (Completed 2026-02-27)

### Availability API

- **Endpoint**: `POST https://www.opentable.com/dapi/fe/gql?optype=query&opname=RestaurantsAvailability`
- **Type**: GraphQL with **persisted queries** (no inline query text, uses `extensions.persistedQuery.sha256Hash`)
- **Hash**: `b2d05a06151b3cb21d9dfce4f021303eeba288fac347068b29c1cb66badc46af`

**Variables**:
- `restaurantIds`: number[] (internal ID, NOT the `rid` from widget URLs)
- `date`: "YYYY-MM-DD"
- `time`: "HH:mm" (24h)
- `partySize`: number
- `forwardDays`: 0
- `onlyPop`: false
- `requireTimes`: false
- `requireTypes`: "Standard"
- `privilegedAccess`: ""
- `databaseRegion`: "NA"
- `restaurantAvailabilityTokens`: []

**Required Headers**:
- `x-csrf-token`: UUID (from `window.__CSRF_TOKEN__` / `windowVariables` JSON in page HTML)
- `ot-page-type`: "restprofilepage"
- `ot-page-group`: "rest-profile"
- `Content-Type`: "application/json"
- Session cookies from page load

**Response Structure**:
```json
{
  "data": {
    "availability": [{
      "restaurantId": 942,
      "availabilityDays": [{
        "noTimesReasons": ["BlockedAvailability"],  // or ["NoTimesExist"] or []
        "slots": [{
          "isAvailable": true,
          "timeOffsetMinutes": -30,  // relative to requested time
          "slotHash": "3677215611",
          "type": "Standard"
        }]
      }]
    }]
  }
}
```

**noTimesReasons values**:
- `[]` — has availability (check slots)
- `["BlockedAvailability"]` — reservations exist but all taken (sold out)
- `["NoTimesExist"]` — no online availability on that day

### Restaurant Page Data

The restaurant page at `https://www.opentable.com/r/{slug}` contains embedded JSON with:
- `__CSRF_TOKEN__`: UUID in a `<script type="application/json">` windowVariables block
- `__INITIAL_STATE__.restaurantProfile.restaurant`:
  - `restaurantId`: internal numeric ID (e.g., 942 for Gramercy Tavern)
  - `name`: restaurant name
  - `maxAdvanceDays`: how far ahead reservations can be made (e.g., 28)
  - `timeZone.offsetInMinutes`: timezone offset (e.g., -300 for EST)

### URL Parameters

The restaurant page accepts query params to preset the search:
- `?dateTime=2026-03-05T19%3A00&covers=2` → sets `initialDTPDate`, `initialDTPTime`, `initialDTPPartySize`
- Availability is NOT server-rendered — always fetched client-side via GraphQL

### Opening Window

- `maxAdvanceDays` on the restaurant object directly tells us the booking window
- The calendar UI greys out dates beyond `today + maxAdvanceDays`
- No probing/binary search needed — just read `maxAdvanceDays` from the page

### Bot Protection (Akamai)

The GraphQL API is behind Akamai Bot Manager. Direct server-to-server calls return 400 because:
- The `_abck` cookie requires JavaScript sensor data execution to become valid
- Without valid Akamai cookies, the gateway rejects POST requests to `/dapi/fe/gql`
- **Page HTML fetching works fine** with browser-like headers (200 OK, ~46KB)
- The Oxylabs residential proxy may help bypass Akamai for the GraphQL calls

### Mobile REST API (via iOS mitmproxy — USED BY CLIENT)

Discovered by intercepting OpenTable iOS app traffic with mitmproxy.

- **Base URL**: `https://mobile-api.opentable.com/api`
- **Auth**: Static Bearer token `41dbbf15-5c4e-415b-9f45-5c1209878e42` (app-level, not user-specific)
- **No cookies, no CSRF, no Akamai** — works directly from curl/fetch

**Availability endpoint**: `PUT /v3/restaurant/availability`

Request body:
```json
{
  "rids": ["1339957"],
  "dateTime": "2026-03-10T19:00",
  "partySize": 2,
  "forceNextAvailable": "true",
  "includeNextAvailable": false,
  "includePrivateDining": false,
  "requestAttributeTables": "true",
  "requestDateMessages": true,
  "allowPop": true,
  "attribution": { "partnerId": "84" }
}
```

Response:
```json
{
  "availability": {
    "id": "1339957",
    "dateTime": "2026-03-10T19:00",
    "maxDaysInAdvance": 60,
    "noTimesReasons": [],
    "timeslots": [
      { "dateTime": "2026-03-10T15:30", "available": true, "type": "Standard", "slotHash": "..." },
      ...
    ]
  }
}
```

**noTimesReasons values**:
- `[]` — has availability
- `["BlockedAvailability"]` — sold out
- `["NoTimesExist"]` — no online availability that day
- `["TooFarInAdvance"]` — date is beyond `maxDaysInAdvance`

**Key advantages over web GraphQL API**:
- No Akamai Bot Manager — works from plain `fetch`
- Uses the same `rid` as widget URLs (the mobile API uses `rids`, not internal `restaurantId`)
- `maxDaysInAdvance` returned in every availability response
- Timeslots use absolute ISO datetimes (not offset-based)

### ID Mapping

- The web UI uses an internal `restaurantId` (e.g., 942) which differs from the widget `rid` (1180)
- The **mobile API uses `rid`** directly — same as what appears in widget embed URLs
- For the detection system, the website scanner extracts `rid` from widgets → passes directly to the mobile API client

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
