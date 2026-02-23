import { logger } from "@trigger.dev/sdk";
import { getBeliClient } from "../utils/clients";
import type { ScrapeResult } from "../utils/ratings";

interface PlaceInfo {
  id: number;
  name: string;
  cityName: string | null;
  lat: number;
  lng: number;
}

export async function scrapeBeli(
  place: PlaceInfo,
  existingExternalId?: string | null,
  sessionId?: string
): Promise<ScrapeResult> {
  return logger.trace("scrape-beli", async (span) => {
    span.setAttribute("placeId", place.id);
    span.setAttribute("placeName", place.name);
    span.setAttribute("hasExistingId", !!existingExternalId);

    const client = getBeliClient(sessionId ?? "");

    let businessId = existingExternalId;

    if (!businessId) {
      const searchParams = {
        query: place.name,
        city: place.cityName ?? undefined,
        lat: place.lat,
        lng: place.lng,
      };

      logger.info("Beli search request", {
        placeId: place.id,
        placeName: place.name,
        searchParams,
      });

      const results = await client.search(place.name, {
        city: place.cityName ?? undefined,
        lat: place.lat,
        lng: place.lng,
      });

      logger.info("Beli search response", {
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

      businessId = results[0].externalId;
    } else {
      logger.info("Beli using existing businessId", {
        placeId: place.id,
        businessId: existingExternalId,
      });
    }

    logger.debug("Beli lookup request", {
      placeId: place.id,
      businessId,
    });

    const details = await client.lookup(businessId);

    logger.info("Beli lookup response", {
      placeId: place.id,
      businessId,
      name: details.name,
      rating: details.rating,
      ratingCount: details.ratingCount,
      url: details.url,
      neighborhood: details.neighborhood,
      cuisines: details.cuisines,
    });

    const rating = details.rating ?? null;
    const reviewCount = details.ratingCount ?? null;

    span.setAttribute("found", true);
    span.setAttribute("businessId", businessId);
    span.setAttribute("rating", rating ?? "none");
    span.setAttribute("ratingCount", reviewCount ?? 0);

    return {
      found: true,
      externalId: businessId,
      ratingData: {
        source: "beli",
        rating,
        ratingMax: 10,
        notes: null,
        reviewCount,
        ratingUrl: details.url,
        reviewDate: null,
        externalId: businessId,
      },
      placeData: null,
    };
  });
}
