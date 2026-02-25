# Detection Orchestrator

## Goal

Create the detection orchestrator at `jobs/src/providers/reservation-detect.ts` that combines all detection strategies (Infatuation data, website scanning, Resy API, OpenTable API, SevenRooms API) to detect a restaurant's reservation provider and populate its booking metadata.

## Context

This is the final module in the reservation provider detection system. It depends on:
- `packages/clients/src/resy/index.ts` — Resy API client (search, getVenue, getCalendar)
- `packages/clients/src/opentable/index.ts` — OpenTable client (getOpeningWindow)
- `packages/clients/src/sevenrooms/index.ts` — SevenRooms client (getOpeningWindow)
- `packages/clients/src/website-scanner/index.ts` — Website scanner (scanWebsiteForReservation)
- `jobs/src/utils/clients.ts` — Factory helpers (getResyClient, getOpenTableClient, getSevenRoomsClient)

**All four modules above must be implemented first.**

The orchestrator is standalone — it does NOT integrate into `initiate-coverage` yet. It can be called manually or from a test script.

## Detection Pipeline

The orchestrator runs four steps in order, enriching a single result:

### Step 1 — Infatuation Data (free, already scraped)

If the caller provides Infatuation data (from the Contentful `venue.reservation` field), use it as the initial signal:

- `reservationPlatform` → map to provider enum:
  - `"Resy"` → `"resy"`
  - `"OpenTable"` → `"opentable"`
  - `"SevenRooms"` → `"sevenrooms"`
  - Other values → `"other"`
- `reservationUrl` → booking URL

This is the cheapest check (data is already available from the existing Infatuation scraping pipeline). The Infatuation `lookup()` method returns `raw` which includes `raw.venue.reservation.{reservationUrl, reservationPlatform}`.

### Step 2 — Website Scan

If `place.websiteUrl` exists, call `scanWebsiteForReservation(place.websiteUrl, fetchFn)`:

- If it returns a provider, this **overrides** the Infatuation result (the restaurant's own website is more authoritative)
- Extract `externalId` from the scan (rid for OT, venue slug for 7R/Resy)
- Capture any opening window/pattern text signals

Pass a proxy-enabled fetch function: `createFetch(getProxyUrl(sessionId))`.

### Step 3 — Resy API Search (always runs)

Always search Resy by name + lat/lng, even if a provider was already detected:
- If the restaurant IS on Resy, this enriches with venue ID, calendar data, and opening window
- If the restaurant is NOT on Resy and no provider was detected yet, this confirms it's not on Resy

**Resy search + enrichment flow:**
1. `client.search(place.name, { lat: place.lat, lng: place.lng })`
2. Match results against place name using fuzzy matching:
   - Normalize both names: lowercase, strip punctuation/articles ("the", "a")
   - Check if normalized names are equal, or if one contains the other
   - Also compare lat/lng proximity (within ~0.01 degrees ≈ 1km)
3. If matched: `client.getVenue(venueId)` for description text
4. If matched: `client.getCalendar(venueId, 2, today, today+90)` for `lastCalendarDay`
5. Set `externalId = venueId`, `url = https://resy.com/cities/{regionId}/{urlSlug}`, `lastAvailableDate = lastCalendarDay`, `openingWindowDays = lastCalendarDay - today`
6. Parse venue `content` texts for opening pattern signals

If Resy was already detected in step 1 or 2 but we didn't have the venue ID, this step provides it. If a different provider was detected, skip setting the provider but still note if the restaurant is also on Resy (in signals).

### Step 4 — Provider-Specific Window Enrichment

If the detected provider is OpenTable or SevenRooms AND we have the external ID:

**For OpenTable** (if we have `rid`):
1. `client.getOpeningWindow(rid, 2)`
2. Set `lastAvailableDate` and `openingWindowDays` from result

**For SevenRooms** (if we have `venueSlug`):
1. `client.getOpeningWindow(venueSlug, 2)`
2. Set `lastAvailableDate` and `openingWindowDays` from result

This step is skipped for Resy (already handled in step 3) and for non-platform providers (phone, walk-in, other).

## File to Create

### `jobs/src/providers/reservation-detect.ts`

```ts
import { createFetch } from "@places/clients";
import { scanWebsiteForReservation } from "@places/clients";
import type { WebsiteScanResult } from "@places/clients";
import { getResyClient, getOpenTableClient, getSevenRoomsClient } from "../utils/clients";

export interface ReservationDetectionResult {
  /** Detected provider — matches RESERVATION_PROVIDERS values from apps/web/src/lib/types.ts */
  provider: string | null;
  /** Provider-specific external ID (Resy venue ID, OT rid, 7R venue slug) */
  externalId: string | null;
  /** Direct booking URL */
  url: string | null;
  /** How many days ahead reservations are available */
  openingWindowDays: number | null;
  /** Opening pattern: "rolling", "bulk", "hybrid", "unknown" */
  openingPattern: string | null;
  /** Furthest bookable date (YYYY-MM-DD) */
  lastAvailableDate: string | null;
  /** How the provider was detected */
  source: string;
  /** All signals found during detection (for debugging) */
  signals: string[];
}

export interface PlaceInfo {
  id: number;
  name: string;
  lat: number;
  lng: number;
  websiteUrl: string | null;
}

export interface InfatuationReservationData {
  reservationPlatform?: string;
  reservationUrl?: string;
}

/**
 * Detect the reservation provider for a place.
 * Runs through: Infatuation data → website scan → Resy API → provider-specific enrichment.
 * Does NOT write to the database — returns the result for the caller to handle.
 */
export async function detectReservationProvider(
  place: PlaceInfo,
  sessionId: string,
  infatuationData?: InfatuationReservationData | null
): Promise<ReservationDetectionResult>
```

**Error handling per step:**
- Each step should be wrapped in try/catch
- If a step fails, log the error (using `console.error` or `logger` if available) and continue to the next step
- Never throw from the top-level function — always return a result (possibly with `provider: null`)
- Record errors in the `signals` array: `"resy_search_failed: <message>"`

**Merge logic:**
- `provider`: website scan > infatuation > resy API (if newly discovered)
- `externalId`: API-specific value (venue ID from Resy, rid from OT, slug from 7R)
- `url`: website scan URL > infatuation URL > constructed URL from API
- `openingWindowDays`: API-derived > website text signal
- `openingPattern`: website text signal as prior, API data overrides
- `lastAvailableDate`: only from API calls (Resy calendar, OT/7R window)
- `source`: the step that detected the provider ("infatuation", "website_scan", "resy_api")

## Existing Patterns to Follow

The provider modules in `jobs/src/providers/` (e.g., `google.ts`, `infatuation.ts`) use this pattern:
- Import clients from `../utils/clients`
- Accept a `PlaceInfo` object
- Return structured result
- Use `logger.trace()` and `logger.info()` for observability (from `@trigger.dev/sdk`)

However, this module is simpler — it doesn't need `ScrapeResult` / `upsertRating` / `upsertAudit` since it's detection-only and doesn't integrate into the audit system yet.

**Important:** Use `console.log` / `console.error` for logging (not `logger` from Trigger.dev SDK), since this module needs to work standalone in test scripts, not just inside Trigger.dev tasks.

## Helper: Name Matching

Implement a simple fuzzy name matcher for Resy search results:

```ts
function namesMatch(a: string, b: string): boolean {
  const normalize = (s: string) =>
    s.toLowerCase()
      .replace(/['']/g, "'")
      .replace(/[^a-z0-9\s']/g, "")
      .replace(/\b(the|a|an|le|la|el)\b/g, "")
      .trim()
      .replace(/\s+/g, " ");
  const na = normalize(a);
  const nb = normalize(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}
```

## Helper: Opening Pattern Parsing

Parse text (from Resy venue description or website scan) for opening pattern signals:

```ts
function parseOpeningPatternFromText(text: string): { windowDays: number | null; pattern: string | null } {
  // Check for: "reservations open X days in advance", "X-day window", etc.
  // Return extracted values
}
```

## Files to Modify

None — this is a new file. The existing clients and client helpers should already be set up by the time this module is implemented.

## Testing

Create a test script at `scripts/test-detect.ts`:

```ts
import { detectReservationProvider } from "../jobs/src/providers/reservation-detect";
import { generateSessionId } from "../jobs/src/utils/clients";

async function main() {
  const sessionId = generateSessionId();

  const testCases = [
    {
      label: "Resy restaurant (4 Charles Prime Rib, NYC)",
      place: { id: 1, name: "4 Charles Prime Rib", lat: 40.7352, lng: -74.0003, websiteUrl: "https://www.4charlesprimrib.com" },
    },
    {
      label: "OpenTable restaurant (Gramercy Tavern, NYC)",
      place: { id: 2, name: "Gramercy Tavern", lat: 40.7383, lng: -73.9885, websiteUrl: "https://www.gramercytavern.com" },
    },
    // Add more test cases as needed:
    // - SevenRooms restaurant
    // - Phone-only restaurant
    // - Walk-in-only restaurant
    // - Restaurant with no website
  ];

  for (const tc of testCases) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`TEST: ${tc.label}`);
    console.log("=".repeat(60));

    const result = await detectReservationProvider(tc.place, sessionId);

    console.log("Provider:", result.provider);
    console.log("External ID:", result.externalId);
    console.log("URL:", result.url);
    console.log("Window:", result.openingWindowDays, "days");
    console.log("Pattern:", result.openingPattern);
    console.log("Last available:", result.lastAvailableDate);
    console.log("Source:", result.source);
    console.log("Signals:", result.signals);
  }
}

main().catch(console.error);
```

Run with: `npx tsx scripts/test-detect.ts`

**Expected outputs:**

| Test case | Provider | Has externalId | Has URL | Has window | Has lastAvailable |
|-----------|----------|----------------|---------|------------|-------------------|
| 4 Charles (Resy) | resy | Yes (venue ID) | Yes (resy.com link) | Yes (from calendar) | Yes |
| Gramercy Tavern (OT) | opentable | Yes (rid) | Yes (opentable.com link) | Yes (from OT API) | Yes |
| SevenRooms place | sevenrooms | Yes (slug) | Yes (sevenrooms.com link) | Yes (from 7R API) | Yes |
| Phone-only | phone | No | No | No | No |
| Walk-in | walk_in | No | No | No | No |
| No website | resy or null | Depends | Depends | Depends | Depends |

**Verify:**
- Each step runs without errors (or errors are caught and logged)
- Signals array shows the full detection trail
- Provider values match the RESERVATION_PROVIDERS enum
- Opening window is reasonable (7-90 days for most restaurants)
- The function never throws (always returns a result)
