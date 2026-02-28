import { createFetch } from "../proxy";

const BASE_URL = "https://www.sevenrooms.com/api-yoa/availability/widget/range";

/**
 * Max num_days the widget API accepts. Only 1 and 3 are valid;
 * anything else returns 400.
 */
const MAX_BATCH_DAYS = 3;

// ── Types ──────────────────────────────────────────────────────────

export interface SevenRoomsClientConfig {
  proxyUrl?: string;
}

export interface SevenRoomsSlot {
  time: string; // e.g. "5:30 PM"
  timeIso: string; // e.g. "2026-03-01 17:30:00"
  type: "book" | "request" | string;
  duration: number | null; // minutes
  shiftCategory: string; // e.g. "DINNER"
  shiftName: string;
}

export interface SevenRoomsAvailability {
  date: string; // YYYY-MM-DD
  slots: SevenRoomsSlot[];
}

export interface SevenRoomsOpeningWindow {
  lastAvailableDate: string | null; // YYYY-MM-DD
  openingWindowDays: number | null;
}

// ── Client ─────────────────────────────────────────────────────────

export function createSevenRoomsClient(
  config: SevenRoomsClientConfig = {}
) {
  const fetchFn = createFetch(config.proxyUrl);

  /**
   * Query availability for a venue on a specific date.
   * Returns all slots (both "book" and "request" types).
   * Filter to `type === "book"` for instantly bookable slots.
   */
  async function getAvailability(
    venueSlug: string,
    date: string,
    partySize: number,
    timeSlot: string = "19:00"
  ): Promise<SevenRoomsAvailability[]> {
    return fetchRange(venueSlug, date, 1, partySize, timeSlot);
  }

  /**
   * Probe forward to find the furthest bookable date.
   *
   * Uses a two-phase approach:
   *  1. Exponential jump: start 14 days out and leap by 14 days
   *     until we hit a 3-day window with no bookable slots.
   *  2. Binary search: narrow between last-known-bookable and
   *     first-known-empty positions using 3-day queries.
   */
  async function getOpeningWindow(
    venueSlug: string,
    partySize: number = 2
  ): Promise<SevenRoomsOpeningWindow> {
    const today = new Date();
    const todayStr = formatDate(today);
    const JUMP_DAYS = 28;

    /** Check a 3-day window and return the latest bookable date, or null. */
    async function probe(startDate: string): Promise<string | null> {
      const results = await fetchRange(
        venueSlug,
        startDate,
        MAX_BATCH_DAYS,
        partySize,
        "19:00"
      );
      const bookable = results
        .filter((r) => r.slots.some((s) => s.type === "book"))
        .map((r) => r.date);
      return bookable.length > 0 ? bookable.sort().pop()! : null;
    }

    // Phase 1: Jump forward by JUMP_DAYS until we find an empty window
    let lastBookable: string | null = null;
    let lo = 0; // days offset of last-known-bookable probe
    let hi = 0; // days offset of first-known-empty probe
    let offset = JUMP_DAYS;

    while (offset <= 180) {
      const startDate = addDays(todayStr, offset);
      const result = await probe(startDate);

      if (result) {
        lastBookable = result;
        lo = offset;
        offset += JUMP_DAYS;
      } else {
        hi = offset;
        break;
      }
    }

    // If we never found any bookable slots at the first probe,
    // check near-term (from today) as a fallback
    if (!lastBookable) {
      const nearResult = await probe(todayStr);
      if (!nearResult) {
        return { lastAvailableDate: null, openingWindowDays: null };
      }
      lastBookable = nearResult;
      lo = 0;
      // If hi is still 0 (jumped past 180 with bookable slots), cap it
      if (hi === 0) hi = 180;
    }

    // If we exited without finding an empty window (offset > 180), done
    if (hi === 0) {
      const diffMs =
        new Date(lastBookable).getTime() - today.getTime();
      return {
        lastAvailableDate: lastBookable,
        openingWindowDays: Math.ceil(diffMs / 86_400_000),
      };
    }

    // Phase 2: Binary search between lo and hi to find the exact boundary.
    // Each probe covers 3 days, so we stop when the gap is small.
    while (hi - lo > MAX_BATCH_DAYS) {
      const mid = lo + Math.floor((hi - lo) / 2);
      const startDate = addDays(todayStr, mid);
      const result = await probe(startDate);

      if (result) {
        if (result > lastBookable!) lastBookable = result;
        lo = mid;
      } else {
        hi = mid;
      }
    }

    const diffMs =
      new Date(lastBookable!).getTime() - today.getTime();
    const openingWindowDays = Math.ceil(diffMs / 86_400_000);

    return { lastAvailableDate: lastBookable, openingWindowDays };
  }

  // ── Internal helpers ───────────────────────────────────────────

  async function fetchRange(
    venueSlug: string,
    startDate: string,
    numDays: number,
    partySize: number,
    timeSlot: string
  ): Promise<SevenRoomsAvailability[]> {
    const params = new URLSearchParams({
      venue: venueSlug,
      time_slot: timeSlot,
      party_size: String(partySize),
      start_date: startDate,
      num_days: String(numDays),
      halo_size_interval: "16",
      channel: "SEVENROOMS_WIDGET",
    });

    const res = await fetchFn(`${BASE_URL}?${params}`);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `SevenRooms API error ${res.status}: ${text}`
      );
    }

    const json = await res.json();
    const availability = json?.data?.availability ?? {};

    const results: SevenRoomsAvailability[] = [];

    for (const dateKey of Object.keys(availability).sort()) {
      const shifts: any[] = availability[dateKey] ?? [];
      const slots: SevenRoomsSlot[] = [];

      for (const shift of shifts) {
        if (shift.is_closed) continue;

        for (const t of shift.times ?? []) {
          slots.push({
            time: t.time,
            timeIso: t.time_iso,
            type: t.type,
            duration: t.duration ?? null,
            shiftCategory: shift.shift_category ?? "",
            shiftName: shift.name ?? "",
          });
        }
      }

      results.push({ date: dateKey, slots });
    }

    return results;
  }

  return { getAvailability, getOpeningWindow };
}

export type SevenRoomsClient = ReturnType<typeof createSevenRoomsClient>;

// ── Date helpers ─────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}
