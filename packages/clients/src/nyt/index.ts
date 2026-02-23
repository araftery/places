import type { SearchResult, LookupResult } from "../types.js";

const GRAPHQL_ENDPOINT = "https://samizdat-graphql.nytimes.com/graphql/v2";

const PERSISTED_QUERY_HASH =
  "8956e8b91938167a7cb02bd4f39072acbce5bba3bc64aa8a4aa0fcc1643fd6ed";

const NYT_TOKEN =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAs+/oUCTBmD/cLdmcecrnBMHiU/pxQCn2DDyaPKUOXxi4p0uUSZQzsuq1pJ1m5z1i0YGPd1U1OeGHAChWtqoxC7bFMCXcwnE1oyui9G1uobgpm1GdhtwkR7ta7akVTcsF8zxiXx7DNXIPd2nIJFH83rmkZueKrC4JVaNzjvD+Z03piLn5bHWU6+w+rA+kyJtGgZNTXKyPh6EC6o5N+rknNMG5+CdTq35p8f99WjFawSvYgP9V64kgckbTbtdJ6YhVP58TnuYgr12urtwnIqWP9KSJ1e5vmgf3tunMqWNm6+AnsqNj8mCLdCuc5cEB74CwUeQcP2HQQmbCddBy2y0mEwIDAQAB";

const PRICE_MAP: Record<string, number> = {
  INEXPENSIVE: 1,
  MODERATE: 2,
  EXPENSIVE: 3,
  VERY_EXPENSIVE: 4,
};

interface NytEdge {
  node: {
    id: string;
    url: string;
    promotionalHeadline: string;
    firstPublished: string;
    bylines: Array<{
      creators: Array<{ displayName: string }>;
    }>;
    reviewItems: Array<{ isCriticsPick: boolean }>;
    promotionalMedia?: {
      crops: Array<{
        renditions: Array<{ url: string; width: number; height: number }>;
      }>;
    };
  };
  reviewItem: {
    id: string;
    name: string;
    rating: number;
    priceCategory: string | null;
    cuisines: string[];
    shortSummary: string;
    isCriticsPick: boolean;
    reservationsUrl: string;
    sourceId: string;
    contactDetails?: {
      addresses: Array<{ neighborhood: string }>;
    };
    restaurantImage?: {
      crops: Array<{
        renditions: Array<{ url: string }>;
      }>;
    };
    firstPublished?: string;
  };
}

export function createNytClient() {
  async function searchDining(
    query: string,
    options?: { limit?: number }
  ): Promise<SearchResult[]> {
    const first = options?.limit ?? 10;

    const params = new URLSearchParams({
      operationName: "DiningReviewsQuery",
      variables: JSON.stringify({ first, searchTerm: query }),
      extensions: JSON.stringify({
        persistedQuery: {
          version: 1,
          sha256Hash: PERSISTED_QUERY_HASH,
        },
      }),
    });

    const res = await fetch(`${GRAPHQL_ENDPOINT}?${params.toString()}`, {
      method: "GET",
      headers: {
        "nyt-app-type": "project-vi",
        "nyt-app-version": "0.0.5",
        "nyt-token": NYT_TOKEN,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`NYT dining search error: ${text}`);
    }

    const data = await res.json();
    const edges: NytEdge[] =
      data?.data?.reviews?.dining?.search?.edges ?? [];

    return edges.map((edge) => {
      const { node, reviewItem } = edge;
      const neighborhood =
        reviewItem.contactDetails?.addresses?.[0]?.neighborhood ?? null;
      const cuisines = (reviewItem.cuisines || []).flatMap((c: string) =>
        c.split(";").map((s: string) => s.trim())
      );

      return {
        externalId: reviewItem.sourceId || node.id,
        provider: "nyt" as const,
        name: reviewItem.name,
        summary: reviewItem.shortSummary || null,
        rating: reviewItem.rating ?? null,
        ratingScale: "0-3",
        priceLevel: PRICE_MAP[reviewItem.priceCategory || ""] ?? null,
        cuisines,
        lat: null,
        lng: null,
        neighborhood,
        url: node.url,
      };
    });
  }

  async function lookup(sourceId: string): Promise<LookupResult> {
    // NYT uses a persisted query that only supports search, so
    // we search by restaurant name derived from the sourceId or
    // pass the sourceId as a search term. The caller should pass
    // the restaurant name for best results.
    const results = await searchDining(sourceId, { limit: 1 });
    if (results.length === 0) {
      throw new Error(`No NYT review found for: ${sourceId}`);
    }

    // Re-fetch the raw edge data for extra fields
    const params = new URLSearchParams({
      operationName: "DiningReviewsQuery",
      variables: JSON.stringify({ first: 1, searchTerm: sourceId }),
      extensions: JSON.stringify({
        persistedQuery: {
          version: 1,
          sha256Hash: PERSISTED_QUERY_HASH,
        },
      }),
    });

    const res = await fetch(`${GRAPHQL_ENDPOINT}?${params.toString()}`, {
      method: "GET",
      headers: {
        "nyt-app-type": "project-vi",
        "nyt-app-version": "0.0.5",
        "nyt-token": NYT_TOKEN,
      },
    });

    const data = await res.json();
    const edge: NytEdge = data?.data?.reviews?.dining?.search?.edges?.[0];

    if (!edge) {
      throw new Error(`No NYT review found for: ${sourceId}`);
    }

    const { node, reviewItem } = edge;
    const neighborhood =
      reviewItem.contactDetails?.addresses?.[0]?.neighborhood ?? null;
    const cuisines = (reviewItem.cuisines || []).flatMap((c: string) =>
      c.split(";").map((s: string) => s.trim())
    );
    const reviewer =
      node.bylines?.[0]?.creators?.[0]?.displayName ?? null;
    const isCriticsPick =
      reviewItem.isCriticsPick ||
      node.reviewItems?.[0]?.isCriticsPick ||
      false;

    return {
      externalId: reviewItem.sourceId || node.id,
      provider: "nyt",
      name: reviewItem.name,
      summary: reviewItem.shortSummary || null,
      rating: reviewItem.rating ?? null,
      ratingScale: "0-3",
      priceLevel: PRICE_MAP[reviewItem.priceCategory || ""] ?? null,
      cuisines,
      lat: null,
      lng: null,
      neighborhood,
      url: node.url,
      address: null,
      city: null,
      state: null,
      reviewer,
      isCriticsPick,
      reviewDate: node.firstPublished || null,
      ratingCount: null,
      raw: edge,
    };
  }

  return {
    /** Search NYT dining reviews */
    search: searchDining,
    /** Lookup a single NYT review (searches by name since NYT only supports search) */
    lookup,
  };
}

export type NytClient = ReturnType<typeof createNytClient>;
