export { createGoogleClient } from "./google/index.js";
export type { GoogleClient, GoogleClientConfig, GooglePlaceResult, AutocompleteResult } from "./google/index.js";

export { createInfatuationClient } from "./infatuation/index.js";
export type { InfatuationClient, InfatuationClientConfig, GuideListItem, GuideRestaurant, GuideVenue, GuideContent } from "./infatuation/index.js";

export { createBeliClient } from "./beli/index.js";
export type { BeliClient, BeliClientConfig, BeliTokens } from "./beli/index.js";

export { createNytClient } from "./nyt/index.js";
export type { NytClient, NytClientConfig } from "./nyt/index.js";

export { createOpenTableClient } from "./opentable/index.js";
export type {
  OpenTableClient,
  OpenTableClientConfig,
  OpenTableAvailability,
  OpenTableSlot,
  OpenTableOpeningWindow,
} from "./opentable/index.js";

export { createFetch } from "./proxy";
export type { ProxyConfig } from "./proxy";

export type { SearchResult, LookupResult } from "./types.js";
