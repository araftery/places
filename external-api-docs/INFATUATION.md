# The Infatuation Public Web API — Reverse-Engineered

Captured by inspecting the Next.js web app at `theinfatuation.com` (Feb 2026).

## Architecture Overview

The website uses **two backends**, both public and unauthenticated:

1. **Contentful CMS** — editorial content (reviews, guides, venues, cities)
2. **PSS (Post Search Service)** — search, filtering, trending

---

## Backend 1: Contentful CMS (GraphQL)

**Endpoint:** `POST https://graphql.contentful.com/content/v1/spaces/by7j1x5pisip/environments/master`

**Auth:** `Bearer FU30TvGbzF3EdhZBqMuF1KXVymYcnf5_Di9qDO1qN1I`

This is a Contentful Delivery API token (public/read-only). No other auth required.

**Headers:**
```
Content-Type: application/json
Authorization: Bearer FU30TvGbzF3EdhZBqMuF1KXVymYcnf5_Di9qDO1qN1I
```

### Key Content Types

| Type | Description |
|------|-------------|
| `PostReview` | Restaurant review with rating, venue, blurb |
| `PostGuide` | Curated list (Hit List, Top 25, Best Pizza, etc.) |
| `PostFeature` | Feature article (news, openings stories) |
| `Venue` | Restaurant/bar/cafe with address, price, hours |
| `City` | City with coordinates, bounds, path |
| `Caption` | A single entry in a modular guide, links to a `PostReview` |
| `CaptionGroup` | A group of Captions (subsection of a guide) |
| `Section` | City section/category (neighborhoods, cuisines, etc.) |
| `CoreGuides` | Per-city pointers to Hit List, Top 25, New Openings |

---

### 1. Search for a Restaurant Review

Search by slug (exact):
```graphql
query {
  postReviewCollection(limit: 1, where: {
    slug: { name: "lilia" }
  }) {
    items {
      title
      rating
      headline
      preview
      publishDate
      canonicalPath
      slug { name }
      status
      venue {
        name street city state postalCode
        price closed closedStatus
        phone instagram url
        latlong { lat lon }
        reservation(where: { reservationPlatform_exists: true }) {
          reservationUrl reservationPlatform
        }
      }
      neighborhoodTagsCollection(limit: 2) { items { displayName name } }
      cuisineTagsCollection(limit: 2) { items { name } }
      perfectForCollection(limit: 6, where: { name_exists: true }) { items { name } }
      badgeCollection { items { name } }
      contributorCollection(limit: 5) { items { name slug } }
    }
  }
}
```

Search by title (contains):
```graphql
query {
  postReviewCollection(limit: 10, where: {
    title_contains: "pizza"
    canonicalPath: "/new-york"
  }) {
    items {
      title rating preview publishDate
      slug { name }
      canonicalPath
      venue { name street city state price latlong { lat lon } }
    }
  }
}
```

**Example response:**
```json
{
  "title": "Lilia",
  "rating": 8.9,
  "headline": "At Williamsburg's Lilia, it was never about the hype",
  "preview": "Williamsburg's Lilia has become the overachieving neighborhood Italian spot...",
  "publishDate": "2025-04-25T15:00:00.000Z",
  "status": null,
  "venue": {
    "name": "Lilia",
    "street": "567 Union Avenue",
    "city": "Brooklyn",
    "state": "NY",
    "price": 3,
    "closed": false,
    "closedStatus": "Open",
    "latlong": { "lat": 40.7174888933, "lon": -73.9523563253 },
    "instagram": "lilianewyork",
    "phone": "(718) 576-3095"
  }
}
```

**Notes:**
- `rating` is a float (0-10 scale), `null` for unrated/new restaurants
- `price` is an integer: 1=Inexpensive, 2=Moderate, 3=Moderately Expensive, 4=Expensive
- `canonicalPath` is the city path (e.g. `/new-york`)
- Review URL pattern: `https://www.theinfatuation.com{canonicalPath}/reviews/{slug.name}`

---

### 2. Get a City's Core Guides (Hit List, Top 25, New Openings)

```graphql
query {
  coreGuidesCollection(where: { canonicalPath: "/new-york" }) {
    items {
      hitList { title slug { name } }
      top25 { title slug { name } }
      newOpenings { title slug { name } }
    }
  }
}
```

Or search directly:
```graphql
query {
  # Hit List
  hitList: postGuideCollection(limit: 1, where: {
    title_contains: "Hit List"
    canonicalPath: "/new-york"
  }) {
    items { title slug { name } publishDate guideType }
  }

  # Top 25
  top25: postGuideCollection(limit: 1, where: {
    title_contains: "Top 25"
    canonicalPath: "/new-york"
  }) {
    items { title slug { name } publishDate guideType }
  }

  # New Openings
  openings: postGuideCollection(limit: 1, where: {
    title_contains: "Opening"
    canonicalPath: "/new-york"
  }) {
    items { title slug { name } publishDate guideType }
  }
}
```

**Known guide slugs (NYC):**
| Guide | Slug |
|-------|------|
| Hit List | `best-new-new-york-restaurants-hit-list` |
| Top 25 | `best-restaurants-nyc` |
| New Openings | `new-nyc-restaurants-openings` |

Guide URL pattern: `https://www.theinfatuation.com{canonicalPath}/guides/{slug}`

---

### 3. Get Restaurants Inside a Guide

Modular guides (guideType: "Modular") store restaurants in `contentV2BodyCollection` as `Caption` objects, each with a `review` field linking to a `PostReview`.

```graphql
query {
  postGuideCollection(limit: 1, where: {
    slug: { name: "best-new-new-york-restaurants-hit-list" }
  }) {
    items {
      title
      publishDate
      contentV2BodyCollection(limit: 50) {
        items {
          __typename
          ... on Caption {
            headline
            review {
              title
              rating
              preview
              publishDate
              slug { name }
              canonicalPath
              venue {
                name street city state price
                closedStatus
                latlong { lat lon }
              }
            }
          }
          ... on CaptionGroup {
            heading
            spotsCollection(limit: 30) {
              items {
                headline
                review {
                  title rating preview publishDate
                  slug { name }
                  canonicalPath
                  venue {
                    name street city state price closedStatus
                    latlong { lat lon }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

**Notes:**
- Each `Caption` in the body represents one restaurant entry
- `Caption.review` links to the full `PostReview` with rating, venue, etc.
- `CaptionGroup` groups multiple Captions under a heading (e.g. subsections)
- Hit List restaurants are often unrated (`rating: null`) since they're new
- Top 25 restaurants will have ratings
- Use `limit: 50` for contentV2BodyCollection to get all entries (guides rarely exceed 30)

---

### 4. Get All Cities

```graphql
query {
  cityCollection(limit: 200) {
    items {
      name
      cityPath
      abbreviation
      navigation
      centerCoordinates { lat lon }
      southwestBounds { lat lon }
      northeastBounds { lat lon }
    }
  }
}
```

Filter to active cities: `navigation == "Show"`

---

## Backend 2: PSS — Post Search Service (GraphQL)

**Endpoint:** `POST https://www.theinfatuation.com/direct/api/post-search/public/graphql`

**Auth:** None required. Public endpoint.

**Headers:**
```
Content-Type: application/json
```

### 1. Predictive Search (Autocomplete)

```graphql
query getPredictiveSearch(
  $query: String!
  $canonicalPath: String!
  $enableSitewideSearch: Boolean!
) {
  searchPosts(input: {
    searchText: $query
    canonicalPathText: $canonicalPath
    postCategoryTypeText: [POST_REVIEW, POST_GUIDE, POST_FEATURE]
    enableSitewideSearch: $enableSitewideSearch
  }) {
    receivedRecordCount
    nodes {
      __typename
      documentTitleText
      documentIdentifier
      canonicalPathText
      slugName
      publishedTimestamp
      previewText
      ... on PostReview {
        placeName
        placeStreetName
        placeAddressPostalCode
        placeCityName
        placeStateName
        placePriceIndicatorCode
        placeRatingNumber
        placeKnownTelephoneNumber
        placeLocation { latitudeNumber longitudeNumber }
      }
    }
    resultsProperties {
      hasExactMatch
      hasFuzzyMatch
    }
  }
}
```

**Variables:**
```json
{
  "query": "lilia",
  "canonicalPath": "/new-york",
  "enableSitewideSearch": true
}
```

**Example response:**
```json
{
  "data": {
    "searchPosts": {
      "receivedRecordCount": 5,
      "nodes": [
        {
          "__typename": "PostReview",
          "documentTitleText": "Lilia",
          "slugName": "lilia",
          "canonicalPathText": "/new-york",
          "publishedTimestamp": "2025-04-25T15:00:00Z",
          "previewText": "Williamsburg's Lilia has become the overachieving neighborhood Italian spot...",
          "placeName": "Lilia",
          "placeStreetName": "567 Union Avenue",
          "placeCityName": "Brooklyn",
          "placeStateName": "NY",
          "placePriceIndicatorCode": "EXPENSIVE",
          "placeRatingNumber": 8.9,
          "placeLocation": { "latitudeNumber": 40.717, "longitudeNumber": -73.952 }
        }
      ]
    }
  }
}
```

### 2. Recently Published Posts

```graphql
query {
  searchPosts(input: {
    canonicalPathText: "/new-york"
    postCategoryTypeText: [POST_REVIEW]
    searchType: RECENTLY_PUBLISHED
    sizeNumber: 10
  }) {
    nodes {
      __typename
      documentTitleText slugName canonicalPathText
      publishedTimestamp previewText
      ... on PostReview {
        placeName placeRatingNumber placePriceIndicatorCode
        placeLocation { latitudeNumber longitudeNumber }
      }
    }
  }
}
```

### 3. Popular Guides for a City

```graphql
query {
  searchPosts(input: {
    postCategoryTypeText: [POST_GUIDE]
    sectionIdentifiers: ["<section-id>"]
    sizeNumber: 10
  }) {
    nodes {
      documentIdentifier documentTitleText slugName
      publishedTimestamp previewText
    }
  }
}
```

---

## PSS Field Reference

### PostReview fields (PSS)
| Field | Type | Description |
|-------|------|-------------|
| `documentTitleText` | String | Restaurant name |
| `slugName` | String | URL slug |
| `documentIdentifier` | String | Contentful entry ID |
| `canonicalPathText` | String | City path (e.g. `/new-york`) |
| `publishedTimestamp` | ISO 8601 | Publish date |
| `previewText` | String | Short review blurb |
| `placeName` | String | Venue name |
| `placeRatingNumber` | Float | Rating (0.0–10.0), 0.0 if unrated |
| `placePriceIndicatorCode` | Enum | `INEXPENSIVE`, `MODERATE`, `MODERATELY_EXPENSIVE`, `EXPENSIVE` |
| `placeStreetName` | String | Street address |
| `placeCityName` | String | City |
| `placeStateName` | String | State |
| `placeAddressPostalCode` | String | Zip code |
| `placeKnownTelephoneNumber` | String | Phone number |
| `placeLocation` | Object | `{ latitudeNumber, longitudeNumber }` |
| `placeReservationPlatformName` | String | e.g. "RESY", "OPENTABLE" |
| `placeReservationUrl` | String | Reservation link |

### Post type enum (PSS)
| Value | Description |
|-------|-------------|
| `POST_REVIEW` | Restaurant reviews |
| `POST_GUIDE` | Curated guides/lists |
| `POST_FEATURE` | Feature articles |
| `POST_GUIDEBOOK` | Guidebooks |
| `POST_COLLECTION` | Collections |

---

## Quick Reference: curl Examples

### Search for a restaurant
```bash
curl -s -X POST 'https://www.theinfatuation.com/direct/api/post-search/public/graphql' \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ searchPosts(input: {searchText: \"lilia\", canonicalPathText: \"/new-york\", postCategoryTypeText: [POST_REVIEW], enableSitewideSearch: true}) { nodes { __typename documentTitleText slugName ... on PostReview { placeName placeRatingNumber placePriceIndicatorCode placeStreetName placeCityName placeStateName } } } }"}'
```

### Get a review by slug
```bash
curl -s -X POST 'https://graphql.contentful.com/content/v1/spaces/by7j1x5pisip/environments/master' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer FU30TvGbzF3EdhZBqMuF1KXVymYcnf5_Di9qDO1qN1I' \
  -d '{"query":"{ postReviewCollection(limit: 1, where: { slug: { name: \"lilia\" } }) { items { title rating headline preview publishDate venue { name street city state price closedStatus latlong { lat lon } phone instagram } } } }"}'
```

### Get Hit List restaurants for a city
```bash
curl -s -X POST 'https://graphql.contentful.com/content/v1/spaces/by7j1x5pisip/environments/master' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer FU30TvGbzF3EdhZBqMuF1KXVymYcnf5_Di9qDO1qN1I' \
  -d '{"query":"{ postGuideCollection(limit: 1, where: { slug: { name: \"best-new-new-york-restaurants-hit-list\" } }) { items { title publishDate contentV2BodyCollection(limit: 50) { items { ... on Caption { review { title rating preview slug { name } venue { name street city state price latlong { lat lon } } } } ... on CaptionGroup { heading spotsCollection(limit: 30) { items { review { title rating preview slug { name } venue { name street city state price latlong { lat lon } } } } } } } } } } }"}'
```

### Get core guides for a city (Hit List, Top 25, New Openings slugs)
```bash
curl -s -X POST 'https://graphql.contentful.com/content/v1/spaces/by7j1x5pisip/environments/master' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer FU30TvGbzF3EdhZBqMuF1KXVymYcnf5_Di9qDO1qN1I' \
  -d '{"query":"{ coreGuidesCollection(where: { canonicalPath: \"/new-york\" }) { items { hitList { title slug { name } } top25 { title slug { name } } newOpenings { title slug { name } } } } }"}'
```

---

## URL Patterns

| Content | URL |
|---------|-----|
| Review | `https://www.theinfatuation.com{canonicalPath}/reviews/{slug}` |
| Guide | `https://www.theinfatuation.com{canonicalPath}/guides/{slug}` |
| Feature | `https://www.theinfatuation.com{canonicalPath}/features/{slug}` |
| City | `https://www.theinfatuation.com{cityPath}` |
| Image | `https://res.cloudinary.com/the-infatuation/image/upload/f_auto/q_auto/{imageIdentifier}` |
