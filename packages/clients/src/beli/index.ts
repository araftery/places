import type { SearchResult, LookupResult } from "../types.js";
import { createFetch } from "../proxy";

const BASE_URL =
  "https://backoffice-service-split-t57o3dxfca-nn.a.run.app";

const DEFAULT_HEADERS = {
  accept: "application/json",
  "content-type": "application/json",
  origin: "capacitor://localhost",
  "user-agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
};

export interface BeliClientConfig {
  phoneNumber: string;
  password: string;
  userId: string;
  /** Optional initial access token (skips login if still valid) */
  accessToken?: string;
  /** Optional initial refresh token */
  refreshToken?: string;
  proxyUrl?: string;
}

export interface BeliTokens {
  access: string;
  refresh: string;
}

export function createBeliClient(config: BeliClientConfig) {
  let accessToken = config.accessToken ?? "";
  let refreshToken = config.refreshToken ?? "";
  const userId = config.userId;
  const fetchFn = createFetch(config.proxyUrl);

  async function login(): Promise<BeliTokens> {
    const res = await fetchFn(`${BASE_URL}/api/token/`, {
      method: "POST",
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({
        phone_no: config.phoneNumber,
        password: config.password,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Beli login failed: ${text}`);
    }

    const data = await res.json();
    accessToken = data.access;
    refreshToken = data.refresh;
    return { access: accessToken, refresh: refreshToken };
  }

  async function refreshAccessToken(): Promise<string> {
    const res = await fetchFn(`${BASE_URL}/api/token/refresh/`, {
      method: "POST",
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({ refresh: refreshToken }),
    });

    if (!res.ok) {
      // Refresh token expired — need full re-login
      await login();
      return accessToken;
    }

    const data = await res.json();
    accessToken = data.access;
    return accessToken;
  }

  function isTokenExpired(token: string): boolean {
    if (!token) return true;
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      // Consider expired if within 60 seconds of expiry
      return payload.exp * 1000 < Date.now() + 60_000;
    } catch {
      return true;
    }
  }

  async function ensureAuth(): Promise<string> {
    if (!accessToken || isTokenExpired(accessToken)) {
      if (refreshToken && !isTokenExpired(refreshToken)) {
        await refreshAccessToken();
      } else {
        await login();
      }
    }
    return accessToken;
  }

  async function authedFetch(
    url: string,
    init?: RequestInit
  ): Promise<Response> {
    const token = await ensureAuth();
    const res = await fetchFn(url, {
      ...init,
      headers: {
        ...DEFAULT_HEADERS,
        Authorization: `Bearer ${token}`,
        ...(init?.headers || {}),
      },
    });

    // If we get a 401, try refreshing once
    if (res.status === 401) {
      await refreshAccessToken();
      return fetchFn(url, {
        ...init,
        headers: {
          ...DEFAULT_HEADERS,
          Authorization: `Bearer ${accessToken}`,
          ...(init?.headers || {}),
        },
      });
    }

    return res;
  }

  async function search(
    query: string,
    options?: { city?: string; lat?: number; lng?: number }
  ): Promise<SearchResult[]> {
    const params = new URLSearchParams({
      term: query,
      coords: options?.lat && options?.lng
        ? `${options.lat},${options.lng}`
        : " ",
      user: userId,
    });
    if (options?.city) {
      params.set("city", options.city);
    }

    const res = await authedFetch(
      `${BASE_URL}/api/search-app/?${params.toString()}`
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Beli search error: ${text}`);
    }

    const data = await res.json();
    const predictions = data.predictions || [];

    return predictions.map(
      (p: Record<string, unknown>) => ({
        externalId: String(p.business || p.place_id),
        provider: "beli" as const,
        name:
          (p.structured_formatting as Record<string, unknown>)?.main_text as string ||
          "",
        summary:
          (p.structured_formatting as Record<string, unknown>)?.secondary_text as string ||
          null,
        rating: null,
        ratingScale: "0-10",
        priceLevel: null,
        cuisines: [],
        lat: null,
        lng: null,
        neighborhood: null,
        url: null,
      })
    );
  }

  async function getBusinessDetails(businessId: number): Promise<Record<string, unknown> | null> {
    const params = new URLSearchParams({
      id: String(businessId),
      from_business_page: "true",
    });
    const res = await authedFetch(
      `${BASE_URL}/api/business/?${params.toString()}`
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Beli business details error: ${text}`);
    }

    const data = await res.json();
    return data.results?.[0] ?? null;
  }

  async function getBusinessScore(businessId: number): Promise<number | null> {
    const params = new URLSearchParams({
      business: String(businessId),
      field__name: "AVGBUSINESSSCORE",
    });
    const res = await authedFetch(
      `${BASE_URL}/api/databusinessfloat-sparse/?${params.toString()}`
    );

    if (!res.ok) return null;

    const data = await res.json();
    return data.results?.[0]?.value ?? null;
  }

  async function getRatingCount(businessId: number): Promise<number | null> {
    const res = await authedFetch(
      `${BASE_URL}/api/business-count-rated/${businessId}/`
    );

    if (!res.ok) return null;

    const data = await res.json();
    return data.count ?? null;
  }

  async function lookup(businessId: string): Promise<LookupResult> {
    const id = parseInt(businessId, 10);
    const [details, score, ratingCount] = await Promise.all([
      getBusinessDetails(id),
      getBusinessScore(id),
      getRatingCount(id),
    ]);

    if (!details) {
      throw new Error(`No Beli business found for ID: ${businessId}`);
    }

    const cuisines = (details.cuisines as string[]) || [];

    return {
      externalId: String(details.id),
      provider: "beli",
      name: (details.name as string) || "",
      summary: null,
      rating: score,
      ratingScale: "0-10",
      priceLevel: (details.price as number) ?? null,
      cuisines,
      lat: (details.lat as number) ?? null,
      lng: (details.lng as number) ?? null,
      neighborhood: (details.neighborhood as string) || null,
      url: (details.quick_link as string) || null,
      address: null,
      city: (details.city as string) || null,
      state: null,
      reviewer: null,
      isCriticsPick: false,
      reviewDate: null,
      ratingCount,
      raw: details,
    };
  }

  return {
    /** Authenticate (or re-authenticate) with Beli */
    login,
    /** Refresh the access token */
    refreshAccessToken,
    /** Search for restaurants */
    search,
    /** Look up a business by its Beli business ID */
    lookup,
    /** Low-level: get business details */
    getBusinessDetails,
    /** Low-level: get average score (0-10) */
    getBusinessScore,
    /** Low-level: get total rating count */
    getRatingCount,
    /** Get current tokens (useful for persistence) */
    getTokens: (): BeliTokens => ({ access: accessToken, refresh: refreshToken }),
  };
}

export type BeliClient = ReturnType<typeof createBeliClient>;
