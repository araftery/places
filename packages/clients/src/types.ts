/** Common result shape returned by all client search methods */
export interface SearchResult {
  /** Provider-specific identifier for the place */
  externalId: string;
  /** Provider name (google, infatuation, beli, nyt) */
  provider: string;
  /** Place/restaurant name */
  name: string;
  /** Short summary or preview text */
  summary: string | null;
  /** Numeric rating (normalized to provider's own scale) */
  rating: number | null;
  /** Description of the rating scale (e.g. "0-5", "0-10", "0-3") */
  ratingScale: string | null;
  /** Price level (1-4) */
  priceLevel: number | null;
  /** Cuisine tags */
  cuisines: string[];
  /** Latitude */
  lat: number | null;
  /** Longitude */
  lng: number | null;
  /** Neighborhood name */
  neighborhood: string | null;
  /** URL to the review/listing page */
  url: string | null;
  /** When the review was published (optional, available from some providers in search) */
  reviewDate?: string | null;
}

/** Common result shape returned by all client lookup methods */
export interface LookupResult extends SearchResult {
  /** Full street address */
  address: string | null;
  /** City name */
  city: string | null;
  /** State/region */
  state: string | null;
  /** Reviewer/critic name */
  reviewer: string | null;
  /** Whether this is a critic's pick / editorial recommendation */
  isCriticsPick: boolean;
  /** When the review was published */
  reviewDate: string | null;
  /** Number of ratings (for crowd-sourced platforms) */
  ratingCount: number | null;
  /** Additional provider-specific data */
  raw: unknown;
}
