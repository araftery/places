# Places App

Personal web app for tracking recommended and favorite places (restaurants, bars, cafes, etc.) across cities. Map-first, mobile-friendly.

./KEY_USE_CASES.md lists the key use cases of the app

## Rules

- Always use `pnpm` (never `npm` or `npx`) for running scripts, installing packages, and executing tools (e.g. `pnpm tsx` not `npx tsx`)

## Monorepo Structure

pnpm workspace monorepo:

```
places/
├── apps/web/          # @places/web — Next.js web app
├── jobs/              # @places/jobs — Trigger.dev async job system
├── packages/
│   ├── clients/       # @places/clients — Review site API clients
│   └── db/            # @places/db — Shared Drizzle schema + DB connection
├── scripts/           # Seed scripts (e.g. seed-cities.ts)
├── pnpm-workspace.yaml
└── package.json       # Root scripts proxy to @places/web
```

### `apps/web` — Next.js Web App (`@places/web`)

The main web application. All the UI, API routes, and auth live here. DB schema and connection are imported from `@places/db`.

### `packages/db` — Database (`@places/db`)

Shared Drizzle ORM schema and lazy-proxy DB connection. Used by both `@places/web` and `@places/jobs`.

### `packages/clients` — Review Clients (`@places/clients`)

Standalone API clients for scraping/querying restaurant review sources. Each client exposes `search()` and `lookup()` methods returning a common `SearchResult`/`LookupResult` shape. All clients support optional `proxyUrl` config for routing through Oxylabs.

Clients: **Google Places**, **The Infatuation**, **Beli**, **NYT Cooking/Restaurant Reviews**, **Resy**, **OpenTable**

Also includes a **Website Scanner** utility (`packages/clients/src/website-scanner/index.ts`) — not a traditional client but a `scanWebsiteForReservation(url, options)` function that:
1. Uses **Playwright** (headless Chromium) to load a restaurant's website with full JS rendering, optionally proxied through **Oxylabs**
2. **Two-hop scan**: loads homepage, then follows any internal "Reservations" link to also scan that page
3. Extracts visible text, links, and script/iframe embeds from both pages
4. Sends the extracted content to **Google Gemini** (`gemini-flash-latest`) for structured analysis
5. Returns detected reservation provider, booking URL, external ID, opening window, and opening pattern

Requires `GEMINI_API_KEY` env var (stored in `jobs/.env`). Dependencies: `playwright`, `@google/generative-ai`.

### `jobs/` — Trigger.dev Jobs (`@places/jobs`)

Async job system for multi-source rating scraping and scheduled audits:
- `initiate-coverage` — triggered when a place is added, scrapes all providers for the place's city
- `audit-google` — weekly scheduled Google data refresh (hours, closed status)
- `audit-infatuation` — monthly Infatuation re-scrape
- `audit-beli` — biweekly Beli re-scrape
- `audit-nyt` — monthly NYT re-scrape

## Tech Stack

- **pnpm** workspaces (not npm)
- **Next.js 16** (App Router) + TypeScript
- **Tailwind CSS v4** (via `@tailwindcss/postcss`)
- **Drizzle ORM** + **Neon** serverless Postgres
- **Trigger.dev v4** for async jobs and scheduled tasks
- **Mapbox GL JS** via `react-map-gl` v8 (import from `react-map-gl/mapbox`)
- **Google Places API v1** (New API, not legacy)
- **TravelTime API** for isochrones
- **Oxylabs** proxy for scraping (optional, via `undici` ProxyAgent and Playwright proxy config)
- **Playwright** for headless browser scraping (website scanner)
- **Google Gemini** (`gemini-flash-latest`) for LLM-based website analysis
- **jose** for JWT session cookies
- Single-user auth (password → JWT cookie)

## Commands

All commands run from the **repo root** (they proxy to `@places/web` via `pnpm --filter`):

- `pnpm dev` — Start dev server
- `pnpm build` — Production build
- `pnpm db:generate` — Generate Drizzle migration from schema changes
- `pnpm db:push` — Push schema directly to database (no migration file)
- `pnpm db:migrate` — Run pending migrations
- `pnpm db:studio` — Open Drizzle Studio (DB browser)

For other packages:
- `pnpm --filter @places/clients typecheck` — Type-check clients
- `cd jobs && pnpm dev` — Start Trigger.dev dev server
- `npx tsx scripts/seed-cities.ts` — Seed cities table

## Architecture

- **All state lives in `apps/web/src/app/page.tsx`** — it's a client component that fetches places/tags/cities on mount and passes them down. No server components beyond layout and login.
- **API routes** are thin wrappers around Drizzle queries. All marked `force-dynamic`.
- **DB schema** lives in `packages/db/src/schema.ts`. Web app re-exports from `@places/db/schema`.
- **DB connection** (`packages/db/src/index.ts`) uses a lazy Proxy pattern to avoid build-time errors when `DATABASE_URL` isn't set.
- **Auth middleware** (`apps/web/src/middleware.ts`) checks JWT on every request except `/login`.
- **Map component** is loaded with `next/dynamic` (SSR disabled) since Mapbox requires the DOM.
- **Cities** are first-class entities with per-city provider coverage config. Places have `cityId` FK → `cities`.
- **Place audits** (`place_audits` table) track when each provider was last scraped per place, with `next_audit_at` for scheduling.
- **Trigger.dev** tasks handle async scraping. POST `/api/places` fires `initiate-coverage` after creating a place.

## Key Patterns

- **Google Places API v1**: Uses `X-Goog-Api-Key` and `X-Goog-FieldMask` headers, not query params. Autocomplete is limited to 5 `includedPrimaryTypes`.
- **Filters**: Defined in `apps/web/src/components/Sidebar.tsx` (`Filters` type, `applyFilters` function). City filter uses `cityId` (number). Applied to both map pins and sidebar list.
- **Isochrone**: Point-in-polygon check runs client-side against GeoJSON returned from TravelTime.
- **Duplicate detection**: `AddPlaceModal` receives `existingPlaces` and checks `googlePlaceId` before allowing save.
- **City auto-detection**: After Google lookup returns lat/lng, `AddPlaceModal` calls `GET /api/cities/closest` to auto-select the nearest city. Includes inline city creation.
- **Review clients**: All clients in `packages/clients/src/` follow the factory pattern (`createXClient(config)`) and return a common `SearchResult`/`LookupResult` interface. All accept optional `proxyUrl`.
- **Provider modules**: `jobs/src/providers/` encapsulate scraping logic per source. Both `initiate-coverage` and audit tasks use the same modules.
- **Shared geo helpers**: `apps/web/src/lib/geo.ts` exports `isPointInPolygon`, `isInIsochrone`, `getTravelTimeBand`, and `TravelTimeBand` type. Used by both `page.tsx` and `DiscoverPanel` for isochrone filtering and travel time display.
- **Map pins (native layers)**: My Places render as GPU-accelerated Mapbox GL circle layers (not React Markers) for performance at scale. A GeoJSON FeatureCollection is built via `useMemo` from `places` with properties like `categoryColor`, `isSelected`, `isBuildMode`. Layers: `place-shadows` (blurred shadow beneath), `place-dots` (filled circles with white stroke), `place-selected-ring` (amber ring). Click handling uses `interactiveLayerIds` + feature detection in the `onClick` handler. Isochrone layers use `beforeId="place-shadows"` to render below dots.
- **Place type categories**: 17 place types map to 6 categories (`PLACE_TYPE_CATEGORY` in `types.ts`), each with a pastel color (`CATEGORY_COLORS`). Categories: sitdown_dining (terracotta), quick_eats (gold), cocktail_wine (plum), casual_bars (teal), cafes_bakeries (amber), other (taupe). Circle radius scales with zoom level via Mapbox `interpolate` expressions.

## Discover Tab (Infatuation Guide Browser)

Browse Infatuation restaurant guides (Hitlist, New Openings, Top 25, etc.) per city and one-click add restaurants to your places list. Only available when the selected city has an `infatuationSlug` (stored on `cities` table).

### Infatuation Client Methods

In `packages/clients/src/infatuation/index.ts`:
- `listGuides(canonicalPath)` — queries Infatuation PSS GraphQL for all guides in a city
- `getGuideContent(slug)` — queries Infatuation Contentful GraphQL for a guide's restaurants (handles both `Caption` and `CaptionGroup` content types)
- Types: `GuideListItem`, `GuideRestaurant`, `GuideVenue`, `GuideContent`

### API Routes

- `GET /api/discover/guides?citySlug=/new-york` — lists guides for a city
- `GET /api/discover/guides/[slug]` — fetches guide content (restaurants)
- `POST /api/discover/add` — auto-matches Infatuation venue to Google Places, saves via same logic as `POST /api/places`. Request: `{ name, lat, lng, cityId, source }`. Returns `{ matched, duplicate?, place? }`

Shared helper `mapGoogleDetailsToPlace()` in `apps/web/src/lib/google-places.ts` extracts address parsing + cuisine derivation logic used by both `/api/search` and `/api/discover/add`.

### Components

- **`DiscoverPanel`** (`apps/web/src/components/DiscoverPanel.tsx`) — main browser with guide list → guide detail views. Auto-selects "New Openings" (if available) or "Hit List" on load. New Openings sorted newest-first, limited to 75 restaurants. Pushes `DiscoverPin[]` to the map via `onDiscoverPinsChange`.
- **`DiscoverRestaurantCard`** (`apps/web/src/components/DiscoverRestaurantCard.tsx`) — restaurant card with add button states: idle → adding → added/duplicate/no-match.

### Key Behaviors

- **Map pins**: When Discover tab is active, My Places native layers are hidden (`showPlaces` flag). Discover pins are React Markers (small filled circles with white stroke) — amber for new restaurants, slate-blue for already-in-list.
- **"Already in list" detection**: Matches by Infatuation review slug in `place_ratings.externalId` (source: `"infatuation"`), with name fallback. Uses slate-blue accent color in both map pins and sidebar cards.
- **Isochrone integration**: Discover restaurants filter to those within the isochrone polygon. Travel time bands display on cards. Sort-by-nearest auto-activates when isochrone is active.
- **Auto-open PlaceDetail**: Clicking an in-list card or in-list map pin opens the matching place's detail panel. Newly added places auto-open after the places list refreshes (via `pendingOpenPlaceId` state + effect). `DiscoverPin` includes `matchedPlaceId` for in-list pins so the map click can resolve the Place without going through DiscoverPanel.
- **Tab system**: `activeTab` state is lifted to `page.tsx` and passed as props to both `Sidebar` and `MobileBottomSheet`. This ensures tab state survives across PlaceDetail open/close. Switching to "My Places" clears discover pins (via effect in `page.tsx` with `tabMountedRef` guard to skip initial mount).
- **MobileBottomSheet persistence**: MobileBottomSheet is always mounted but hidden via CSS (`className={showDetail ? "hidden" : ""}`) rather than conditionally rendered. This preserves DiscoverPanel state (selected guide, loaded restaurants, pins) when PlaceDetail opens and closes.
- **Pin ↔ card selection**: Index mapping between sorted restaurant list and pin list computed via `useMemo` from `sortedRestaurants`. Clicking a map pin scrolls to and highlights the sidebar card, and vice versa. Cards have `scroll-mt-12` to clear the sticky "< Guides" header during auto-scroll.
- **Map click behavior**: Clicking blank map closes PlaceDetail and deselects pins/places (handled in `handleMapClick` in `page.tsx`). In discover mode, clicking a non-in-list pin closes any open detail; clicking an in-list pin opens PlaceDetail for the matched place.
- **Sticky guide header**: The "< Guides" back button in DiscoverPanel uses `sticky -top-3` with `bg-[var(--color-sidebar-bg)]` to stay visible while scrolling through restaurants.
- **Mobile map behavior**: Popups/tooltips are not rendered on mobile (detected via `isMobile` state in Map component). FlyTo padding varies by context: 80% for discover panel (expanded at `top-[20vh]`), 50% for PlaceDetail (`max-h-[70vh]`), 25% for collapsed bottom sheet.

## Neighborhood Boundary Overlays

Togglable neighborhood boundary lines + labels on the map. On by default. Icon-only toggle button sits next to the "Nearby" isochrone control.

### Data Pipeline
- **Source**: Static GeoJSON files at `apps/web/public/neighborhoods/{city-slug}.json`
- **Prep script**: `scripts/process-neighborhoods.ts` — downloads raw GeoJSON from city open data portals, filters to residential areas, simplifies geometry (Douglas-Peucker), outputs `{ name }` features
- **Adding a city**: Add an entry to the `CITY_SOURCES` array in `process-neighborhoods.ts` (URL, name property, optional filter/transform), add slug to `CITIES_WITH_NEIGHBORHOODS` in `apps/web/src/lib/neighborhoods.ts`, run the script

### Key Files
- **`apps/web/src/lib/neighborhoods.ts`** — `CITIES_WITH_NEIGHBORHOODS` allowlist, `getCitySlug()`, `fetchNeighborhoodGeoJson()` with module-level `Map` cache
- **`apps/web/src/components/Map.tsx`** — Three Mapbox GL layers (fill, line, symbol) rendered with `beforeId="place-shadows"`. Labels placed at bbox centroids via `useMemo`. Not in `INTERACTIVE_LAYER_IDS` (no click handling)
- **`apps/web/src/app/page.tsx`** — `showNeighborhoods` state (default `true`), `neighborhoodGeoJson` state, fetch effect on city/toggle change, `cityHasNeighborhoods` derived from allowlist, icon toggle button

### Behaviors
- Toggle button only shows for cities in the allowlist
- Layers persist in discover mode (useful context); `beforeId` conditionally applied only when `showPlaces` is true
- Module-level cache makes re-toggle instant
- Switching cities clears and re-fetches GeoJSON

## Environment Variables

```
# Web app (Vercel)
DATABASE_URL              # Neon Postgres connection string
AUTH_PASSWORD             # The login password (plain text, compared directly)
AUTH_SECRET               # Random string for signing JWT cookies
NEXT_PUBLIC_MAPBOX_TOKEN  # Mapbox public access token
GOOGLE_PLACES_API_KEY     # Google Cloud API key with Places API (New) enabled
TRAVELTIME_APP_ID         # TravelTime API app ID
TRAVELTIME_API_KEY        # TravelTime API key
TRIGGER_SECRET_KEY        # Trigger.dev SDK auth

# Trigger.dev jobs
DATABASE_URL              # Neon Postgres connection string
GOOGLE_PLACES_API_KEY     # Google audit task
BELI_PHONE_NUMBER         # Beli client auth
BELI_PASSWORD             # Beli client auth
BELI_USER_ID              # Beli client auth
OXYLABS_USERNAME          # Proxy (optional)
OXYLABS_PASSWORD          # Proxy (optional)
GEMINI_API_KEY            # Google Gemini API key (website scanner)
```

## Database

Schema is in `packages/db/src/schema.ts`. Six tables: `cities`, `places`, `tags`, `place_tags` (junction), `place_ratings`, `place_audits`. After schema changes, run `pnpm db:generate` then `pnpm db:migrate` (or `db:push` for quick iteration). Drizzle config points to `../../packages/db/src/schema.ts`.

## Visual Design

**Aesthetic**: Warm editorial cartography — personal travel journal meets modern map app.

### Typography
- **Libre Baskerville** (`--font-libre-baskerville`) — serif display font for headings, place names, panel titles
- **DM Sans** (`--font-dm-sans`) — geometric sans-serif for all body/UI text, labels, buttons

### Color Palette (CSS variables in `globals.css`)
- **Ink** (`--color-ink: #1a1612`) — primary text on light backgrounds
- **Parchment** (`--color-parchment: #faf6f1`) — warm off-white, used for detail panel and modals
- **Cream** (`--color-cream: #f5efe6`) — secondary light surface (cards, input backgrounds on parchment)
- **Sidebar bg** (`--color-sidebar-bg: #1e1b18`) — dark warm brown for sidebar and mobile bottom sheet
- **Sidebar surface** (`--color-sidebar-surface: #2a2520`) — elevated surface within dark sidebar
- **Amber** (`--color-amber: #c47d2e`) — primary accent for buttons, active states, links, focus rings
- **Terracotta** (`--color-terracotta: #b5543b`) — destructive actions (delete)
- **Sage** (`--color-sage: #5a7a5e`) — "been there" status
- **Slate blue** (`--color-slate-blue: #5b7b9a`) — "want to try" status
- **Muted brown** (`--color-status-archived: #8a7e72`) — archived status

### Design Rules
- Sidebar and mobile bottom sheet use the **dark theme** (sidebar-bg, sidebar-surface, sidebar-text)
- Detail panel, modals, and isochrone control use the **parchment theme** (parchment, cream, ink)
- All section labels use `text-[11px] font-semibold uppercase tracking-wider` for a consistent editorial feel
- Filter chips and tag chips use `rounded-md` (not fully rounded pills)
- Active filter/tag chips get amber background (or tag color for tags); inactive get sidebar-surface
- Map pins are native Mapbox circle layers colored by place type category (pastel tones) with white strokes and subtle shadows; selected pins get an amber ring. Discover/preview pins are React Markers styled as small filled circles to match
- Isochrone overlay uses amber with dashed outline
- Grain texture overlay (`.grain::before`) on the sidebar via inline SVG noise
- Stagger animation (`.animate-fade-slide-in`) on sidebar place list items
- Custom scrollbars: dark for sidebar (`.sidebar-scroll`), light for parchment (`.parchment-scroll`)
- Mapbox popup styles are overridden in `globals.css` to match parchment aesthetic
