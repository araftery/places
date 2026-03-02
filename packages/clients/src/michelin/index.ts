import { z } from "zod";
import type { SearchResult, LookupResult } from "../types";
import { createFetch } from "../proxy";

// ── Algolia Config ──────────────────────────────────────────────
const ALGOLIA_APP_ID = "8NVHRD7ONV";
const ALGOLIA_SEARCH_KEY = "3222e669cf890dc73fa5f38241117ba5";
const ALGOLIA_ENDPOINT = `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/*/queries`;
const ALGOLIA_INDEX = "prod-restaurants-en";

// ── Zod Schemas ──────────────────────────────────────────────────

const AlgoliaLocationSchema = z
  .object({
    lat: z.number(),
    lng: z.number(),
  })
  .passthrough();

const AlgoliaHitSchema = z
  .object({
    objectID: z.string(),
    name: z.string().nullable().optional(),
    slug: z.string().nullable().optional(),
    city: z
      .object({
        name: z.string().optional(),
        slug: z.string().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    region: z
      .object({
        name: z.string().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    country: z
      .object({
        name: z.string().optional(),
        code: z.string().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    _geoloc: AlgoliaLocationSchema.nullable().optional(),
    street: z.string().nullable().optional(),
    zip_code: z.string().nullable().optional(),
    michelin_award: z.string().nullable().optional(),
    stars: z.number().nullable().optional(),
    green_star: z.number().nullable().optional(),
    cuisines: z
      .array(
        z
          .object({
            label: z.string().optional(),
            slug: z.string().optional(),
          })
          .passthrough()
      )
      .optional(),
    price_category: z
      .object({
        label: z.string().optional(),
        slug: z.string().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    image: z.string().nullable().optional(),
    main_image: z
      .object({
        url: z.string().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    url: z.string().nullable().optional(),
    chef: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    main_desc: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    site_url: z.string().nullable().optional(),
    booking: z
      .object({
        url: z.string().optional(),
        provider: z.string().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

const AlgoliaResultSchema = z
  .object({
    results: z.array(
      z
        .object({
          hits: z.array(AlgoliaHitSchema).default([]),
          nbHits: z.number().optional(),
          page: z.number().optional(),
          nbPages: z.number().optional(),
          hitsPerPage: z.number().optional(),
        })
        .passthrough()
    ),
  })
  .passthrough();

// ── Price mapping ──────────────────────────────────────────────

const PRICE_MAP: Record<string, number> = {
  affordable: 1,
  "mid-range": 2,
  premium: 3,
  luxury: 4,
};

function mapPrice(slug: string | null | undefined): number | null {
  if (!slug) return null;
  return PRICE_MAP[slug.toLowerCase()] ?? null;
}

// ── Types ──────────────────────────────────────────────────────

export interface MichelinRestaurant {
  objectID: string;
  name: string;
  slug: string;
  lat: number | null;
  lng: number | null;
  street: string | null;
  city: string | null;
  country: string | null;
  distinction: string;
  stars: number;
  greenStar: boolean;
  cuisines: string[];
  priceLevel: number | null;
  priceLabel: string | null;
  description: string | null;
  imageUrl: string | null;
  chef: string | null;
  url: string;
  phone: string | null;
  bookingUrl: string | null;
}

export interface MichelinListResult {
  restaurants: MichelinRestaurant[];
  totalHits: number;
  page: number;
  totalPages: number;
}

export interface MichelinClientConfig {
  proxyUrl?: string;
}

const AWARD_TO_STARS: Record<string, number> = {
  THREE_STARS: 3,
  TWO_STARS: 2,
  ONE_STAR: 1,
};

function deriveStars(award: string | null | undefined, numericStars: number | null | undefined): number {
  if (award && AWARD_TO_STARS[award] != null) return AWARD_TO_STARS[award];
  if (numericStars && numericStars > 0) return numericStars;
  return 0;
}

function mapHitToRestaurant(hit: z.infer<typeof AlgoliaHitSchema>): MichelinRestaurant {
  const imageUrl =
    hit.main_image?.url || hit.image || null;
  const award = hit.michelin_award || "selected";
  const stars = deriveStars(award, hit.stars);

  return {
    objectID: hit.objectID,
    name: hit.name || "",
    slug: hit.slug || "",
    lat: hit._geoloc?.lat ?? null,
    lng: hit._geoloc?.lng ?? null,
    street: hit.street || null,
    city: hit.city?.name || null,
    country: hit.country?.name || null,
    distinction: award,
    stars,
    greenStar: (hit.green_star ?? 0) > 0,
    cuisines: (hit.cuisines || [])
      .map((c) => c.label)
      .filter((l): l is string => !!l),
    priceLevel: mapPrice(hit.price_category?.slug),
    priceLabel: hit.price_category?.label || null,
    description: hit.main_desc || hit.description || null,
    imageUrl,
    chef: hit.chef || null,
    url: hit.url || `/en/restaurant/${hit.slug}`,
    phone: hit.phone || null,
    bookingUrl: hit.booking?.url || null,
  };
}

// ── Client Factory ──────────────────────────────────────────────

export function createMichelinClient(config?: MichelinClientConfig) {
  const fetchFn = createFetch(config?.proxyUrl);

  async function algoliaQuery(
    params: string,
    hitsPerPage = 20,
    page = 0
  ): Promise<z.infer<typeof AlgoliaResultSchema>> {
    const res = await fetchFn(ALGOLIA_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Algolia-Application-Id": ALGOLIA_APP_ID,
        "X-Algolia-API-Key": ALGOLIA_SEARCH_KEY,
        Referer: "https://guide.michelin.com/",
        Origin: "https://guide.michelin.com",
      },
      body: JSON.stringify({
        requests: [
          {
            indexName: ALGOLIA_INDEX,
            params: `${params}&hitsPerPage=${hitsPerPage}&page=${page}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Michelin Algolia query error: ${text}`);
    }

    return AlgoliaResultSchema.parse(await res.json());
  }

  /**
   * List restaurants for a city (Discover browsing).
   * Optional distinction filter: "3 STARS", "2 STARS", "1 STAR", "BIB_GOURMAND", "SELECTED"
   */
  async function listRestaurants(
    citySlug: string,
    options?: { distinction?: string; page?: number; hitsPerPage?: number }
  ): Promise<MichelinListResult> {
    const page = options?.page ?? 0;
    const hitsPerPage = options?.hitsPerPage ?? 20;

    let filters = `status:Published AND city.slug:"${citySlug}"`;
    if (options?.distinction) {
      filters += ` AND michelin_award:"${options.distinction}"`;
    }

    const params = `filters=${encodeURIComponent(filters)}`;
    const data = await algoliaQuery(params, hitsPerPage, page);
    const result = data.results[0];

    return {
      restaurants: (result?.hits || []).map(mapHitToRestaurant),
      totalHits: result?.nbHits || 0,
      page: result?.page || 0,
      totalPages: result?.nbPages || 0,
    };
  }

  /**
   * Search by name near a location (for initiate-coverage matching).
   */
  async function search(
    name: string,
    options?: { lat?: number; lng?: number; limit?: number }
  ): Promise<SearchResult[]> {
    const limit = options?.limit ?? 5;

    let params = `query=${encodeURIComponent(name)}&filters=${encodeURIComponent('status:Published')}`;
    if (options?.lat != null && options?.lng != null) {
      params += `&aroundLatLng=${options.lat},${options.lng}&aroundRadius=2000`;
    }

    const data = await algoliaQuery(params, limit, 0);
    const hits = data.results[0]?.hits || [];

    return hits.map((hit) => {
      const r = mapHitToRestaurant(hit);
      return {
        externalId: r.objectID,
        provider: "michelin",
        name: r.name,
        summary: r.description,
        rating: r.stars > 0 ? r.stars : null,
        ratingScale: r.stars > 0 ? "0-3" : null,
        priceLevel: r.priceLevel,
        cuisines: r.cuisines,
        lat: r.lat,
        lng: r.lng,
        neighborhood: null,
        url: `https://guide.michelin.com${r.url}`,
      };
    });
  }

  /**
   * Fetch a single restaurant by objectID.
   */
  async function lookup(objectID: string): Promise<LookupResult> {
    const params = `filters=${encodeURIComponent(`objectID:"${objectID}"`)}`;
    const data = await algoliaQuery(params, 1, 0);
    const hit = data.results[0]?.hits?.[0];

    if (!hit) {
      throw new Error(`No Michelin restaurant found for objectID: ${objectID}`);
    }

    const r = mapHitToRestaurant(hit);
    return {
      externalId: r.objectID,
      provider: "michelin",
      name: r.name,
      summary: r.description,
      rating: r.stars > 0 ? r.stars : null,
      ratingScale: r.stars > 0 ? "0-3" : null,
      priceLevel: r.priceLevel,
      cuisines: r.cuisines,
      lat: r.lat,
      lng: r.lng,
      neighborhood: null,
      url: `https://guide.michelin.com${r.url}`,
      address: r.street,
      city: r.city,
      state: null,
      reviewer: null,
      isCriticsPick: r.stars > 0,
      reviewDate: null,
      ratingCount: null,
      raw: hit,
    };
  }

  return {
    listRestaurants,
    search,
    lookup,
  };
}

export type MichelinClient = ReturnType<typeof createMichelinClient>;
