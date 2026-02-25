# Website Scanner

## Goal

Create a website scanning utility at `packages/clients/src/website-scanner/index.ts` that fetches a restaurant's website HTML and detects reservation provider signals: links to booking platforms, embedded widgets, and text patterns about how the restaurant takes reservations.

This is NOT a traditional factory client — it's a utility module that exports a single function.

## Context

This is part of a larger reservation provider detection system. The website scanner is step 2 in the detection pipeline (after checking Infatuation data). It's the primary method for detecting OpenTable, SevenRooms, Tock, and non-platform reservation methods (phone, walk-in, WhatsApp). For Resy, website detection is a complement to the Resy API search (step 3).

The scanner produces:
- The detected **provider** (resy, opentable, sevenrooms, tock, phone, walk_in, other, none)
- The **booking URL** found on the page
- An **external ID** extracted from the URL (rid for OT, venue slug for 7R, etc.)
- **Opening window/pattern** text signals from the page content
- A list of all **signals** found (for debugging/logging)

## Design

### What to scan

Fetch the page HTML with a reasonable User-Agent and timeout. Parse the HTML as a string (no need for a full DOM parser — regex/string matching on the raw HTML is fine for link and embed detection).

### Provider link detection

Scan all `href="..."`, `src="..."`, and `action="..."` attribute values for known provider URLs:

| URL contains | Provider | ID extraction |
|-------------|----------|---------------|
| `resy.com/cities/` | resy | venue slug: last path segment (e.g., `/cities/ny/4-charles-prime-rib` → `4-charles-prime-rib`) |
| `resy.com` (other paths) | resy | URL itself as booking URL |
| `opentable.com/restref/client/?rid=` | opentable | `rid` query param value |
| `opentable.com/widget/` with `rid=` | opentable | `rid` query param value |
| `opentable.com/r/` | opentable | slug from path (e.g., `/r/gramercy-tavern-new-york`) |
| `opentable.com` (other) | opentable | URL itself |
| `sevenrooms.com/reservations/` | sevenrooms | venue slug from path (e.g., `/reservations/venue-name` → `venue-name`) |
| `sevenrooms.com/explore/` or other | sevenrooms | URL itself |
| `exploretock.com/` | other (tock) | URL itself |
| `tock.com/` | other (tock) | URL itself |
| `yelp.com/reservations/` | other (yelp) | URL itself |

### Widget/embed detection

Scan for inline `<script>` and `<iframe>` elements that reference provider platforms:

| Pattern in HTML | Provider | ID extraction |
|----------------|----------|---------------|
| `opentable.com/widget` or `opentable.com/booking` with `rid=` nearby | opentable | `rid` value (look for `rid=(\d+)` pattern) |
| `sevenrooms.com` with `venueId` nearby | sevenrooms | `venueId` value (look for `venueId['":\s]*['"]?([a-zA-Z0-9-]+)`) |
| `widgets.resy.com` or `resy.com` in script/iframe | resy | URL or slug |

### Text signal detection

Extract visible text from the HTML body (strip tags, decode entities) and scan for patterns (case-insensitive):

| Pattern (regex or substring) | Result |
|------------------------------|--------|
| `walk[- ]?ins? only` | provider = `walk_in` |
| `no reservations` | provider = `walk_in` or `none` |
| `call (to\|for) reserv(e\|ations)` | provider = `phone` |
| `reserv(e\|ations) by phone` | provider = `phone` |
| `phone only` | provider = `phone` |
| `whatsapp` (in reservation context) | provider = `phone`, note "WhatsApp" in signals |
| `message us to (book\|reserve)` | provider = `phone` |
| `reservations? open (\d+) days? in advance` | openingWindowDays = captured number, openingPattern = `rolling` |
| `(\d+)[- ]day (rolling\|booking)? ?window` | openingWindowDays = captured number, openingPattern = `rolling` |
| `rolling window` | openingPattern = `rolling` |
| `reservations? (open\|release[ds]?\|available) (on\|every) the (\d+)(st\|nd\|rd\|th)?` | openingPattern = `bulk` |
| `released? monthly` | openingPattern = `bulk` |
| `first (come\|served)` | provider = `walk_in` |

### Generic booking link detection

If no known provider is found, look for `<a>` elements whose visible text matches booking-related phrases:
- Text contains: "reserve", "book a table", "make a reservation", "reservations", "book now"
- The `href` is NOT a provider URL (already handled above)
- Result: provider = `other`, url = the href value

### Priority / conflict resolution

If multiple signals are found (e.g., a Resy link AND text saying "walk-in only"), provider links take priority over text signals. Specifically:

1. Provider links/widgets (resy, opentable, sevenrooms) — highest priority
2. Generic booking links — medium priority
3. Text signals (phone, walk-in) — lowest priority (may be outdated text on the page)

If multiple provider links are found (rare but possible), prefer in order: resy > opentable > sevenrooms > other.

## File to Create

### `packages/clients/src/website-scanner/index.ts`

```ts
export interface WebsiteScanResult {
  /** Detected provider (matches RESERVATION_PROVIDERS values) */
  provider: string | null;
  /** Booking URL found on the page */
  url: string | null;
  /** Provider-specific external ID (rid, venue slug, etc.) */
  externalId: string | null;
  /** Opening window in days (from text signals) */
  openingWindowDays: number | null;
  /** Opening pattern (from text signals) */
  openingPattern: string | null;   // "rolling" | "bulk" | null
  /** All signals found during scanning (for debugging) */
  signals: string[];
}

/**
 * Scan a restaurant's website HTML for reservation provider signals.
 * Fetches the page and checks for provider links, widget embeds, and text patterns.
 *
 * @param websiteUrl - The restaurant's website URL
 * @param fetchFn - Optional fetch function (for proxy support). Defaults to globalThis.fetch.
 * @returns Scan result with detected provider info, or null provider if nothing found
 */
export async function scanWebsiteForReservation(
  websiteUrl: string,
  fetchFn?: typeof globalThis.fetch
): Promise<WebsiteScanResult>
```

**Implementation approach:**

1. Fetch the page with a browser-like User-Agent, 10s timeout, follow redirects
2. Get the HTML string from the response
3. Run all detection passes (links, widgets, text) and collect signals
4. Apply priority resolution
5. Return the merged result

**Error handling:**
- If fetch fails (network error, timeout, 403, etc.), return `{ provider: null, url: null, externalId: null, openingWindowDays: null, openingPattern: null, signals: ["fetch_failed: <error message>"] }`
- Don't throw — the orchestrator needs graceful degradation

**HTML parsing notes:**
- No need for a full DOM parser library. Use regex on the raw HTML string.
- For text signal detection, strip HTML tags with a simple regex (`html.replace(/<[^>]+>/g, ' ')`) to get approximate visible text
- Be careful with URL extraction — `href` values may be relative, protocol-relative, or absolute. Resolve against the base URL when constructing booking URLs.
- Decode HTML entities in extracted text (`&amp;` → `&`, etc.)

## Files to Modify

### `packages/clients/src/index.ts`

Add exports:
```ts
export { scanWebsiteForReservation } from "./website-scanner/index.js";
export type { WebsiteScanResult } from "./website-scanner/index.js";
```

### `packages/clients/package.json`

Add to `exports`:
```json
"./website-scanner": "./src/website-scanner/index.ts"
```

## Important Notes

- Provider values must match `apps/web/src/lib/types.ts` RESERVATION_PROVIDERS: `"resy"`, `"opentable"`, `"sevenrooms"`, `"thefork"`, `"walk_in"`, `"phone"`, `"other"`, `"none"`
- The function accepts an optional `fetchFn` parameter so the orchestrator can pass a proxy-enabled fetch (from `createFetch(proxyUrl)`)
- Keep regex patterns simple and readable — comment each one with what it matches
- The `signals` array should be human-readable strings describing what was found, e.g.: `"link: resy.com/cities/ny/4-charles (provider=resy)"`, `"text: 'reservations open 14 days in advance' (window=14, pattern=rolling)"`, `"widget: opentable rid=1180"`

## Testing

Create a test script at `scripts/test-website-scanner.ts`:

```ts
import { scanWebsiteForReservation } from "@places/clients";

async function main() {
  const urls = [
    // Resy restaurant — should have a resy.com link
    "https://www.4charlesprimrib.com",
    // OpenTable restaurant — should have OT widget or link
    "https://www.gramercytavern.com",
    // Walk-in / no reservations
    // (find a known walk-in-only restaurant)
    // Phone only
    // (find a known phone-reservation restaurant)
  ];

  for (const url of urls) {
    console.log(`\n=== Scanning: ${url} ===`);
    try {
      const result = await scanWebsiteForReservation(url);
      console.log("Provider:", result.provider);
      console.log("URL:", result.url);
      console.log("External ID:", result.externalId);
      console.log("Window:", result.openingWindowDays, "days");
      console.log("Pattern:", result.openingPattern);
      console.log("Signals:", result.signals);
    } catch (err) {
      console.error("Error:", err);
    }
  }
}

main().catch(console.error);
```

Run with: `npx tsx scripts/test-website-scanner.ts`

**Expected output:**
- Resy restaurant: `provider=resy`, URL contains resy.com, possibly a venue slug as externalId
- OT restaurant: `provider=opentable`, URL contains opentable.com, rid as externalId
- Walk-in restaurant: `provider=walk_in`, signals mention the walk-in text found
- Failed fetch: provider is null, signals contain the error

**Verify:**
- URLs are properly resolved (relative → absolute)
- Multiple signals are all captured in the signals array
- Priority resolution works (provider link beats text signal)
- Graceful failure on unreachable/bot-protected sites
