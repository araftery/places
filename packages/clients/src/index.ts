export { createGoogleClient } from "./google/index";
export type { GoogleClient, GoogleClientConfig, GooglePlaceResult, AutocompleteResult } from "./google/index";

export { createInfatuationClient } from "./infatuation/index";
export type { InfatuationClient, InfatuationClientConfig, GuideListItem, GuideRestaurant, GuideVenue, GuideContent } from "./infatuation/index";

export { createBeliClient } from "./beli/index";
export type { BeliClient, BeliClientConfig, BeliTokens } from "./beli/index";

export { createNytClient } from "./nyt/index";
export type { NytClient, NytClientConfig } from "./nyt/index";

export { createResyClient } from "./resy/index";
export type { ResyClient, ResyClientConfig, ResySearchResult, ResyVenue, ResyCalendar, ResyCalendarDay, ResySlot } from "./resy/index";

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

export type { SearchResult, LookupResult } from "./types";
