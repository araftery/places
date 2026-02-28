import { createFetch } from "../proxy";

const MOBILE_API = "https://mobile-api.opentable.com/api";

/**
 * Bearer token from the OpenTable iOS app.
 * This is a static app-level token (not user-specific), used to
 * authenticate all requests to the mobile API.
 */
const BEARER_TOKEN = "41dbbf15-5c4e-415b-9f45-5c1209878e42";

const MOBILE_UA =
  "com.contextoptional.OpenTable/26.9.0.4; iPhone; iOS/26.3; 3.0";

// ── Types ──────────────────────────────────────────────────────────

export interface OpenTableClientConfig {
  proxyUrl?: string;
}

export interface OpenTableSlot {
  dateTime: string; // ISO datetime e.g. "2026-03-10T19:00"
  available: boolean;
  type: string; // "Standard", "Experience", etc.
}

export interface OpenTableAvailability {
  rid: string;
  dateTime: string; // requested dateTime
  maxDaysInAdvance: number;
  hasAvailability: boolean;
  noTimesReasons: string[]; // [], ["BlockedAvailability"], ["NoTimesExist"], ["TooFarInAdvance"]
  slots: OpenTableSlot[];
}

export interface OpenTableOpeningWindow {
  rid: string;
  maxDaysInAdvance: number;
  lastAvailableDate: string; // YYYY-MM-DD (today + maxDaysInAdvance)
}

// ── Client ─────────────────────────────────────────────────────────

export function createOpenTableClient(config: OpenTableClientConfig = {}) {
  const fetchFn = createFetch(config.proxyUrl);

  function mobileHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": MOBILE_UA,
      Authorization: `Bearer ${BEARER_TOKEN}`,
    };
  }

  /**
   * Query availability for a restaurant on a specific date/time.
   *
   * Uses the OpenTable mobile API which doesn't require cookies or
   * browser session — just a static Bearer token.
   *
   * @param rid - OpenTable restaurant ID (numeric string, e.g. "942")
   * @param dateTime - ISO datetime string, e.g. "2026-03-10T19:00"
   * @param partySize - number of guests
   */
  async function getAvailability(
    rid: string,
    dateTime: string,
    partySize: number
  ): Promise<OpenTableAvailability> {
    const resp = await fetchFn(
      `${MOBILE_API}/v3/restaurant/availability`,
      {
        method: "PUT",
        headers: mobileHeaders(),
        body: JSON.stringify({
          rids: [rid],
          dateTime,
          partySize,
          forceNextAvailable: "true",
          includeNextAvailable: false,
          includePrivateDining: false,
          requestAttributeTables: "true",
          requestDateMessages: true,
          allowPop: true,
          attribution: { partnerId: "84" },
        }),
      }
    );

    if (!resp.ok) {
      throw new Error(
        `OT mobile API returned ${resp.status}: ${await resp.text()}`
      );
    }

    const json = await resp.json();
    const avail = json?.availability;

    if (!avail) {
      return {
        rid,
        dateTime,
        maxDaysInAdvance: 0,
        hasAvailability: false,
        noTimesReasons: [],
        slots: [],
      };
    }

    const slots: OpenTableSlot[] = (avail.timeslots || []).map((s: any) => ({
      dateTime: s.dateTime,
      available: s.available,
      type: s.type ?? "Standard",
    }));

    return {
      rid: avail.id ?? rid,
      dateTime,
      maxDaysInAdvance: avail.maxDaysInAdvance ?? 0,
      hasAvailability: slots.some((s) => s.available),
      noTimesReasons: avail.noTimesReasons || [],
      slots,
    };
  }

  /**
   * Get the opening window for a restaurant.
   *
   * Makes a single availability call to extract `maxDaysInAdvance`
   * from the response (no date probing needed).
   *
   * @param rid - OpenTable restaurant ID (numeric string)
   * @param partySize - number of guests (default: 2)
   */
  async function getOpeningWindow(
    rid: string,
    partySize: number = 2
  ): Promise<OpenTableOpeningWindow> {
    // Use tomorrow at 19:00 as a reasonable default query
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateTime = `${tomorrow.toISOString().split("T")[0]}T19:00`;

    const avail = await getAvailability(rid, dateTime, partySize);

    const lastDate = new Date();
    lastDate.setDate(lastDate.getDate() + avail.maxDaysInAdvance);

    return {
      rid: avail.rid,
      maxDaysInAdvance: avail.maxDaysInAdvance,
      lastAvailableDate: lastDate.toISOString().split("T")[0],
    };
  }

  return { getAvailability, getOpeningWindow };
}

export type OpenTableClient = ReturnType<typeof createOpenTableClient>;
