# Resy Client

## Goal

Create a Resy API client at `packages/clients/src/resy/index.ts` that can search for restaurants, get venue details, fetch calendar availability, and find time slots. This is the most fully-featured reservation client since Resy has a stable undocumented API.

## Context

This is part of a larger reservation provider detection system. The Resy client will be used by:
1. The detection orchestrator (`jobs/src/providers/reservation-detect.ts`) to search for a restaurant on Resy and enrich with calendar/window data
2. Future audit tasks to keep `lastAvailableDate` / `openingWindowDays` up to date
3. Future live availability searches

The client follows the same factory pattern as all other clients in `packages/clients/src/`.

## Client Pattern

All clients in this codebase follow this pattern (see `packages/clients/src/google/index.ts` for reference):

```ts
// 1. Import createFetch from proxy module
import { createFetch } from "../proxy";

// 2. Define config interface with optional proxyUrl
export interface XClientConfig {
  apiKey: string;
  proxyUrl?: string;
}

// 3. Export factory function that returns an object of methods
export function createXClient(config: XClientConfig) {
  const fetchFn = createFetch(config.proxyUrl);

  async function someMethod(...): Promise<SomeResult> {
    const res = await fetchFn(url, { headers: { ... } });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`X error: ${text}`);
    }
    return res.json();
  }

  return { someMethod };
}

// 4. Export client type
export type XClient = ReturnType<typeof createXClient>;
```

Key patterns:
- Use `createFetch(config.proxyUrl)` from `../proxy` for all HTTP calls
- Throw descriptive errors on non-OK responses
- Export the config interface, all result types, and the client type (`ReturnType<typeof createX>`)

## Resy API Details

**Base URL:** `https://api.resy.com`

**Auth header on ALL requests:** `Authorization: ResyAPI api_key="<key>"`

### Endpoints

#### 1. Venue Search
```
GET /3/venuesearch/search?query={name}&lat={lat}&long={lng}&per_page=5
```

Response (relevant fields):
```json
{
  "search": {
    "hits": [
      {
        "id": {
          "resy": 12345
        },
        "name": "Restaurant Name",
        "location": {
          "latitude": 40.1234,
          "longitude": -74.5678
        },
        "url_slug": "restaurant-name",
        "region": {
          "id": "ny"
        }
      }
    ]
  }
}
```

#### 2. Venue Details
```
GET /3/venue?venue_id={venueId}
```

Response (relevant fields — type what you observe, there will be more):
```json
{
  "id": { "resy": 12345 },
  "name": "Restaurant Name",
  "contact": { "url": "https://..." },
  "location": {
    "latitude": 40.1234,
    "longitude": -74.5678,
    "city": "New York",
    "region": "ny"
  },
  "url_slug": "restaurant-name",
  "config": { ... },
  "content": [
    { "body": "About this restaurant. Reservations open 14 days in advance..." }
  ]
}
```

The `content` array may contain text about the restaurant's reservation policy / opening pattern. Parse this for signals like "reservations open X days in advance", "rolling window", etc.

#### 3. Calendar
```
GET /4/venue/calendar?venue_id={venueId}&num_seats={numSeats}&start_date={YYYY-MM-DD}&end_date={YYYY-MM-DD}
```

Response:
```json
{
  "last_calendar_day": "2026-03-25",
  "scheduled": [
    {
      "date": "2026-02-25",
      "inventory": {
        "reservation": "available"
      }
    },
    {
      "date": "2026-02-26",
      "inventory": {
        "reservation": "sold-out"
      }
    },
    {
      "date": "2026-02-27",
      "inventory": {
        "reservation": "closed"
      }
    }
  ]
}
```

**Status meanings:**
- `"available"` — tables can be booked
- `"sold-out"` — all tables booked (reservations WERE released)
- `"closed"` — restaurant not operating that day
- Dates beyond `last_calendar_day` haven't had reservations released yet

**Opening window derivation:**
- `openingWindowDays = last_calendar_day - today` (in days)
- `lastAvailableDate = last_calendar_day`

#### 4. Find Availability (time slots)
```
GET /4/find?venue_id={venueId}&day={YYYY-MM-DD}&party_size={partySize}&lat={lat}&long={lng}
```

Response (relevant fields):
```json
{
  "results": {
    "venues": [
      {
        "venue": { "id": { "resy": 12345 } },
        "slots": [
          {
            "config": { "id": "config_id", "type": "Dining Room" },
            "date": { "start": "2026-02-25 19:00:00", "end": "2026-02-25 21:00:00" }
          }
        ]
      }
    ]
  }
}
```

## File to Create

### `packages/clients/src/resy/index.ts`

```ts
export interface ResyClientConfig {
  apiKey: string;
  proxyUrl?: string;
}

export interface ResySearchResult {
  venueId: number;
  name: string;
  urlSlug: string;
  regionId: string;
  lat: number | null;
  lng: number | null;
}

export interface ResyVenue {
  venueId: number;
  name: string;
  urlSlug: string;
  regionId: string;
  lat: number | null;
  lng: number | null;
  websiteUrl: string | null;
  content: string[];       // text blocks from venue "about" section
  raw: unknown;            // full API response
}

export interface ResyCalendarDay {
  date: string;            // YYYY-MM-DD
  status: "available" | "sold-out" | "closed";
}

export interface ResyCalendar {
  lastCalendarDay: string; // YYYY-MM-DD — furthest bookable date
  days: ResyCalendarDay[];
}

export interface ResySlot {
  configId: string;
  type: string;            // e.g. "Dining Room", "Bar"
  startTime: string;       // "2026-02-25 19:00:00"
  endTime: string;         // "2026-02-25 21:00:00"
}

export function createResyClient(config: ResyClientConfig) {
  // Use createFetch from ../proxy
  // Set auth header: Authorization: ResyAPI api_key="<key>"
  // Implement: search, getVenue, getCalendar, findAvailability
  // Return object with all methods
}

export type ResyClient = ReturnType<typeof createResyClient>;
```

**Methods to implement:**

1. **`search(query, options?)`** — calls `/3/venuesearch/search`, returns `ResySearchResult[]`
2. **`getVenue(venueId)`** — calls `/3/venue`, returns `ResyVenue`. Extract `content` bodies as a string array for opening pattern parsing.
3. **`getCalendar(venueId, numSeats, startDate, endDate)`** — calls `/4/venue/calendar`, returns `ResyCalendar` with `lastCalendarDay` and parsed day statuses.
4. **`findAvailability(venueId, date, partySize)`** — calls `/4/find`, returns `ResySlot[]`.

## Files to Modify

### `packages/clients/src/index.ts`

Add exports:
```ts
export { createResyClient } from "./resy/index.js";
export type { ResyClient, ResyClientConfig, ResySearchResult, ResyVenue, ResyCalendar, ResyCalendarDay, ResySlot } from "./resy/index.js";
```

### `packages/clients/package.json`

Add to `exports`:
```json
"./resy": "./src/resy/index.ts"
```

### `jobs/src/utils/clients.ts`

Add (import `createResyClient` from `@places/clients`):
```ts
export function getResyClient(sessionId: string) {
  return createResyClient({
    apiKey: process.env.RESY_API_KEY!,
    proxyUrl: getProxyUrl(sessionId),
  });
}
```

## Environment Variable

`RESY_API_KEY` — obtained from Resy web app network inspector. Add to `.env` / environment config. The key goes in the header as `Authorization: ResyAPI api_key="<value>"`.

## Testing

Create a test script at `scripts/test-resy.ts`:

```ts
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
```

Run with: `npx tsx scripts/test-resy.ts`

**Expected output:**
- Search returns at least 1 result with a numeric `venueId`
- Venue details include name, urlSlug, regionId
- Calendar shows `lastCalendarDay` (a date ~14-30 days from now for most restaurants)
- Calendar days have statuses of `available`, `sold-out`, or `closed`
- Availability returns slot objects with times

**Verify:**
- `lastCalendarDay` is a valid YYYY-MM-DD string
- `openingWindowDays` derived from calendar is a reasonable number (7-90)
- Venue content includes text that could describe opening patterns
- All API errors throw descriptive Error messages
