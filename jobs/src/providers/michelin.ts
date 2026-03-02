import { logger } from "@trigger.dev/sdk";
import { getMichelinClient } from "../utils/clients";
import type { ScrapeResult } from "../utils/ratings";

interface PlaceInfo {
  id: number;
  name: string;
  lat: number;
  lng: number;
}

export async function scrapeMichelin(
  place: PlaceInfo,
  existingExternalId?: string | null,
  sessionId?: string
): Promise<ScrapeResult> {
  return logger.trace("scrape-michelin", async (span) => {
    span.setAttribute("placeId", place.id);
    span.setAttribute("placeName", place.name);
    span.setAttribute("hasExistingId", !!existingExternalId);

    const client = getMichelinClient(sessionId);

    // Search by name near the place's location
    const searchTerm = place.name;

    logger.info("Michelin search request", {
      placeId: place.id,
      placeName: place.name,
      searchTerm,
      lat: place.lat,
      lng: place.lng,
    });

    const results = await client.search(searchTerm, {
      lat: place.lat,
      lng: place.lng,
      limit: 3,
    });

    logger.info("Michelin search response", {
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
      return {
        found: false,
        externalId: null,
        ratingData: null,
        placeData: null,
      };
    }

    const best = results[0];

    // Look up full details to get distinction info
    const details = await client.lookup(best.externalId);
    const raw = details.raw as Record<string, unknown>;
    const distinction = (raw.michelin_award as string) || "SELECTED";
    // Derive star count from michelin_award string (the numeric `stars` field is unreliable)
    const stars =
      distinction === "THREE_STARS" ? 3 :
      distinction === "TWO_STARS" ? 2 :
      distinction === "ONE_STAR" ? 1 : 0;
    const greenStar = ((raw.green_star as number) || 0) > 0;

    // Build notes describing the distinction
    const noteParts: string[] = [];
    if (stars > 0) {
      noteParts.push(`${stars} Michelin Star${stars > 1 ? "s" : ""}`);
    } else if (distinction === "BIB_GOURMAND") {
      noteParts.push("Bib Gourmand");
    } else {
      noteParts.push("Michelin Selected");
    }
    if (greenStar) {
      noteParts.push("Green Star");
    }
    const distinctionLabel = noteParts.join(", ");
    const description = details.description || null;
    // Store distinction label + description separated by \n\n
    const notes = description ? `${distinctionLabel}\n\n${description}` : distinctionLabel;

    span.setAttribute("found", true);
    span.setAttribute("matchedExternalId", best.externalId);
    span.setAttribute("matchedName", best.name);
    span.setAttribute("distinction", distinction);
    span.setAttribute("stars", stars);

    return {
      found: true,
      externalId: best.externalId,
      ratingData: {
        source: "michelin",
        rating: stars > 0 ? stars : null,
        ratingMax: stars > 0 ? 3 : null,
        notes,
        reviewCount: null,
        ratingUrl: best.url,
        reviewDate: null,
        externalId: best.externalId,
      },
      placeData: null,
    };
  });
}
