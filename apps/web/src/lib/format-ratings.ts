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

/** Get the best editorial blurb from ratings (NYT > Michelin > Infatuation, must be >30 chars) */
export function getBestBlurb(
  ratings: PlaceRating[]
): { text: string; source: string; url: string | null } | null {
  const sourceLabels: Record<string, string> = {
    nyt: "The New York Times",
    michelin: "Michelin Guide",
    infatuation: "The Infatuation",
  };
  const sources = ["nyt", "michelin", "infatuation"];
  for (const src of sources) {
    const r = ratings.find((r) => r.source === src);
    if (!r?.notes) continue;
    // For michelin, the description is after the distinction label (separated by \n\n)
    const text = src === "michelin" ? r.notes.split("\n\n").slice(1).join("\n\n") : r.notes;
    if (text && text.length > 30) {
      return {
        text,
        source: sourceLabels[src] || src,
        url: r.ratingUrl,
      };
    }
  }
  return null;
}
