# Frontend Integration Update (NOTAM/FIR Backend)

Date: 2026-03-02
Backend base URL: http://localhost:3001

This document explains what changed in backend APIs and what the frontend team should update now.

## 1) What changed

1. Auto background sync is enabled in backend (batched scraping + DB update).
2. NOTAM API now reports response source:
   - `scraped-live` (fresh scrape)
   - `db-cache` (served from Mongo cache)
3. New force refresh option on NOTAM endpoint to force live scrape.
4. New cache verification endpoint for debugging/ops.
5. NOTAM items now include parsed analysis fields (A/B/C/Q/E, active state, confidence).

## 2) Endpoints frontend should use

### A) Normal data for UI (primary)

GET /api/notams/bulk?locations=OMAA,OMDB,OBBI

Use this for normal UI rendering.

### B) Force fresh scrape (manual refresh button / admin action)

GET /api/notams/bulk?locations=OMAA,OMDB&forceRefresh=true

Use this only when user explicitly asks for latest data, because it is slower.

### C) FIR status (existing)

GET /api/firs/bulk?locations=OMAE,OSTT

### D) Sync health/status (new)

GET /api/sync/status

Use this to show backend sync heartbeat in admin/dev panel.

### E) Cache inspection (new, debug only)

GET /api/notams/cache/bulk?locations=OMAA,OMDB

Use for debugging and data verification, not regular user flow.

## 3) Updated response shape (NOTAM bulk)

Example response:

```json
{
  "locations": {
    "OMAA": {
      "icao": "OMAA",
      "status": "orange",
      "hasEscat": false,
      "cachedAt": 1772447849629,
      "lastCheckedAt": 1772447849629,
      "dataSource": "db-cache",
      "notams": [
        {
          "id": "A1234/26",
          "text": "...",
          "status": "orange",
          "hasEscat": false,
          "analysis": {
            "aField": "OMAA",
            "bField": "2601280800",
            "cField": "2604282359",
            "qCode": "...",
            "eField": "...",
            "isActive": true,
            "isPermanent": false,
            "startsAtUtc": "2026-01-28T08:00:00.000Z",
            "endsAtUtc": "2026-04-28T23:59:00.000Z",
            "matchedKeywords": ["RESTRICTED"],
            "confidence": "high"
          }
        }
      ]
    }
  },
  "timestamp": 1772447850100
}
```

## 4) Frontend implementation guidance

### Required UI handling

1. Keep using `status`, `hasEscat`, and `notams` as before.
2. Read `dataSource` and optionally show a small badge:
   - Live (scraped-live)
   - Cached (db-cache)
3. Use `cachedAt` / `lastCheckedAt` for freshness display.
4. Do not break if `analysis` is missing on some historical items.

### Suggested actions

1. Add a Manual Refresh button that calls NOTAM bulk with `forceRefresh=true`.
2. Poll normal NOTAM bulk every UI interval (for example 30–60s) if needed.
3. Keep FIR cards using `/api/firs/bulk`.
4. In admin/debug page, show `/api/sync/status` and `/api/notams/cache/bulk` data.

## 5) Backward compatibility notes

- Existing fields are preserved.
- New fields added only:
  - On location object: `lastCheckedAt`, `dataSource`
  - On notam item: `analysis`
- Frontend using old parser should still work.

## 6) Error and fallback behavior

- If scrape fails for a location, backend may return:
  - `status: "unknown"`
  - `error: "Scrape failed"`
- Frontend should:
  1. Show unknown state safely.
  2. Keep previous UI data if your store supports stale fallback.
  3. Allow manual refresh retry.

## 7) Quick checklist for frontend PR

- [ ] Add support for `dataSource` badge.
- [ ] Add support for `lastCheckedAt` timestamp display.
- [ ] Add optional parsing/use of `notam.analysis` fields.
- [ ] Add manual refresh flow with `forceRefresh=true`.
- [ ] Add admin debug panel cards for `/api/sync/status` and cache endpoint.
- [ ] Validate no regressions with existing FIR and airport dashboards.

## 8) QA test calls

1. Fresh scrape:
   - `/api/notams/bulk?locations=OMAA&forceRefresh=true`
   - Expect: `dataSource = scraped-live`
2. Immediate next request:
   - `/api/notams/bulk?locations=OMAA`
   - Expect: `dataSource = db-cache`
3. Cache inspect:
   - `/api/notams/cache/bulk?locations=OMAA`
   - Expect: document present with `analysis` fields on NOTAM items.
