export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface PlaceRating {
  id: number;
  placeId: number;
  source: string;
  rating: string | null;
  notes: string | null;
  ratingUrl: string | null;
  lastFetched: string | null;
}

export interface Place {
  id: number;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  city: string | null;
  neighborhood: string | null;
  placeType: string | null;
  cuisineType: string[] | null;
  priceRange: number | null;
  websiteUrl: string | null;
  menuUrl: string | null;
  phone: string | null;
  status: string;
  personalNotes: string | null;
  source: string | null;
  googlePlaceId: string | null;
  hoursJson: unknown;
  hoursLastFetched: string | null;
  createdAt: string;
  updatedAt: string;
  tags: Tag[];
  ratings: PlaceRating[];
}

export interface PlaceFormData {
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  city: string | null;
  neighborhood: string | null;
  placeType: string | null;
  cuisineType: string[] | null;
  priceRange: number | null;
  websiteUrl: string | null;
  menuUrl: string | null;
  phone: string | null;
  status: string;
  personalNotes: string | null;
  source: string | null;
  googlePlaceId: string | null;
  hoursJson: unknown;
  tagIds: number[];
  googleRating: number | null;
  googleRatingCount: number | null;
}

export const PLACE_TYPES = [
  { value: "restaurant", label: "Restaurant" },
  { value: "bar", label: "Bar" },
  { value: "cafe", label: "Cafe" },
  { value: "tourist_site", label: "Tourist Site" },
  { value: "retail", label: "Retail" },
  { value: "night_club", label: "Night Club" },
  { value: "bakery", label: "Bakery" },
  { value: "other", label: "Other" },
] as const;

export const STATUS_OPTIONS = [
  { value: "want_to_try", label: "Want to Try" },
  { value: "been_there", label: "Been There" },
  { value: "archived", label: "Archived" },
] as const;

export const GOOGLE_TYPE_MAP: Record<string, string> = {
  restaurant: "restaurant",
  bar: "bar",
  cafe: "cafe",
  tourist_attraction: "tourist_site",
  store: "retail",
  night_club: "night_club",
  bakery: "bakery",
};
