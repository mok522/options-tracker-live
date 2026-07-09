# Position P&L History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist a daily unrealized-P&L snapshot for every open option position and surface each position's history in a slide-out panel (chart + percentile-of-range metric) opened by clicking a row in Open Positions.

**Architecture:** A Vercel Cron hits a secret-protected route daily after market close; the route reuses the existing `fetchOpenOptionMarks()` → `computeOpenAnalytics()` pipeline, aggregates per `positionKey`, and upserts one row per position per day into a new Turso table. The UI reads history via a server action and renders it in a slide-out panel.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM + Turso (libSQL), Vercel Cron, hand-rolled SVG charts (existing house style), standalone `tsx` test scripts (existing house style).

**Spec:** `docs/superpowers/specs/2026-07-08-position-pl-history-design.md`

---

## Conventions the engineer must know

- **Tests** in this repo are standalone TypeScript scripts with a tiny inline harness (see `lib/engine/__tests__/positionBuilder.test.ts`). Run with `npx tsx <path>`. They exit non-zero on failure. There is no vitest/jest.
- **Design tokens**: never hardcode colors. P&L gains/losses use `--pos` / `--neg` (or `--pos-soft` / `--neg-soft` for chart strokes) exclusively.
- **UI vs logic separation** (CLAUDE.md): tasks below are split so logic tasks don't touch UI files and vice versa.
- `positionKey(sym, strike, expYMD, kind, isShort)` and `parseExp(exp)` are exported from `lib/openAnalytics.ts`. `toYMD` there is private — Task 2 defines its own local `ymd()` helper instead of modifying `openAnalytics.ts`.
- The app-login middleware (`middleware.ts`) gates every route; the cron route must be added to its `PUBLIC_PATHS` (the route enforces `CRON_SECRET` itself).
- DB rows → `Trade` mapping pattern is in `app/page.tsx:16-29`; the cron route reuses it.

---

### Task 1: History metrics library (`rangePercentile`, `summarizeHistory`)

**Files:**
- Create: `lib/positionHistory.ts`
- Test: `lib/__tests__/positionHistory.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
/**
 * Tests for lib/positionHistory.ts
 * Run with: npx tsx lib/__tests__/positionHistory.test.ts
 */

import { rangePercentile, summarizeHistory, type SnapshotPoint } from '../positionHistory.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) { console.error(`  FAIL: ${message}`); failed++; }
  else { console.log(`  PASS: ${message}`); passed++; }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    console.error(`  FAIL: ${message}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual  : ${JSON.stringify(actual)}`);
    failed++;
  } else { console.log(`  PASS: ${message}`); passed++; }
}

function describe(name: string, fn: () => void): void {
  console.log(`\n${name}`);
  fn();
}

const pt = (date: string, unrealizedPl: number): SnapshotPoint =>
  ({ date, unrealizedPl, mark: 1, qty: 1 });

describe('rangePercentile', () => {
  assertEqual(rangePercentile(50, [0, 100]), 50, 'midpoint of range → 50');
  assertEqual(rangePercentile(100, [0, 100]), 100, 'at max → 100');
  assertEqual(rangePercentile(0, [0, 100]), 0, 'at min → 0');
  assertEqual(rangePercentile(150, [0, 100]), 100, 'above max clamps to 100');
  assertEqual(rangePercentile(-50, [0, 100]), 0, 'below min clamps to 0');
  assertEqual(rangePercentile(74, [0, 100]), 74, 'interpolates linearly');
  assertEqual(rangePercentile(5, [5, 5, 5]), 50, 'flat history → 50');
  assertEqual(rangePercentile(5, [7]), null, 'single point → null (not enough history)');
  assertEqual(rangePercentile(5, []), null, 'empty history → null');
  assertEqual(rangePercentile(-100, [-300, -50]), 80, 'all-negative range works');
});

describe('summarizeHistory', () => {
  assertEqual(summarizeHistory([]), null, 'empty → null');
  const points = [pt('2026-07-01', -20), pt('2026-07-02', 150), pt('2026-07-03', 40)];
  const s = summarizeHistory(points)!;
  assertEqual(s.best, { date: '2026-07-02', pl: 150 }, 'best day found');
  assertEqual(s.worst, { date: '2026-07-01', pl: -20 }, 'worst day found');
  assertEqual(s.daysTracked, 3, 'daysTracked = point count');
  const one = summarizeHistory([pt('2026-07-01', 10)])!;
  assertEqual(one.best, { date: '2026-07-01', pl: 10 }, 'single point is both best…');
  assertEqual(one.worst, { date: '2026-07-01', pl: 10 }, '…and worst');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/__tests__/positionHistory.test.ts`
Expected: FAIL — cannot find module `../positionHistory.js`

- [ ] **Step 3: Write the implementation**

Create `lib/positionHistory.ts`:

```ts
// Position P&L history metrics — pure functions over daily snapshot points.
// A "point" is one day's persisted mark/P&L for one position (see
// db/schema.ts `positionSnapshots`).

export interface SnapshotPoint {
  date: string;         // "YYYY-MM-DD"
  unrealizedPl: number; // $ P&L across the position's open legs that day
  mark: number;         // per-contract mark that day
  qty: number;          // contracts open at capture time
}

/**
 * Where `current` sits inside the historical min→max range, 0–100.
 * 100 = best it has ever been, 0 = worst. Clamped for values outside the
 * recorded range (live P&L can exceed yesterday's extremes). Returns null
 * with fewer than 2 points — no meaningful range yet. A flat range → 50.
 */
export function rangePercentile(current: number, history: number[]): number | null {
  if (history.length < 2) return null;
  const min = Math.min(...history);
  const max = Math.max(...history);
  if (max === min) return 50;
  const pct = ((current - min) / (max - min)) * 100;
  return Math.round(Math.min(100, Math.max(0, pct)));
}

export interface HistoryStats {
  best: { date: string; pl: number };
  worst: { date: string; pl: number };
  daysTracked: number;
}

export function summarizeHistory(points: SnapshotPoint[]): HistoryStats | null {
  if (points.length === 0) return null;
  let best = points[0];
  let worst = points[0];
  for (const p of points) {
    if (p.unrealizedPl > best.unrealizedPl) best = p;
    if (p.unrealizedPl < worst.unrealizedPl) worst = p;
  }
  return {
    best: { date: best.date, pl: best.unrealizedPl },
    worst: { date: worst.date, pl: worst.unrealizedPl },
    daysTracked: points.length,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/__tests__/positionHistory.test.ts`
Expected: all PASS, exit 0

- [ ] **Step 5: Commit**

```bash
git add lib/positionHistory.ts lib/__tests__/positionHistory.test.ts
git commit -m "feat: position history metrics (range percentile, best/worst)"
```

---

### Task 2: Snapshot builder (aggregate open legs → per-position rows)

**Files:**
- Create: `lib/snapshotPositions.ts`
- Test: `lib/__tests__/snapshotPositions.test.ts`

Multiple open lots can share one `positionKey` (same contract opened at
different fills). The snapshot is **per position**, so lots are aggregated:
qty summed, unrealizedPl summed, mark identical across lots by construction.

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/snapshotPositions.test.ts`:

```ts
/**
 * Tests for lib/snapshotPositions.ts
 * Run with: npx tsx lib/__tests__/snapshotPositions.test.ts
 */

import { buildSnapshots } from '../snapshotPositions.js';
import type { Trade } from '../../types/trade.js';
import type { MarksMap } from '../openAnalytics.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) { console.error(`  FAIL: ${message}`); failed++; }
  else { console.log(`  PASS: ${message}`); passed++; }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    console.error(`  FAIL: ${message}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual  : ${JSON.stringify(actual)}`);
    failed++;
  } else { console.log(`  PASS: ${message}`); passed++; }
}

function describe(name: string, fn: () => void): void {
  console.log(`\n${name}`);
  fn();
}

function makeTrade(overrides: Partial<Trade>): Trade {
  return {
    sym: 'RKT', strat: 'Long Call', side: 'Buy', qty: 1,
    strike: '20 C', exp: '2026-09-18', fill: 3.8, optType: 'CALL',
    pl: 0, status: 'Open', date: '2026-06-01',
    ...overrides,
  };
}

// Fixed "now" so date fields are deterministic.
const NOW = new Date(2026, 6, 8, 16, 30); // 2026-07-08 local
const KEY = 'RKT|20|2026-09-18|CALL|long';

describe('buildSnapshots: single open lot with a mark', () => {
  const marks: MarksMap = { [KEY]: { mark: 4.5, openPl: 0 } };
  const snaps = buildSnapshots([makeTrade({})], marks, NOW);
  assertEqual(snaps.length, 1, 'one snapshot row');
  assertEqual(snaps[0].positionKey, KEY, 'keyed by positionKey');
  assertEqual(snaps[0].date, '2026-07-08', 'date is local YYYY-MM-DD of now');
  assertEqual(snaps[0].mark, 4.5, 'mark recorded');
  // long: (mark 4.5 − fill 3.8) × 1 × 100 = +70
  assertEqual(snaps[0].unrealizedPl, 70, 'P&L = (mark − fill) × qty × 100 for longs');
  assertEqual(snaps[0].qty, 1, 'qty recorded');
  assert(snaps[0].capturedAt.startsWith('2026-07-08T') || snaps[0].capturedAt.includes('2026-07-08'),
    'capturedAt is an ISO timestamp of now');
});

describe('buildSnapshots: two lots, same position → one aggregated row', () => {
  const marks: MarksMap = { [KEY]: { mark: 4.5, openPl: 0 } };
  const lots = [makeTrade({ fill: 3.8 }), makeTrade({ fill: 4.0, qty: 2 })];
  const snaps = buildSnapshots(lots, marks, NOW);
  assertEqual(snaps.length, 1, 'lots sharing a positionKey collapse to one row');
  assertEqual(snaps[0].qty, 3, 'qty summed across lots');
  // lot1: (4.5−3.8)×1×100 = 70 ; lot2: (4.5−4.0)×2×100 = 100 → 170
  assertEqual(snaps[0].unrealizedPl, 170, 'P&L summed across lots');
});

describe('buildSnapshots: short position P&L sign', () => {
  const shortKey = 'RKT|20|2026-09-18|CALL|short';
  const marks: MarksMap = { [shortKey]: { mark: 2.0, openPl: 0 } };
  const snaps = buildSnapshots([makeTrade({ side: 'Sell', fill: 3.0 })], marks, NOW);
  // short: (entry 3.0 − mark 2.0) × 1 × 100 = +100
  assertEqual(snaps[0].unrealizedPl, 100, 'shorts profit when mark drops');
});

describe('buildSnapshots: legs without a mark are skipped', () => {
  const snaps = buildSnapshots([makeTrade({})], {}, NOW);
  assertEqual(snaps.length, 0, 'no mark → no snapshot row');
});

describe('buildSnapshots: closed trades are ignored', () => {
  const marks: MarksMap = { [KEY]: { mark: 4.5, openPl: 0 } };
  const snaps = buildSnapshots([makeTrade({ status: 'Closed' })], marks, NOW);
  assertEqual(snaps.length, 0, 'closed legs produce no snapshot');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/__tests__/snapshotPositions.test.ts`
Expected: FAIL — cannot find module `../snapshotPositions.js`

- [ ] **Step 3: Write the implementation**

Create `lib/snapshotPositions.ts`:

```ts
import type { Trade } from '@/types/trade';
import { computeOpenAnalytics, parseExp, positionKey, type MarksMap } from '@/lib/openAnalytics';

// One day's persisted state for one open position (may span multiple lots).
export interface SnapshotRow {
  positionKey: string;
  date: string;         // "YYYY-MM-DD" local
  mark: number;
  unrealizedPl: number; // summed across lots
  qty: number;          // summed across lots
  capturedAt: string;   // ISO timestamp
}

// Local-date YMD; the cron fires in a fixed UTC slot so local vs UTC only
// matters for the date label, and local matches the rest of the app.
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Build one snapshot row per open position from the current marks. Reuses
 * computeOpenAnalytics for lot-level mark matching and P&L, then aggregates
 * lots sharing a positionKey. Lots with no mark contribute nothing; a
 * position whose every lot lacks a mark is omitted entirely (a gap, not a 0).
 */
export function buildSnapshots(trades: Trade[], marks: MarksMap, now: Date = new Date()): SnapshotRow[] {
  const { rows } = computeOpenAnalytics(trades, {}, marks);
  const date = ymd(now);
  const capturedAt = now.toISOString();
  const byKey = new Map<string, SnapshotRow>();

  for (const r of rows) {
    if (r.mark == null || r.unrealizedPl == null) continue;
    const expDate = parseExp(r.trade.exp);
    const key = positionKey(r.trade.sym, r.strikeNum, expDate ? ymd(expDate) : null, r.kind, r.isShort);
    if (!key) continue;

    const cur = byKey.get(key);
    if (cur) {
      cur.unrealizedPl += r.unrealizedPl;
      cur.qty += r.trade.qty;
    } else {
      byKey.set(key, {
        positionKey: key, date, mark: r.mark,
        unrealizedPl: r.unrealizedPl, qty: r.trade.qty, capturedAt,
      });
    }
  }
  return [...byKey.values()];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/__tests__/snapshotPositions.test.ts`
Expected: all PASS, exit 0. Also re-run Task 1's test to confirm nothing broke:
`npx tsx lib/__tests__/positionHistory.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/snapshotPositions.ts lib/__tests__/snapshotPositions.test.ts
git commit -m "feat: snapshot builder aggregating open lots per position"
```

---

### Task 3: `position_snapshots` table

**Files:**
- Modify: `db/schema.ts` (append table)
- Generated: `db/migrations/000N_*.sql` (via drizzle-kit)

- [ ] **Step 1: Add the table to the schema**

In `db/schema.ts`, change the first import line to include `primaryKey`:

```ts
import { sqliteTable, text, real, integer, primaryKey } from 'drizzle-orm/sqlite-core';
```

Append at the end of the file:

```ts
// Daily point-in-time P&L per open position. One row per (position, day);
// the cron job upserts so a re-run overwrites that day's row. Rows are kept
// forever, including after the position closes (spec: 2026-07-08 design).
export const positionSnapshots = sqliteTable('position_snapshots', {
  positionKey:  text('position_key').notNull(),   // lib/openAnalytics.ts positionKey()
  date:         text('date').notNull(),           // "YYYY-MM-DD" local
  mark:         real('mark').notNull(),           // per-contract mark
  unrealizedPl: real('unrealized_pl').notNull(),  // $ across the position's lots
  qty:          integer('qty').notNull(),         // contracts open at capture
  capturedAt:   text('captured_at').notNull(),    // ISO timestamp
}, (t) => [primaryKey({ columns: [t.positionKey, t.date] })]);
```

- [ ] **Step 2: Generate and apply the migration**

```bash
npm run db:generate
npm run db:migrate
```

Expected: a new file in `db/migrations/` containing `CREATE TABLE position_snapshots (...)` with a composite primary key, and migrate exits 0. Verify the table exists:

```bash
npx tsx -e "
import { createClient } from '@libsql/client';
const c = createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN! });
c.execute(\"SELECT name FROM sqlite_master WHERE name='position_snapshots'\").then(r => console.log(r.rows));
" --env-file=.env.local
```

Expected output: `[ { name: 'position_snapshots' } ]`

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add db/schema.ts db/migrations
git commit -m "feat: position_snapshots table for daily P&L history"
```

---

### Task 4: Cron route, middleware exemption, schedule, secret

**Files:**
- Create: `app/api/cron/snapshot/route.ts`
- Create: `vercel.json`
- Modify: `middleware.ts:5` (PUBLIC_PATHS)
- Modify: `.env.local` (add CRON_SECRET — local value only)

- [ ] **Step 1: Create the cron route**

Create `app/api/cron/snapshot/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/db/client';
import { positionSnapshots, trades as tradesTable } from '@/db/schema';
import { isConnected } from '@/lib/schwab/tokenManager';
import { fetchOpenOptionMarks } from '@/lib/schwab/positions';
import { buildSnapshots } from '@/lib/snapshotPositions';
import type { Trade } from '@/types/trade';

export const dynamic = 'force-dynamic';

/**
 * Daily position-P&L snapshot, triggered by Vercel Cron (see vercel.json).
 * Auth: CRON_SECRET as a Bearer token — Vercel Cron sends it automatically
 * when the env var is set. Fail-closed: no secret configured → 401 always.
 * The app-login middleware exempts this path; this check replaces it.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await isConnected())) {
    return NextResponse.json({ error: 'Schwab not connected' }, { status: 503 });
  }

  let marks;
  try {
    marks = await fetchOpenOptionMarks();
  } catch (e) {
    console.error('snapshot cron: marks fetch failed', e);
    return NextResponse.json({ error: 'Schwab marks fetch failed' }, { status: 503 });
  }

  const rows = await db.select().from(tradesTable);
  const trades: Trade[] = rows.map((r) => ({
    id: r.id, sym: r.sym, strat: r.strat, side: r.side as Trade['side'],
    qty: r.qty, strike: r.strike, exp: r.exp, fill: r.fill,
    comm: r.comm ?? null, pl: r.pl, status: r.status as Trade['status'],
    date: r.date ?? '',
  }));

  const snapshots = buildSnapshots(trades, marks);
  for (const s of snapshots) {
    await db.insert(positionSnapshots).values(s).onConflictDoUpdate({
      target: [positionSnapshots.positionKey, positionSnapshots.date],
      set: { mark: s.mark, unrealizedPl: s.unrealizedPl, qty: s.qty, capturedAt: s.capturedAt },
    });
  }

  return NextResponse.json({ ok: true, written: snapshots.length, date: snapshots[0]?.date ?? null });
}
```

- [ ] **Step 2: Exempt the path in the middleware**

In `middleware.ts`, change line 5 from:

```ts
const PUBLIC_PATHS = ['/login', '/api/app-auth/login'];
```

to:

```ts
// /api/cron/snapshot is public here but enforces CRON_SECRET itself.
const PUBLIC_PATHS = ['/login', '/api/app-auth/login', '/api/cron/snapshot'];
```

- [ ] **Step 3: Create vercel.json with the cron schedule**

Create `vercel.json` (the repo has none today; adding only `crons` changes nothing else):

```json
{
  "crons": [
    {
      "path": "/api/cron/snapshot",
      "schedule": "30 21 * * 1-5"
    }
  ]
}
```

21:30 UTC ≈ 4:30pm ET during DST (5:30pm in winter) — either is after close, and Schwab holds the last mark after hours, so drift is fine.

- [ ] **Step 4: Add CRON_SECRET locally**

```bash
echo "" >> .env.local
echo "# Vercel Cron auth for /api/cron/snapshot (prod value set in Vercel by the user)" >> .env.local
echo "CRON_SECRET=$(openssl rand -base64 32)" >> .env.local
```

**Do NOT add the production value to Vercel — the user does that themselves.**

- [ ] **Step 5: Verify locally end-to-end**

Start the dev server (`npm run dev`, port 3000), then:

```bash
# wrong secret → 401
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/cron/snapshot
# right secret → 200 with written count
CRON_SECRET=$(grep '^CRON_SECRET=' .env.local | cut -d= -f2-)
curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/snapshot
```

Expected: `401`, then `{"ok":true,"written":<n>,"date":"YYYY-MM-DD"}` with n = number of open positions holding a mark. Re-run the second curl — same result, no duplicate-key error (upsert). Confirm rows landed:

```bash
npx tsx -e "
import { createClient } from '@libsql/client';
const c = createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN! });
c.execute('SELECT position_key, date, unrealized_pl, qty FROM position_snapshots').then(r => console.log(r.rows));
" --env-file=.env.local
```

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit` — expected: no errors.

```bash
git add app/api/cron/snapshot/route.ts vercel.json middleware.ts
git commit -m "feat: daily position snapshot cron route + schedule"
```

(`.env.local` is gitignored — verify with `git status` that it is not staged.)

---

### Task 5: Server action to read a position's history

**Files:**
- Create: `actions/fetchPositionHistory.ts`

- [ ] **Step 1: Write the action**

```ts
'use server';

import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { positionSnapshots } from '@/db/schema';
import type { SnapshotPoint } from '@/lib/positionHistory';

// All daily snapshots for one position, oldest first. Empty array when the
// position has no history yet (or on any failure — the panel shows its
// empty state either way).
export async function getPositionHistory(positionKey: string): Promise<SnapshotPoint[]> {
  try {
    const rows = await db
      .select()
      .from(positionSnapshots)
      .where(eq(positionSnapshots.positionKey, positionKey))
      .orderBy(asc(positionSnapshots.date));
    return rows.map((r) => ({ date: r.date, unrealizedPl: r.unrealizedPl, mark: r.mark, qty: r.qty }));
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: Typecheck and commit**

Run: `npx tsc --noEmit` — expected: no errors.

```bash
git add actions/fetchPositionHistory.ts
git commit -m "feat: server action for position snapshot history"
```

---

### Task 6: History line chart component

**Files:**
- Create: `components/charts/PositionHistoryLine.tsx`

Follows the house SVG-chart style (`components/charts/CumulativeLine.tsx`): viewBox scaling, `var(--grid)`/`var(--text-3)` scaffolding, `--pos-soft`/`--neg-soft` for the P&L line (sign of the latest value picks the color).

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { fmtSigned } from '@/lib/formatters';
import type { SnapshotPoint } from '@/lib/positionHistory';

function niceTicks(min: number, max: number, count: number): number[] {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + 1e-6; v += step) out.push(v);
  return out;
}

const kFmt = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1000) return (n / 1000).toFixed(a % 1000 === 0 ? 0 : 1) + 'k';
  return String(n);
};

// "2026-07-08" → "Jul 8"
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function shortDate(ymd: string): string {
  const [, m, d] = ymd.split('-').map(Number);
  return m && d ? `${MON[m - 1]} ${d}` : ymd;
}

interface PositionHistoryLineProps {
  points: SnapshotPoint[]; // oldest first; caller guarantees length >= 2
  width?: number;
  height?: number;
}

export function PositionHistoryLine({ points, width = 560, height = 200 }: PositionHistoryLineProps) {
  const padL = 40, padR = 14, padT = 14, padB = 22;
  const iw = width - padL - padR, ih = height - padT - padB;
  const vals = points.map((p) => p.unrealizedPl);
  const ticks = niceTicks(Math.min(...vals, 0), Math.max(...vals, 0), 4);
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const span = (hi - lo) || 1;
  const xv = (i: number) => padL + (i / (points.length - 1)) * iw;
  const yv = (v: number) => padT + ih - ((v - lo) / span) * ih;

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xv(i)} ${yv(p.unrealizedPl)}`).join(' ');
  const last = points.length - 1;
  const tone = vals[last] >= 0 ? 'var(--pos-soft)' : 'var(--neg-soft)';
  const hiIdx = vals.indexOf(Math.max(...vals));
  const loIdx = vals.indexOf(Math.min(...vals));

  // x labels: first, middle, last date
  const labelIdxs = points.length >= 3 ? [0, Math.floor(last / 2), last] : [0, last];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} x2={width - padR} y1={yv(t)} y2={yv(t)} style={{ stroke: 'var(--grid)' }} strokeWidth="1" />
          <text x={padL - 7} y={yv(t) + 3} textAnchor="end" style={{ fill: 'var(--text-3)', fontSize: 9.5 }}>{kFmt(t)}</text>
        </g>
      ))}
      {/* zero line emphasised when the range crosses it */}
      {lo < 0 && hi > 0 && (
        <line x1={padL} x2={width - padR} y1={yv(0)} y2={yv(0)} style={{ stroke: 'var(--axis)' }} strokeWidth="1" />
      )}
      {labelIdxs.map((i) => (
        <text key={i} x={xv(i)} y={height - 5} textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'}
          style={{ fill: 'var(--text-3)', fontSize: 9.5 }}>{shortDate(points[i].date)}</text>
      ))}
      <path d={line} fill="none" style={{ stroke: tone }} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {/* high / low markers — P&L extremes, so pos/neg tokens */}
      <circle cx={xv(hiIdx)} cy={yv(vals[hiIdx])} r="3.5" style={{ fill: 'var(--pos)' }} />
      <circle cx={xv(loIdx)} cy={yv(vals[loIdx])} r="3.5" style={{ fill: 'var(--neg)' }} />
      {/* latest point + value tag */}
      <circle cx={xv(last)} cy={yv(vals[last])} r="3.5" style={{ fill: tone }} />
      {(() => {
        const label = fmtSigned(vals[last]);
        const tw = label.length * 6.4 + 16;
        const tx = Math.min(xv(last) - tw + 6, width - tw);
        const ty = Math.max(2, yv(vals[last]) - 28);
        return (
          <g>
            <rect x={tx} y={ty} width={tw} height={21} rx={5} style={{ fill: 'var(--text-1)' }} />
            <text x={tx + tw / 2} y={ty + 14} textAnchor="middle"
              style={{ fill: 'var(--surface)', fontSize: 11.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{label}</text>
          </g>
        );
      })()}
    </svg>
  );
}
```

- [ ] **Step 2: Typecheck and commit**

Run: `npx tsc --noEmit` — expected: no errors.

```bash
git add components/charts/PositionHistoryLine.tsx
git commit -m "feat: position history line chart"
```

---

### Task 7: Slide-out panel + row click wiring + CSS

**Files:**
- Create: `components/positions/PositionHistoryPanel.tsx`
- Modify: `components/positions/OpenPositionsView.tsx` (row `onClick`, selected state, render panel)
- Modify: `app/globals.css` (slide-out styles + mobile full-width)

- [ ] **Step 1: Add slide-out CSS**

In `app/globals.css`, append **before** the `@media (max-width: 1000px)` block:

```css
/* slide-out detail panel (position history) */
.dash .slideout-backdrop {
  position: fixed; inset: 0; z-index: 40;
  background: rgba(16,22,33,0.35);
  animation: fadeIn .18s ease;
}
.dash .slideout {
  position: fixed; top: 0; right: 0; bottom: 0; z-index: 41;
  width: min(480px, 100vw);
  background: var(--surface);
  border-left: 1px solid var(--border);
  box-shadow: var(--shadow-md);
  display: flex; flex-direction: column;
  animation: slideIn .22s cubic-bezier(.2,.8,.3,1);
  overflow-y: auto;
}
@keyframes fadeIn { from { opacity: 0; } }
@keyframes slideIn { from { transform: translateX(100%); } }
```

Inside the existing `@media (max-width: 1000px)` block, append:

```css
  /* history slide-out covers the full viewport on phones */
  .slideout { width: 100vw !important; border-left: none !important; }
```

- [ ] **Step 2: Write the panel component**

Create `components/positions/PositionHistoryPanel.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import type { OpenRow } from '@/lib/openAnalytics';
import { getPositionHistory } from '@/actions/fetchPositionHistory';
import { rangePercentile, summarizeHistory, type SnapshotPoint } from '@/lib/positionHistory';
import { PositionHistoryLine } from '@/components/charts/PositionHistoryLine';
import { fmtSigned, fmtUSD } from '@/lib/formatters';
import { Icon } from '@/components/shared/Icon';

const plColor = (n: number) => (n >= 0 ? 'var(--pos)' : 'var(--neg)');

// 74 → "74th", 21 → "21st", 42 → "42nd"…
function ordinal(n: number): string {
  const r10 = n % 10, r100 = n % 100;
  if (r10 === 1 && r100 !== 11) return `${n}st`;
  if (r10 === 2 && r100 !== 12) return `${n}nd`;
  if (r10 === 3 && r100 !== 13) return `${n}rd`;
  return `${n}th`;
}

interface PositionHistoryPanelProps {
  row: OpenRow;
  positionKey: string;
  onClose: () => void;
}

export function PositionHistoryPanel({ row, positionKey, onClose }: PositionHistoryPanelProps) {
  const [points, setPoints] = useState<SnapshotPoint[] | null>(null); // null = loading

  useEffect(() => {
    let live = true;
    getPositionHistory(positionKey).then((p) => { if (live) setPoints(p); });
    return () => { live = false; };
  }, [positionKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const t = row.trade;
  // Live unrealized P&L when a mark resolved this session; otherwise the
  // most recent snapshot stands in as "current".
  const current = row.unrealizedPl ?? (points && points.length ? points[points.length - 1].unrealizedPl : null);
  const stats = points ? summarizeHistory(points) : null;
  const pctile = points && current != null ? rangePercentile(current, points.map((p) => p.unrealizedPl)) : null;

  return (
    <>
      <div className="slideout-backdrop" onClick={onClose} />
      <div className="slideout" role="dialog" aria-label={`${t.sym} position history`}>
        {/* header */}
        <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.2px' }}>
              {t.sym} <span style={{ color: 'var(--text-2)', fontWeight: 500 }}>{t.strike} · {t.exp}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>
              {t.strat} · {row.isShort ? 'short' : 'long'} · {t.qty} contract{t.qty !== 1 ? 's' : ''}
              {row.mark != null && <> · mark {fmtUSD(row.mark)}</>}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{ font: 'inherit', cursor: 'pointer', border: 0, background: 'var(--inset)', borderRadius: 7, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)', flex: '0 0 auto' }}>
            ✕
          </button>
        </div>

        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* headline: current P&L + percentile of range */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>P&L Since Open</div>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.5px', color: current != null ? plColor(current) : 'var(--text-3)', marginTop: 2 }}>
              {current != null ? fmtSigned(current) : '—'}
            </div>
            {pctile != null && (
              <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4 }}>
                <span style={{ fontWeight: 700, color: 'var(--text-1)' }}>{ordinal(pctile)} percentile</span> of its tracked history
              </div>
            )}
          </div>

          {/* chart / loading / empty */}
          {points === null ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 12.5 }}>Loading history…</div>
          ) : points.length < 2 ? (
            <div style={{ height: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'var(--inset)', borderRadius: 9, padding: 18, textAlign: 'center' }}>
              <Icon name="calendar" size={20} style={{ color: 'var(--text-3)' }} />
              <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>History builds up as daily snapshots accumulate.</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{points.length === 1 ? '1 day tracked so far — the chart appears from day 2.' : 'First snapshot lands after the next market close.'}</div>
            </div>
          ) : (
            <div>
              <PositionHistoryLine points={points} />
            </div>
          )}

          {/* stats row */}
          {stats && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {([
                ['Best Day', fmtSigned(stats.best.pl), plColor(stats.best.pl), stats.best.date],
                ['Worst Day', fmtSigned(stats.worst.pl), plColor(stats.worst.pl), stats.worst.date],
                ['Days Tracked', String(stats.daysTracked), 'var(--text-1)', ''],
              ] as [string, string, string, string][]).map(([label, value, color, sub]) => (
                <div key={label} className="panel" style={{ borderRadius: 9, padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.4px', whiteSpace: 'nowrap' }}>{label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
                  {sub && <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 1 }}>{sub}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Wire row clicks in OpenPositionsView**

In `components/positions/OpenPositionsView.tsx`:

3a. Extend the imports (line 5 already imports from openAnalytics — add `parseExp` and `positionKey`):

```ts
import { computeOpenAnalytics, parseExp, positionKey, type CloseSignal, type OpenRow, type MarksMap } from '@/lib/openAnalytics';
import { ymd } from '@/lib/snapshotPositions';
import { PositionHistoryPanel } from './PositionHistoryPanel';
```

3b. Inside the component (after the existing `useState` lines around line 59), add:

```ts
const [selected, setSelected] = useState<{ row: OpenRow; key: string } | null>(null);

const openHistory = (r: OpenRow) => {
  const expDate = parseExp(r.trade.exp);
  const key = positionKey(r.trade.sym, r.strikeNum, expDate ? ymd(expDate) : null, r.kind, r.isShort);
  if (key) setSelected({ row: r, key });
};
```

3c. Change the row `<tr>` (line 154) from:

```tsx
<tr key={i} style={{ borderTop: '1px solid var(--border)' }} className="trow">
```

to:

```tsx
<tr key={i} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }} className="trow"
  onClick={() => openHistory(r)} title="View P&L history">
```

3d. Render the panel just before the component's closing `</div>` (after the "When to Close" panel `</div>`, line 182):

```tsx
{selected && (
  <PositionHistoryPanel row={selected.row} positionKey={selected.key} onClose={() => setSelected(null)} />
)}
```

3e. Update the "When to Close" subtitle (line 124) to hint the interaction — change the end of the string to:

```
P&L since open, time decay, premium at risk & live moneyness per open leg · click a row for P&L history · marks reflect Schwab&apos;s last mark (updates during market hours)
```

- [ ] **Step 4: Verify in the browser**

Typecheck first: `npx tsc --noEmit` — no errors. With the dev server running (and at least one cron run from Task 4 having written rows):

1. Open the Open Positions tab, click a position row.
2. Panel slides in from the right; header shows the contract; headline shows P&L.
3. With 1 snapshot: empty-state message appears. Run the Task 4 curl once if zero snapshots exist.
4. Escape key, backdrop click, and ✕ all close the panel.
5. Resize to phone width (≤1000px): panel covers full viewport width.
6. Verify no console errors.

(A second snapshot day won't exist yet, so the chart itself renders only after two days of cron runs — or insert a fake prior-day row for a visual check and delete it after:

```bash
npx tsx -e "
import { createClient } from '@libsql/client';
const c = createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN! });
c.execute(\"SELECT position_key FROM position_snapshots LIMIT 1\").then(async r => {
  const k = r.rows[0]?.position_key; if (!k) { console.log('no snapshots yet'); return; }
  await c.execute({ sql: \"INSERT OR REPLACE INTO position_snapshots VALUES (?, '2026-07-07', 3.2, -140, 1, '2026-07-07T21:30:00Z')\", args: [k] });
  console.log('fake prior day inserted for', k);
});
" --env-file=.env.local
```

Then verify the chart + percentile + high/low markers render, and delete the fake row:

```bash
npx tsx -e "
import { createClient } from '@libsql/client';
const c = createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN! });
c.execute(\"DELETE FROM position_snapshots WHERE date='2026-07-07'\").then(r => console.log('deleted', r.rowsAffected));
" --env-file=.env.local
```
)

- [ ] **Step 5: Commit**

```bash
git add components/positions/PositionHistoryPanel.tsx components/positions/OpenPositionsView.tsx app/globals.css
git commit -m "feat: position history slide-out panel on Open Positions rows"
```

---

### Task 8: Docs, deploy, and user hand-offs

**Files:**
- Modify: `context/ARCHITECTURE.md` (new table, cron route, panel component)
- Modify: `context/PROGRESS.md` (milestone entry)
- Modify: `context/DECISIONS.md` (already largely covered by the spec — add a pointer entry)

- [ ] **Step 1: Update context docs**

Add to `context/ARCHITECTURE.md` in the appropriate sections (storage schema, API routes, components):

```markdown
### position_snapshots (Turso)
Daily point-in-time P&L per open position, written by the snapshot cron.
Composite PK (position_key, date); upsert on re-run; rows kept forever.
Columns: position_key, date (YYYY-MM-DD), mark, unrealized_pl, qty, captured_at.

### /api/cron/snapshot (GET)
Vercel Cron target (vercel.json: 30 21 * * 1-5 UTC). Auth via CRON_SECRET
Bearer header, fail-closed. Exempt from the app-login middleware. Reuses
fetchOpenOptionMarks → buildSnapshots (lib/snapshotPositions.ts) and upserts
one row per open position.

### PositionHistoryPanel (components/positions/)
Slide-out opened by clicking a row in Open Positions. Fetches history via
actions/fetchPositionHistory.ts; renders PositionHistoryLine chart,
percentile-of-range metric (lib/positionHistory.ts), best/worst/days stats.
Full-viewport width on ≤1000px screens.
```

Add to `context/PROGRESS.md` under completed milestones:

```markdown
- **Position P&L history** (2026-07-08): daily cron snapshots per-position
  unrealized P&L into `position_snapshots`; Open Positions rows open a
  slide-out with a history chart and percentile-of-range metric.
  Spec: docs/superpowers/specs/2026-07-08-position-pl-history-design.md
```

Add to `context/DECISIONS.md`:

```markdown
## Position history snapshots (2026-07-08)
Store both P&L and mark per day; percentile-of-range as headline metric;
keep rows forever; Vercel Cron only (no on-visit fallback). Full rationale in
docs/superpowers/specs/2026-07-08-position-pl-history-design.md.
```

- [ ] **Step 2: Run the full test suite**

```bash
npx tsx lib/__tests__/positionHistory.test.ts
npx tsx lib/__tests__/snapshotPositions.test.ts
npx tsx lib/engine/__tests__/positionBuilder.test.ts
npx tsx lib/engine/__tests__/taxEngine.test.ts
npx tsx lib/parser/__tests__/tosParser.test.ts
npx tsc --noEmit
npm run build
```

Expected: all pass, build succeeds.

- [ ] **Step 3: Commit docs**

```bash
git add context/ARCHITECTURE.md context/PROGRESS.md context/DECISIONS.md
git commit -m "docs: record position P&L history feature in context files"
```

- [ ] **Step 4: USER ACTION REQUIRED — production secret**

Before deploying, the **user** must add `CRON_SECRET` in Vercel (Project → Settings → Environment Variables, Production scope) with a fresh value, e.g. from `openssl rand -base64 32`. Claude never sets production secrets. The cron returns 401 until this is set — fail-closed, nothing breaks.

- [ ] **Step 5: Deploy**

```bash
vercel deploy --prod
```

Expected: readyState READY, alias `options-tracker-lake-one.vercel.app`. Vercel dashboard → project → Settings → Cron Jobs should now list `/api/cron/snapshot @ 30 21 * * 1-5`. After the next weekday 21:30 UTC, check the cron invocation log shows 200 and `position_snapshots` gained rows.

---

## Self-review notes

- Spec coverage: storage (Task 3), daily job (Task 4), chart (Task 6), percentile metric (Tasks 1, 7), slide-out with empty state (Task 7), keep-forever retention (no delete logic anywhere), error handling 401/503 (Task 4), tests (Tasks 1–2), CRON_SECRET user hand-off (Task 8). ✓
- `ymd()` is defined once in `lib/snapshotPositions.ts` and imported by `OpenPositionsView` — key construction is identical on the write path (Task 2) and read path (Task 7 step 3b), so history lookups always match. ✓
- Type names consistent: `SnapshotPoint` (lib/positionHistory), `SnapshotRow` (lib/snapshotPositions), `positionSnapshots` (db/schema). ✓
