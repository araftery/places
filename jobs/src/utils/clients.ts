import {
  createGoogleClient,
  createInfatuationClient,
  createBeliClient,
  createNytClient,
  createResyClient,
  createOpenTableClient,
  createSevenRoomsClient,
} from "@places/clients";

function getProxyUrl(sessionId: string): string | undefined {
  const user = process.env.OXYLABS_USERNAME;
  const pass = process.env.OXYLABS_PASSWORD;
  if (!user || !pass) return undefined;
  const proxyUser = `customer-${user}-cc-us-sessid-${sessionId}-sesstime-10`;
  return `http://${proxyUser}:${encodeURIComponent(pass)}@pr.oxylabs.io:7777`;
}

/** Generate a random session ID for a job run. */
export function generateSessionId(): string {
  return Math.random().toString().slice(2, 12);
}

export function getGoogleClient() {
  return createGoogleClient({
    apiKey: process.env.GOOGLE_PLACES_API_KEY!,
    // Google Places is a first-party API — no proxy needed
  });
}

export function getInfatuationClient(sessionId: string) {
  return createInfatuationClient({
    proxyUrl: getProxyUrl(sessionId),
  });
}

export function getBeliClient(sessionId: string) {
  return createBeliClient({
    phoneNumber: process.env.BELI_PHONE_NUMBER!,
    password: process.env.BELI_PASSWORD!,
    userId: process.env.BELI_USER_ID!,
    proxyUrl: getProxyUrl(sessionId),
  });
}

export function getNytClient(sessionId: string) {
  return createNytClient({
    proxyUrl: getProxyUrl(sessionId),
  });
}

export function getResyClient(sessionId: string) {
  return createResyClient({
    apiKey: process.env.RESY_API_KEY!,
    proxyUrl: getProxyUrl(sessionId),
  });
}

export function getOpenTableClient(sessionId: string) {
  return createOpenTableClient({
    proxyUrl: getProxyUrl(sessionId),
  });
}

export function getSevenRoomsClient(sessionId: string) {
  return createSevenRoomsClient({
    proxyUrl: getProxyUrl(sessionId),
  });
}
