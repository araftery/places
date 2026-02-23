import { ProxyAgent } from "undici";

export interface ProxyConfig {
  proxyUrl?: string;
}

/**
 * Creates a fetch-compatible function that optionally routes through a proxy.
 * When no proxyUrl is provided, returns the global fetch unchanged.
 */
export function createFetch(proxyUrl?: string): typeof globalThis.fetch {
  if (!proxyUrl) return globalThis.fetch;

  const dispatcher = new ProxyAgent(proxyUrl);

  return ((input: RequestInfo | URL, init?: RequestInit) => {
    return globalThis.fetch(input, {
      ...init,
      // @ts-expect-error undici dispatcher is compatible at runtime
      dispatcher,
    });
  }) as typeof globalThis.fetch;
}
