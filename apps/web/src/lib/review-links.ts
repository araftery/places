export interface ReviewLink {
  source: string;
  label: string;
  url: string;
}

export function generateReviewLinks(
  name: string,
  address?: string | null,
  city?: string | null
): ReviewLink[] {
  const query = encodeURIComponent(
    `${name}${city ? ` ${city}` : ""}`
  );
  const fullQuery = encodeURIComponent(
    `${name}${address ? ` ${address}` : ""}`
  );

  return [
    {
      source: "google",
      label: "Google",
      url: `https://www.google.com/maps/search/${fullQuery}`,
    },
    {
      source: "infatuation",
      label: "Infatuation",
      url: `https://www.theinfatuation.com/search?q=${query}`,
    },
    {
      source: "beli",
      label: "Beli",
      url: `https://beliapp.com/search?q=${query}`,
    },
    {
      source: "yelp",
      label: "Yelp",
      url: `https://www.yelp.com/search?find_desc=${query}`,
    },
  ];
}
