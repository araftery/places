# Resy API

Undocumented API reverse-engineered from the Resy web app. All endpoints are on `https://api.resy.com`.

## Authentication

All requests require:

```
Authorization: ResyAPI api_key="<key>"
```

The API key is a public key embedded in the Resy web app (`VbWk7s3L4KiK5fzlO7JD3Q5EYolJI7n5`). Same for all users.

Some endpoints (calendar, find) require a `User-Agent` header or they return 500. Use a Chrome-like UA string.

The web app also sends `X-Resy-Auth-Token` and `X-Resy-Universal-Auth` (user JWTs) but these are not required for the endpoints below.

## Quirks

- **Search and Find are POST** (not GET) with JSON bodies. Venue and Calendar are GET with query params.
- **Venue param is `id`** (not `venue_id`) on `/3/venue`. Calendar uses `venue_id`.
- **Node fetch needs User-Agent**: Node's native fetch doesn't send a User-Agent by default, causing 500s on some endpoints. Always include one.
- **Search uses XHR** in the web app (not fetch), which is why browser network tools that only capture fetch miss it.

## Endpoints

### 1. Venue Search

```
POST /3/venuesearch/search
Content-Type: application/json
```

**Request body:**

```json
{
  "query": "4 Charles Prime Rib",
  "per_page": 5,
  "types": ["venue", "cuisine"],
  "geo": { "latitude": 40.7099, "longitude": -73.9591 }
}
```

Optional fields the web app sends (not required):
- `slot_filter`: `{ "day": "2026-02-27", "party_size": 2 }`
- `highlight`: `{ "pre_tag": "<b>", "post_tag": "</b>" }`

**Response:**

```json
{
  "search": {
    "hits": [
      {
        "id": { "resy": 834 },
        "name": "4 Charles Prime Rib",
        "url_slug": "4-charles-prime-rib",
        "region": { "id": "ny" },
        "location": { "latitude": 40.735, "longitude": -74.000 }
      }
    ]
  }
}
```

Note: `region` and `location` may be absent from search hits depending on the query. Use `getVenue` for reliable location data.

### 2. Venue Details

```
GET /3/venue?id={venueId}
```

**Important:** The param is `id`, NOT `venue_id`. Using `venue_id` returns `{"data": {"id": "missing"}}`.

**Response (key fields):**

```json
{
  "id": { "resy": 834, "google": "ChIJ...", "foursquare": "..." },
  "name": "4 Charles Prime Rib",
  "url_slug": "4-charles-prime-rib",
  "location": {
    "address_1": "4 Charles St",
    "latitude": 40.735144,
    "longitude": -74.000652,
    "locality": "New York",
    "region": "NY",
    "neighborhood": "West Village",
    "postal_code": "10014",
    "country": "United States"
  },
  "contact": {
    "phone_number": null,
    "url": "http://www.nycprimerib.com/"
  },
  "content": [
    { "name": "why_we_like_it", "body": "For the swanky..." },
    { "name": "tagline", "body": "Prime Rib, Fresh Seafood..." },
    { "name": "from_the_venue", "body": "Reservations are available up to 21 days in advance..." },
    { "name": "about", "body": "4 Charles is an intimate supper club..." }
  ]
}
```

The `content` array contains text blocks. The `from_the_venue` entry often describes the reservation policy (opening window, advance booking days).

There is also a batch endpoint: `GET /3/venues?venue_ids=834,4408,5769&lat=...&long=...&location=...`

### 3. Calendar

```
GET /4/venue/calendar?venue_id={venueId}&num_seats={numSeats}&start_date={YYYY-MM-DD}&end_date={YYYY-MM-DD}
```

**Response:**

```json
{
  "last_calendar_day": "2026-03-19",
  "scheduled": [
    {
      "date": "2026-02-27",
      "inventory": {
        "reservation": "sold-out",
        "event": "not available",
        "walk-in": "available"
      }
    }
  ]
}
```

**Reservation status values:**
- `"available"` - tables can be booked
- `"sold-out"` - all tables booked (reservations were released)
- `"closed"` - restaurant not operating

**Walk-in/event** also have `"available"`, `"not available"`.

**Opening window derivation:**
- `openingWindowDays = last_calendar_day - today`
- `lastAvailableDate = last_calendar_day`

### 4. Find Availability (time slots)

```
POST /4/find
Content-Type: application/json
```

**Request body:**

```json
{
  "venue_id": 834,
  "day": "2026-02-28",
  "party_size": 2,
  "lat": 0,
  "long": 0
}
```

`lat`/`long` can be 0 (the web app sends 0,0).

**Response:**

```json
{
  "results": {
    "venues": [
      {
        "venue": { "id": { "resy": 834 } },
        "slots": [
          {
            "config": { "id": "config_id", "type": "Dining Room" },
            "date": {
              "start": "2026-02-28 19:00:00",
              "end": "2026-02-28 21:00:00"
            }
          }
        ]
      }
    ]
  }
}
```

### 5. Notify (not implemented in client)

```
GET /3/notify?filter_date=2026-01-27
```

Used by the web app for the "Notify" button (get alerts when tables open up). Requires user auth token.
