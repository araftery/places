# Google Maps Saved Places Export

How to export all saved/pinned places from Google Maps via Chrome browser automation.

## What You Get

JSON file organized by list name. Each place has:
- `name` — place name
- `address` — full street address
- `lat` / `lng` — coordinates
- `placeId` — Google Place ID in `ChIJ...` format

## Overview

1. **Collect list IDs** — navigate to saved lists overview, click each list to capture its ID from the URL, then go back
2. **Fetch list data** — call the internal `getlist` API for each list ID to get all places in one response
3. **Convert Place IDs** — the API returns decimal CID pairs which must be converted to `ChIJ...` format via protobuf+base64

## Key Technical Details

### Saved Lists URL

```
https://www.google.com/maps/@40.7,-74,13z/data=!4m2!10m1!1e1
```

The `!4m2!10m1!1e1` suffix opens the "Saved" panel. Coordinates don't matter much.

### List ID Location

When you click a list, the URL updates to include `!2s{LIST_ID}`:

```
https://www.google.com/maps/@.../data=!4m6!1m2!10m1!1e1!11m2!2s{LIST_ID}!3e3
```

The list ID is a base64-ish string like `gr0imPk_bSc2eDvxzAVEhz0Wf_qftg`.

### List Name DOM Selector

On the saved lists overview page, list names are in:
```css
.Io6YTe.fontBodyLarge
```
Each is inside a `button.CsEnBe` ancestor.

### getlist API

```
GET /maps/preview/entitylist/getlist?authuser=0&hl=en&gl=us&pb=!1m4!1s{LIST_ID}!2e1!3m1!1e1!2e2!3e2!4i500!6m3!1s{SESSION_TOKEN}!7e81!28e2!8i3!16b1
```

- `{LIST_ID}` — the list ID from the URL
- `{SESSION_TOKEN}` — can be grabbed from any Maps network request (appears as `!1s{token}!7e81` in `!6m3` block). It's a session/user token.
- `!4i500` — max items to return (500 is generous)

Response is JSON prefixed with `)]}'\n`. Strip that, then parse.

### Response Structure

```
data[0][4]  — list name (string)
data[0][8]  — array of place items
```

Each item in `data[0][8]`:
```
item[1][2]  — "Name, Full Address" (string)
item[1][4]  — address only (string)
item[1][5]  — [null, null, lat, lng]
item[1][6]  — [decimalCID1, decimalCID2] (strings)
item[1][7]  — Knowledge Graph ID like "/g/11clgm28dr" (NOT the Place ID)
```

### CID-to-PlaceId Conversion

The decimal CID pair (signed int64 strings) must be converted to the `ChIJ...` Google Place ID:

```javascript
function cidsToPlaceId(decId1, decId2) {
  let n1 = BigInt(decId1), n2 = BigInt(decId2);
  if (n1 < 0n) n1 += (1n << 64n);
  if (n2 < 0n) n2 += (1n << 64n);
  const b1 = [], b2 = [];
  for (let i = 0; i < 8; i++) {
    b1.push(Number(n1 & 0xFFn)); n1 >>= 8n;
    b2.push(Number(n2 & 0xFFn)); n2 >>= 8n;
  }
  // Protobuf: outer message (tag=1, wire=2, len=18), inner fixed64 fields
  const proto = [0x0a, 0x12, 0x09, ...b1, 0x11, ...b2];
  return btoa(String.fromCharCode(...proto))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
```

Verified: `cidsToPlaceId("-8520146790258507997", "7655548836907048239")` → `ChIJI_90zKJbwokRL91_OBv5PWo` (Hartley's).

## Phase 1: Collect List IDs (Browser Automation)

Use `localStorage` to persist data across SPA navigations.

```javascript
// Run on the saved lists overview page
// Uses SPA back-button navigation to avoid full reloads
window._listIds = [];

(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const collectedNames = new Set();

  for (let iteration = 0; iteration < 200; iteration++) {
    const nameEls = document.querySelectorAll('.Io6YTe.fontBodyLarge');
    const buttons = Array.from(nameEls).map(el => ({
      name: el.textContent.trim(),
      button: el.closest('button.CsEnBe')
    })).filter(x => x.button && !collectedNames.has(x.name));

    if (buttons.length === 0) {
      // Scroll sidebar to load more lists
      const sc = document.querySelector('.m6QErb.DxyBCb');
      if (sc) { sc.scrollTop += 400; await sleep(800); }
      else break;
      continue;
    }

    buttons[0].button.click();
    await sleep(2000);

    const match = window.location.href.match(/!2s([A-Za-z0-9_-]+)/);
    if (match) {
      window._listIds.push({ name: buttons[0].name, listId: match[1] });
      collectedNames.add(buttons[0].name);
      localStorage.setItem('_listIds', JSON.stringify(window._listIds));
    }

    // SPA back navigation
    const backBtn = document.querySelector('button[aria-label="Back"]');
    if (backBtn) { backBtn.click(); await sleep(1500); }
    else { history.back(); await sleep(2000); }
  }
})();
```

**Notes:**
- Empty/special lists (Travel plans, Saved places, Starred places) won't have `!2s` in the URL — the script skips them automatically.
- Takes ~3 seconds per list. ~56 lists ≈ ~3 minutes.

## Phase 2: Fetch All Place Data

```javascript
// Run after Phase 1 completes. Uses the getlist API for each collected list ID.
window._allPlaces = {};

(async () => {
  const lists = window._listIds; // or JSON.parse(localStorage.getItem('_listIds'))

  function cidsToPlaceId(d1, d2) {
    let n1 = BigInt(d1), n2 = BigInt(d2);
    if (n1 < 0n) n1 += (1n << 64n);
    if (n2 < 0n) n2 += (1n << 64n);
    const b1 = [], b2 = [];
    for (let i = 0; i < 8; i++) { b1.push(Number(n1 & 0xFFn)); n1 >>= 8n; b2.push(Number(n2 & 0xFFn)); n2 >>= 8n; }
    const proto = [0x0a, 0x12, 0x09, ...b1, 0x11, ...b2];
    return btoa(String.fromCharCode(...proto)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  for (const list of lists) {
    const url = `/maps/preview/entitylist/getlist?authuser=0&hl=en&gl=us&pb=!1m4!1s${encodeURIComponent(list.listId)}!2e1!3m1!1e1!2e2!3e2!4i500!6m3!1svBWjac_5HpHR5NoP6ZvZeQ!7e81!28e2!8i3!16b1`;
    const resp = await fetch(url);
    const text = await resp.text();
    const data = JSON.parse(text.replace(/^\)\]\}'/, '').trim());

    const items = data[0]?.[8] || [];
    window._allPlaces[list.name] = items.map(item => {
      const info = item[1];
      if (!info) return null;
      return {
        name: info[2]?.split(',')[0] || 'Unknown',
        address: info[4] || '',
        lat: info[5]?.[2],
        lng: info[5]?.[3],
        placeId: (info[6]?.[0] && info[6]?.[1]) ? cidsToPlaceId(info[6][0], info[6][1]) : null,
      };
    }).filter(Boolean);
  }

  // Trigger download
  const json = JSON.stringify(window._allPlaces, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'google_maps_saved_places.json';
  a.click();
})();
```

**Notes:**
- The session token (`!6m3!1s...!7e81`) may expire. Grab a fresh one from Chrome DevTools Network tab if requests fail.
- `!4i500` limits to 500 items per list. Increase if a list has more.
- Fetches are sequential to avoid rate limiting. Takes ~15 seconds for ~50 lists.

## Caveats

- Google's internal API and DOM selectors may change at any time
- The session token in the `!6m3` block is user-specific — grab from any Maps network request
- Lists with 0 places have a different URL pattern (`!3e7` instead of `!2s{id}!3e3`)
- "Starred places" and "Want to go" are special Google default lists with different handling
