# OpenTable API

Undocumented APIs discovered via reverse engineering. OpenTable has no public API.

## Mobile REST API

Discovered by intercepting OpenTable iOS app traffic with mitmproxy. This is the API our client uses.

- **Base URL**: `https://mobile-api.opentable.com/api`
- **Auth**: `Authorization: Bearer 41dbbf15-5c4e-415b-9f45-5c1209878e42` (static app-level token, not user-specific)
- **No cookies, CSRF, or Akamai protection** — works directly from server-side fetch/curl

### PUT /v3/restaurant/availability

Query availability for a restaurant on a specific date.

**Request:**

```
PUT /api/v3/restaurant/availability
Host: mobile-api.opentable.com
Content-Type: application/json
Accept: application/json
Authorization: Bearer 41dbbf15-5c4e-415b-9f45-5c1209878e42
User-Agent: com.contextoptional.OpenTable/26.9.0.4; iPhone; iOS/26.3; 3.0
```

```json
{
  "rids": ["1339957"],
  "dateTime": "2026-03-10T19:00",
  "partySize": 2,
  "forceNextAvailable": "true",
  "includeNextAvailable": false,
  "includePrivateDining": false,
  "requestAttributeTables": "true",
  "requestDateMessages": true,
  "allowPop": true,
  "attribution": { "partnerId": "84" }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `rids` | string[] | Restaurant IDs (same as `rid` in widget embed URLs) |
| `dateTime` | string | ISO datetime, e.g. `"2026-03-10T19:00"` |
| `partySize` | number | Number of guests |
| `forceNextAvailable` | string | `"true"` — include next-available info |
| `includeNextAvailable` | boolean | Whether to include alternative dates |
| `includePrivateDining` | boolean | Include private dining slots |
| `requestAttributeTables` | string | `"true"` — include table attributes |
| `requestDateMessages` | boolean | Include date-specific messaging |
| `allowPop` | boolean | Allow points-earning slots |
| `attribution.partnerId` | string | `"84"` (iOS app) |
| `forceFullDaySearch` | boolean | Optional. When true, returns all timeslots for the full day regardless of requested time |
| `correlationId` | string | Optional. UUID for request correlation |
| `availabilityToken` | string | Optional. Opaque token from prior responses |

**Response (200 OK):**

```json
{
  "dateTime": "2026-03-10T19:00",
  "experienceList": {
    "results": [
      {
        "id": "302938",
        "experienceVersionId": "2",
        "firstAvailableDates": ["2026-02-28T10:00", "2026-03-06T10:00"],
        "hasMoreDates": true,
        "hasMoreTimes": true
      }
    ]
  },
  "availability": {
    "id": "1339957",
    "dateTime": "2026-03-10T19:00",
    "noTimesReasons": [],
    "minPartySize": 1,
    "maxPartySize": 20,
    "maxDaysInAdvance": 60,
    "timeslots": [
      {
        "dateTime": "2026-03-10T15:30",
        "available": true,
        "redemptionTier": "DineAnywhere",
        "diningAreas": [
          {
            "id": "1",
            "isDefaultArea": true,
            "environment": "INDOOR",
            "availableAttributes": ["default"],
            "privilegedAccessRulesByAttributes": {}
          }
        ],
        "token": "eyJ2IjoyLC...",
        "slotHash": "2823490628",
        "points": 100,
        "type": "Standard",
        "attributes": ["default"],
        "priceAmount": 0
      }
    ]
  }
}
```

**`availability` fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Restaurant ID (matches the `rid` in request) |
| `dateTime` | string | Echoes the requested dateTime |
| `noTimesReasons` | string[] | Why no slots are available (see below) |
| `minPartySize` | number | Minimum supported party size |
| `maxPartySize` | number | Maximum supported party size |
| `maxDaysInAdvance` | number | How far ahead reservations are accepted (opening window) |
| `timeslots` | array | Available time slots |

**`noTimesReasons` values:**

| Value | Meaning |
|-------|---------|
| `[]` (empty) | Slots available — check `timeslots` |
| `["BlockedAvailability"]` | Reservations existed but all taken (sold out) |
| `["NoTimesExist"]` | No online availability on that day (closed, not accepting reservations) |
| `["TooFarInAdvance"]` | Date is beyond `maxDaysInAdvance` window |

**`timeslots[]` fields:**

| Field | Type | Description |
|-------|------|-------------|
| `dateTime` | string | Absolute ISO datetime of the slot |
| `available` | boolean | Whether the slot can be booked |
| `type` | string | `"Standard"`, `"Experience"`, etc. |
| `slotHash` | string | Opaque identifier for the slot |
| `token` | string | Booking token (needed to complete reservation) |
| `points` | number | OpenTable rewards points |
| `redemptionTier` | string | Points redemption tier |
| `priceAmount` | number | Additional price (0 for standard) |
| `diningAreas` | array | Available seating areas with environment (INDOOR/OUTDOOR) |
| `attributes` | string[] | Table attributes (`"default"`, `"bar"`, etc.) |

### GET /v3/restaurant/{rid}/photos/{page}

Fetch restaurant photos.

```
GET /api/v3/restaurant/145786/photos/1?pageCount=5
```

Returns paginated photo sightings with asset IDs for the image resizer.

### PUT /v4/personalize/autocomplete

Search/autocomplete for restaurants. Seen in traffic but not fully documented.

### POST /v5/personalize/search

Full restaurant search. Seen in traffic but not fully documented.

---

## Web GraphQL API (NOT USED — blocked by Akamai)

Documented here for reference. The web frontend uses a GraphQL API at `https://www.opentable.com/dapi/fe/gql` which is protected by Akamai Bot Manager and cannot be called from server-side code without JS execution.

- **Endpoint**: `POST /dapi/fe/gql?optype=query&opname=RestaurantsAvailability`
- **Uses persisted queries** (sha256 hash instead of inline query)
- **Requires**: CSRF token, session cookies, valid Akamai `_abck` cookie from JS sensor
- **Restaurant IDs**: Uses internal `restaurantId` (different from widget `rid`)

### Key differences from mobile API

| | Mobile API | Web GraphQL |
|---|---|---|
| Auth | Static Bearer token | CSRF token + session cookies |
| Bot protection | None | Akamai Bot Manager |
| Restaurant ID | `rid` (widget ID) | Internal `restaurantId` |
| Slot times | Absolute ISO datetimes | Offset from requested time |
| Opening window | `maxDaysInAdvance` in response | `maxAdvanceDays` in page HTML |
| Server-side callable | Yes | No (needs JS execution) |

### Persisted query hash

```
RestaurantsAvailability: b2d05a06151b3cb21d9dfce4f021303eeba288fac347068b29c1cb66badc46af
```

### CSRF token

Found in the page HTML inside a `<script type="application/json">` block:
```json
{"windowVariables": {"__CSRF_TOKEN__": "uuid-here", ...}}
```
Also available at `window.__CSRF_TOKEN__` after page load.

### Restaurant data in page HTML

`window.__INITIAL_STATE__.restaurantProfile.restaurant` contains:
- `restaurantId` — internal numeric ID (not the same as widget `rid`)
- `name` — restaurant name
- `maxAdvanceDays` — booking window in days
- `timeZone.offsetInMinutes` — timezone offset

---

## Restaurant ID (`rid`)

The `rid` is the primary restaurant identifier used across OpenTable systems.

- Found in widget embed URLs: `opentable.com/widget/...?rid=1180`
- Found in `<iframe>` and `<script>` tags on restaurant websites
- Used directly by the mobile API
- The web frontend maps `rid` to an internal `restaurantId` (different number)
- Restaurant page URL uses a slug: `opentable.com/r/gramercy-tavern-new-york` (not the `rid`)

### Known rids

| rid | Restaurant | maxDaysInAdvance |
|-----|-----------|-----------------|
| 942 | The Dining Room at Gramercy Tavern (NYC) | 28 |
| 1339957 | (from iOS capture) | 60 |
