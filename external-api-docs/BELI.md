# Beli API Documentation

Reverse-engineered from iOS app v8.2.41 traffic on 2026-02-22.

## My Credentials

| Field | Value |
|-------|-------|
| User ID | `d9ee51c4-6465-40c4-a0c5-95bf3d8d6a3a` |
| Phone | `+16178997127` |
| Username | `araftery` |

**Latest tokens (from 2026-02-22 session):**

- **Refresh token** (valid ~7 days from login):
  ```
  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc3MjQyNzM2OCwiaWF0IjoxNzcxODIyNTY4LCJqdGkiOiIwMmU0MWZkNDdlMTA0MGZkOGMwOGUwNWNlNWQ0MmUzZiIsInVzZXJfaWQiOiJkOWVlNTFjNC02NDY1LTQwYzQtYTBjNS05NWJmM2Q4ZDZhM2EifQ.4RTgzC_Oote_l8GRbedDWluFOkfcfMk_oxinJcOb8IE
  ```

- **Access token** (valid ~20 min, refresh as needed):
  ```
  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoiYWNjZXNzIiwiZXhwIjoxNzcxODIzNzY4LCJpYXQiOjE3NzE4MjI1NjgsImp0aSI6IjZiNjUyNDUwNDI0ODQ2YjQ4MzQ2MDY3YWQzMWNjM2VjIiwidXNlcl9pZCI6ImQ5ZWU1MWM0LTY0NjUtNDBjNC1hMGM1LTk1YmYzZDhkNmEzYSJ9.UTkjbay2C2_mN4vXjdUv-XfjTLBqoNetsMaw3IwqtjI
  ```

## Base URLs

| Service | Base URL |
|---------|----------|
| Backoffice API | `https://backoffice-service-split-t57o3dxfca-nn.a.run.app` |
| Activity Tracking | `https://activity-service-978733420956.northamerica-northeast1.run.app` |
| Photos CDN | `https://photos2.beliapp.cloud` |

## Authentication

All API requests use a **JWT Bearer token** in the `Authorization` header:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Login (Obtain Token Pair)

```
POST /api/token/
```

**Request body:**
```json
{
  "phone_no": "+16178997127",
  "password": "your_password"
}
```

**Response (200):**
```json
{
  "refresh": "eyJhbGciOiJIUzI1NiIs...",
  "access": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Error (401):**
```json
{
  "detail": "No active account found with the given credentials"
}
```

### Refresh Access Token

When the access token expires, the app automatically calls:

```
POST /api/token/refresh/
```

**Request body:**
```json
{
  "refresh": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response (200):**
```json
{
  "access": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Error (400) — empty/invalid refresh token:**
```json
{
  "refresh": ["This field may not be blank."]
}
```

### Token Lifetimes

| Token | Lifetime |
|-------|----------|
| Access token | ~20 minutes (exp - iat = 1200s) |
| Refresh token | ~7 days (exp - iat = 604800s) |

JWT payload structure (access token):
```json
{
  "token_type": "access",
  "exp": 1771823768,
  "iat": 1771822568,
  "jti": "6b65245042484b483460...",
  "user_id": "d9ee51c4-6465-40c4-a0c5-95bf3d8d6a3a"
}
```

### Auth Flow Summary

1. **Login**: `POST /api/token/` with phone + password → get `access` + `refresh` tokens
2. **Use**: Pass `access` token as `Authorization: Bearer {access}` on all requests
3. **Refresh**: When access token expires, `POST /api/token/refresh/` with `refresh` token → get new `access` token
4. **Re-login**: When refresh token expires (~7 days), user must log in again

Common request headers:
```
accept: application/json
origin: capacitor://localhost
user-agent: Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148
```

## Identifiers

- **User IDs**: UUIDs (e.g. `d9ee51c4-6465-40c4-a0c5-95bf3d8d6a3a`)
- **Business IDs**: integers (e.g. `7365` for Manhatta)
- **Place IDs**: Google Place IDs (e.g. `ChIJoTXWl8dbwokRpKA2BJFVsGA`)
- **Categories**: `RES` (restaurant), `BAR`, `COF` (coffee), `BAK` (bakery), `DES` (dessert)

---

## Core Endpoints

### 1. Search Restaurants

```
GET /api/search-app/
```

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `term` | string | Search query |
| `coords` | string | Coordinates (space-separated lat,lng or empty `%20`) |
| `user` | uuid | Current user ID |
| `city` | string | City name, e.g. `New York, NY` |

**Response:**
```json
{
  "predictions": [
    {
      "place_id": "ChIJoTXWl8dbwokRpKA2BJFVsGA",
      "structured_formatting": {
        "main_text": "Manhatta",
        "main_text_matched_substrings": [{"length": 8, "offset": 0}],
        "secondary_text": "Liberty Street, New York, NY, USA"
      },
      "business": 7365,
      "types": ["bar", "restaurant", ...],
      "clickable": true,
      "distance_meters": 20624,
      "default_category": null,
      "source_used": "AUTOCOMPLETE_CACHED"
    }
  ],
  "featured_lists": [
    {"id": 2625, "title": "Top 10 Manhattan Chinatown", "icon": "newspaper-outline", "subtitle": "Featured list"}
  ],
  "cuisines": [],
  "labels": [],
  "enable_dish_search": true,
  "neighborhoods": [
    {
      "icon": "home-outline",
      "title": "Lower Manhattan, New York, NY",
      "subtitle": "Neighborhood",
      "filters": [{"key": "CITY", "value": "New York, NY"}, {"key": "NEIGHBORHOOD", "value": "Lower Manhattan"}]
    }
  ]
}
```

### 2. Get Business Details

```
GET /api/business/
```

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `id` | int | Business ID |
| `from_business_page` | bool | Always `true` when viewing business page |

**Response:**
```json
{
  "count": 1,
  "results": [
    {
      "id": 7365,
      "place_id": "ChIJoTXWl8dbwokRpKA2BJFVsGA",
      "name": "Manhatta",
      "status": "OPERATIONAL",
      "city": "New York, NY",
      "borough": "Manhattan",
      "lat": 40.7079974,
      "lng": -74.00888259999999,
      "price": 4,
      "neighborhood": "Financial District",
      "country": "United States",
      "website": "https://www.manhattarestaurant.com/...",
      "phone_number": "+12122305788",
      "cuisines": ["American"],
      "has_res_links": true,
      "default_category": null,
      "quick_link": "https://beliapp.co/UQUbxd9OoEb",
      "tz": "America/New_York",
      "businesshours_set": [
        {
          "id": 553212,
          "open_day": 0,
          "close_day": 0,
          "open_time": "12:00:00",
          "close_time": "22:30:00",
          "business": 7365
        }
      ],
      "has_no_show_fee": false,
      "reservation_venue_id": 11952,
      "price_key": "$",
      "businessdistinction_set": [
        {
          "id": 5233,
          "distinction_type": "FEATURED_LIST_CHIP",
          "display_type": "CHIP",
          "display_name": "Top NYC Restaurant Week"
        }
      ]
    }
  ]
}
```

**Notes:**
- `price`: 1-4 scale ($ to $$$$)
- `price_key`: always `"$"` (the symbol used)
- `open_day`/`close_day`: 0=Monday, 6=Sunday
- `status`: `"OPERATIONAL"` or presumably `"CLOSED_TEMPORARILY"`, etc.

### 3. Get Average Business Score

```
GET /api/databusinessfloat-sparse/
```

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `business` | int | Business ID |
| `field__name` | string | `AVGBUSINESSSCORE` |

**Response:**
```json
{
  "count": 1,
  "results": [
    {
      "id": 504747248,
      "business": 7365,
      "field": 206,
      "value": 8.602098919522193
    }
  ]
}
```

The `value` is the overall Beli score on a **0-10 scale**.

### 4. Get Rating Count

```
GET /api/business-count-rated/{business_id}/
```

**Response:**
```json
{
  "count": 12164
}
```

### 5. Get Score Distribution Histogram

```
GET /api/business-histogram-data/{business_id}/
```

**Response:**
```json
{
  "config": {
    "buckets": [
      {"label": "0.0", "count": 3, "color": "#134F5C", "heightPercent": 0.08},
      {"label": "", "count": 6, "color": "#134F5C", "heightPercent": 0.16},
      ...
      {"label": "10.0", "count": 3730, "color": "#134F5C", "heightPercent": 100.0}
    ],
    "chartHeight": "10vh",
    "chartWidth": "65vw",
    "barGap": "1px",
    "borderRadius": "0px"
  }
}
```

20 buckets from 0.0 to 10.0 (each bucket = 0.5 range). Only first and last are labeled.

### 6. Get Occasion/Vibe Tags

```
GET /api/countuserbusinessoccasion/{business_id}/
```

**Response:**
```json
[
  {"business": 7365, "field__name": "GOODFORCOCKTAILS", "field__display": "Cocktails", "count": 604},
  {"business": 7365, "field__name": "GOODFORDATENIGHT", "field__display": "Date Night", "count": 602},
  {"business": 7365, "field__name": "GOODFORVIEWS", "field__display": "Views", "count": 568}
]
```

Returns top 3 occasion/vibe tags with vote counts.

### 7. Get Dish Recommendations

```
GET /api/dish-rec/
```

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `business` | int | Business ID |
| `version` | string | App version, e.g. `8.2.41` |
| `menu_vibes` | bool | `true` |

**Response:**
```json
{
  "results": [
    {
      "id": 43294183,
      "business": 7365,
      "name": "Menu",
      "photo": {
        "id": 41795024,
        "user": "a5e30c23-...",
        "business": 7365,
        "description": "Menu",
        "image": "https://photos2.beliapp.cloud/file/beli-b2/userbusiness/7365/.../images/yytb3mfgtp3hezkcoq.jpg",
        "thumbnail": "https://photos2.beliapp.cloud/file/beli-b2/userbusiness/7365/.../thumbnails/yytb3mfgtp3hezkcoq.jpg",
        "favorite_dish": false,
        "likes": []
      },
      "meta": "182 photos",
      "rec_type": 0
    },
    {
      "id": 43294178,
      "business": 7365,
      "name": "Burger",
      "photo": { ... },
      "meta": "110 recommended",
      "rec_type": 1
    }
  ]
}
```

- `rec_type`: 0 = general/menu, 1 = specific dish recommendation
- `meta`: count string like "110 recommended" or "182 photos"

### 8. Get Friend Scores on a Business

```
GET /api/scores/{user_id}/{business_id}/
```

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `multi_category` | bool | `true` |
| `business_likes_comments` | bool | `true` |

**Response:**
```json
{
  "results": [
    {
      "user_id": "61f976f9-...",
      "business_id": 7365,
      "value": 7.6494,
      "category": "RES",
      "notification_id": 106698328,
      "sent_dt": "2022-07-16T05:23:01.823352Z"
    }
  ],
  "count": 1,
  "score": 7.6494,
  "count_new": 1,
  "score_new": 7.6494
}
```

Shows friends-of-user scores on a business. `score` is the average of friends' scores.

### 9. Get Personalized Recommendation Score

```
GET /api/rec-score/
```

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `user` | uuid | User ID |
| `business` | int | Business ID |

**Response:**
```json
{
  "results": {
    "business": 7365,
    "expected_percentile": 8.508168798358547,
    "rank_count": 12164
  }
}
```

`expected_percentile` is the predicted score (0-10) for this user based on their taste profile.

### 10. Get Friend Notes/Text Reviews

```
GET /api/business-friend-text/{user_id}/{business_id}/
```

**Response:**
```json
{
  "count": 1,
  "results": [
    {
      "user": "61f976f9-...",
      "business": 7365,
      "field": 11,
      "field_name": "NOTES",
      "value": "This place is definitely a spot for the drinks and views (it's on the 60th floor) - not so much for the food.",
      "visit": null
    }
  ]
}
```

### 11. Get Reservation Links

```
GET /api/business-link/
```

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `business` | int | Business ID |
| `link_type` | string | `RESV` for reservations |

**Response:**
```json
{
  "count": 1,
  "results": [
    {
      "id": 755,
      "link_type": "RESV",
      "label": "Resy",
      "url": "https://resy.com/cities/ny/manhatta",
      "status": "ACTIVE",
      "business": 7365
    }
  ]
}
```

### 12. Get Reservation Availability (Single Business)

```
GET /api/business-res-availability/
```

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `business` | int | Business ID |
| `date` | string | `YYYY-MM-DD` |
| `table_size` | int | Party size |
| `local_dt` | string | ISO datetime |

**Response:**
```json
{
  "reservation_platform": {"name": "SEVENROOMS"},
  "results": {"timeslots": []},
  "empty_state_text": null,
  "error_response": null,
  "block_notify_staff_of_error": false
}
```

### 13. Get Reservation Availability (Bulk)

```
POST /api/businesses-res-availability/
```

**Request body:**
```json
{
  "business_ids": [5808, 8386, ...],
  "date": "2026-02-23",
  "table_size": 2,
  "time": "12:00 AM",
  "use_now": true,
  "all_day_text": "Dinner",
  "local_dt": "2026-02-22T23:41:36.998Z"
}
```

### 14. Get Static Map Image

```
GET /api/static-maps-url/
```

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `business` | int | Business ID |

**Response:**
```json
{
  "url": "https://photos2.beliapp.cloud/file/beli-b2/business/7365/images/tmp/7365_map.jpg"
}
```

---

## User-Scoped Endpoints

### 15. Get User's Ranking List

```
GET /api/get-ranking/
```

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `user` | uuid | User ID |
| `category` | string | `RES`, `BAR`, `COF`, `BAK`, `DES` |

**Response:** Paginated list of businesses with full details, ordered by user's ranking.

### 16. Get User Recommendations (Explore/Discovery)

```
POST /api/user-rec-scores/
```

**Request body:**
```json
{
  "user": "d9ee51c4-...",
  "category": "RES",
  "page": 1,
  "page_size": 50,
  "sort_method": "Distance",
  "coords": null,
  "filters": [],
  "bounds": null,
  "for_map_view": false
}
```

**Response:**
```json
{
  "count": 2718,
  "results": [
    {
      "id": 5808,
      "lat": 40.7307176,
      "lng": -73.9854793,
      "distance_mi": 0.014,
      "expected_percentile": 7.458,
      "business_id": 5808,
      "count": 3426,
      "business": { /* full business object */ }
    }
  ]
}
```

`sort_method` options: `"Distance"`, `"Score"` (and likely others).

### 17. Popular in City

```
GET /api/popular-in-city/{user_id}/{city}/
```

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `category` | string | `RES`, `BAR`, etc. |

**Response:** Array of businesses popular in the city with basic info (id, name, lat, lng, price, cuisines, hours).

### 18. Bookmark Status

```
GET /api/bookmark-status/{user_id}/{business_id}/
```

**Response:**
```json
{"results": []}
```

Empty if not bookmarked.

### 19. Friends Who Bookmarked

```
GET /api/friends-bookmarked/{user_id}/{business_id}/
```

**Response:**
```json
{"results": [], "count": 0}
```

### 20. Visit Dates

```
GET /api/visit-dates-on-business/{user_id}/{business_id}/
```

**Query params:** `reversed=true`

**Response:**
```json
{"visit_dates": []}
```

### 21. User Photos on Business

```
GET /api/user-business-photo/
```

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `user` | uuid | User ID |
| `business` | int | Business ID |

**Response:**
```json
{
  "results": [
    {
      "id": 73746,
      "image": "https://photos2.beliapp.cloud/file/beli-b2/userbusiness/{business}/{user}/images/{hash}.jpg",
      "thumbnail": "https://photos2.beliapp.cloud/file/beli-b2/userbusiness/{business}/{user}/thumbnails/{hash}.jpg",
      "description": "Burger",
      "order": 1,
      "favorite_dish": false,
      "likes": ["uuid1", "uuid2"],
      "user": "61f976f9-...",
      "business": 7365
    }
  ]
}
```

### 22. All Member Photos on Business

```
GET /api/members-business-photo/{business_id}/
```

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `version` | string | `8.2.41` |
| `menu_vibes` | bool | `true` |

Returns all user-submitted photos for a business. Can be very large (5.8MB for Manhatta).

### 23. Tagged Users on Business

```
GET /api/tagged-users-on-business/{user_id}/{business_id}/
```

### 24. Resolve Users by ID

```
POST /api/user/list/
```

**Request body:**
```json
{"ids": ["uuid1", "uuid2", ...]}
```

**Response:**
```json
{
  "results": [
    {
      "id": "61f976f9-...",
      "first_name": "Judy",
      "last_name": "Thelen",
      "full_name": "Judy Thelen",
      "username": "judy",
      "instagram_url": "https://www.instagram.com/Beli_eats/",
      "tiktok_url": "https://www.tiktok.com/@beli_eats/",
      "profile_photo": "https://photos2.beliapp.cloud/file/beli-b2/profilephotos/{user_id}/{hash}.jpeg",
      "public": true,
      "has_supper_club": true,
      "has_vip": false,
      "is_playlist_eligible": true
    }
  ]
}
```

### 25. Playlists

```
GET /api/playlists/
```

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `user_id` | uuid | User ID |
| `list_field` | string | `RANK` |
| `category` | string | `RES` |
| `city` | string | `New York, NY` |
| `playlist` | string | (additional filter) |

### 26. Filter Options

```
POST /api/filter-options/
```

**Query params:** `user`, `list`, `category`

**Request body:**
```json
{"ids": [47, 196, 17192, ...]}
```

**Response:** Array of filter facets:
```json
[
  {"field__name": "BOROUGH", "value": "Brooklyn", "count": 15},
  {"field__name": "BOROUGH", "value": "Manhattan", "count": 25},
  {"field__name": "NEIGHBORHOOD", "value": "Carroll Gardens", "count": 1}
]
```

---

## Feed & Notifications

### 27. Newsfeed Data

```
GET /api/newsfeed-data/{user_id}/
```

**Query params:** `no_mv`, `num_vis`, `version`, `bundle_bookmarks`, `supports_guide_feed_items`, etc.

### 28. Profile Newsfeed Data

```
GET /api/profile-newsfeed-data/{profile_user_id}/
```

**Query params:** `user`, `no_mv`, `num_vis`, `version`, `supports_guide_feed_items`, etc.

### 29. Available Reservations (from friends)

```
GET /api/available-reservations/{user_id}/
```

Returns reservation openings shared by friends, including user and business details.

### 30. Notification Counts

```
GET /api/count-app-notification-unread/
```

**Query params:** `user` (uuid)

---

## Activity Tracking

```
POST /api/activity/
```

**Host:** `activity-service-978733420956.northamerica-northeast1.run.app`

**Request body:**
```json
{
  "user": "d9ee51c4-...",
  "field_name": "VIEWBUSINESS",
  "business": "7365",
  "info": "optional string",
  "version": "8.2.41",
  "json_info": { "source": "search-item-to-business" },
  "device": "C5A5BE2F-...",
  "page": "/business/7365"
}
```

**Known activity field_names:**
- `ENTERAPP`, `LEAVEAPP` - app lifecycle
- `OPENSEARCH`, `SEARCH` - search events
- `CLICKED_BUSINESS_SEARCH_PREDICTION` - tapped a search result
- `VIEWBUSINESS` - opened a business page
- `VIEWHOME` - viewed home feed
- `CLICK_TAB_BAR_BUTTON` - tab navigation (info: `search`, `home`, `lists`)
- `SCROLL_BUSINESS_PAGE`, `SCROLL_TAG_ITEMS` - scroll tracking
- `VIEW_LISTS_PAGE`, `SELECT_LIST` - list page events
- `VIEW_EXPLAIN_BUSINESS_RESERVATIONS` - reservation UI impression

---

## Photo URL Pattern

```
https://photos2.beliapp.cloud/file/beli-b2/userbusiness/{business_id}/{user_id}/images/{hash}.jpg
https://photos2.beliapp.cloud/file/beli-b2/userbusiness/{business_id}/{user_id}/thumbnails/{hash}.jpg
https://photos2.beliapp.cloud/file/beli-b2/profilephotos/{user_id}/{hash}.jpeg
https://photos2.beliapp.cloud/file/beli-b2/business/{business_id}/images/tmp/{business_id}_map.jpg
```

---

## Typical Flow: Search → View Restaurant

1. `GET /api/search-app/?term=Manhatta&...` → get `business: 7365`
2. `GET /api/business/?id=7365` → name, location, hours, cuisines, price
3. `GET /api/databusinessfloat-sparse/?business=7365&field__name=AVGBUSINESSSCORE` → overall score (8.6)
4. `GET /api/business-count-rated/7365/` → rating count (12,164)
5. `GET /api/business-histogram-data/7365/` → score distribution
6. `GET /api/countuserbusinessoccasion/7365/` → vibes (Cocktails, Date Night, Views)
7. `GET /api/rec-score/?user=...&business=7365` → personalized predicted score
8. `GET /api/scores/{user_id}/7365/` → friends' scores
9. `GET /api/business-friend-text/{user_id}/7365/` → friends' text reviews
10. `GET /api/dish-rec/?business=7365` → recommended dishes
11. `GET /api/business-link/?business=7365&link_type=RESV` → reservation links
12. `GET /api/business-res-availability/?business=7365&date=...` → available timeslots
