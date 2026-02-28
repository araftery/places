import { logger } from "@trigger.dev/sdk";
import { scanWebsiteForReservation } from "../utils/website-scanner";
import type { WebsiteScanResult } from "../utils/website-scanner";
import {
  getResyClient,
  getOpenTableClient,
  getSevenRoomsClient,
  getProxyUrl,
} from "../utils/clients";

// ── Types ──────────────────────────────────────────────────────────

export interface PlaceInfo {
  id: number;
  name: string;
  lat: number;
  lng: number;
  websiteUrl: string | null;
}

export interface InfatuationReservationData {
  reservationPlatform?: string | null;
  reservationUrl?: string | null;
}

export interface ReservationDetectionResult {
  provider: string | null;
  externalId: string | null;
  url: string | null;
  openingWindowDays: number | null;
  openingPattern: string | null;
  openingTime: string | null;
  lastAvailableDate: string | null;
  source: string | null; // which step produced the provider
  signals: string[];
}

// ── Helpers ────────────────────────────────────────────────────────

/** Normalize a name for fuzzy comparison: lowercase, strip articles/punctuation, collapse whitespace. */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^(the|a|an)\s+/i, "")
    .replace(/[''"".,\-&!@#$%^*()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fuzzy name match: checks if either normalized name contains the other. */
function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}

/** Haversine distance in meters between two lat/lng points. */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Max distance in meters to consider a lat/lng match. */
const MAX_LATLNG_MATCH_METERS = 200;

/** Format a Date as YYYY-MM-DD. */
function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

/** Parse Resy venue content (e.g. "Need to Know") for opening time, window, and pattern. */
function parseResyContent(contentTexts: string[]): {
  openingTime: string | null;
  openingWindowDays: number | null;
  openingPattern: string | null;
} {
  const text = contentTexts.join("\n");

  // Opening time: "available at 9 AM", "becoming available at 10:00 AM", "released at midnight"
  const timeMatch = text.match(
    /(?:available|released|open(?:s|ing)?|drop(?:s|ped)?)\s+(?:at|@)\s+(1?\d(?::?\d{2})?\s*(?:AM|PM|am|pm|a\.m\.|p\.m\.)|midnight|noon)/i
  );
  const openingTime = timeMatch ? timeMatch[1].trim() : null;

  // Opening window: "X days in advance", "up to X days"
  const daysMatch = text.match(/(\d+)\s*days?\s*(?:in\s*advance|out|ahead)/i);
  const openingWindowDays = daysMatch ? parseInt(daysMatch[1], 10) : null;

  // Opening pattern: "each new date" / "rolling" → rolling; "first of the month" / "released on the" → bulk
  let openingPattern: string | null = null;
  if (/each\s+new\s+date|rolling|daily/i.test(text)) {
    openingPattern = "rolling";
  } else if (/first\s+of\s+(the\s+)?month|released\s+on\s+(the\s+)?\d|every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month)/i.test(text)) {
    openingPattern = "bulk";
  }

  return { openingTime, openingWindowDays, openingPattern };
}

/** Map Infatuation platform strings to our provider enum values. */
function mapInfatuationPlatform(platform: string): string | null {
  const normalized = platform.toLowerCase().trim();
  if (normalized.includes("resy")) return "resy";
  if (normalized.includes("opentable")) return "opentable";
  if (normalized.includes("sevenrooms") || normalized.includes("seven rooms")) return "sevenrooms";
  if (normalized.includes("tock")) return "tock";
  if (normalized.includes("yelp")) return "other";
  return null;
}

/** Extract a provider-specific external ID from a reservation URL. */
function extractExternalIdFromUrl(url: string, provider: string): string | null {
  try {
    const parsed = new URL(url);
    if (provider === "opentable") {
      // /r/slug or rid= param
      const ridParam = parsed.searchParams.get("rid");
      if (ridParam) return ridParam;
      const rMatch = parsed.pathname.match(/\/r\/([^/?]+)/);
      if (rMatch) return rMatch[1];
    }
    if (provider === "resy") {
      // /cities/<city>/venues/<slug> (canonical) or /cities/<city>/<slug> (legacy)
      const resyMatch = parsed.pathname.match(/\/cities\/[^/]+\/(?:venues\/)?([^/?]+)/);
      if (resyMatch) return resyMatch[1];
    }
    if (provider === "sevenrooms") {
      // /reservations/<slug>
      const srMatch = parsed.pathname.match(/\/reservations\/([^/?]+)/);
      if (srMatch) return srMatch[1];
    }
  } catch {
    // invalid URL
  }
  return null;
}

// Providers we can enrich with API calls
const ENRICHABLE_PROVIDERS = new Set(["resy", "opentable", "sevenrooms"]);

// ── Main Detection Function ────────────────────────────────────────

export async function detectReservationProvider(
  place: PlaceInfo,
  sessionId: string,
  infatuationData?: InfatuationReservationData
): Promise<ReservationDetectionResult> {
  const result: ReservationDetectionResult = {
    provider: null,
    externalId: null,
    url: null,
    openingWindowDays: null,
    openingPattern: null,
    openingTime: null,
    lastAvailableDate: null,
    source: null,
    signals: [],
  };

  // ── Step 1: Infatuation data ──────────────────────────────────

  logger.info("[detect] Step 1: Checking Infatuation data", {
    hasInfatuationData: !!infatuationData,
    platform: infatuationData?.reservationPlatform ?? null,
    url: infatuationData?.reservationUrl ?? null,
  });

  if (infatuationData?.reservationPlatform) {
    const mapped = mapInfatuationPlatform(infatuationData.reservationPlatform);
    if (mapped) {
      result.provider = mapped;
      result.source = "infatuation";
      result.signals.push(`infatuation_platform: ${infatuationData.reservationPlatform} → ${mapped}`);
      logger.info("[detect] Infatuation mapped provider", { raw: infatuationData.reservationPlatform, mapped });
    } else {
      result.signals.push(`infatuation_platform_unknown: ${infatuationData.reservationPlatform}`);
      logger.warn("[detect] Infatuation platform not recognized", { platform: infatuationData.reservationPlatform });
    }
  }

  if (infatuationData?.reservationUrl) {
    result.url = infatuationData.reservationUrl;
    result.signals.push(`infatuation_url: ${infatuationData.reservationUrl}`);
    // Try to extract external ID from the URL
    if (result.provider) {
      const eid = extractExternalIdFromUrl(infatuationData.reservationUrl, result.provider);
      if (eid) {
        result.externalId = eid;
        result.signals.push(`infatuation_external_id: ${eid}`);
        logger.info("[detect] Extracted external ID from Infatuation URL", { eid, url: infatuationData.reservationUrl });
      } else {
        logger.warn("[detect] Could not extract external ID from Infatuation URL", { url: infatuationData.reservationUrl, provider: result.provider });
      }
    }
  }

  // ── Step 2: Website scan ──────────────────────────────────────

  logger.info("[detect] Step 2: Website scan", { websiteUrl: place.websiteUrl });

  if (place.websiteUrl) {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      result.signals.push("website_scan_skipped: no GEMINI_API_KEY");
      logger.warn("[detect] Website scan skipped: no GEMINI_API_KEY");
    } else {
      try {
        const proxyUrl = getProxyUrl(sessionId);
        logger.info("[detect] Starting website scan", { url: place.websiteUrl, hasProxy: !!proxyUrl });
        const scanResult: WebsiteScanResult = await scanWebsiteForReservation(
          place.websiteUrl,
          { geminiApiKey, proxyUrl }
        );

        logger.info("[detect] Website scan complete", {
          provider: scanResult.provider,
          url: scanResult.url,
          externalId: scanResult.externalId,
          openingWindowDays: scanResult.openingWindowDays,
          openingPattern: scanResult.openingPattern,
          openingTime: scanResult.openingTime,
          signalCount: scanResult.signals.length,
        });

        result.signals.push(...scanResult.signals.map((s) => `webscan: ${s}`));

        // Website scan overrides Infatuation (more authoritative)
        if (scanResult.provider) {
          result.provider = scanResult.provider;
          result.source = "website_scan";
          result.signals.push(`webscan_provider: ${scanResult.provider}`);
        }
        if (scanResult.url) {
          result.url = scanResult.url;
        }
        if (scanResult.externalId) {
          result.externalId = scanResult.externalId;
        }
        if (scanResult.openingWindowDays != null) {
          result.openingWindowDays = scanResult.openingWindowDays;
        }
        if (scanResult.openingPattern) {
          result.openingPattern = scanResult.openingPattern;
        }
        if (scanResult.openingTime) {
          result.openingTime = scanResult.openingTime;
        }
      } catch (err: any) {
        result.signals.push(`website_scan_error: ${err.message ?? String(err)}`);
        logger.error("[detect] Website scan error", { error: err.message ?? String(err) });
      }
    }
  } else {
    result.signals.push("website_scan_skipped: no websiteUrl");
    logger.info("[detect] Website scan skipped: no websiteUrl");
  }

  // ── Step 3: Provider-specific enrichment ──────────────────────

  logger.info("[detect] Step 3: Provider enrichment", {
    provider: result.provider,
    externalId: result.externalId,
    url: result.url,
    source: result.source,
  });

  if (!result.provider || !ENRICHABLE_PROVIDERS.has(result.provider)) {
    if (result.provider) {
      result.signals.push(`enrichment_skipped: provider ${result.provider} not enrichable`);
      logger.info("[detect] Enrichment skipped: provider not enrichable", { provider: result.provider });
    } else {
      result.signals.push("enrichment_skipped: no provider detected");
      logger.info("[detect] Enrichment skipped: no provider detected");
    }
    return result;
  }

  // --- Resy enrichment ---
  if (result.provider === "resy") {
    if (!process.env.RESY_API_KEY) {
      result.signals.push("resy_enrichment_skipped: no RESY_API_KEY");
      logger.warn("[detect] Resy enrichment skipped: no RESY_API_KEY");
    } else {
      try {
        const resy = getResyClient(sessionId);
        let venueId: number | null = null;

        // Search by slug first (more reliable), fall back to name
        const slug = result.externalId;
        const searchQuery = slug || place.name;
        logger.info("[detect] Resy search starting", {
          searchQuery,
          slug,
          placeName: place.name,
          lat: place.lat,
          lng: place.lng,
        });
        const searchResults = await resy.search(searchQuery, {
          lat: place.lat,
          lng: place.lng,
          perPage: 5,
        });
        result.signals.push(`resy_search: ${searchResults.length} results for "${searchQuery}"`);
        logger.info("[detect] Resy search results", {
          query: searchQuery,
          count: searchResults.length,
          results: searchResults.map((r) => ({
            name: r.name,
            venueId: r.venueId,
            slug: r.urlSlug,
            regionId: r.regionId,
          })),
        });

        // Try matching by slug first, then by name
        let match = slug
          ? searchResults.find((r) => r.urlSlug === slug)
          : undefined;
        if (match) {
          logger.info("[detect] Resy matched by slug", { slug, matchedName: match.name });
        }
        if (!match) {
          logger.info("[detect] Resy slug match failed, trying name match", { slug, placeName: place.name });
          match = searchResults.find((r) => namesMatch(r.name, place.name));
          if (match) {
            logger.info("[detect] Resy matched by name", { placeName: place.name, matchedName: match.name });
          }
        }
        if (!match) {
          logger.info("[detect] Resy name match failed, trying lat/lng match", { placeLat: place.lat, placeLng: place.lng });
          match = searchResults.find((r) => {
            if (r.lat == null || r.lng == null) return false;
            const dist = haversineMeters(place.lat, place.lng, r.lat, r.lng);
            logger.info("[detect] Resy lat/lng candidate", { name: r.name, dist: Math.round(dist) });
            return dist <= MAX_LATLNG_MATCH_METERS;
          });
          if (match) {
            logger.info("[detect] Resy matched by lat/lng", { placeName: place.name, matchedName: match.name });
          }
        }

        if (match) {
          venueId = match.venueId;
          result.externalId = String(match.venueId);
          result.signals.push(`resy_matched: ${match.name} (venueId=${match.venueId}, slug=${match.urlSlug})`);
          logger.info("[detect] Resy match found", {
            venueId: match.venueId,
            slug: match.urlSlug,
            regionId: match.regionId,
          });

          if (!result.url) {
            result.url = `https://resy.com/cities/${match.regionId}/venues/${match.urlSlug}`;
            logger.info("[detect] Set Resy URL", { url: result.url });
          }
        } else if (searchResults.length > 0) {
          result.signals.push(
            `resy_no_match: searched "${searchQuery}", got [${searchResults.map((r) => `${r.name} (${r.urlSlug})`).join(", ")}]`
          );
          logger.warn("[detect] Resy no match found", {
            searchQuery,
            candidates: searchResults.map((r) => `${r.name} (${r.urlSlug})`),
          });
        } else {
          logger.warn("[detect] Resy search returned 0 results", { searchQuery });
        }

        if (venueId) {
          // Get venue details for "Need to Know" content
          logger.info("[detect] Fetching Resy venue details", { venueId });
          const venue = await resy.getVenue(venueId);
          logger.info("[detect] Resy venue details", {
            venueId,
            name: venue.name,
            contentCount: venue.content.length,
            contentPreview: venue.content.map((c) => c.substring(0, 100)),
          });

          if (venue.content.length > 0) {
            result.signals.push(`resy_content: ${venue.content.join(" | ")}`);
            const parsed = parseResyContent(venue.content);
            logger.info("[detect] Resy content parsed", {
              openingTime: parsed.openingTime,
              openingWindowDays: parsed.openingWindowDays,
              openingPattern: parsed.openingPattern,
            });
            if (parsed.openingTime) {
              result.openingTime = parsed.openingTime;
              result.signals.push(`resy_opening_time: ${parsed.openingTime}`);
            }
            if (parsed.openingWindowDays != null) {
              result.openingWindowDays = parsed.openingWindowDays;
              result.signals.push(`resy_opening_window_text: ${parsed.openingWindowDays} days`);
            }
            if (parsed.openingPattern) {
              result.openingPattern = parsed.openingPattern;
              result.signals.push(`resy_opening_pattern: ${parsed.openingPattern}`);
            }
          } else {
            logger.info("[detect] Resy venue has no content (no Need to Know)");
          }

          // Get calendar to determine last available date
          const today = formatDate(new Date());
          const endDate = formatDate(new Date(Date.now() + 90 * 86_400_000));
          logger.info("[detect] Fetching Resy calendar", { venueId, today, endDate });
          const calendar = await resy.getCalendar(venueId, 2, today, endDate);
          logger.info("[detect] Resy calendar response", {
            venueId,
            lastCalendarDay: calendar.lastCalendarDay,
            totalDays: calendar.days.length,
            availableDays: calendar.days.filter((d) => d.status === "available").length,
          });

          if (calendar.lastCalendarDay) {
            result.lastAvailableDate = calendar.lastCalendarDay;
            const diffMs = new Date(calendar.lastCalendarDay).getTime() - Date.now();
            const diffDays = Math.ceil(diffMs / 86_400_000);
            // Calendar-derived window overrides text-parsed window (more precise)
            result.openingWindowDays = diffDays;
            result.signals.push(
              `resy_calendar: lastDay=${calendar.lastCalendarDay}, windowDays=${diffDays}`
            );
            logger.info("[detect] Resy calendar window calculated", {
              lastCalendarDay: calendar.lastCalendarDay,
              diffDays,
            });
          } else {
            logger.warn("[detect] Resy calendar has no lastCalendarDay");
          }
        } else {
          logger.warn("[detect] Skipping Resy venue/calendar enrichment: no venueId");
        }
      } catch (err: any) {
        result.signals.push(`resy_enrichment_error: ${err.message ?? String(err)}`);
        logger.error("[detect] Resy enrichment error", { error: err.message ?? String(err), stack: err.stack });
      }
    }
  }

  // --- OpenTable enrichment ---
  if (result.provider === "opentable" && result.externalId) {
    try {
      const ot = getOpenTableClient(sessionId);
      const window = await ot.getOpeningWindow(result.externalId);

      result.openingWindowDays = window.maxDaysInAdvance;
      result.lastAvailableDate = window.lastAvailableDate;
      result.signals.push(
        `opentable_window: maxDays=${window.maxDaysInAdvance}, lastDate=${window.lastAvailableDate}`
      );
    } catch (err: any) {
      result.signals.push(`opentable_enrichment_error: ${err.message ?? String(err)}`);
    }
  }

  // --- SevenRooms enrichment ---
  if (result.provider === "sevenrooms" && result.externalId) {
    try {
      const sr = getSevenRoomsClient(sessionId);
      const window = await sr.getOpeningWindow(result.externalId);

      if (window.openingWindowDays != null) {
        result.openingWindowDays = window.openingWindowDays;
      }
      if (window.lastAvailableDate) {
        result.lastAvailableDate = window.lastAvailableDate;
      }
      result.signals.push(
        `sevenrooms_window: days=${window.openingWindowDays}, lastDate=${window.lastAvailableDate}`
      );
    } catch (err: any) {
      result.signals.push(`sevenrooms_enrichment_error: ${err.message ?? String(err)}`);
    }
  }

  logger.info("[detect] Final result", {
    provider: result.provider,
    externalId: result.externalId,
    url: result.url,
    source: result.source,
    openingWindowDays: result.openingWindowDays,
    openingTime: result.openingTime,
    openingPattern: result.openingPattern,
    lastAvailableDate: result.lastAvailableDate,
    signalCount: result.signals.length,
  });

  return result;
}
