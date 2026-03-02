/** Cities that have neighborhood boundary data in public/neighborhoods/{slug}.json */
export const CITIES_WITH_NEIGHBORHOODS = [
  "new-york",
  "los-angeles",
  "paris",
  "london",
  "boston",
  "chicago",
  "washington",
  "san-francisco",
];

/** Convert a city name like "New York" → "new-york" */
export function getCitySlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-");
}

const cache = new Map<string, GeoJSON.FeatureCollection>();

/** Fetch neighborhood GeoJSON for a city slug. Returns null if unavailable. Caches in memory. */
export async function fetchNeighborhoodGeoJson(
  slug: string
): Promise<GeoJSON.FeatureCollection | null> {
  if (!CITIES_WITH_NEIGHBORHOODS.includes(slug)) return null;

  const cached = cache.get(slug);
  if (cached) return cached;

  try {
    const res = await fetch(`/neighborhoods/${slug}.json`);
    if (!res.ok) return null;
    const data = (await res.json()) as GeoJSON.FeatureCollection;
    cache.set(slug, data);
    return data;
  } catch {
    return null;
  }
}
