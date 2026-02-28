import { createFetch } from "../proxy";

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

    const res = await fetchFn(`${BASE_URL}/3/venuesearch/search`, {
      method: "POST",
      headers: { ...defaultHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Resy search error: ${text}`);
    }

    const data = await res.json();
    const hits = data?.search?.hits ?? [];

    return hits.map((hit: any) => ({
      venueId: hit.id?.resy,
      name: hit.name,
      urlSlug: hit.url_slug,
      regionId: hit.region?.id ?? "",
      lat: hit.location?.latitude ?? null,
      lng: hit.location?.longitude ?? null,
    }));
  }

  async function getVenue(venueId: number): Promise<ResyVenue> {
    const params = new URLSearchParams({ id: String(venueId) });

    const res = await fetchFn(`${BASE_URL}/3/venue?${params}`, {
      headers: defaultHeaders,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Resy venue error: ${text}`);
    }

    const data = await res.json();

    const contentBodies: string[] = (data.content ?? [])
      .map((c: any) => c.body)
      .filter((b: any): b is string => typeof b === "string" && b.length > 0);

    return {
      venueId: data.id?.resy,
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

    const res = await fetchFn(`${BASE_URL}/4/venue/calendar?${params}`, {
      headers: defaultHeaders,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Resy calendar error: ${text}`);
    }

    const data = await res.json();

    const days: ResyCalendarDay[] = (data.scheduled ?? []).map((day: any) => ({
      date: day.date,
      status: day.inventory?.reservation ?? "closed",
    }));

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

    const data = await res.json();
    const venues = data?.results?.venues ?? [];
    if (venues.length === 0) return [];

    return (venues[0].slots ?? []).map((slot: any) => ({
      configId: slot.config?.id ?? "",
      type: slot.config?.type ?? "",
      startTime: slot.date?.start ?? "",
      endTime: slot.date?.end ?? "",
    }));
  }

  return { search, getVenue, getCalendar, findAvailability };
}

export type ResyClient = ReturnType<typeof createResyClient>;
