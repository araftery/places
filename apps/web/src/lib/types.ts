export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface Cuisine {
  id: number;
  name: string;
}

export interface List {
  id: number;
  name: string;
  createdAt: string;
}

export interface City {
  id: number;
  name: string;
  country: string;
  lat: number;
  lng: number;
  providers: string[];
  infatuationSlug: string | null;
  michelinCitySlug: string | null;
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
  googlePlaceType: string | null;
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
  cuisines: Cuisine[];
  ratings: PlaceRating[];
  listIds: number[];
}

export interface PlaceFormData {
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  cityId: number | null;
  neighborhood: string | null;
  placeType: string | null;
  googlePlaceType: string | null;
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
  { value: "fine_dining", label: "Fine Dining" },
  { value: "casual_dining", label: "Casual Dining" },
  { value: "fast_casual", label: "Fast Casual" },
  { value: "deli", label: "Deli" },
  { value: "cocktail_bar", label: "Cocktail Bar" },
  { value: "wine_bar", label: "Wine Bar" },
  { value: "dive_bar", label: "Dive Bar" },
  { value: "sports_bar", label: "Sports Bar" },
  { value: "pub", label: "Pub" },
  { value: "brewery", label: "Brewery" },
  { value: "cafe", label: "Cafe" },
  { value: "bakery", label: "Bakery" },
  { value: "night_club", label: "Night Club" },
  { value: "retail", label: "Retail" },
  { value: "tourist_site", label: "Tourist Site" },
  { value: "food_truck", label: "Food Truck" },
  { value: "other", label: "Other" },
] as const;

export type PlaceTypeCategory =
  | "sitdown_dining"
  | "quick_eats"
  | "cocktail_wine"
  | "casual_bars"
  | "cafes_bakeries"
  | "other";

export const PLACE_TYPE_CATEGORY: Record<string, PlaceTypeCategory> = {
  fine_dining: "sitdown_dining",
  casual_dining: "sitdown_dining",
  fast_casual: "quick_eats",
  deli: "quick_eats",
  food_truck: "quick_eats",
  cocktail_bar: "cocktail_wine",
  wine_bar: "cocktail_wine",
  dive_bar: "casual_bars",
  sports_bar: "casual_bars",
  pub: "casual_bars",
  brewery: "casual_bars",
  cafe: "cafes_bakeries",
  bakery: "cafes_bakeries",
  night_club: "other",
  retail: "other",
  tourist_site: "other",
  other: "other",
};

export const CATEGORY_COLORS: Record<PlaceTypeCategory, string> = {
  sitdown_dining: "#d4897a",
  quick_eats: "#d4b87a",
  cocktail_wine: "#b08faa",
  casual_bars: "#82b5ad",
  cafes_bakeries: "#daa66a",
  other: "#a8a098",
};

export const CATEGORY_STROKE_COLORS: Record<PlaceTypeCategory, string> = {
  sitdown_dining: "#a35843",
  quick_eats: "#a38543",
  cocktail_wine: "#7a5874",
  casual_bars: "#4d7a72",
  cafes_bakeries: "#a87430",
  other: "#736b62",
};

export const GOOGLE_TO_DEFAULT_PLACE_TYPE: Record<string, string> = {
  restaurant: "casual_dining",
  bar: "dive_bar",
  cafe: "cafe",
  bakery: "bakery",
  night_club: "night_club",
  coffee_shop: "cafe",
  pub: "pub",
  wine_bar: "wine_bar",
  brewery: "brewery",
  cocktail_bar: "cocktail_bar",
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
  // Food variants
  ice_cream_shop: "casual_dining",
  sandwich_shop: "deli",
  pizza_restaurant: "casual_dining",
  steak_house: "casual_dining",
  seafood_restaurant: "casual_dining",
  meal_takeaway: "fast_casual",
  meal_delivery: "fast_casual",
};
