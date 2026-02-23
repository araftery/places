import type { SearchResult, LookupResult } from "../types.js";
import { createFetch } from "../proxy";

const CONTENTFUL_ENDPOINT =
  "https://graphql.contentful.com/content/v1/spaces/by7j1x5pisip/environments/master";
const CONTENTFUL_TOKEN = "FU30TvGbzF3EdhZBqMuF1KXVymYcnf5_Di9qDO1qN1I";

const PSS_ENDPOINT =
  "https://www.theinfatuation.com/direct/api/post-search/public/graphql";

const PRICE_MAP: Record<string, number> = {
  INEXPENSIVE: 1,
  MODERATE: 2,
  MODERATELY_EXPENSIVE: 3,
  EXPENSIVE: 4,
};

function mapPrice(code: string | null | undefined): number | null {
  if (!code) return null;
  return PRICE_MAP[code] ?? null;
}

export interface InfatuationClientConfig {
  /** Optional override for Contentful token (default: public token) */
  contentfulToken?: string;
  proxyUrl?: string;
}

export function createInfatuationClient(config?: InfatuationClientConfig) {
  const token = config?.contentfulToken ?? CONTENTFUL_TOKEN;
  const fetchFn = createFetch(config?.proxyUrl);

  async function searchPSS(
    query: string,
    options?: { canonicalPath?: string }
  ): Promise<SearchResult[]> {
    const canonicalPath = options?.canonicalPath ?? "";

    const graphqlQuery = `
      query getPredictiveSearch($query: String!, $canonicalPath: String!, $enableSitewideSearch: Boolean!) {
        searchPosts(input: {
          searchText: $query
          canonicalPathText: $canonicalPath
          postCategoryTypeText: [POST_REVIEW]
          enableSitewideSearch: $enableSitewideSearch
        }) {
          receivedRecordCount
          nodes {
            __typename
            documentTitleText
            documentIdentifier
            canonicalPathText
            slugName
            publishedTimestamp
            previewText
            ... on PostReview {
              placeName
              placeStreetName
              placeAddressPostalCode
              placeCityName
              placeStateName
              placePriceIndicatorCode
              placeRatingNumber
              placeKnownTelephoneNumber
              placeLocation { latitudeNumber longitudeNumber }
            }
          }
          resultsProperties {
            hasExactMatch
            hasFuzzyMatch
          }
        }
      }
    `;

    const res = await fetchFn(PSS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: graphqlQuery,
        variables: {
          query,
          canonicalPath,
          enableSitewideSearch: true,
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Infatuation PSS search error: ${text}`);
    }

    const data = await res.json();
    const nodes = data?.data?.searchPosts?.nodes ?? [];

    return nodes
      .filter((n: Record<string, unknown>) => n.__typename === "PostReview")
      .map((n: Record<string, unknown>) => ({
        externalId: n.slugName as string,
        provider: "infatuation" as const,
        name: (n.placeName as string) || (n.documentTitleText as string),
        summary: (n.previewText as string) || null,
        rating: (n.placeRatingNumber as number) || null,
        ratingScale: "0-10",
        priceLevel: mapPrice(n.placePriceIndicatorCode as string),
        cuisines: [],
        lat: (n.placeLocation as Record<string, number>)?.latitudeNumber ?? null,
        lng: (n.placeLocation as Record<string, number>)?.longitudeNumber ?? null,
        neighborhood: null,
        url: `https://www.theinfatuation.com${n.canonicalPathText}/reviews/${n.slugName}`,
      }));
  }

  async function lookupBySlug(slug: string): Promise<LookupResult> {
    const graphqlQuery = `
      query {
        postReviewCollection(limit: 1, where: {
          slug: { name: "${slug}" }
        }) {
          items {
            title
            rating
            headline
            preview
            publishDate
            canonicalPath
            slug { name }
            status
            venue {
              name
              street
              city
              state
              postalCode
              price
              closed
              closedStatus
              phone
              instagram
              url
              latlong { lat lon }
              reservation {
                reservationUrl
                reservationPlatform
              }
            }
            neighborhoodTagsCollection(limit: 2) {
              items { displayName name }
            }
            cuisineTagsCollection(limit: 5) {
              items { name }
            }
            perfectForCollection(limit: 6, where: { name_exists: true }) {
              items { name }
            }
            contributorCollection(limit: 5) {
              items { name slug { name } }
            }
          }
        }
      }
    `;

    const res = await fetchFn(CONTENTFUL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query: graphqlQuery }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Infatuation Contentful lookup error: ${text}`);
    }

    const data = await res.json();
    const item = data?.data?.postReviewCollection?.items?.[0];

    if (!item) {
      throw new Error(`No Infatuation review found for slug: ${slug}`);
    }

    const venue = item.venue || {};
    const cuisines = (item.cuisineTagsCollection?.items || []).map(
      (c: { name: string }) => c.name
    );
    const neighborhoods = (item.neighborhoodTagsCollection?.items || []).map(
      (n: { displayName?: string; name: string }) => n.displayName || n.name
    );
    const contributor = item.contributorCollection?.items?.[0];

    return {
      externalId: item.slug?.name || slug,
      provider: "infatuation",
      name: venue.name || item.title,
      summary: item.preview || item.headline || null,
      rating: item.rating ?? null,
      ratingScale: "0-10",
      priceLevel: venue.price ?? null,
      cuisines,
      lat: venue.latlong?.lat ?? null,
      lng: venue.latlong?.lon ?? null,
      neighborhood: neighborhoods[0] || null,
      url: `https://www.theinfatuation.com${item.canonicalPath}/reviews/${item.slug?.name}`,
      address: venue.street || null,
      city: venue.city || null,
      state: venue.state || null,
      reviewer: contributor?.name || null,
      isCriticsPick: false,
      reviewDate: item.publishDate || null,
      ratingCount: null,
      raw: item,
    };
  }

  async function listCities(): Promise<{ name: string; slug: string }[]> {
    const graphqlQuery = `
      query {
        cityCollection(limit: 500) {
          items {
            name
            cityPath
          }
        }
      }
    `;

    const res = await fetchFn(CONTENTFUL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query: graphqlQuery }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Infatuation Contentful listCities error: ${text}`);
    }

    const data = await res.json();
    const items = data?.data?.cityCollection?.items ?? [];

    return items.map((item: { name: string; cityPath: string }) => ({
      name: item.name,
      slug: item.cityPath,
    }));
  }

  return {
    /** Search via PSS (Post Search Service) — returns standardized SearchResult[] */
    search: searchPSS,
    /** Lookup a review by slug via Contentful — returns standardized LookupResult */
    lookup: lookupBySlug,
    /** List all cities available on The Infatuation */
    listCities,
  };
}

export type InfatuationClient = ReturnType<typeof createInfatuationClient>;
