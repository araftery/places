# Places App - Remaining Work Phases

All MVP phases (1–6) are complete. The work below covers remaining polish items and post-MVP features, organized into dependency-ordered phases.

---

## Phase 1: Core Polish (no dependencies)

Quick wins that improve everyday usability. All items are independent of each other.

### 1A — Tag Editing UI ([#1](https://github.com/araftery/places/issues/1))
Add the ability to rename tags, change tag colors, and delete tags from within the sidebar filter panel.

### 1B — Edit Place Tags After Creation ([#2](https://github.com/araftery/places/issues/2))
Allow adding/removing tags on an existing place from the PlaceDetail panel (currently tags can only be set during the add flow).

### 1C — "Open Now" Filter ([#3](https://github.com/araftery/places/issues/3))
Add a toggle filter that hides places that are currently closed, using the stored `hoursJson` periods data and the user's local time.

### 1D — Travel Time Display Per Place ([#4](https://github.com/araftery/places/issues/4))
When an isochrone is active, show the estimated travel time to each visible place in the sidebar list and on map popups.

---

## Phase 2: Data Freshness & Hygiene (no dependencies)

Background jobs to keep place data current and flag stale entries. Complements Phase 1C ("Open Now" filter) but neither depends on the other — hours data already exists in the DB from the add flow.

### 2A — Vercel Cron Job for Hours Refresh ([#5](https://github.com/araftery/places/issues/5))
Set up a scheduled cron endpoint that re-fetches `regularOpeningHours` from Google Places API for all places and updates `hoursJson` / `hoursLastFetched`. Makes the "Open Now" filter accurate over time.

### 2B — Closed Place Detection & Auto-Archive ([#6](https://github.com/araftery/places/issues/6))
Periodically check Google Places API for `businessStatus: CLOSED_PERMANENTLY`. Auto-flag closed places and prompt to archive. Also surface "stale" places (added 6+ months ago, never visited) for review.

---

## Phase 3: Import & External Data (no dependencies)

Bulk data ingestion and multi-source ratings. Items are independent but share similar patterns.

### 3A — Google Maps Bulk Import ([#7](https://github.com/araftery/places/issues/7))
Parse KML/KMZ exports from Google My Maps, match imported places against Google Places API for data enrichment, and let the user review/tag before saving.

### 3B — Auto-Scraped Ratings ([#8](https://github.com/araftery/places/issues/8))
Build scrapers (or structured search) for Infatuation, Michelin, Yelp, and others. Run on a schedule to keep ratings current. Display aggregated multi-source ratings in PlaceDetail.

### 3C — Infatuation Discovery Feed ([#9](https://github.com/araftery/places/issues/9))
Scrape Infatuation's "Hit List" and "New Restaurants" pages. Present as a discovery feed with one-tap add-to-list or dismiss. Periodic refresh for new additions.

---

## Phase 4: Action Links & PWA (no dependencies)

Utility features that make the app more actionable and installable.

### 4A — Reservation & Action Deep Links ([#10](https://github.com/araftery/places/issues/10))
Add deep links to Resy, OpenTable, Tock for reservations. Add Uber Eats / DoorDash / Seamless links for delivery. Add "Directions" button opening native maps with transit directions.

### 4B — PWA Manifest & Service Worker ([#11](https://github.com/araftery/places/issues/11))
Add `manifest.json` and a service worker for home-screen install on mobile. Cache critical assets for offline shell loading.

---

## Phase 5: Visit Tracking (no dependencies)

Log visits to places with structured data.

### 5A — Visit Logging ([#12](https://github.com/araftery/places/issues/12))
New `visits` table (date, what you ordered, personal rating 1–5, notes). UI in PlaceDetail to log a visit. Auto-set status to `been_there` on first visit.

### 5B — Visit History & Stats ([#13](https://github.com/araftery/places/issues/13))
Visit history timeline on PlaceDetail. Stats dashboard: most visited places, visits per month, total visits.

---

## Phase 6: Rich Media & Vibe (depends on Phase 5 for user photos from visits)

Photos and atmosphere tagging.

### 6A — Google Places Photos on Add ([#14](https://github.com/araftery/places/issues/14))
Fetch and store photo references from Google Places API during the add flow. Display photo gallery in PlaceDetail.

### 6B — User Photo Uploads ([#15](https://github.com/araftery/places/issues/15))
Allow users to upload their own photos (from visits or otherwise). Store in cloud storage (e.g., Vercel Blob or S3).

### 6C — Vibe Tags ([#16](https://github.com/araftery/places/issues/16))
Add a separate "vibe" dimension: cozy, trendy, loud, intimate, outdoor seating, rooftop, etc. Filterable in the sidebar.

---

## Phase 7: Trip Planning (depends on Phase 5 for visit data, benefits from Phase 6 for photos)

Plan and organize places for upcoming trips.

### 7A — Trip Creation & Place Assignment ([#17](https://github.com/araftery/places/issues/17))
Create named trips with dates and city. Add places to a trip from your list. Map view scoped to trip city showing only trip places.

### 7B — Day-by-Day Itinerary & Routing ([#18](https://github.com/araftery/places/issues/18))
Drag-and-drop places into days. Auto-route between places. Neighborhood clustering suggestions ("you have 3 places in Soho, consider grouping them").

### 7C — Shareable Trip Links ([#19](https://github.com/araftery/places/issues/19))
Generate a public read-only link for a trip so travel companions can view the itinerary.

---

## Phase 8: Smart Suggestions (depends on Phase 5 for visit history)

Contextual, intelligent place surfacing.

### 8A — Seasonal & Contextual Surfacing ([#20](https://github.com/araftery/places/issues/20))
Auto-highlight rooftop bars in summer, cozy spots in winter. Surface places with limited hours that are about to close.

### 8B — Personalized Recommendations ([#21](https://github.com/araftery/places/issues/21))
"You haven't been here yet" prompts for old want-to-try places. "Similar places" based on shared tags/cuisine/neighborhood. "New in your area" for recently added places.

---

## Phase 9: Social Features (depends on Phase 7C for sharing patterns)

Lightweight sharing and collaboration.

### 9A — Shareable Filtered Views ([#22](https://github.com/araftery/places/issues/22))
Generate public read-only links for filtered subsets ("my cocktail bars in NYC").

### 9B — Friend Recommendation Inbox ([#23](https://github.com/araftery/places/issues/23))
Simple form where friends can suggest a place. Goes into an inbox for review and one-tap add.

### 9C — CSV/JSON Export ([#24](https://github.com/araftery/places/issues/24))
Export all places (or filtered subsets) as CSV or JSON.

---

## Dependency Graph

```
Phase 1 (Core Polish) ──────────────── no dependencies
  ├── 1A Tag Editing
  ├── 1B Edit Place Tags
  ├── 1C Open Now Filter ◄──► Phase 2 (complement)
  └── 1D Travel Time Display

Phase 2 (Data Freshness) ─────────── no dependencies
Phase 3 (Import & External Data) ── no dependencies
Phase 4 (Action Links & PWA) ────── no dependencies

Phase 5 (Visit Tracking) ─────────── no dependencies
  ├──► Phase 6 (Rich Media)
  ├──► Phase 7 (Trip Planning) ◄── Phase 6
  ├──► Phase 8 (Smart Suggestions)
  └──► Phase 9 (Social) ◄──── Phase 7
```

Phases 1–5 can all be started in parallel since they have no inter-dependencies.
