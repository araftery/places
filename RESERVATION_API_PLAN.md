# Reservation Provider Integration — Future Phases

Phase 1 (manual data entry + client-side filters) adds reservation columns to the `places` table and UI for tracking provider, booking window, and opening patterns. This document captures the plan for Phases 2 and 3: automated provider detection, metadata auditing, and live availability search.

---

## Phase 2: Provider Detection & Reservation Metadata Auditing

Goal: Automatically detect which reservation provider a place uses, populate its external ID and booking URL, and keep `lastAvailableDate` / `openingWindowDays` up to date via daily audits.

### Resy Client

**File:** `packages/clients/src/resy/index.ts`

The Resy API is undocumented but stable, reverse-engineered by the community. No partner approval needed.

```ts
interface ResyClientConfig {
  apiKey: string;
  authToken?: string;  // for future booking capability
  proxyUrl?: string;
}

function createResyClient(config: ResyClientConfig) {
  return {
    search(query, options?: { lat?, lng? }): Promise<SearchResult[]>,
    lookup(venueId: string): Promise<LookupResult>,
    findAvailability(venueId, date, partySize): Promise<ResyAvailability>,
    findLastAvailableDate(venueId, partySize?): Promise<string | null>,
  };
}
```

**Authentication:** `Authorization: ResyAPI api_key="..."` header. Key obtained from the Resy web app's network inspector — stable across sessions.

**Proxy support:** Uses existing `createFetch(config.proxyUrl)` pattern from `packages/clients/src/proxy.ts`, same as other clients.

**Env var:** `RESY_API_KEY`

### Resy API Reference

| Endpoint | Method | Params | Purpose |
|----------|--------|--------|---------|
| `api.resy.com/3/venuesearch/search` | GET | query, lat, long, per_page | Search venues by name/location |
| `api.resy.com/3/venue` | GET | venue_id | Venue details (hours, booking info) |
| `api.resy.com/4/find` | GET | venue_id, day, party_size, lat, long | Find available time slots |

All endpoints use the same `Authorization: ResyAPI api_key="..."` header. ~200ms per request. No documented rate limits, but community experience shows it's stable for personal-scale usage.

### OpenTable Detection (Lightweight)

**File:** `packages/clients/src/opentable/index.ts`

OpenTable requires partner/affiliate approval for their official API, which isn't practical for a personal app. Instead, use a lightweight detection-only approach:

```ts
function createOpenTableClient(config: { proxyUrl?: string }) {
  return {
    detect(restaurantName: string, city: string): Promise<{
      found: boolean;
      url: string | null;
      externalId: string | null;
    }>,
  };
}
```

Scrapes the public OpenTable search page (`opentable.com/s?term={name}&covers=2&...`) to determine if a restaurant is listed. Extracts the external ID from the result URL. No availability queries — just detection.

### Website Scraping Detector

**File:** `jobs/src/providers/reservation-detect.ts`

Scans a restaurant's own website (from `place.websiteUrl`) for reservation provider signals:

- Links containing `resy.com` → Resy
- Links containing `opentable.com` → OpenTable
- Links containing `sevenrooms.com` → SevenRooms
- Keywords: "walk-in only", "no reservations", "call to reserve", "by phone"

This runs as part of `initiate-coverage` and provides a fallback when direct Resy/OT search doesn't find a match.

### Resy Provider Module

**File:** `jobs/src/providers/resy.ts`

Follows the existing provider pattern (`scrapeGoogle`, `scrapeBeli`, etc.):

```ts
export async function scrapeResy(
  place: PlaceInfo,
  existingExternalId?: string | null,
  sessionId?: string
): Promise<ScrapeResult> {
  // 1. If have Resy venue ID → look up directly
  // 2. Otherwise → search by name + lat/lng
  // 3. Get venue details for booking window info
  // 4. Call findLastAvailableDate() to get furthest bookable date
  // 5. Return ScrapeResult with reservationData
}
```

**ScrapeResult extension** — add a new `reservationData` field to the existing interface:

```ts
interface ScrapeResult {
  found: boolean;
  externalId: string | null;
  ratingData: { ... } | null;
  placeData: Record<string, unknown> | null;
  reservationData: {                    // NEW
    provider: string;
    providerExternalId: string | null;
    providerUrl: string | null;
    openingWindowDays: number | null;
    lastAvailableDate: string | null;
  } | null;
}
```

### Integration with initiate-coverage

In `jobs/src/trigger/initiate-coverage.ts`:

1. Add `"resy"` to city provider arrays (cities that should be scraped for Resy)
2. After getting a scrape result with `reservationData`, update the `places` row:
   ```ts
   if (result.reservationData) {
     await db.update(places).set({
       reservationProvider: result.reservationData.provider,
       reservationExternalId: result.reservationData.providerExternalId,
       reservationUrl: result.reservationData.providerUrl,
       openingWindowDays: result.reservationData.openingWindowDays,
       lastAvailableDate: result.reservationData.lastAvailableDate,
     }).where(eq(places.id, place.id));
   }
   ```

### Audit Task

**File:** `jobs/src/trigger/audit-resy.ts`

```ts
export const auditResyTask = schedules.task({
  id: "audit-resy",
  cron: "0 8 * * *",   // Daily at 8 AM UTC
  run: async () => { ... }
});
```

**Why daily:** Reservation windows change every day (a rolling 28-day window means one new day opens each morning). Other providers audit weekly/monthly because ratings don't change that fast — but reservation metadata needs daily checks.

**What it does:**
1. Query `place_audits` where provider = "resy" and `nextAuditAt <= now()`
2. For each place: call `findLastAvailableDate(venueId)` via Resy client
3. Update `places.lastAvailableDate` and `places.lastReservationCheck`
4. If `lastAvailableDate` changed: infer/update `openingWindowDays` from the delta
5. Upsert `place_audits` with next audit = tomorrow

**Opening window inference:** By tracking `lastAvailableDate` over multiple days, the system can infer the opening window. If yesterday's last date was Mar 20 and today's is Mar 21, the window is rolling. If it jumps from Mar 28 to Apr 30 on the 1st of the month, it's bulk.

### Client Utility

**File:** `jobs/src/utils/clients.ts`

```ts
export function getResyClient(sessionId: string) {
  return createResyClient({
    apiKey: process.env.RESY_API_KEY!,
    proxyUrl: getProxyUrl(sessionId),
  });
}
```

### Auto-populated vs Manual Fields

| Field | Auto (Phase 2) | Manual |
|-------|:-:|:-:|
| `reservationProvider` | x | x (fallback) |
| `reservationExternalId` | x | |
| `reservationUrl` | x | x (override) |
| `openingWindowDays` | x (inferred from audit data) | x (initial entry) |
| `openingTime` | | x |
| `openingPattern` | x (inferred over time) | x (initial entry) |
| `openingBulkDescription` | | x |
| `lastAvailableDate` | x | x (manual override) |
| `lastReservationCheck` | x | |
| `reservationNotes` | | x |

---

## Phase 3: Live Availability Search

Goal: When the user activates "Find a table" for a specific date and party size, fetch real-time availability from Resy for all matching places and show which ones have open slots.

### Why On-Demand (Not Pre-Fetched)

Availability is ephemeral — tables get booked and released minute-by-minute. Pre-fetching would be wasteful and stale. Instead, fetch on user action and cache briefly in client state.

### API Endpoint

**File:** `apps/web/src/app/api/places/availability/route.ts`

```
POST /api/places/availability
Body: { placeIds: number[], date: string, partySize: number }
Returns: {
  results: Array<{
    placeId: number;
    available: boolean;
    slots: Array<{ time: string; type: string }> | null;
    error: string | null;
  }>
}
```

**Execution:**
1. Look up reservation config for each place ID (provider + external ID)
2. Filter to places with supported providers (Resy initially)
3. Call Resy `find` endpoint in parallel with rate limiting
4. Return availability per place

**Performance:** ~200ms per Resy call. 50 venues in parallel ≈ a few seconds total. Acceptable for an on-demand user action.

### Client-Side Integration

**Caching:** Store availability results in React state with a 5-10 minute TTL. Re-fetch when date/party size changes or cache expires.

**Filter behavior when live search is active:**
- Walk-in places: always pass (no API call needed)
- Resy places with external ID: live-checked → show if `available: true`
- Places with no provider info: shown with "unknown availability" indicator
- Places where `available: false`: dimmed/hidden based on user preference

### UI Indicators

**PlaceCard:**
- Green dot + "Available" for places with open slots
- Specific time slots shown (e.g., "7:00, 8:30, 9:15")
- "Walk-in" badge for walk-in places
- Dimmed card for "No availability"

**PlaceDetail — Availability section:**
```
AVAILABILITY — Mar 1 for 2
┌─────────────────────────────┐
│  5:30 PM  ·  7:00 PM       │
│  8:30 PM  ·  9:15 PM       │
│  [Book on Resy ↗]           │
└─────────────────────────────┘
```

Shows time slots returned by Resy with a direct booking link.

---

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary provider | Resy | Undocumented but stable API, no approval needed, strong community reverse-engineering |
| OpenTable approach | Detection only | Requires partner approval for official API; detection sufficient for personal app |
| Availability fetching | On-demand with client caching | Availability is ephemeral; pre-fetching is wasteful |
| Client pattern | Factory function in `packages/clients` | Matches existing Google/Infatuation/Beli/NYT clients |
| ScrapeResult | Extend with `reservationData` field | Clean separation from rating data; natural integration with audit system |
| Audit frequency | Daily for Resy | Reservation windows change daily, unlike ratings which are stable for weeks/months |
| Data model | Columns on `places` table | Simpler than a separate table; single query; 1:1 relationship with places |

## Environment Variables (New)

| Variable | Used By | Purpose |
|----------|---------|---------|
| `RESY_API_KEY` | `@places/clients`, `@places/jobs` | Resy API authentication |

OpenTable detection uses public pages and doesn't require an API key.

## Files to Create/Modify

### Phase 2
| File | Action |
|------|--------|
| `packages/clients/src/resy/index.ts` | Create — Resy API client |
| `packages/clients/src/opentable/index.ts` | Create — OpenTable detection client |
| `jobs/src/providers/resy.ts` | Create — Resy provider module |
| `jobs/src/providers/reservation-detect.ts` | Create — Website scraping detector |
| `jobs/src/trigger/audit-resy.ts` | Create — Daily Resy audit task |
| `jobs/src/utils/clients.ts` | Modify — Add `getResyClient()` |
| `jobs/src/utils/ratings.ts` | Modify — Add reservation upsert logic |
| `jobs/src/trigger/initiate-coverage.ts` | Modify — Add Resy to scraper map |
| `packages/clients/src/types.ts` | Modify — Add `reservationData` to `ScrapeResult` |

### Phase 3
| File | Action |
|------|--------|
| `apps/web/src/app/api/places/availability/route.ts` | Create — Availability endpoint |
| `apps/web/src/components/Sidebar.tsx` | Modify — Live search trigger |
| `apps/web/src/components/PlaceCard.tsx` | Modify — Availability indicators |
| `apps/web/src/components/PlaceDetail.tsx` | Modify — Time slot display |

## Phase 1 Schema Fields That Support Future Automation

These fields are entered manually in Phase 1 but become auto-populated in Phase 2:

- `reservationProvider` — detected by Resy search, OpenTable detection, or website scraping
- `reservationExternalId` — Resy venue ID or OpenTable restaurant ID, needed for API lookups
- `reservationUrl` — constructed from provider + external ID
- `lastAvailableDate` — updated daily by `audit-resy` task
- `openingWindowDays` — inferred from `lastAvailableDate` changes over time
- `lastReservationCheck` — set by audit task on each run
