# Places App - Implementation Plan

## Context

A personal web app for tracking recommended and favorite places (restaurants, bars, cafes, tourist sites, etc.) across cities. Replaces the current workflow of managing many separate Google My Maps lists. The app is map-first, mobile-friendly, and designed to support two core workflows: (1) quickly logging a new place when you hear about it, and (2) finding the right place to go based on where you are, what you're in the mood for, and what's nearby.

## Tech Stack

- **Framework**: Next.js (App Router)
- **Database**: Postgres (via Drizzle ORM + Neon serverless)
- **Styling**: Tailwind CSS v4
- **Maps**: Mapbox GL JS via react-map-gl
- **Place Search**: Google Places API (autocomplete + details)
- **Isochrones**: TravelTime API (walking, transit, driving)
- **Deployment**: Vercel
- **Auth**: Simple password → session cookie (single user)

## Data Model

### `places`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | auto-increment |
| name | TEXT | required |
| address | TEXT | from Google Places |
| lat | REAL | required |
| lng | REAL | required |
| city | TEXT | e.g. "New York", "London" |
| neighborhood | TEXT | e.g. "West Village", "LES" |
| place_type | TEXT | restaurant, bar, cafe, tourist_site, retail, etc. |
| cuisine_type | JSONB | JSON array: ["Italian", "Pizza"] |
| price_range | SMALLINT | 1-4 ($-$$$$) |
| website_url | TEXT | |
| menu_url | TEXT | |
| phone | TEXT | |
| status | TEXT | want_to_try, been_there, archived |
| personal_notes | TEXT | "John recommended", "get the pasta" |
| source | TEXT | how you heard about it |
| google_place_id | TEXT | unique, for de-duplication and refresh |
| hours_json | JSONB | JSON blob from Google Places |
| hours_last_fetched | TIMESTAMP | for periodic refresh |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### `tags`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| name | TEXT | unique, e.g. "date night", "group dinner", "darts" |
| color | TEXT | hex color for map pins / UI chips |

### `place_tags` (junction)
| Column | Type |
|--------|------|
| place_id | FK → places |
| tag_id | FK → tags |

### `place_ratings`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| place_id | FK → places | |
| source | TEXT | google, infatuation, nyt, michelin, beli |
| rating | TEXT | flexible: "4.5/5", "1 star", etc. |
| notes | TEXT | free text summary/comments about the review |
| rating_url | TEXT | link to review on source site |
| last_fetched | TIMESTAMP | |

## UI / UX Design

### Desktop Layout
- **Map** takes ~65% of the screen (right side)
- **Sidebar** (left, ~35%) with:
  - Search/filter controls at top (tags, status, city, neighborhood, cuisine, price range, open now toggle)
  - Scrollable list of matching places below (compact cards)
- Clicking a place in the list → highlights pin on map + shows detail panel (slides in from right or replaces sidebar)
- Floating "Add Place" button

### Mobile Layout
- **Full-screen map** with floating filter button (top) and "Add" FAB (bottom-right)
- **Bottom sheet** pulls up to show place list, filters
- Tapping a pin → bottom sheet shows place detail
- Add flow is a full-screen modal

### Map Pins
- **Color by status**: want to try (blue outline), been there (solid green), archived (gray)
- **Icon by type**: fork/knife (restaurant), cocktail glass (bar), coffee cup (cafe), camera (tourist), shopping bag (retail)
- Pins show name on hover (desktop) or tap (mobile)

### Isochrone Feature
- User taps/clicks a point on the map (or uses current location)
- Selects mode (walk / transit / drive) and time budget (5, 10, 15, 20, 30 min)
- Shaded polygon appears showing reachable area
- Places within polygon are highlighted, others dimmed

## MVP Implementation Phases

### Phase 1: Project Setup ✅ DONE
1. ✅ Initialize Next.js project (App Router) - Next.js 16.1.6 with TypeScript
2. ✅ Set up Tailwind CSS v4
3. ✅ Set up Drizzle ORM with Neon Postgres
4. ✅ Create database schema and initial migration (places, tags, place_tags, place_ratings)
5. ✅ Set up simple password auth (JWT session cookie via jose, middleware, login page)
6. Configure Vercel deployment (ready - just needs env vars + `vercel deploy`)

### Phase 2: Core Map + Places CRUD ✅ DONE
1. ✅ Integrate react-map-gl v8 with Mapbox GL JS
2. ✅ Main map view route (`/`) - render map with pins (color by status, icon by type)
3. ✅ Sidebar with scrollable place list (PlaceCard component)
4. ✅ Place detail view - show all place info, ratings, links, hours (slide-over panel)
5. ✅ Add place flow:
   - Google Places autocomplete search (New Places API v1)
   - Fetch place details (address, lat/lng, hours, rating, price range)
   - Form for: status, tags (multi-select/create), place type, cuisine, personal notes, source
   - Save to Postgres via API route
6. ✅ Edit place flow (update status, notes, source)
7. ✅ Archive/delete flow

### Phase 3: Filtering + Search ✅ DONE (built into Phase 2)
1. ✅ Tag management (create inline during add flow, display with colors)
2. ✅ Filter panel: tags (multi-select), status, city, neighborhood, cuisine, price range
3. "Open now" filter - compare current time against stored hours (TODO)
4. ✅ Text search across place names
5. ✅ City filter (populated from existing places)
6. ✅ Neighborhood filter (populated from existing places)
7. ✅ All filters apply to both map pins and sidebar list simultaneously

### Phase 4: Isochrone / Nearby Search ✅ DONE
1. ✅ Integrate TravelTime API
2. ✅ Click-to-set-point on map (or use browser geolocation)
3. ✅ Mode selector (walk / transit / drive) and time budget (5/10/15/20/30 min)
4. ✅ Fetch isochrone polygon, render on map (GeoJSON fill + outline)
5. ✅ Filter visible places to those within polygon (point-in-polygon check)
6. Show travel time to each visible place (TODO - future enhancement)

### Phase 5: Reviews + External Data ✅ DONE
1. ✅ Google rating auto-fetched on add (from Places API detail call)
2. ✅ Generate search/link URLs for: Infatuation, Beli, Yelp, Google Maps
3. ✅ Inline display of Google rating (stars + count) on place cards and detail view
4. ✅ Link-out buttons to each review source in PlaceDetail
5. ✅ Manual rating entry (user can add a rating + free text notes from any source)
6. Background job: refresh hours data weekly for all places (TODO - Vercel cron)

### Phase 6: Mobile Optimization ✅ DONE
1. ✅ Responsive layout - bottom sheet for place list on mobile, detail bottom sheet
2. ✅ Touch-friendly filter controls (chip-style buttons)
3. ✅ FAB "+" button for quick add on mobile
4. ✅ Full-screen add modal works on mobile
5. PWA setup (manifest, service worker) for home screen install (TODO)

### Post-MVP Improvements (Done)
- ✅ Auto-fill city, neighborhood, and cuisine from Google Places `addressComponents` and `types`
- ✅ Duplicate place detection (warns if `googlePlaceId` already exists, blocks save)
- ✅ Fixed add modal dropdown clipping and scroll issues
- ✅ Fixed dropdown re-appearing after selecting a suggestion

### Remaining TODO (Minor)
- "Open now" filter using stored `hoursJson`
- Travel time display per place when isochrone is active
- Vercel cron job to refresh hours data weekly
- PWA manifest + service worker
- Tag editing UI (rename, change color, delete)
- Edit place tags after creation (currently only set during add)

---

## Future Phases (Post-MVP)

### Phase 7: Infatuation Import / Discovery Feed
- Scrape Infatuation's "Hit List" and "New Restaurants" pages for NYC (and other cities)
- Present as a discovery feed: show each place with Infatuation's blurb, photos, rating
- One-tap to add to your list (with pre-filled tags/type) or dismiss
- Periodic refresh to catch new additions (weekly)
- Could extend to other curated sources (Eater, NYT best-of lists, etc.)

### Phase 8: Auto-Scraped Ratings
- Beyond Google (already auto-fetched), build scrapers for:
  - **Infatuation**: rating + summary blurb
  - **Michelin**: star count + distinction (Bib Gourmand, etc.)
  - **NYT**: star rating (if available, many are paywalled)
  - **Beli**: rating + top dishes (if scrapable)
  - **Yelp**: rating + review count
- Run on a schedule (weekly/monthly) to keep ratings current
- Show aggregated ratings in place detail (compact multi-source view)

### Phase 9: Google Maps Bulk Import
- Import from existing Google My Maps lists to bootstrap the app
- Parse KML/KMZ export files from Google My Maps
- Match imported places to Google Places API for full data enrichment
- Let you review and tag imported places before finalizing

### Phase 10: Visit Tracking
- Log individual visits: date, what you ordered, personal rating (1-5), notes, photos
- "Been there" status auto-set on first visit log
- Visit history timeline on place detail page
- Stats: most visited places, visits per month, etc.
- Optionally track spend per visit

### Phase 11: Trip Planning Mode
- Create a "trip" (e.g., "London July 2026") with dates and city
- Add places to the trip from your list or discover new ones
- Map view scoped to the trip city with only trip places shown
- Day-by-day itinerary planner: drag places into days, auto-route between them
- Neighborhood clustering: "you have 3 places in Soho, consider grouping them"
- Shareable trip link for travel companions

### Phase 12: Photos & Vibe
- Google Places photos auto-fetched and stored on add
- User-uploaded photos (from visits)
- Photo gallery view for each place
- "Vibe" tags: cozy, trendy, loud, intimate, outdoor seating, rooftop, etc.
- Visual browse mode: grid of place photos with overlay info (like an Instagram-style feed of your places)

### Phase 13: Smart Suggestions
- **Seasonal surfacing**: auto-highlight rooftop bars in summer, cozy spots in winter
- **"You haven't been here yet"**: surface highly-rated want-to-try places you added long ago
- **Similar places**: "you liked X, you might like Y" based on shared tags/cuisine/neighborhood
- **Closing soon**: surface places with limited hours that are about to close for the night
- **New in your area**: highlight recently added places near your usual neighborhoods

### Phase 14: Reservation & Action Links
- Deep links to Resy, OpenTable, Tock for reservations
- Direct link to Uber Eats / DoorDash / Seamless for delivery places
- "Call" button with phone number
- "Directions" button opening Google Maps/Apple Maps with transit directions

### Phase 15: Closed Place Detection & List Hygiene
- Periodically check Google Places API for permanently closed status
- Auto-flag closed places, prompt to archive
- "Stale" detection: places you added 6+ months ago and never visited — prompt to keep or prune
- Batch archive/delete tools for list cleanup

### Phase 16: Social Features (Lightweight)
- **Share a filtered view**: generate a public read-only link for "my cocktail bars in NYC" or "my London trip picks"
- **Friends submit recommendations**: a simple form where friends can suggest a place to you (goes into an inbox for you to review and add)
- **Export**: CSV/JSON export of all places, or filtered subsets

---

## Key External APIs

| API | Purpose | Free Tier |
|-----|---------|-----------|
| Google Places API | Place search, autocomplete, details (hours, rating, photos) | $200/mo credit (~$0.017/autocomplete, ~$0.017/details) |
| Mapbox GL JS | Map rendering | 50,000 map loads/mo |
| TravelTime API | Isochrone polygons (walk, transit, drive) | 10 req/min |
| Neon | Serverless Postgres database | 0.5 GB storage, 190 compute hours/mo |

## File Structure (Actual)

```
src/
├── app/
│   ├── layout.tsx              # Root layout (Geist font, metadata)
│   ├── page.tsx                # Main map + sidebar view (client component, all state)
│   ├── globals.css             # Tailwind v4 entry
│   ├── login/
│   │   └── page.tsx            # Password login (server action)
│   ├── api/
│   │   ├── places/
│   │   │   ├── route.ts        # GET all, POST create, PUT update, DELETE
│   │   │   └── ratings/
│   │   │       └── route.ts    # POST manual rating entry
│   │   ├── search/
│   │   │   └── route.ts        # GET autocomplete, POST place details
│   │   ├── tags/
│   │   │   └── route.ts        # CRUD for tags
│   │   └── isochrone/
│   │       └── route.ts        # POST TravelTime isochrone
│   └── middleware.ts           # Auth guard (JWT verification)
├── components/
│   ├── Map.tsx                 # Mapbox GL via react-map-gl v8, pins, isochrone overlay
│   ├── Sidebar.tsx             # Desktop sidebar: search, filters, place list
│   ├── PlaceCard.tsx           # Compact place card for list view
│   ├── PlaceDetail.tsx         # Full detail panel with edit, ratings, review links
│   ├── AddPlaceModal.tsx       # Add flow: Google autocomplete → detail fetch → form
│   ├── IsochroneControl.tsx    # Nearby search: mode, time, geolocation
│   └── MobileBottomSheet.tsx   # Mobile place list + filters bottom sheet
├── db/
│   ├── schema.ts               # Drizzle schema (places, tags, place_tags, place_ratings)
│   └── index.ts                # Lazy Neon DB connection (proxy pattern)
├── lib/
│   ├── auth.ts                 # JWT session create/verify, cookie management
│   ├── google-places.ts        # Google Places API v1 (autocomplete + details)
│   ├── traveltime.ts           # TravelTime API (isochrone polygons)
│   ├── review-links.ts         # Generate search URLs for review sources
│   └── types.ts                # Shared types, constants (Place, Tag, PlaceFormData, etc.)
drizzle/
├── 0000_sharp_slapstick.sql    # Initial migration
└── meta/                       # Drizzle migration metadata
drizzle.config.ts               # Drizzle Kit config
```

## Verification

1. **Add a place**: Search for a restaurant, verify it appears on map with correct pin, verify Google rating is fetched
2. **Filter**: Add several places with different tags/statuses, verify all filter combinations work on both map and list
3. **Open now**: Verify places correctly show as open/closed based on stored hours
4. **Isochrone**: Click a point, select walking 15min, verify polygon renders and places are filtered
5. **Mobile**: Test on phone-sized viewport, verify bottom sheet, quick-add flow, and map interaction all work
6. **Deploy**: Push to Vercel, verify Neon DB connection works, verify auth blocks unauthenticated access
