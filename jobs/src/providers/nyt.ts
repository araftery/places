import { logger } from "@trigger.dev/sdk";
import { getNytClient } from "../utils/clients";
import type { ScrapeResult } from "../utils/ratings";

interface PlaceInfo {
  id: number;
  name: string;
  cityName: string | null;
}

export async function scrapeNyt(
  place: PlaceInfo,
  existingExternalId?: string | null,
  sessionId?: string
): Promise<ScrapeResult> {
  return logger.trace("scrape-nyt", async (span) => {
    span.setAttribute("placeId", place.id);
    span.setAttribute("placeName", place.name);
    span.setAttribute("hasExistingId", !!existingExternalId);

    const client = getNytClient(sessionId ?? "");

    // NYT only supports search, so we always search by name
    const searchTerm = existingExternalId || place.name;

    logger.info("NYT search request", {
      placeId: place.id,
      placeName: place.name,
      searchTerm,
      usingExistingId: !!existingExternalId,
      limit: 3,
    });

    const results = await client.search(searchTerm, { limit: 3 });

    logger.info("NYT search response", {
      placeId: place.id,
      resultCount: results.length,
      results: results.map((r) => ({
        externalId: r.externalId,
        name: r.name,
        rating: r.rating,
        summary: r.summary,
        url: r.url,
      })),
    });

    span.setAttribute("searchResultCount", results.length);

    if (results.length === 0) {
      return { found: false, externalId: null, ratingData: null, placeData: null };
    }

    // Take the first result
    const best = results[0];
    const rating = best.rating || null; // treat 0 as null (unrated)

    span.setAttribute("found", true);
    span.setAttribute("matchedExternalId", best.externalId);
    span.setAttribute("matchedName", best.name);
    span.setAttribute("rating", rating ?? "none");

    return {
      found: true,
      externalId: best.externalId,
      ratingData: {
        source: "nyt",
        rating,
        ratingMax: 4,
        notes: best.summary,
        reviewCount: null,
        ratingUrl: best.url,
        reviewDate: best.reviewDate ?? null,
        externalId: best.externalId,
      },
      placeData: null,
    };
  });
}
