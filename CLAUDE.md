# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server (Next.js 15 + Turbopack) at localhost:3000
npm run build        # Production build
npm run lint         # ESLint
npx tsc --noEmit     # TypeScript type-check only

# Database
npm run db:generate  # Generate Drizzle migration files from schema changes
npm run db:migrate   # Apply migrations to Turso

# Tests (custom tsx runner — no Jest/Vitest installed)
npx tsx lib/parser/__tests__/tosParser.test.ts
npx tsx lib/engine/__tests__/positionBuilder.test.ts
npx tsx lib/engine/__tests__/taxEngine.test.ts
```

## Environment Setup

Copy `.env.local.example` to `.env.local` and fill in your Turso credentials:
```
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-token-here
```

Get credentials at [turso.tech](https://turso.tech). Run `npm run db:migrate` after first setup.

## Architecture

### Data flow

```
CSV Upload (browser)
  → parseTOS() [lib/parser/tosParser.ts]
  → importTrades() Server Action [actions/importTrades.ts]
  → Turso DB (rawTrades table)

Page Load (RSC)
  → db.select().from(rawTrades) [db/client.ts]
  → buildPositions() [lib/engine/positionBuilder.ts]
  → computeTax() [lib/engine/taxEngine.ts]
  → Client view component (props)
```

### Key files

| File | Purpose |
|------|---------|
| `lib/engine/positionBuilder.ts` | **Core algorithm**: clusters RawTrade[] into Position[] by matching open/close legs. Most complex file in the codebase. |
| `lib/engine/strategyDetector.ts` | Maps TOS "Spread" field + leg structure → StrategyType |
| `lib/engine/taxEngine.ts` | §1256 (60/40 rule), wash-sale detection, estimated tax |
| `lib/parser/tosParser.ts` | TOS account statement CSV parser (PapaParse + section detection) |
| `lib/selectors.ts` | Pure functions that compute chart/KPI data from Position[] |
| `db/schema.ts` | Drizzle schema: rawTrades, importHistory, settings |
| `store/uiStore.ts` | Zustand store for UI state only (theme, trade filters) — no trade data |

### Routing

| Route | Type | Purpose |
|-------|------|---------|
| `/dashboard` | RSC + client | KPI tiles + 4 Recharts charts |
| `/trades` | RSC + client | Filterable positions table |
| `/tax` | RSC + client | §1256 table, wash-sale flags, bracket grid |
| `/import` | client only | Drag-and-drop CSV import flow |

### Styling

- **Tailwind v4** — CSS-first. Put theme customizations in `app/globals.css`, not `tailwind.config.ts` (which is inert in v4).
- **Dark mode** — `dark:` prefix classes + `.dark` class on `<html>` (managed by `ThemeProvider`). Default: light mode.
- **P&L colors** — Always use `var(--color-pos)` and `var(--color-neg)` CSS variables, never raw Tailwind green/red classes. Both variables are defined for light and dark mode in `globals.css`.

### Position building algorithm

`buildPositions()` processes trades in three steps:
1. **Sort** by execTime ascending
2. **Cluster** consecutive trades into order groups (SINGLE trades = 1 leg each; multi-leg spreads grouped by same underlying + spread label + within 30s)
3. **Open/close book** (`Map<positionSignature, Position>`): opening clusters create entries, closing clusters match and close them. Partial closes (qty < open qty) split the position. Orphan closes (no matching open) produce a closed position without crashing.

### Turso / Drizzle notes

- `db/client.ts` uses a global singleton to avoid hot-reload connection leaks in development.
- Drizzle returns row types with camelCase field names matching the TypeScript schema. Cast to `RawTrade[]` with `as unknown as RawTrade[]` where needed (acceptable — schema and interface align exactly).
- Section 1256 underlyings (SPX, NDX, RUT, /ES, etc.) are detected by `positionBuilder` and stored as `isSection1256: boolean` on each Position.
