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
  googlePlaceType: string | null;
  types: string[];
  neighborhood: string | null;
  city: string | null;
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
    googlePlaceType: details.primaryType || null,
    types: details.types || [],
    neighborhood: neighborhood || sublocality || null,
    city,
  };
}
