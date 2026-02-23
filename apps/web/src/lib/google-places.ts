import { createGoogleClient } from "@places/clients/google";

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
