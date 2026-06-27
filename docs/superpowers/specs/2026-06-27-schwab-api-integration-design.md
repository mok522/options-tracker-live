# Schwab Developer API Integration — Design Spec
**Date:** 2026-06-27  
**Status:** Approved

## Context

The app currently ingests trade data exclusively through manual CSV exports from ThinkOrSwim/Schwab. Users must export a statement, navigate to the Import tab, and drag-drop the file. This is friction-heavy and leaves open positions without live market data.

Goal: replace CSV import with live Charles Schwab Developer API integration that (1) syncs transaction history directly and (2) provides real-time quotes for open positions and topbar tickers.

---

## Architecture

### Approach: Thin Adapter Layer

Schwab API JSON is converted to the existing `RawTrade` shape by a new adapter module. All downstream business logic (deduplicator, pnlEngine, taxEngine, positionBuilder, analytics) is unchanged.

```
User clicks "Sync Now"
  ↓
actions/syncSchwab.ts
  ↓  (get valid token — auto-refresh if < 5 min to expiry)
lib/schwab/tokenManager.ts
  ↓
lib/schwab/client.ts → GET /trader/v1/accounts/{accountNumber}/transactions
  ↓
lib/schwab/adapter.ts → Schwab Transaction JSON → RawTrade[]
  ↓
actions/importTrades.ts (existing pipeline: dedup → merge legs → recompute positions → DB write)
  ↓
React components re-render (same flow as post-CSV-import today)

Live quotes (separate path, every 60s when connected):
lib/schwab/quotes.ts → GET /marketdata/v1/quotes?symbols=SPX,NDX,VIX,{open_underlyings}
  ↓
Topbar tickers + unrealized P&L for open positions
```

---

## OAuth 2.0 Flow

Schwab uses standard Authorization Code flow.

### Initiate
`GET /api/auth/schwab`  
Builds and redirects to:
```
https://api.schwabapi.com/v1/oauth/authorize
  ?response_type=code
  &client_id={SCHWAB_CLIENT_ID}
  &redirect_uri={SCHWAB_REDIRECT_URI}
  &scope=readonly
```

### Callback
`GET /api/auth/callback?code=...`  
1. POST to `https://api.schwabapi.com/v1/oauth/token` with Basic Auth (`client_id:client_secret` base64) and body `grant_type=authorization_code&code={code}&redirect_uri={REDIRECT_URI}`
2. Receives `{ access_token, refresh_token, expires_in, token_type }`
3. Stores in `settings` table: key = `schwab_tokens`, value = JSON `{ access_token, refresh_token, expires_at: Date.now() + expires_in * 1000 }`
4. Caches account number: key = `schwab_account_number`
5. Redirects to `/?connected=true`

### Token Refresh
When `expires_at - now < 5 min`, POST to token endpoint with `grant_type=refresh_token`. Access tokens expire in 30 min; refresh tokens expire in 7 days.

---

## New Files

| Path | Purpose |
|------|---------|
| `app/api/auth/schwab/route.ts` | OAuth initiate — builds auth URL, redirects |
| `app/api/auth/callback/route.ts` | OAuth callback — exchanges code for tokens, stores in DB |
| `lib/schwab/client.ts` | Authenticated fetch wrapper (`schwabFetch`) |
| `lib/schwab/tokenManager.ts` | `getValidToken()` with auto-refresh logic |
| `lib/schwab/adapter.ts` | Schwab Transaction JSON → `RawTrade[]` |
| `lib/schwab/quotes.ts` | `fetchQuotes(symbols: string[])` → live prices |
| `actions/syncSchwab.ts` | Server action: orchestrates full sync cycle |
| `actions/fetchQuotes.ts` | Server action: returns live quotes map |

---

## Modified Files

| Path | Change |
|------|--------|
| `components/import/ImportView.tsx` | Replace CSV dropzone with Schwab connection UI |
| `components/layout/Topbar.tsx` | Replace hardcoded tickers with live quotes |
| `components/TrackerApp.tsx` | Wire syncSchwab action, handle sync state, refresh after sync |
| `app/page.tsx` | Pass `isConnected` + `lastSyncAt` from DB settings to components |

---

## Data Adapter: Schwab Transaction → RawTrade

Schwab's `/transactions` endpoint returns option trades with this shape:

```json
{
  "activityId": 123456789,
  "time": "2025-06-15T14:30:00+0000",
  "type": "TRADE",
  "description": "SOLD -1 AAPL 100 JUN 20 2025 200 CALL @5.00",
  "netAmount": 499.35,
  "transferItems": [{
    "instrument": {
      "symbol": "AAPL  250620C00200000",
      "underlyingSymbol": "AAPL",
      "putCall": "CALL",
      "strikePrice": 200.00,
      "expirationDate": "2025-06-20T00:00:00+0000",
      "type": "OPTION"
    },
    "amount": -1,
    "price": 5.00,
    "cost": -500.00,
    "positionEffect": "OPENING"
  }]
}
```

Mapping to `RawTrade`:
- `execTime`: format `time` as `"MM/DD/YY HH:mm"` (matches existing dedup key format)
- `spread`: `"SINGLE"` (multi-leg grouping happens in positionBuilder after import)
- `side`: `transferItem.amount < 0 → "SELL"`, else `"BUY"`
- `qty`: `Math.abs(transferItem.amount)`
- `posEffect`: `"OPENING" → "TO OPEN"`, `"CLOSING" → "TO CLOSE"`, `"AUTOMATIC" → "TO CLOSE (EXPIRED)"`
- `symbol`: `transferItem.instrument.symbol` (full OCC)
- `underlying`: `transferItem.instrument.underlyingSymbol`
- `expiration`: extract date from `instrument.expirationDate` → `"MM/DD/YY"`
- `strike`: `instrument.strikePrice`
- `optionType`: `instrument.putCall` (`"CALL"` or `"PUT"`)
- `price`: `Math.abs(transferItem.price)` (per-unit premium, e.g., `5.00` for a $5 option)
- `netPrice` and `commission`: Sign direction differs between buys (netAmount negative) and sells (netAmount positive). Formula: `gross = side === 'SELL' ? price × qty × 100 : -(price × qty × 100)`, then `commissionTotal = netAmount - gross`, `commission = commissionTotal / qty` (always negative), `netPrice = price + commission / 100`. Verify exact signs against real API responses during implementation.
- `dedupKey`: `buildDedupKey(execTime, symbol, side, qty, price)` — reuses existing function from `lib/parser/deduplicator.ts`

Filter: only process `transaction.type === "TRADE"` and `instrument.type === "OPTION"`. Ignore `RECEIVE_AND_DELIVER` (assignment/exercise events) for now — the existing `pnlEngine` handles those via expiry logic.

---

## Live Quotes

Endpoint: `GET /marketdata/v1/quotes?symbols={comma-separated}`

Response shape:
```json
{
  "SPX": { "quote": { "lastPrice": 5431.20, "netChange": 12.4 } },
  "NVDA": { "quote": { "lastPrice": 131.50, "netChange": -2.1 } }
}
```

Usage:
- **Topbar**: always fetch `SPX,NDX,VIX` on app load when connected, then every 60 seconds
- **Open positions**: collect unique `sym` values from open trades, batch-fetch quotes, display as "Current: $X.XX" and "Unrealized P&L: ±$X"

Quote refresh: use `setInterval` in `TrackerApp.tsx`, cleared on unmount. Only runs when `isConnected === true`.

---

## Sync Action (`actions/syncSchwab.ts`)

```
1. getValidToken() — refresh if needed
2. GET /trader/v1/accounts — extract accountNumber (cached in settings)
3. Read last_sync_at from settings (null → default 365 days back)
4. GET /trader/v1/accounts/{accountNumber}/transactions
     ?types=TRADE
     &startDate={last_sync_at or 365d ago}
     &endDate={now}
5. adaptTransactions(json) → RawTrade[]
6. Call existing importTrades(rawTrades, false) — hasPnl=false since we FIFO-match
7. Write last_sync_at = now to settings
8. Return Trade[] (same shape as CSV import response today)
```

Note: `hasPnl=false` because the Schwab transactions API gives individual execution legs, not realized P&L — same as TOS Trade History CSV format (no P&L column path).

---

## UI: Import Tab → Connection Hub

### Disconnected State
- Card with "Connect to Schwab" heading
- Brief copy: "Link your Schwab account to automatically sync option trades"
- Primary button: "Connect to Schwab" → `GET /api/auth/schwab`

### Connected State
- Green status dot + "Connected" label
- Masked account number (e.g., `••••1234`)
- "Last synced: 3 minutes ago" (relative time)
- Primary button: "Sync Now" → `syncSchwab()` server action
  - Button shows spinner while syncing, then success count
- Secondary: "Disconnect" link → clears `schwab_tokens` from DB

### Topbar
- Live SPX / NDX / VIX prices and change
- Small green dot when connected, grey when not
- Prices update every 60 seconds

---

## Environment Variables

Add to `.env.local` and Vercel env settings:
```
SCHWAB_CLIENT_ID=...
SCHWAB_CLIENT_SECRET=...
SCHWAB_REDIRECT_URI=http://localhost:3001/api/auth/callback
```

---

## Settings Table Keys (new)

No schema changes needed — `settings` is already a key-value table.

| Key | Value |
|-----|-------|
| `schwab_tokens` | JSON: `{ access_token, refresh_token, expires_at }` |
| `schwab_account_number` | Cached account number string |
| `last_sync_at` | ISO timestamp of last successful sync |

---

## Verification

1. Set `SCHWAB_CLIENT_ID`, `SCHWAB_CLIENT_SECRET`, `SCHWAB_REDIRECT_URI` in `.env.local`
2. Start dev server (`npm run dev`)
3. Navigate to Import tab → see "Connect to Schwab" button
4. Click button → redirected to Schwab auth page → authorize → redirected back to app
5. Import tab now shows "Connected" state with account info
6. Click "Sync Now" → trades populate in Dashboard/Trades tabs
7. Topbar shows live SPX/NDX/VIX prices
8. Open positions show current market price and unrealized P&L
9. Click "Sync Now" again → new trades dedup correctly (count = 0 new if nothing changed)
10. Token expiry test: manually set `expires_at` to past → Sync Now still works (auto-refresh)
