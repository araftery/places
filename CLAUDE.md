# Places App

Personal web app for tracking recommended and favorite places (restaurants, bars, cafes, etc.) across cities. Map-first, mobile-friendly.

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

Clients: **Google Places**, **The Infatuation**, **Beli**, **NYT Cooking/Restaurant Reviews**

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
- **Oxylabs** proxy for scraping (optional, via `undici` ProxyAgent)
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
- Map pins use CSS triangles for the pointed bottom; selected pins get an amber ring
- Isochrone overlay uses amber with dashed outline
- Grain texture overlay (`.grain::before`) on the sidebar via inline SVG noise
- Stagger animation (`.animate-fade-slide-in`) on sidebar place list items
- Custom scrollbars: dark for sidebar (`.sidebar-scroll`), light for parchment (`.parchment-scroll`)
- Mapbox popup styles are overridden in `globals.css` to match parchment aesthetic
