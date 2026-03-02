import { chromium, type Browser, type Page } from "playwright";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

export interface WebsiteScanResult {
  /** Detected provider (matches RESERVATION_PROVIDERS values) */
  provider: string | null;
  /** Booking URL found on the page */
  url: string | null;
  /** Provider-specific external ID (rid, venue slug, etc.) */
  externalId: string | null;
  /** Opening window in days (from text signals) */
  openingWindowDays: number | null;
  /** Opening pattern (from text signals) */
  openingPattern: string | null; // "rolling" | "bulk" | null
  /** Time of day reservations open, in local time (e.g. "10:00 AM", "midnight", "noon") */
  openingTime: string | null;
  /** All signals found during scanning (for debugging) */
  signals: string[];
}

export interface WebsiteScanOptions {
  /** Oxylabs proxy URL (e.g. http://user:pass@pr.oxylabs.io:7777) */
  proxyUrl?: string;
  /** Google Gemini API key */
  geminiApiKey: string;
}

/** Parse an Oxylabs-style proxy URL into Playwright proxy config. */
function parseProxyUrl(proxyUrl: string) {
  const parsed = new URL(proxyUrl);
  return {
    server: `${parsed.protocol}//${parsed.host}`,
    username: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
  };
}

/** Extract all links from the page with their text and href. */
async function extractLinks(page: Page): Promise<{ text: string; href: string }[]> {
  return page.evaluate(() => {
    const links: { text: string; href: string }[] = [];
    const elements = Array.from(document.querySelectorAll("a[href]"));
    for (const a of elements) {
      const text = (a as HTMLElement).innerText?.trim();
      const href = (a as HTMLAnchorElement).href;
      if (text && href && !href.startsWith("javascript:")) {
        links.push({ text: text.slice(0, 200), href });
      }
    }
    return links;
  });
}

/** Extract visible text content from the page body. */
async function extractVisibleText(page: Page): Promise<string> {
  return page.evaluate(() => {
    return document.body?.innerText ?? "";
  });
}

/** Extract script and iframe src URLs from the page. */
async function extractEmbeds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const srcs: string[] = [];
    const elements = Array.from(document.querySelectorAll("script[src], iframe[src]"));
    for (const el of elements) {
      const src = el.getAttribute("src");
      if (src) srcs.push(src);
    }
    return srcs;
  });
}

/** Find the first reservation-related link on the page (for two-hop navigation). */
function findReservationLink(links: { text: string; href: string }[], baseUrl: string): string | null {
  const reservationPatterns = /^(reservations?|reserve|book\s*(a\s*table|now)?|make\s*a\s*reservation)$/i;
  for (const link of links) {
    if (reservationPatterns.test(link.text.trim())) {
      // Skip links to known external providers (we want internal reservation pages)
      try {
        const url = new URL(link.href);
        const base = new URL(baseUrl);
        if (url.hostname === base.hostname || url.hostname.endsWith("." + base.hostname)) {
          return link.href;
        }
      } catch {
        continue;
      }
    }
  }
  return null;
}

/** Truncate text to fit within token budget. */
function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n...[truncated]";
}

/** Gemini response schema for structured output. */
const scanResultSchema = {
  type: SchemaType.OBJECT as const,
  properties: {
    provider: {
      type: SchemaType.STRING as const,
      nullable: true as const,
      description:
        'The reservation platform provider. One of: "resy", "opentable", "sevenrooms", "tock", "walk_in", "phone", "other", or null if unknown.',
    },
    url: {
      type: SchemaType.STRING as const,
      nullable: true as const,
      description:
        "The booking/reservation URL found on the page (e.g. the OpenTable, Resy, or SevenRooms link).",
    },
    externalId: {
      type: SchemaType.STRING as const,
      nullable: true as const,
      description:
        "Provider-specific external ID extracted from the booking URL. For OpenTable: the rid number or /r/ slug. For Resy: the venue slug from /cities/<city>/<slug>. For SevenRooms: the venue slug from /reservations/<slug>.",
    },
    openingWindowDays: {
      type: SchemaType.NUMBER as const,
      nullable: true as const,
      description:
        "How many days in advance reservations open, if mentioned on the page.",
    },
    openingPattern: {
      type: SchemaType.STRING as const,
      nullable: true as const,
      description:
        'How reservations are released. "rolling" if they open on a rolling basis (e.g. 14 days in advance). "bulk" if they are released on a specific date (e.g. first of the month). null if not mentioned.',
    },
    openingTime: {
      type: SchemaType.STRING as const,
      nullable: true as const,
      description:
        'The time of day (in the restaurant\'s local time) when new reservations become available, if mentioned on the page. Examples: "10:00 AM", "midnight", "noon", "9:00 AM EST". null if not mentioned.',
    },
    reasoning: {
      type: SchemaType.STRING as const,
      description:
        "Brief explanation of how the provider was determined and what signals were found.",
    },
  },
  required: ["provider", "url", "externalId", "openingWindowDays", "openingPattern", "openingTime", "reasoning"],
};

const SYSTEM_PROMPT = `You are analyzing a restaurant's website to determine how they handle reservations.

You will receive:
1. The visible text content from the homepage (and possibly a reservations subpage)
2. All links found on those pages (with their text and href)
3. Embedded script/iframe sources

Your job is to determine:
- Which reservation PLATFORM the restaurant uses (resy, opentable, sevenrooms, tock, walk_in, phone, other, or null)
- The booking URL (the link to the reservation platform)
- The provider-specific external ID from the booking URL
- Whether the page mentions how far in advance reservations open (opening window)
- Whether reservations are released on a rolling basis or in bulk
- What time of day new reservations become available (e.g. "10:00 AM", "midnight", "noon") — this is the time they DROP or are released, not when the restaurant opens for dining

Important rules:
- Look at ACTUAL booking links and what the page text says. A stale/unused script embed (e.g. a resy embed.js with no corresponding booking link) should be ignored if the page clearly uses a different provider.
- If the page says "exclusively on OpenTable" or similar, that's the provider even if other embeds exist.
- For provider detection, prioritize: actual booking links > page text > script embeds.
- For external IDs: OpenTable rid is in "rid=" param or /r/<slug>. Resy slug is the last path segment of /cities/<city>/<slug>. SevenRooms slug is from /reservations/<slug>.
- "tock" is for exploretock.com or tock.com links.
- "walk_in" is for restaurants that explicitly say walk-ins only, no reservations, or first come first served.
- "phone" is for restaurants that say to call for reservations or reserve by phone.
- "other" is for booking links that don't match any known provider.
- null if you can't determine how reservations work.`;

/**
 * Scan a restaurant's website for reservation provider signals.
 * Uses Playwright to load the page (with optional Oxylabs proxy),
 * follows any internal "Reservations" link for a two-hop scan,
 * then sends the extracted content to Gemini for analysis.
 */
export async function scanWebsiteForReservation(
  websiteUrl: string,
  options: WebsiteScanOptions
): Promise<WebsiteScanResult> {
  const result: WebsiteScanResult = {
    provider: null,
    url: null,
    externalId: null,
    openingWindowDays: null,
    openingPattern: null,
    openingTime: null,
    signals: [],
  };

  // --- Step 1: Load pages with Playwright ---
  let homepageText = "";
  let homepageLinks: { text: string; href: string }[] = [];
  let homepageEmbeds: string[] = [];
  let reservationPageText = "";
  let reservationPageLinks: { text: string; href: string }[] = [];
  let reservationPageEmbeds: string[] = [];
  let reservationPageUrl: string | null = null;

  let browser: Browser | null = null;
  try {
    const launchOptions: Parameters<typeof chromium.launch>[0] = {
      headless: true,
    };
    if (options.proxyUrl) {
      launchOptions.proxy = parseProxyUrl(options.proxyUrl);
    }

    browser = await chromium.launch(launchOptions);
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    // Load homepage (continue with partial content on timeout)
    try {
      await page.goto(websiteUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
    } catch (err: any) {
      if (err.name === "TimeoutError" || err.message?.includes("Timeout")) {
        result.signals.push(`timeout_partial: ${websiteUrl}`);
      } else {
        throw err;
      }
    }
    homepageText = await extractVisibleText(page);
    homepageLinks = await extractLinks(page);
    homepageEmbeds = await extractEmbeds(page);
    result.signals.push(`loaded: ${websiteUrl}`);

    // Two-hop: find and follow a "Reservations" link on the same domain
    reservationPageUrl = findReservationLink(homepageLinks, websiteUrl);
    if (reservationPageUrl) {
      try {
        await page.goto(reservationPageUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
      } catch (err: any) {
        if (err.name === "TimeoutError" || err.message?.includes("Timeout")) {
          result.signals.push(`timeout_partial: ${reservationPageUrl}`);
        } else {
          result.signals.push(`follow_failed: ${reservationPageUrl} - ${err.message}`);
          reservationPageUrl = null;
        }
      }
      if (reservationPageUrl) {
        reservationPageText = await extractVisibleText(page);
        reservationPageLinks = await extractLinks(page);
        reservationPageEmbeds = await extractEmbeds(page);
        result.signals.push(`followed: ${reservationPageUrl}`);
      }
    }
  } catch (err: any) {
    result.signals.push(`fetch_failed: ${err.message ?? String(err)}`);
    return result;
  } finally {
    if (browser) await browser.close();
  }

  // --- Step 2: Build prompt for Gemini ---
  // Deduplicate links across both pages
  const allLinks = [...homepageLinks];
  const seenHrefs = new Set(homepageLinks.map((l) => l.href));
  for (const link of reservationPageLinks) {
    if (!seenHrefs.has(link.href)) {
      allLinks.push(link);
      seenHrefs.add(link.href);
    }
  }
  const allEmbeds = [...new Set([...homepageEmbeds, ...reservationPageEmbeds])];

  // Filter links to only potentially relevant ones (booking platforms, reservation-related text)
  const relevantLinkPatterns =
    /reserv|book|resy|opentable|sevenrooms|tock|yelp|walk[- ]?in|phone|call|whatsapp/i;
  const relevantLinks = allLinks.filter(
    (l) => relevantLinkPatterns.test(l.text) || relevantLinkPatterns.test(l.href)
  );
  // Always include all external links (non-same-domain) as they might be booking links
  const baseDomain = new URL(websiteUrl).hostname.replace(/^www\./, "");
  for (const link of allLinks) {
    try {
      const linkDomain = new URL(link.href).hostname.replace(/^www\./, "");
      if (linkDomain !== baseDomain && !relevantLinks.includes(link)) {
        relevantLinks.push(link);
      }
    } catch {
      // skip invalid URLs
    }
  }

  const linksStr = relevantLinks
    .map((l) => `  "${l.text}" → ${l.href}`)
    .join("\n");

  const embedsStr = allEmbeds
    .filter((s) => /resy|opentable|sevenrooms|tock/i.test(s))
    .map((s) => `  ${s}`)
    .join("\n");

  const userPrompt = `Restaurant website: ${websiteUrl}

## Homepage text:
${truncate(homepageText, 4000)}

${reservationPageUrl ? `## Reservations page (${reservationPageUrl}) text:\n${truncate(reservationPageText, 4000)}` : "(No internal reservations page found)"}

## Relevant links found:
${linksStr || "(none)"}

## Reservation-related script/iframe embeds:
${embedsStr || "(none)"}`;

  // --- Step 3: Send to Gemini ---
  try {
    const genAI = new GoogleGenerativeAI(options.geminiApiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-flash-latest",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: scanResultSchema,
      },
      systemInstruction: SYSTEM_PROMPT,
    });

    const geminiResult = await model.generateContent(userPrompt);
    const text = geminiResult.response.text();
    console.log("[website-scanner] Gemini full response:", text);
    const parsed = JSON.parse(text);

    result.provider = parsed.provider ?? null;
    result.url = parsed.url ?? null;
    result.externalId = parsed.externalId ?? null;
    result.openingWindowDays = parsed.openingWindowDays ?? null;
    result.openingPattern = parsed.openingPattern ?? null;
    result.openingTime = parsed.openingTime ?? null;
    if (parsed.reasoning) {
      result.signals.push(`gemini: ${parsed.reasoning}`);
    }
  } catch (err: any) {
    result.signals.push(`gemini_failed: ${err.message ?? String(err)}`);
  }

  return result;
}
