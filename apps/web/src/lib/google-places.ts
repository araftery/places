import { createGoogleClient, mapPriceLevel } from "@places/clients/google";
import type { GooglePlaceResult } from "@places/clients/google";

export type {
  GooglePlaceResult,
  AutocompleteResult,
} from "@places/clients/google";

export { mapPriceLevel } from "@places/clients/google";

const client = createGoogleClient({
  apiKey: process.env.GOOGLE_PLACES_API_KEY!,
});

export const autocomplete = client.autocomplete;
export const getPlaceDetails = client.getPlaceDetails;

export interface MappedPlaceDetails {
  googlePlaceId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  websiteUrl: string | null;
  phone: string | null;
  priceRange: number | null;
  hoursJson: unknown;
  googleRating: number | null;
  googleRatingCount: number | null;
  primaryType: string | null;
  types: string[];
  neighborhood: string | null;
  city: string | null;
  cuisineTypes: string[];
}

export function mapGoogleDetailsToPlace(details: GooglePlaceResult): MappedPlaceDetails {
  const components = details.addressComponents || [];
  const neighborhood =
    components.find((c) => c.types.includes("neighborhood"))?.longText || null;
  const sublocality =
    components.find((c) => c.types.includes("sublocality"))?.longText || null;
  const locality =
    components.find((c) => c.types.includes("locality"))?.longText || null;
  const postalTown =
    components.find((c) => c.types.includes("postal_town"))?.longText || null;
  const adminLevel1 =
    components.find((c) => c.types.includes("administrative_area_level_1"))?.longText || null;
  const city = locality || postalTown || (sublocality ? adminLevel1 : null) || null;

  const cuisineTypes = (details.types || [])
    .filter(
      (t) =>
        t.endsWith("_restaurant") ||
        ["italian_restaurant", "japanese_restaurant", "mexican_restaurant",
         "chinese_restaurant", "indian_restaurant", "thai_restaurant",
         "french_restaurant", "korean_restaurant", "vietnamese_restaurant",
         "mediterranean_restaurant", "greek_restaurant", "spanish_restaurant",
         "american_restaurant", "seafood_restaurant", "pizza_restaurant",
         "sushi_restaurant", "steak_house", "barbecue_restaurant",
         "ramen_restaurant", "brunch_restaurant", "vegetarian_restaurant",
         "vegan_restaurant"].includes(t)
    )
    .map((t) =>
      t
        .replace("_restaurant", "")
        .replace("_", " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
    );

  return {
    googlePlaceId: details.id,
    name: details.displayName.text,
    address: details.formattedAddress,
    lat: details.location.latitude,
    lng: details.location.longitude,
    websiteUrl: details.websiteUri || null,
    phone: details.nationalPhoneNumber || null,
    priceRange: mapPriceLevel(details.priceLevel),
    hoursJson: details.regularOpeningHours || null,
    googleRating: details.rating || null,
    googleRatingCount: details.userRatingCount || null,
    primaryType: details.primaryType || null,
    types: details.types || [],
    neighborhood: neighborhood || sublocality || null,
    city,
    cuisineTypes,
  };
}
