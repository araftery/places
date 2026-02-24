export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface City {
  id: number;
  name: string;
  country: string;
  lat: number;
  lng: number;
  providers: string[];
}

export interface PlaceRating {
  id: number;
  placeId: number;
  source: string;
  externalId: string | null;
  rating: number | null;
  ratingMax: number | null;
  notes: string | null;
  reviewCount: number | null;
  ratingUrl: string | null;
  reviewDate: string | null;
  lastFetched: string | null;
}

export interface Place {
  id: number;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  cityId: number | null;
  cityName: string | null;
  neighborhood: string | null;
  placeType: string | null;
  cuisineType: string[] | null;
  priceRange: number | null;
  websiteUrl: string | null;
  menuUrl: string | null;
  phone: string | null;
  beenThere: boolean;
  archived: boolean;
  personalNotes: string | null;
  source: string | null;
  googlePlaceId: string | null;
  hoursJson: unknown;
  closedPermanently: boolean;
  reservationProvider: string | null;
  reservationExternalId: string | null;
  reservationUrl: string | null;
  openingWindowDays: number | null;
  openingTime: string | null;
  openingPattern: string | null;
  openingBulkDescription: string | null;
  lastAvailableDate: string | null;
  lastReservationCheck: string | null;
  reservationNotes: string | null;
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
  cityId: number | null;
  neighborhood: string | null;
  placeType: string | null;
  cuisineType: string[] | null;
  priceRange: number | null;
  websiteUrl: string | null;
  menuUrl: string | null;
  phone: string | null;
  beenThere: boolean;
  archived: boolean;
  personalNotes: string | null;
  source: string | null;
  googlePlaceId: string | null;
  hoursJson: unknown;
  tagIds: number[];
  googleRating: number | null;
  googleRatingCount: number | null;
}

export const RESERVATION_PROVIDERS = [
  { value: "resy", label: "Resy" },
  { value: "opentable", label: "OpenTable" },
  { value: "sevenrooms", label: "SevenRooms" },
  { value: "thefork", label: "TheFork" },
  { value: "walk_in", label: "Walk-in Only" },
  { value: "phone", label: "Phone / WhatsApp" },
  { value: "other", label: "Other" },
  { value: "none", label: "No Reservations" },
] as const;

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

export const GOOGLE_TYPE_MAP: Record<string, string> = {
  // Direct matches
  restaurant: "restaurant",
  bar: "bar",
  cafe: "cafe",
  bakery: "bakery",
  night_club: "night_club",
  // Tourist / attractions
  tourist_attraction: "tourist_site",
  museum: "tourist_site",
  art_gallery: "tourist_site",
  amusement_park: "tourist_site",
  aquarium: "tourist_site",
  zoo: "tourist_site",
  landmark: "tourist_site",
  historical_landmark: "tourist_site",
  national_park: "tourist_site",
  performing_arts_theater: "tourist_site",
  // Retail
  store: "retail",
  shopping_mall: "retail",
  book_store: "retail",
  clothing_store: "retail",
  grocery_store: "retail",
  supermarket: "retail",
  // Aliases
  coffee_shop: "cafe",
  pub: "bar",
  wine_bar: "bar",
  brewery: "bar",
  cocktail_bar: "bar",
  // Food variants
  ice_cream_shop: "restaurant",
  sandwich_shop: "restaurant",
  pizza_restaurant: "restaurant",
  steak_house: "restaurant",
  seafood_restaurant: "restaurant",
  meal_takeaway: "restaurant",
  meal_delivery: "restaurant",
};
