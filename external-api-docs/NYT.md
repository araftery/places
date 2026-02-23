# NYT Dining Reviews API — Reverse-Engineered

Captured by inspecting the NYT website at `nytimes.com/reviews/dining` (Feb 2026).

## Architecture Overview

Uses a **persisted GraphQL query** on the NYT's Samizdat GraphQL gateway. No user authentication required — works in incognito with no cookies.

---

## Endpoint

**Method:** `GET`

**URL:** `https://samizdat-graphql.nytimes.com/graphql/v2`

Query parameters are URL-encoded JSON:

| Param | Value |
|-------|-------|
| `operationName` | `DiningReviewsQuery` |
| `variables` | `{"first": 10, "searchTerm": "<query>"}` |
| `extensions` | `{"persistedQuery": {"version": 1, "sha256Hash": "8956e8b91938167a7cb02bd4f39072acbce5bba3bc64aa8a4aa0fcc1643fd6ed"}}` |

The `sha256Hash` identifies the persisted query on the server — the actual GraphQL query text is never sent. You cannot send arbitrary GraphQL; only the pre-registered operation with the known hash.

---

## Required Headers

```
nyt-app-type: project-vi
nyt-app-version: 0.0.5
nyt-token: MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAs+/oUCTBmD/cLdmcecrnBMHiU/pxQCn2DDyaPKUOXxi4p0uUSZQzsuq1pJ1m5z1i0YGPd1U1OeGHAChWtqoxC7bFMCXcwnE1oyui9G1uobgpm1GdhtwkR7ta7akVTcsF8zxiXx7DNXIPd2nIJFH83rmkZueKrC4JVaNzjvD+Z03piLn5bHWU6+w+rA+kyJtGgZNTXKyPh6EC6o5N+rknNMG5+CdTq35p8f99WjFawSvYgP9V64kgckbTbtdJ6YhVP58TnuYgr12urtwnIqWP9KSJ1e5vmgf3tunMqWNm6+AnsqNj8mCLdCuc5cEB74CwUeQcP2HQQmbCddBy2y0mEwIDAQAB
```

- `nyt-token` is a static public RSA key embedded in the NYT frontend bundle (same for all users)
- No cookies or user auth required

---

## Variables

| Field | Type | Description |
|-------|------|-------------|
| `first` | Integer | Number of results to return (e.g. `10`) |
| `searchTerm` | String | Free-text search query (restaurant name, cuisine, neighborhood, etc.) |

**Note:** The persisted query does not appear to support cursor-based pagination via an `after` variable — passing `after` has no effect. Use `first` to control result count.

---

## Response Shape

```
data.reviews.dining.search
├── totalCount: Integer
├── pageInfo
│   ├── hasNextPage: Boolean
│   ├── hasPreviousPage: Boolean
│   ├── startCursor: String
│   └── endCursor: String
└── edges[]
    ├── node (Article — the review article)
    │   ├── id: String (base64-encoded)
    │   ├── url: String (full article URL)
    │   ├── promotionalHeadline: String
    │   ├── firstPublished: ISO 8601 timestamp
    │   ├── bylines[].creators[].displayName: String (reviewer name)
    │   ├── reviewItems[].isCriticsPick: Boolean
    │   └── promotionalMedia.crops[].renditions[].url: String (thumbnail)
    └── reviewItem (Restaurant — the reviewed venue)
        ├── id: String (base64-encoded)
        ├── name: String
        ├── rating: Integer (0–3 stars; 0 = no star rating)
        ├── priceCategory: Enum ("INEXPENSIVE", "MODERATE", "EXPENSIVE", "VERY_EXPENSIVE")
        ├── cuisines: String[] (e.g. ["Italian;Pizza"])
        ├── shortSummary: String (1-2 sentence blurb)
        ├── isCriticsPick: Boolean
        ├── reservationsUrl: String (Resy/OpenTable link, may be empty)
        ├── sourceId: String (NYT internal ID)
        ├── restaurantImage.crops[].renditions[].url: String
        ├── contactDetails.addresses[].neighborhood: String
        └── firstPublished: ISO 8601 timestamp
```

### Rating Scale

NYT uses a 0–3 star system (integer):

| Rating | Meaning |
|--------|---------|
| 0 | No star rating (not necessarily bad — many Critic's Picks have 0 stars) |
| 1 | Good |
| 2 | Very Good |
| 3 | Excellent |

### Price Categories

| Value | Meaning |
|-------|---------|
| `INEXPENSIVE` | $ |
| `MODERATE` | $$ |
| `EXPENSIVE` | $$$ |
| `VERY_EXPENSIVE` | $$$$ |

---

## Example Response (trimmed)

```json
{
  "data": {
    "reviews": {
      "dining": {
        "search": {
          "totalCount": 1,
          "pageInfo": {
            "hasNextPage": false,
            "hasPreviousPage": false,
            "startCursor": "YXJyYXljb25uZWN0aW9uOjA=",
            "endCursor": "YXJyYXljb25uZWN0aW9uOjA="
          },
          "edges": [
            {
              "node": {
                "url": "https://www.nytimes.com/2016/03/30/dining/lilia-restaurant-review.html",
                "promotionalHeadline": "At Lilia in Brooklyn, Missy Robbins Is Cooking Pasta Again",
                "firstPublished": "2016-03-29T15:08:29.000Z",
                "bylines": [
                  {
                    "creators": [
                      { "displayName": "Pete Wells" }
                    ]
                  }
                ],
                "reviewItems": [
                  { "isCriticsPick": false }
                ],
                "promotionalMedia": {
                  "crops": [
                    {
                      "renditions": [
                        {
                          "url": "https://static01.nyt.com/images/2016/03/30/dining/30RESTAURANT/30RESTAURANT-mediumThreeByTwo210.jpg",
                          "width": 210,
                          "height": 140
                        }
                      ]
                    }
                  ]
                }
              },
              "reviewItem": {
                "name": "Lilia",
                "rating": 3,
                "priceCategory": "EXPENSIVE",
                "cuisines": ["Italian"],
                "shortSummary": "Missy Robbins\u2019s first restaurant as an owner and the chef specializes in exceptional pasta and grilled Italian seafood.",
                "reservationsUrl": "https://resy.com/cities/ny/lilia?utm_source=nyt&utm_medium=restoprofile&utm_campaign=affiliates&aff_id=c1fe784",
                "contactDetails": {
                  "addresses": [
                    { "neighborhood": "Williamsburg" }
                  ]
                }
              }
            }
          ]
        }
      }
    }
  }
}
```

---

## curl Example

```bash
curl -s -G 'https://samizdat-graphql.nytimes.com/graphql/v2' \
  --data-urlencode 'operationName=DiningReviewsQuery' \
  --data-urlencode 'variables={"first":10,"searchTerm":"lilia"}' \
  --data-urlencode 'extensions={"persistedQuery":{"version":1,"sha256Hash":"8956e8b91938167a7cb02bd4f39072acbce5bba3bc64aa8a4aa0fcc1643fd6ed"}}' \
  -H 'nyt-app-type: project-vi' \
  -H 'nyt-app-version: 0.0.5' \
  -H 'nyt-token: MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAs+/oUCTBmD/cLdmcecrnBMHiU/pxQCn2DDyaPKUOXxi4p0uUSZQzsuq1pJ1m5z1i0YGPd1U1OeGHAChWtqoxC7bFMCXcwnE1oyui9G1uobgpm1GdhtwkR7ta7akVTcsF8zxiXx7DNXIPd2nIJFH83rmkZueKrC4JVaNzjvD+Z03piLn5bHWU6+w+rA+kyJtGgZNTXKyPh6EC6o5N+rknNMG5+CdTq35p8f99WjFawSvYgP9V64kgckbTbtdJ6YhVP58TnuYgr12urtwnIqWP9KSJ1e5vmgf3tunMqWNm6+AnsqNj8mCLdCuc5cEB74CwUeQcP2HQQmbCddBy2y0mEwIDAQAB'
```

---

## URL Patterns

| Content | URL |
|---------|-----|
| Review article | Returned directly in `node.url` (e.g. `https://www.nytimes.com/2016/03/30/dining/lilia-restaurant-review.html`) |
| Review thumbnail | `node.promotionalMedia.crops[0].renditions[0].url` |
| Restaurant image | `reviewItem.restaurantImage.crops[0].renditions[0].url` (same image in practice) |
| Reservation | `reviewItem.reservationsUrl` (Resy/OpenTable affiliate link) |

---

## Notes

- **No pagination support**: The `after` cursor variable is accepted but ignored. Set `first` high enough to get all results (search rarely returns more than ~50).
- **Cuisines format**: Cuisines are returned as strings that may contain semicolons for subcategories (e.g. `"Italian;Pizza"`).
- **Critic's Pick**: `isCriticsPick` appears on both `node.reviewItems[0]` and is the NYT's editorial recommendation flag. Many Critic's Picks have a `rating` of 0 (no star rating assigned).
- **No location data**: Unlike The Infatuation API, the NYT response does not include lat/lon coordinates or full street addresses — only `neighborhood` is provided.
