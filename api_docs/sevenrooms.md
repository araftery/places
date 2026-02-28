# SevenRooms API

Undocumented widget API discovered by inspecting the SevenRooms public booking widget. No authentication required.

## Widget Availability API

- **Endpoint**: `GET https://www.sevenrooms.com/api-yoa/availability/widget/range`
- **Auth**: None — this is the same endpoint the public booking widget calls
- **No cookies, CSRF, or bot protection** — works directly from server-side fetch/curl

### Query Parameters

| Param | Type | Description |
|-------|------|-------------|
| `venue` | string | Venue slug (from `sevenrooms.com/reservations/{slug}`) |
| `time_slot` | string | Desired time in 24h format, e.g. `"19:00"` |
| `party_size` | number | Number of guests |
| `start_date` | string | Start date — accepts both `YYYY-MM-DD` and `MM/DD/YYYY` |
| `num_days` | number | Number of days to query. **Only `1` and `3` are valid** — any other value returns 400 |
| `halo_size_interval` | number | Time window around requested slot (e.g. `16`) |
| `channel` | string | Always `"SEVENROOMS_WIDGET"` |

### Response (200 OK)

Top-level structure:

```json
{
  "status": 200,
  "data": {
    "availability": {
      "2026-03-01": [ ...shifts ],
      "2026-03-02": [ ...shifts ],
      "2026-03-03": [ ...shifts ]
    }
  }
}
```

`availability` is keyed by date (`YYYY-MM-DD`). Each date contains an array of shift objects.

### Shift object

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Shift name, e.g. `"Dinner - Sunday"`, `"Weekend Dinner - Saturday"` |
| `shift_persistent_id` | string | Opaque shift identifier |
| `shift_id` | string | Opaque shift ID |
| `shift_category` | string | `"DINNER"`, `"LUNCH"`, `"BRUNCH"`, etc. |
| `is_closed` | boolean | Whether the shift is closed |
| `times` | array | Available time slots (see below) |
| `upsell_categories` | array | Upsell options (usually empty) |

### Slot types

Slots have a `type` field with two known values:

| Type | Meaning |
|------|---------|
| `"book"` | Instantly bookable — full slot metadata included |
| `"request"` | Request-only — minimal fields, `is_requestable: true` |

### `"request"` slot fields (minimal)

```json
{
  "sort_order": 44,
  "time": "5:00 PM",
  "time_iso": "2026-02-28 17:00:00",
  "type": "request",
  "is_requestable": true,
  "access_persistent_id": null
}
```

### `"book"` slot fields (full)

```json
{
  "sort_order": 46,
  "time": "5:30 PM",
  "time_iso": "2026-03-01 17:30:00",
  "utc_datetime": "2026-03-01 22:30:00",
  "real_datetime_of_slot": "2026-03-01 17:30:00",
  "duration": 90,
  "type": "book",
  "access_rule_id": "ahNzfn...",
  "access_persistent_id": "ahNzfn...",
  "shift_persistent_id": "ahNzfn...",
  "is_held": false,
  "is_exclusive": false,
  "access_seating_area_id": null,
  "cc_party_size_min": 5,
  "public_time_slot_description": "Dinner",
  "public_description_title": "",
  "public_photo": null,
  "public_long_form_description": "",
  "policy": "...",
  "cancellation_policy": "...",
  "pacing_limit": 75,
  "pacing_covers_remaining": 54,
  "require_credit_card": false,
  "default_service_charge": 20,
  "default_gratuity": 20,
  "duration_minutes_by_party_size": {
    "1": 90, "2": 90, "3": 90, "4": 90,
    "5": 120, "6": 120, "7": 150, "8": 150, "9": 150, "-1": 150
  },
  "experience_id": null,
  "min_spend": null,
  "cost": null,
  "upsell_categories": [],
  "reservation_tags": [],
  "table_combination_ids": []
}
```

Key fields in bookable slots:

| Field | Type | Description |
|-------|------|-------------|
| `time` | string | Display time, e.g. `"5:30 PM"` |
| `time_iso` | string | ISO-ish datetime `"2026-03-01 17:30:00"` (space-separated, local tz) |
| `utc_datetime` | string | UTC datetime |
| `duration` | number | Reservation duration in minutes |
| `pacing_covers_remaining` | number | Remaining covers for this pacing window |
| `cc_party_size_min` | number | Min party size that requires a credit card |
| `require_credit_card` | boolean | Whether CC is required for this slot |
| `duration_minutes_by_party_size` | object | Duration varies by party size; key `-1` is the fallback |

### Error responses

**400 — Invalid `num_days`:**

```json
{
  "code": 400,
  "status": 400,
  "msg": "invalid num_days"
}
```

Only `num_days=1` and `num_days=3` return 200. All other values (2, 5, 7, 10, 14, 28, 30) return 400.

**Invalid venue slug** returns 200 with empty availability (no error).

---

## Opening Window Behavior

- Venues typically have a 28–30 day booking window
- Dates beyond the window return shifts with zero `"book"` slots (may still have `"request"` slots)
- Closed days also return zero slots — distinguish from window boundary by checking surrounding days
- No explicit `maxDaysInAdvance` field in the response (unlike OpenTable) — must be probed

---

## Venue Slugs

Found in reservation URLs: `https://www.sevenrooms.com/reservations/{slug}`

### Known slugs

| Slug | Restaurant | Location |
|------|-----------|----------|
| `scarpettanyc` | Scarpetta | NYC |
| `portale` | Portale | NYC |
| `theviewrestaurant` | The View Restaurant | Exeter, UK |

---

## Booking URLs

Direct booking link format: `https://www.sevenrooms.com/reservations/{venueSlug}`

Widget explore link format: `https://www.sevenrooms.com/explore/{venueSlug}/reservations/create/search`
