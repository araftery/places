import { logger } from "@trigger.dev/sdk";
import { getGoogleClient } from "../utils/clients";
import type { ScrapeResult } from "../utils/ratings";

interface PlaceInfo {
  id: number;
  name: string;
  googlePlaceId: string | null;
}

export async function scrapeGoogle(place: PlaceInfo): Promise<ScrapeResult> {
  if (!place.googlePlaceId) {
    logger.warn("No googlePlaceId, skipping", {
      placeId: place.id,
      placeName: place.name,
    });
    return { found: false, externalId: null, ratingData: null, placeData: null };
  }

  return logger.trace("scrape-google", async (span) => {
    span.setAttribute("placeId", place.id);
    span.setAttribute("placeName", place.name);
    span.setAttribute("googlePlaceId", place.googlePlaceId!);

    const client = getGoogleClient();

    logger.debug("Google getPlaceDetails request", {
      placeId: place.id,
      googlePlaceId: place.googlePlaceId,
    });

    const details = await client.getPlaceDetails(place.googlePlaceId!);

    logger.debug("Google getPlaceDetails response", {
      placeId: place.id,
      response: details,
    });

    const isClosed = details.businessStatus === "CLOSED_PERMANENTLY";
    const rating = details.rating != null ? `${details.rating}/5` : null;
    const reviewCount = details.userRatingCount ?? 0;
    const notes = reviewCount ? `${reviewCount} reviews` : null;

    span.setAttribute("found", true);
    span.setAttribute("rating", rating ?? "none");
    span.setAttribute("reviewCount", reviewCount);
    span.setAttribute("isClosed", isClosed);
    span.setAttribute("hasHours", !!details.regularOpeningHours);
    span.setAttribute("businessStatus", details.businessStatus ?? "unknown");

    logger.info("Google scrape complete", {
      placeId: place.id,
      placeName: place.name,
      rating,
      reviewCount,
      isClosed,
      hasHours: !!details.regularOpeningHours,
      businessStatus: details.businessStatus ?? "unknown",
    });

    return {
      found: true,
      externalId: place.googlePlaceId,
      ratingData: {
        source: "google",
        rating,
        notes,
        ratingUrl: null,
        externalId: place.googlePlaceId,
      },
      placeData: {
        hoursJson: details.regularOpeningHours ?? null,
        closedPermanently: isClosed,
      },
    };
  });
}
