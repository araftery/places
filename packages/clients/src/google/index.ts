import type { SearchResult, LookupResult } from "../types.js";
import { createFetch } from "../proxy";

const BASE_URL = "https://places.googleapis.com/v1/places";

export interface GooglePlaceResult {
  id: string;
  displayName: { text: string };
  formattedAddress: string;
  location: { latitude: number; longitude: number };
  websiteUri?: string;
  nationalPhoneNumber?: string;
  priceLevel?:
    | "PRICE_LEVEL_FREE"
    | "PRICE_LEVEL_INEXPENSIVE"
    | "PRICE_LEVEL_MODERATE"
    | "PRICE_LEVEL_EXPENSIVE"
    | "PRICE_LEVEL_VERY_EXPENSIVE";
  regularOpeningHours?: {
    periods: Array<{
      open: { day: number; hour: number; minute: number };
      close: { day: number; hour: number; minute: number };
    }>;
    weekdayDescriptions: string[];
  };
  businessStatus?: "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY";
  rating?: number;
  userRatingCount?: number;
  primaryType?: string;
  types?: string[];
  addressComponents?: Array<{
    longText: string;
    shortText: string;
    types: string[];
  }>;
}

export interface AutocompleteResult {
  placePrediction: {
    placeId: string;
    text: { text: string };
    structuredFormat: {
      mainText: { text: string };
      secondaryText: { text: string };
    };
  };
}

const PRICE_MAP: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

export function mapPriceLevel(level?: string): number | null {
  if (!level) return null;
  return PRICE_MAP[level] ?? null;
}

export interface GoogleClientConfig {
  apiKey: string;
  proxyUrl?: string;
}

export function createGoogleClient(config: GoogleClientConfig) {
  const { apiKey } = config;
  const fetchFn = createFetch(config.proxyUrl);

  async function autocomplete(
    input: string,
    locationBias?: { lat: number; lng: number }
  ): Promise<AutocompleteResult[]> {
    const body: Record<string, unknown> = {
      input,
      includedPrimaryTypes: [
        "restaurant",
        "bar",
        "cafe",
        "tourist_attraction",
        "store",
      ],
    };

    if (locationBias) {
      body.locationBias = {
        circle: {
          center: {
            latitude: locationBias.lat,
            longitude: locationBias.lng,
          },
          radius: 50000,
        },
      };
    }

    const res = await fetchFn(
      "https://places.googleapis.com/v1/places:autocomplete",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
        },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google Places autocomplete error: ${text}`);
    }

    const data = await res.json();
    return data.suggestions || [];
  }

  async function getPlaceDetails(
    placeId: string
  ): Promise<GooglePlaceResult> {
    const fields = [
      "id",
      "displayName",
      "formattedAddress",
      "location",
      "websiteUri",
      "nationalPhoneNumber",
      "priceLevel",
      "regularOpeningHours",
      "businessStatus",
      "rating",
      "userRatingCount",
      "primaryType",
      "types",
      "addressComponents",
    ].join(",");

    const res = await fetchFn(`${BASE_URL}/${placeId}`, {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fields,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google Places details error: ${text}`);
    }

    return res.json();
  }

  async function search(
    query: string,
    options?: { lat?: number; lng?: number }
  ): Promise<SearchResult[]> {
    const suggestions = await autocomplete(query, options ? { lat: options.lat!, lng: options.lng! } : undefined);
    return suggestions.map((s) => ({
      externalId: s.placePrediction.placeId,
      provider: "google" as const,
      name: s.placePrediction.structuredFormat.mainText.text,
      summary: s.placePrediction.structuredFormat.secondaryText.text,
      rating: null,
      ratingScale: "0-5",
      priceLevel: null,
      cuisines: [],
      lat: null,
      lng: null,
      neighborhood: null,
      url: null,
    }));
  }

  async function lookup(placeId: string): Promise<LookupResult> {
    const details = await getPlaceDetails(placeId);

    const components = details.addressComponents || [];
    const neighborhood =
      components.find((c) => c.types.includes("neighborhood"))?.longText ||
      null;
    const sublocality =
      components.find((c) => c.types.includes("sublocality"))?.longText ||
      null;
    const locality =
      components.find((c) => c.types.includes("locality"))?.longText || null;
    const postalTown =
      components.find((c) => c.types.includes("postal_town"))?.longText ||
      null;
    const adminLevel1 =
      components.find((c) =>
        c.types.includes("administrative_area_level_1")
      )?.longText || null;
    const state =
      components.find((c) =>
        c.types.includes("administrative_area_level_1")
      )?.shortText || null;
    const city =
      locality ||
      postalTown ||
      (sublocality ? adminLevel1 : null) ||
      null;

    const cuisineTypes = (details.types || [])
      .filter((t) => t.endsWith("_restaurant"))
      .map((t) =>
        t
          .replace("_restaurant", "")
          .replace("_", " ")
          .replace(/\b\w/g, (c) => c.toUpperCase())
      );

    return {
      externalId: details.id,
      provider: "google",
      name: details.displayName.text,
      summary: null,
      rating: details.rating ?? null,
      ratingScale: "0-5",
      priceLevel: mapPriceLevel(details.priceLevel),
      cuisines: cuisineTypes,
      lat: details.location.latitude,
      lng: details.location.longitude,
      neighborhood: neighborhood || sublocality || null,
      url: null,
      address: details.formattedAddress,
      city,
      state,
      reviewer: null,
      isCriticsPick: false,
      reviewDate: null,
      ratingCount: details.userRatingCount ?? null,
      raw: details,
    };
  }

  return {
    /** Low-level: Google Places autocomplete */
    autocomplete,
    /** Low-level: Get full Google Places details */
    getPlaceDetails,
    /** Standardized search returning SearchResult[] */
    search,
    /** Standardized lookup returning LookupResult */
    lookup,
    /** Map price level string to number */
    mapPriceLevel,
  };
}

export type GoogleClient = ReturnType<typeof createGoogleClient>;
