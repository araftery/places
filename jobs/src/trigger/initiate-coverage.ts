import { task, logger, tasks } from "@trigger.dev/sdk";
import { db } from "@places/db";
import { places, cities } from "@places/db/schema";
import { eq } from "drizzle-orm";
import { scrapeGoogle } from "../providers/google";
import { scrapeInfatuation } from "../providers/infatuation";
import { scrapeBeli } from "../providers/beli";
import { scrapeNyt } from "../providers/nyt";
import { upsertRating, upsertAudit, markAuditFailed } from "../utils/ratings";
import { extractError } from "../utils/errors";
import { generateSessionId } from "../utils/clients";

const AUDIT_DAYS: Record<string, number> = {
  google: 7,
  infatuation: 30,
  beli: 14,
  nyt: 30,
};

type PlaceInfo = { id: number; name: string; cityName: string | null; infatuationSlug: string | null; lat: number; lng: number; googlePlaceId: string | null };

function getScrapers(sessionId: string): Record<string, (place: PlaceInfo) => Promise<import("../utils/ratings").ScrapeResult>> {
  return {
    google: (p) => scrapeGoogle(p),
    infatuation: (p) => scrapeInfatuation(p, undefined, sessionId),
    beli: (p) => scrapeBeli(p, undefined, sessionId),
    nyt: (p) => scrapeNyt(p, undefined, sessionId),
  };
}

export const initiateCoverageTask = task({
  id: "initiate-coverage",
  queue: { name: "coverage", concurrencyLimit: 5 },
  run: async (payload: { placeId: number }) => {
    logger.info("Starting coverage initiation", { placeId: payload.placeId });

    const [place] = await db
      .select()
      .from(places)
      .where(eq(places.id, payload.placeId));

    if (!place) {
      logger.error("Place not found, aborting", { placeId: payload.placeId });
      return;
    }

    // Get city to determine provider coverage
    let providers = ["google"];
    let cityName: string | null = null;
    let infatuationSlug: string | null = null;

    if (place.cityId) {
      const [city] = await db
        .select()
        .from(cities)
        .where(eq(cities.id, place.cityId));
      if (city) {
        providers = city.providers;
        cityName = city.name;
        infatuationSlug = city.infatuationSlug;
      } else {
        logger.warn("City not found for place", {
          placeId: place.id,
          cityId: place.cityId,
        });
      }
    } else {
      logger.warn("Place has no cityId, defaulting to google-only", {
        placeId: place.id,
      });
    }

    // Skip infatuation if city has no slug (not covered)
    if (!infatuationSlug && providers.includes("infatuation")) {
      providers = providers.filter((p) => p !== "infatuation");
      logger.info("Skipping infatuation — no city slug configured", {
        placeId: place.id,
        cityName,
      });
    }

    logger.info("Coverage plan", {
      placeId: place.id,
      placeName: place.name,
      city: cityName,
      providers,
      googlePlaceId: place.googlePlaceId,
    });

    const sessionId = generateSessionId();
    const scrapers = getScrapers(sessionId);
    const results: Record<string, { found: boolean; error?: string }> = {};
    let infatuationExtra: Record<string, unknown> | undefined;

    for (const provider of providers) {
      const scraper = scrapers[provider];
      if (!scraper) {
        logger.warn("No scraper registered for provider", { provider });
        continue;
      }

      try {
        const result = await logger.trace(`provider-${provider}`, async (span) => {
          span.setAttribute("provider", provider);
          span.setAttribute("placeId", place.id);
          span.setAttribute("placeName", place.name);

          const r = await scraper({
            id: place.id,
            name: place.name,
            cityName,
            infatuationSlug,
            lat: place.lat,
            lng: place.lng,
            googlePlaceId: place.googlePlaceId,
          });

          span.setAttribute("found", r.found);
          span.setAttribute("hasRating", !!r.ratingData);
          span.setAttribute("hasPlaceData", !!r.placeData);

          return r;
        });

        if (result.ratingData) {
          await upsertRating(place.id, result.ratingData);
        }

        // Update place data if provider returns it (e.g. Google hours)
        if (result.placeData) {
          await db
            .update(places)
            .set({
              ...result.placeData,
              updatedAt: new Date(),
            })
            .where(eq(places.id, place.id));

          logger.log("Place data updated from provider", {
            placeId: place.id,
            provider,
            fields: Object.keys(result.placeData),
          });
        }

        await upsertAudit(place.id, provider, result, AUDIT_DAYS[provider] ?? 30);
        results[provider] = { found: result.found };

        if (provider === "infatuation" && result.extra) {
          infatuationExtra = result.extra;
        }
      } catch (err) {
        const { fullMessage, type, stack, cause } = extractError(err);
        logger.error("Provider scrape failed", {
          placeId: place.id,
          placeName: place.name,
          provider,
          error: fullMessage,
          errorType: type,
          cause,
          stack,
        });
        await markAuditFailed(place.id, provider, fullMessage);
        results[provider] = { found: false, error: fullMessage };
      }
    }

    // Fire-and-forget reservation detection
    try {
      await tasks.trigger("detect-reservation", {
        placeId: place.id,
        name: place.name,
        lat: place.lat,
        lng: place.lng,
        websiteUrl: place.websiteUrl,
        infatuationReservationPlatform: (infatuationExtra?.reservationPlatform as string) ?? null,
        infatuationReservationUrl: (infatuationExtra?.reservationUrl as string) ?? null,
      });
      logger.info("Triggered reservation detection", { placeId: place.id });
    } catch (err) {
      logger.error("Failed to trigger reservation detection", {
        placeId: place.id,
        error: extractError(err).fullMessage,
      });
    }

    // Fire-and-forget Gemini classification
    try {
      await tasks.trigger("classify-place", { placeId: place.id });
      logger.info("Triggered place classification", { placeId: place.id });
    } catch (err) {
      logger.error("Failed to trigger place classification", {
        placeId: place.id,
        error: extractError(err).fullMessage,
      });
    }

    const succeeded = Object.values(results).filter((r) => !r.error).length;
    const found = Object.values(results).filter((r) => r.found).length;
    const errored = Object.values(results).filter((r) => r.error).length;

    logger.info("Coverage initiation complete", {
      placeId: place.id,
      placeName: place.name,
      providers,
      results,
      summary: { total: providers.length, succeeded, found, errored },
    });
  },
});
