import { z } from "zod";
import { createFetch } from "../proxy";

// ── Zod Schemas ──────────────────────────────────────────────────

const ResySearchHitSchema = z.object({
  id: z.object({ resy: z.number() }).passthrough().optional(),
  name: z.string(),
  url_slug: z.string(),
  region: z.union([z.object({ id: z.string() }).passthrough(), z.string()]).optional(),
  location: z.object({
    latitude: z.number().optional(),
    longitude: z.number().optional(),
  }).passthrough().optional(),
}).passthrough();

const ResySearchResponseSchema = z.object({
  search: z.object({
    hits: z.array(ResySearchHitSchema).default([]),
  }).passthrough(),
}).passthrough();

const ResyContentItemSchema = z.object({
  body: z.string().nullable().optional(),
}).passthrough();

const ResyVenueResponseSchema = z.object({
  id: z.object({ resy: z.number() }).passthrough().optional(),
  name: z.string(),
  url_slug: z.string(),
  location: z.object({
    region: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
  }).passthrough().optional(),
  contact: z.object({
    url: z.string().optional(),
  }).passthrough().optional(),
  content: z.array(ResyContentItemSchema).default([]),
}).passthrough();

const ResyCalendarDaySchema = z.object({
  date: z.string(),
  inventory: z.object({
    reservation: z.string().optional(),
  }).passthrough().optional(),
}).passthrough();

const ResyCalendarResponseSchema = z.object({
  last_calendar_day: z.string(),
  scheduled: z.array(ResyCalendarDaySchema).default([]),
}).passthrough();

const ResySlotSchema = z.object({
  config: z.object({
    id: z.string().optional(),
    type: z.string().optional(),
  }).passthrough().optional(),
  date: z.object({
    start: z.string().optional(),
    end: z.string().optional(),
  }).passthrough().optional(),
}).passthrough();

const ResyFindVenueSchema = z.object({
  slots: z.array(ResySlotSchema).default([]),
}).passthrough();

const ResyFindResponseSchema = z.object({
  results: z.object({
    venues: z.array(ResyFindVenueSchema).default([]),
  }).passthrough(),
}).passthrough();

const BASE_URL = "https://api.resy.com";

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
  content: string[];
  raw: unknown;
}

export interface ResyCalendarDay {
  date: string;
  status: "available" | "sold-out" | "closed";
}

export interface ResyCalendar {
  lastCalendarDay: string;
  days: ResyCalendarDay[];
}

export interface ResySlot {
  configId: string;
  type: string;
  startTime: string;
  endTime: string;
}

export function createResyClient(config: ResyClientConfig) {
  const fetchFn = createFetch(config.proxyUrl);
  const defaultHeaders: Record<string, string> = {
    Authorization: `ResyAPI api_key="${config.apiKey}"`,
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
  };

  async function search(
    query: string,
    options?: { lat?: number; lng?: number; perPage?: number }
  ): Promise<ResySearchResult[]> {
    const body: Record<string, unknown> = {
      query,
      per_page: options?.perPage ?? 5,
      types: ["venue", "cuisine"],
    };
    if (options?.lat != null && options?.lng != null) {
      body.geo = { latitude: options.lat, longitude: options.lng };
    }

    console.log(`[resy-client] search request:`, JSON.stringify(body));

    const res = await fetchFn(`${BASE_URL}/3/venuesearch/search`, {
      method: "POST",
      headers: { ...defaultHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[resy-client] search error: ${res.status} ${text}`);
      throw new Error(`Resy search error: ${text}`);
    }

    const raw = await res.json();
    console.log(`[resy-client] search raw response hits:`, JSON.stringify(raw.search?.hits?.length ?? 0));
    const data = ResySearchResponseSchema.parse(raw);

    const results = data.search.hits.map((hit) => ({
      venueId: hit.id?.resy!,
      name: hit.name,
      urlSlug: hit.url_slug,
      regionId: typeof hit.region === "string" ? hit.region : hit.region?.id ?? "",
      lat: hit.location?.latitude ?? null,
      lng: hit.location?.longitude ?? null,
    }));

    console.log(`[resy-client] search results:`, JSON.stringify(results.map((r) => ({ name: r.name, venueId: r.venueId, slug: r.urlSlug, regionId: r.regionId }))));
    return results;
  }

  async function getVenue(venueId: number): Promise<ResyVenue> {
    const params = new URLSearchParams({ id: String(venueId) });
    console.log(`[resy-client] getVenue request: venueId=${venueId}`);

    const res = await fetchFn(`${BASE_URL}/3/venue?${params}`, {
      headers: defaultHeaders,
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[resy-client] getVenue error: ${res.status} ${text}`);
      throw new Error(`Resy venue error: ${text}`);
    }

    const raw = await res.json();
    const data = ResyVenueResponseSchema.parse(raw);

    const contentBodies: string[] = data.content
      .map((c) => c.body)
      .filter((b): b is string => typeof b === "string" && b.length > 0);

    console.log(`[resy-client] getVenue response: name=${data.name}, slug=${data.url_slug}, contentItems=${contentBodies.length}`);

    return {
      venueId: data.id?.resy!,
      name: data.name,
      urlSlug: data.url_slug,
      regionId: data.location?.region ?? "",
      lat: data.location?.latitude ?? null,
      lng: data.location?.longitude ?? null,
      websiteUrl: data.contact?.url ?? null,
      content: contentBodies,
      raw: data,
    };
  }

  async function getCalendar(
    venueId: number,
    numSeats: number,
    startDate: string,
    endDate: string
  ): Promise<ResyCalendar> {
    const params = new URLSearchParams({
      venue_id: String(venueId),
      num_seats: String(numSeats),
      start_date: startDate,
      end_date: endDate,
    });

    console.log(`[resy-client] getCalendar request: venueId=${venueId}, seats=${numSeats}, start=${startDate}, end=${endDate}`);

    const res = await fetchFn(`${BASE_URL}/4/venue/calendar?${params}`, {
      headers: defaultHeaders,
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[resy-client] getCalendar error: ${res.status} ${text}`);
      throw new Error(`Resy calendar error: ${text}`);
    }

    const raw = await res.json();
    const data = ResyCalendarResponseSchema.parse(raw);

    const days: ResyCalendarDay[] = data.scheduled.map((day) => ({
      date: day.date,
      status: (day.inventory?.reservation ?? "closed") as ResyCalendarDay["status"],
    }));

    console.log(`[resy-client] getCalendar response: lastCalendarDay=${data.last_calendar_day}, scheduledDays=${days.length}, availableDays=${days.filter((d) => d.status === "available").length}`);

    return {
      lastCalendarDay: data.last_calendar_day,
      days,
    };
  }

  async function findAvailability(
    venueId: number,
    date: string,
    partySize: number,
    options?: { lat?: number; lng?: number }
  ): Promise<ResySlot[]> {
    const body = {
      venue_id: venueId,
      day: date,
      party_size: partySize,
      lat: options?.lat ?? 0,
      long: options?.lng ?? 0,
    };

    const res = await fetchFn(`${BASE_URL}/4/find`, {
      method: "POST",
      headers: { ...defaultHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Resy find availability error: ${text}`);
    }

    const data = ResyFindResponseSchema.parse(await res.json());
    const venues = data.results.venues;
    if (venues.length === 0) return [];

    return venues[0].slots.map((slot) => ({
      configId: slot.config?.id ?? "",
      type: slot.config?.type ?? "",
      startTime: slot.date?.start ?? "",
      endTime: slot.date?.end ?? "",
    }));
  }

  return { search, getVenue, getCalendar, findAvailability };
}

export type ResyClient = ReturnType<typeof createResyClient>;
