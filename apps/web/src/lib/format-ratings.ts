import type { PlaceRating } from "./types";

/** Format a numeric rating for display: e.g. 4.6 → "4.6", 9.16244 → "9.2" */
export function formatRating(rating: number, _ratingMax: number): string {
  return Number.isInteger(rating) ? String(rating) : rating.toFixed(1);
}

/** Format a count compactly: 1704 → "1.7K", 48147 → "48.1K", 850 → "850" */
export function formatCount(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}K`;
  }
  return String(n);
}

/** Get the best editorial blurb from ratings (NYT > Infatuation, must be >30 chars) */
export function getBestBlurb(
  ratings: PlaceRating[]
): { text: string; source: string; url: string | null } | null {
  const sources = ["nyt", "infatuation"];
  for (const src of sources) {
    const r = ratings.find((r) => r.source === src);
    if (r?.notes && r.notes.length > 30) {
      return {
        text: r.notes,
        source: src === "nyt" ? "The New York Times" : "The Infatuation",
        url: r.ratingUrl,
      };
    }
  }
  return null;
}
