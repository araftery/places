# Places App

Personal web app for tracking recommended and favorite places (restaurants, bars, cafes, etc.) across cities. Map-first, mobile-friendly.

## Monorepo Structure

pnpm workspace monorepo with two packages:

```
places/
├── apps/web/          # @places/web — Next.js web app
├── packages/clients/  # @places/clients — Review site API clients
├── pnpm-workspace.yaml
└── package.json       # Root scripts proxy to @places/web
```

### `apps/web` — Next.js Web App (`@places/web`)

The main web application. All the UI, API routes, database, and auth live here.

### `packages/clients` — Review Clients (`@places/clients`)

Standalone API clients for scraping/querying restaurant review sources. Each client exposes `search()` and `lookup()` methods returning a common `SearchResult`/`LookupResult` shape.

Clients: **Google Places**, **The Infatuation**, **Beli**, **NYT Cooking/Restaurant Reviews**

Imported in the web app as `@places/clients`, `@places/clients/google`, etc.

## Tech Stack

- **pnpm** workspaces (not npm)
- **Next.js 16** (App Router) + TypeScript
- **Tailwind CSS v4** (via `@tailwindcss/postcss`)
- **Drizzle ORM** + **Neon** serverless Postgres
- **Mapbox GL JS** via `react-map-gl` v8 (import from `react-map-gl/mapbox`)
- **Google Places API v1** (New API, not legacy)
- **TravelTime API** for isochrones
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

For the clients package specifically:
- `pnpm --filter @places/clients typecheck` — Type-check clients

## Architecture

- **All state lives in `apps/web/src/app/page.tsx`** — it's a client component that fetches places/tags on mount and passes them down. No server components beyond layout and login.
- **API routes** are thin wrappers around Drizzle queries. All marked `force-dynamic`.
- **DB connection** (`apps/web/src/db/index.ts`) uses a lazy Proxy pattern to avoid build-time errors when `DATABASE_URL` isn't set.
- **Auth middleware** (`apps/web/src/middleware.ts`) checks JWT on every request except `/login`. Note: Next.js 16 shows a deprecation warning about middleware → proxy, but it still works.
- **Map component** is loaded with `next/dynamic` (SSR disabled) since Mapbox requires the DOM.

## Key Patterns

- **Google Places API v1**: Uses `X-Goog-Api-Key` and `X-Goog-FieldMask` headers, not query params. Autocomplete is limited to 5 `includedPrimaryTypes`.
- **Filters**: Defined in `apps/web/src/components/Sidebar.tsx` (`Filters` type, `applyFilters` function). Applied to both map pins and sidebar list.
- **Isochrone**: Point-in-polygon check runs client-side against GeoJSON returned from TravelTime.
- **Duplicate detection**: `AddPlaceModal` receives `existingPlaces` and checks `googlePlaceId` before allowing save.
- **Review clients**: All clients in `packages/clients/src/` follow the factory pattern (`createXClient(config)`) and return a common `SearchResult`/`LookupResult` interface.

## Environment Variables

```
DATABASE_URL          # Neon Postgres connection string
AUTH_PASSWORD         # The login password (plain text, compared directly)
AUTH_SECRET           # Random string for signing JWT cookies (openssl rand -base64 32)
NEXT_PUBLIC_MAPBOX_TOKEN  # Mapbox public access token
GOOGLE_PLACES_API_KEY     # Google Cloud API key with Places API (New) enabled
TRAVELTIME_APP_ID         # TravelTime API app ID
TRAVELTIME_API_KEY        # TravelTime API key
```

## Database

Schema is in `apps/web/src/db/schema.ts`. Four tables: `places`, `tags`, `place_tags` (junction), `place_ratings`. After schema changes, run `pnpm db:generate` then `pnpm db:migrate` (or `db:push` for quick iteration).

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
