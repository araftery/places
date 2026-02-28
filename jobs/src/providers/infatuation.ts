import { logger } from "@trigger.dev/sdk";
import { getInfatuationClient } from "../utils/clients";
import type { ScrapeResult } from "../utils/ratings";

interface PlaceInfo {
  id: number;
  name: string;
  cityName: string | null;
  infatuationSlug: string | null;
  lat: number;
  lng: number;
}

export async function scrapeInfatuation(
  place: PlaceInfo,
  existingExternalId?: string | null,
  sessionId?: string
): Promise<ScrapeResult> {
  return logger.trace("scrape-infatuation", async (span) => {
    span.setAttribute("placeId", place.id);
    span.setAttribute("placeName", place.name);
    span.setAttribute("hasExistingId", !!existingExternalId);

    const client = getInfatuationClient(sessionId ?? "");

    let slug = existingExternalId;

    if (!slug) {
      const searchParams = {
        query: place.name,
        canonicalPath: place.infatuationSlug ?? undefined,
      };

      logger.info("Infatuation search request", {
        placeId: place.id,
        placeName: place.name,
        searchParams,
      });

      const results = await client.search(place.name, {
        canonicalPath: place.infatuationSlug ?? undefined,
      });

      logger.info("Infatuation search response", {
        placeId: place.id,
        resultCount: results.length,
        results: results.map((r) => ({
          externalId: r.externalId,
          name: r.name,
          rating: r.rating,
          url: r.url,
        })),
      });

      span.setAttribute("searchResultCount", results.length);

      if (results.length === 0) {
        return { found: false, externalId: null, ratingData: null, placeData: null };
      }

      slug = results[0].externalId;
    } else {
      logger.info("Infatuation using existing slug", {
        placeId: place.id,
        slug: existingExternalId,
      });
    }

    logger.debug("Infatuation lookup request", {
      placeId: place.id,
      slug,
    });

    const details = await client.lookup(slug);

    logger.info("Infatuation lookup response", {
      placeId: place.id,
      slug,
      name: details.name,
      rating: details.rating,
      isCriticsPick: details.isCriticsPick,
      url: details.url,
      neighborhood: details.neighborhood,
      cuisines: details.cuisines,
    });

    const rating = details.rating ?? null;
    const isCriticsPick = !!details.isCriticsPick;

    span.setAttribute("found", true);
    span.setAttribute("slug", slug);
    span.setAttribute("rating", rating ?? "none");
    span.setAttribute("isCriticsPick", isCriticsPick);

    return {
      found: true,
      externalId: slug,
      ratingData: {
        source: "infatuation",
        rating,
        ratingMax: 10,
        notes: isCriticsPick ? "Critic's Pick" : null,
        reviewCount: null,
        ratingUrl: details.url,
        reviewDate: details.reviewDate ?? null,
        externalId: slug,
      },
      placeData: null,
      extra: {
        reservationPlatform: (details.raw as any)?.venue?.reservation?.reservationPlatform ?? null,
        reservationUrl: (details.raw as any)?.venue?.reservation?.reservationUrl ?? null,
      },
    };
  });
}
