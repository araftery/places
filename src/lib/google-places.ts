const API_KEY = process.env.GOOGLE_PLACES_API_KEY!;
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

export async function autocomplete(
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
        center: { latitude: locationBias.lat, longitude: locationBias.lng },
        radius: 50000,
      },
    };
  }

  const res = await fetch(
    "https://places.googleapis.com/v1/places:autocomplete",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": API_KEY,
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

export async function getPlaceDetails(
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
    "rating",
    "userRatingCount",
    "primaryType",
    "types",
    "addressComponents",
  ].join(",");

  const res = await fetch(`${BASE_URL}/${placeId}`, {
    headers: {
      "X-Goog-Api-Key": API_KEY,
      "X-Goog-FieldMask": fields,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Places details error: ${text}`);
  }

  return res.json();
}
