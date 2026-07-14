# Stock P&L Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync every Schwab equity trade through the existing FIFO pipeline so stock round trips (including covered-call assignment sales) show realized P&L alongside options, with holding-period tax treatment.

**Architecture:** Two new `trades` columns (`asset_type`, `open_date`); the Schwab adapter emits equity legs from TRADE transactions; `buildPositions` becomes multiplier-aware (×100 options, ×1 shares) and records the matched open date; UI adds a Type filter and keeps the Open Positions tab options-only; a new pure tax lib splits gains short/long-term.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM + Turso, standalone `tsx` test scripts (house style).

**Spec:** `docs/superpowers/specs/2026-07-13-stock-pl-tracking-design.md`
**Branch:** `feat/stock-pl-tracking` (already checked out)

---

## Conventions

- Tests are standalone tsx scripts with an inline assert/describe harness (see `lib/__tests__/assignmentSync.test.ts`), run via `npx tsx <path>`, exit 1 on failure. No vitest/jest.
- `Trade.assetType` is OPTIONAL: `undefined` means `'OPTION'` (legacy rows, CSV imports). Every consumer must use `(t.assetType ?? 'OPTION')`.
- Colors: `--pos`/`--neg` exclusively for P&L. No new colors needed anywhere in this plan.
- The trades DB table is rebuilt from persisted raw legs on every import (`actions/upsertTrades.ts` importTrades), so historical rows gain `openDate` automatically after the next sync — no backfill script.

---

### Task 1: Schema + type + persistence plumbing

No behavior change — every existing path defaults to `'OPTION'` / `''`.

**Files:**
- Modify: `db/schema.ts` (trades table)
- Modify: `types/trade.ts`
- Modify: `actions/upsertTrades.ts` (insert mapping)
- Modify: `app/page.tsx` (row → Trade mapping)
- Modify: `app/api/cron/snapshot/route.ts` (row → Trade mapping)
- Generated: `db/migrations/0003_*.sql`

- [ ] **Step 1: Extend the trades table in `db/schema.ts`**

Add two columns at the end of the `trades` table definition (after the `date` column):

```ts
  date:   text('date').notNull().default(''),
  assetType: text('asset_type').notNull().default('OPTION'), // 'OPTION' | 'EQUITY'
  openDate:  text('open_date').notNull().default(''),        // "YYYY-MM-DD" of the FIFO-matched opening leg
```

- [ ] **Step 2: Extend `types/trade.ts`**

Add after the `date` field of the `Trade` interface:

```ts
  assetType?: 'OPTION' | 'EQUITY'; // undefined = OPTION (legacy rows, CSV imports)
  openDate?: string; // "YYYY-MM-DD" of the FIFO-matched opening leg ('' when unknown)
```

- [ ] **Step 3: Generate + apply the migration**

```bash
npm run db:generate
```

Expected: a new `db/migrations/0003_*.sql` containing ONLY:

```sql
ALTER TABLE `trades` ADD `asset_type` text DEFAULT 'OPTION' NOT NULL;--> statement-breakpoint
ALTER TABLE `trades` ADD `open_date` text DEFAULT '' NOT NULL;
```

(The earlier `trades.date` drift is already reconciled in the 0002 snapshot; if anything OTHER than these two ALTERs is generated, STOP and report BLOCKED with the SQL.)

```bash
npm run db:migrate
```

Expected: exit 0. Verify (don't print tokens):

```bash
npx tsx --env-file=.env.local -e "
import { createClient } from '@libsql/client';
const c = createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN! });
c.execute('PRAGMA table_info(trades)').then(r => console.log(r.rows.map((x: any) => x.name).join(',')));
"
```

Expected output includes `asset_type` and `open_date`.

- [ ] **Step 4: Persist the fields in `actions/upsertTrades.ts`**

In the importTrades insert values block, change:

```ts
        comm: t.comm ?? null, pl: t.pl, status: t.status,
        date: t.date ?? '',
```

to:

```ts
        comm: t.comm ?? null, pl: t.pl, status: t.status,
        date: t.date ?? '',
        assetType: t.assetType ?? 'OPTION',
        openDate: t.openDate ?? '',
```

- [ ] **Step 5: Map the fields in `app/page.tsx`**

In the `initialTrades` mapping, change:

```ts
    status: r.status as Trade['status'],
    date:   r.date ?? '',
```

to:

```ts
    status: r.status as Trade['status'],
    date:   r.date ?? '',
    assetType: (r.assetType as Trade['assetType']) ?? 'OPTION',
    openDate:  r.openDate ?? '',
```

- [ ] **Step 6: Map the fields in `app/api/cron/snapshot/route.ts`**

In the `trades` mapping, change:

```ts
    comm: r.comm ?? null, pl: r.pl, status: r.status as Trade['status'],
    date: r.date ?? '',
```

to:

```ts
    comm: r.comm ?? null, pl: r.pl, status: r.status as Trade['status'],
    date: r.date ?? '', assetType: (r.assetType as Trade['assetType']) ?? 'OPTION',
    openDate: r.openDate ?? '',
```

- [ ] **Step 7: Verify + commit**

```bash
npx tsc --noEmit
npx tsx lib/__tests__/assignmentSync.test.ts
git add db/schema.ts db/migrations types/trade.ts actions/upsertTrades.ts app/page.tsx app/api/cron/snapshot/route.ts
git commit -m "feat: asset_type + open_date columns on trades"
```

(Verify `.env.local` is not staged via `git status` first.)

---

### Task 2: FIFO multiplier + openDate (`lib/csvParser.ts`)

**Files:**
- Modify: `lib/csvParser.ts` (buildPositions)
- Test: `lib/__tests__/stockPl.test.ts` (created here, extended in Task 4)

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/stockPl.test.ts`:

```ts
/**
 * Tests for stock (EQUITY) P&L handling:
 *  - buildPositions uses ×1 multiplier for shares (×100 stays for options)
 *  - matched round trips record openDate
 *  - open share lots never fall into the expiration fallback
 * Run with: npx tsx lib/__tests__/stockPl.test.ts
 */

import { recomputePositions, type PersistedLeg } from '../csvParser.js';

let passed = 0;
let failed = 0;

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

function stockLeg(o: Partial<PersistedLeg>): PersistedLeg {
  return {
    sym: 'HOOD', strat: 'Stock', side: 'Buy', qty: 100, strike: '', exp: '',
    fill: 97, optType: '', assetType: 'EQUITY', pl: 0, status: 'Open',
    date: '2026-02-12', hasPnl: false, ...o,
  };
}

describe('stock round trip: ×1 multiplier + openDate', () => {
  const legs: PersistedLeg[] = [
    stockLeg({}),
    stockLeg({ side: 'Sell', fill: 110, status: 'Closed', date: '2026-07-10' }),
  ];
  const out = recomputePositions(legs);
  assertEqual(out.length, 1, 'buy + sell collapse to one round trip');
  assertEqual(out[0].pl, 1300, 'stock P&L = (110 − 97) × 100 shares × $1');
  assertEqual(out[0].status, 'Closed', 'status Closed');
  assertEqual(out[0].openDate, '2026-02-12', 'openDate recorded from the buy');
  assertEqual(out[0].date, '2026-07-10', 'realization date from the sell');
});

describe('partial share lots fan-in', () => {
  const legs: PersistedLeg[] = [
    stockLeg({ sym: 'AMD', qty: 10, fill: 115.61, date: '2025-01-13' }),
    stockLeg({ sym: 'AMD', qty: 10, fill: 89.28, date: '2025-04-16' }),
    stockLeg({ sym: 'AMD', qty: 20, fill: 114.62, side: 'Sell', status: 'Closed', date: '2025-06-02' }),
  ];
  const out = recomputePositions(legs);
  assertEqual(out.length, 2, 'one 20-share sell closes two 10-share lots');
  // lot1: (114.62 − 115.61) × 10 = −9.90 ; lot2: (114.62 − 89.28) × 10 = +253.40
  assertEqual(out[0].pl, -9.9, 'first lot P&L');
  assertEqual(out[1].pl, 253.4, 'second lot P&L');
});

describe('open share lot stays Open (no expiration fallback)', () => {
  const out = recomputePositions([stockLeg({ sym: 'BMNR', fill: 40, date: '2025-11-29' })]);
  assertEqual(out.length, 1, 'lot emitted');
  assertEqual(out[0].status, 'Open', 'no expiry → never Expired');
  assertEqual(out[0].pl, 0, 'unrealized = 0');
});

describe('option multiplier unchanged (×100)', () => {
  const legs: PersistedLeg[] = [
    {
      sym: 'ABC', strat: 'Short Put', side: 'Sell', qty: 1, strike: '50 P',
      exp: '18 SEP 26', fill: 2.0, optType: 'PUT', pl: 0, status: 'Open',
      date: '2026-07-01', hasPnl: false,
    },
    {
      sym: 'ABC', strat: 'Short Put', side: 'Buy', qty: 1, strike: '50 P',
      exp: '18 SEP 26', fill: 0.5, optType: 'PUT', pl: 0, status: 'Closed',
      date: '2026-07-08', hasPnl: false,
    },
  ];
  const out = recomputePositions(legs);
  assertEqual(out[0].pl, 150, '(2.00 − 0.50) × 1 × 100');
  assertEqual(out[0].openDate, '2026-07-01', 'options get openDate too');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run it — expect FAIL** (`pl` is 130000 for the stock case, `openDate` undefined)

Run: `npx tsx lib/__tests__/stockPl.test.ts`

- [ ] **Step 3: Implement in `lib/csvParser.ts` buildPositions**

3a. In the closing-match `while` loop, change:

```ts
        const isBuyOpen = open.side === 'Buy';
        const pl = Math.round((isBuyOpen ? leg.fill - open.fill : open.fill - leg.fill) * contracts * 100 * 100) / 100;
```

to:

```ts
        const isBuyOpen = open.side === 'Buy';
        // Shares settle 1:1; option contracts carry the ×100 multiplier.
        const mult = (open.assetType ?? 'OPTION') === 'EQUITY' ? 1 : 100;
        const pl = Math.round((isBuyOpen ? leg.fill - open.fill : open.fill - leg.fill) * contracts * mult * 100) / 100;
```

3b. In the same `results.push({ ...open, ... })`, add `openDate` after `date`:

```ts
          date: leg.date || open.date || '',
          openDate: open.date || '',
```

3c. In the unmatched-opens fallback loop at the bottom, add `openDate` to its `results.push`:

```ts
      results.push({
        ...leg,
        pl,
        status: expired ? 'Expired' : 'Open',
        date,
        openDate: leg.date || '',
        id: uid(leg.exp, leg.sym, leg.fill, leg.qty, expired ? 'Expired' : 'Open'),
      });
```

(No expiration-fallback change is needed for equity: `parseExpDate('')` already returns null, so share lots can never be marked Expired — the test proves it.)

- [ ] **Step 4: Run tests — expect PASS**, plus regression:

```bash
npx tsx lib/__tests__/stockPl.test.ts
npx tsx lib/__tests__/assignmentSync.test.ts
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add lib/csvParser.ts lib/__tests__/stockPl.test.ts
git commit -m "feat: equity-aware FIFO multiplier + openDate on round trips"
```

---

### Task 3: Adapter emits equity legs (`lib/schwab/adapter.ts`)

**Files:**
- Modify: `lib/schwab/adapter.ts`
- Test: `lib/__tests__/stockAdapter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/stockAdapter.test.ts`:

```ts
/**
 * Tests for equity-leg emission from Schwab TRADE transactions.
 * Fixture mirrors the live HOOD assignment share sale (2026-07-10).
 * Run with: npx tsx lib/__tests__/stockAdapter.test.ts
 */

import { adaptTransactions, type SchwabTransaction } from '../schwab/adapter.js';

let passed = 0;
let failed = 0;

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

// Mirrors the live "assignment share sale" TRADE: −100 HOOD @ $110 + $0.25 SEC fee.
const shareSale: SchwabTransaction = {
  activityId: 124794482714,
  time: '2026-07-11T07:25:13+0000',
  type: 'TRADE',
  description: 'ROBINHOOD MKTS INC CLASS A',
  netAmount: 10999.75,
  transferItems: [
    {
      instrument: { assetType: 'EQUITY', symbol: 'HOOD' },
      amount: -100,
      price: 110,
      cost: 11000,
      positionEffect: 'CLOSING',
    },
    {
      instrument: { assetType: 'CURRENCY', symbol: 'CURRENCY_USD' },
      amount: 0.25,
      cost: -0.25,
      feeType: 'SEC_FEE',
    },
  ],
};

describe('equity CLOSING trade → Closed stock leg', () => {
  const legs = adaptTransactions([shareSale]);
  assertEqual(legs.length, 1, 'one equity leg');
  const leg = legs[0];
  assertEqual(leg.sym, 'HOOD', 'symbol from equity instrument');
  assertEqual(leg.assetType, 'EQUITY', 'assetType EQUITY');
  assertEqual(leg.strat, 'Stock', 'strategy label');
  assertEqual(leg.side, 'Sell', 'negative amount = sell');
  assertEqual(leg.qty, 100, 'share count');
  assertEqual(leg.fill, 110, 'per-share price');
  assertEqual(leg.strike, '', 'no strike');
  assertEqual(leg.exp, '', 'no expiration');
  assertEqual(leg.status, 'Closed', 'CLOSING → Closed');
  assertEqual(leg.comm, -0.25, 'order fees allocated to the leg');
  assertEqual(leg.date, '2026-07-11', 'date from transaction time');
});

describe('equity OPENING trade → Open stock leg', () => {
  const buy: SchwabTransaction = {
    time: '2026-02-12T07:07:42+0000',
    type: 'TRADE',
    netAmount: -9700,
    transferItems: [
      { instrument: { assetType: 'EQUITY', symbol: 'HOOD' }, amount: 100, price: 97, positionEffect: 'OPENING' },
    ],
  };
  const legs = adaptTransactions([buy]);
  assertEqual(legs.length, 1, 'one leg');
  assertEqual(legs[0].side, 'Buy', 'positive amount = buy');
  assertEqual(legs[0].status, 'Open', 'OPENING → Open');
  assertEqual(legs[0].comm, null, 'no fees → null comm');
});

describe('option legs unaffected and tagged OPTION', () => {
  const optTx: SchwabTransaction = {
    time: '2026-06-26T17:53:21+0000',
    type: 'TRADE',
    netAmount: 135.34,
    transferItems: [
      {
        instrument: {
          assetType: 'OPTION', symbol: 'HOOD  260710C00110000', underlyingSymbol: 'HOOD',
          putCall: 'CALL', strikePrice: 110, expirationDate: '2026-07-10T04:00:00+0000',
        },
        amount: -1, price: 2.16, positionEffect: 'OPENING',
      },
      { instrument: { assetType: 'CURRENCY', symbol: 'CURRENCY_USD' }, amount: 0.66, cost: -0.66, feeType: 'COMMISSION' },
    ],
  };
  const legs = adaptTransactions([optTx]);
  assertEqual(legs.length, 1, 'one option leg');
  assertEqual(legs[0].assetType, 'OPTION', 'tagged OPTION');
  assertEqual(legs[0].fill, 2.16, 'premium unchanged');
  assertEqual(legs[0].comm, -0.66, 'fees unchanged');
});

describe('RECEIVE_AND_DELIVER equity items are NOT ingested', () => {
  const rd: SchwabTransaction = {
    time: '2026-07-11T07:30:12+0000',
    type: 'RECEIVE_AND_DELIVER',
    description: 'Removed due to Assignment CALL ROBINHOOD MKTS INC $110 EXP 07/10/26',
    netAmount: 0,
    transferItems: [
      { instrument: { assetType: 'EQUITY', symbol: 'HOOD' }, amount: -100, price: 110, positionEffect: 'CLOSING' },
    ],
  };
  assertEqual(adaptTransactions([rd]).length, 0, 'equity legs only from TRADE transactions');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run it — expect FAIL** (equity transactions currently skipped entirely)

Run: `npx tsx lib/__tests__/stockAdapter.test.ts`

- [ ] **Step 3: Implement in `lib/schwab/adapter.ts`**

3a. Replace the option-items block:

```ts
    // Option legs in this order/transaction.
    const optionItems = items.filter(
      (i) =>
        i.instrument?.assetType === 'OPTION' &&
        i.instrument.putCall &&
        i.instrument.strikePrice != null &&
        i.instrument.expirationDate &&
        i.instrument.underlyingSymbol
    );
    if (optionItems.length === 0) continue;
```

with:

```ts
    // Option legs in this order/transaction.
    const optionItems = items.filter(
      (i) =>
        i.instrument?.assetType === 'OPTION' &&
        i.instrument.putCall &&
        i.instrument.strikePrice != null &&
        i.instrument.expirationDate &&
        i.instrument.underlyingSymbol
    );
    // Share legs — ordinary stock trades AND assignment share sales (Schwab
    // books those as plain equity TRADEs). Only from TRADE transactions:
    // RECEIVE_AND_DELIVER equity items are transfers, not trades.
    const equityItems = tx.type === 'TRADE'
      ? items.filter((i) => i.instrument?.assetType === 'EQUITY' && i.instrument.symbol)
      : [];
    if (optionItems.length === 0 && equityItems.length === 0) continue;
```

3b. Replace the fee-allocation denominator:

```ts
    const totalContracts = optionItems.reduce((s, i) => s + Math.abs(i.amount), 0);
```

with:

```ts
    // Fee pool is shared pro-rata across every unit in the order
    // (option contracts + shares — mixed orders are rare and small).
    const totalUnits =
      optionItems.reduce((s, i) => s + Math.abs(i.amount), 0) +
      equityItems.reduce((s, i) => s + Math.abs(i.amount), 0);
```

3c. In the option-leg loop, update the fee line and tag the asset type:

```ts
      const legComm = totalContracts > 0 ? (totalFees * qty) / totalContracts : 0;
```

→

```ts
      const legComm = totalUnits > 0 ? (totalFees * qty) / totalUnits : 0;
```

and add `assetType: 'OPTION',` to the option `legs.push({ ... })` (after `optType`).

3d. After the option-items `for` loop (still inside the transaction loop), add:

```ts
    for (const item of equityItems) {
      const shares = Math.abs(item.amount);
      if (shares === 0) continue;

      const side: 'Buy' | 'Sell' = item.amount < 0 ? 'Sell' : 'Buy';
      const effect = item.positionEffect ?? 'OPENING';
      const status: Trade['status'] = effect === 'OPENING' ? 'Open' : 'Closed';
      const legComm = totalUnits > 0 ? (totalFees * shares) / totalUnits : 0;

      legs.push({
        sym: item.instrument.symbol.toUpperCase(),
        strat: 'Stock',
        side,
        qty: shares,
        strike: '',
        exp: '',
        fill: Math.abs(item.price ?? 0),
        optType: '',
        assetType: 'EQUITY',
        comm: legComm !== 0 ? Math.round(legComm * 100) / 100 : null,
        pl: 0,
        status,
        date: fmtDate(tx.time),
      });
    }
```

- [ ] **Step 4: Run tests — expect PASS**, plus regression:

```bash
npx tsx lib/__tests__/stockAdapter.test.ts
npx tsx lib/__tests__/assignmentSync.test.ts
npx tsx lib/__tests__/stockPl.test.ts
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add lib/schwab/adapter.ts lib/__tests__/stockAdapter.test.ts
git commit -m "feat: sync equity trades from Schwab as Stock legs"
```

---

### Task 4: Tax holding-period split

**Files:**
- Create: `lib/taxBuckets.ts`
- Test: `lib/__tests__/taxBuckets.test.ts`
- Modify: `components/tax/TaxView.tsx`
- Modify: `components/dashboard/DashboardView.tsx`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/taxBuckets.test.ts`:

```ts
/**
 * Tests for lib/taxBuckets.ts — holding-period gain splitting.
 * Run with: npx tsx lib/__tests__/taxBuckets.test.ts
 */

import { holdingDays, splitGains } from '../taxBuckets.js';
import type { Trade } from '../../types/trade.js';

let passed = 0;
let failed = 0;

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

function trade(o: Partial<Trade>): Trade {
  return {
    sym: 'HOOD', strat: 'Stock', side: 'Buy', qty: 100, strike: '', exp: '',
    fill: 97, optType: '', assetType: 'EQUITY', pl: 1300, status: 'Closed',
    date: '2026-07-10', openDate: '2026-02-12', ...o,
  };
}

describe('holdingDays', () => {
  assertEqual(holdingDays('2026-02-12', '2026-07-10'), 148, 'HOOD lot: 148 days');
  assertEqual(holdingDays('2025-07-10', '2026-07-10'), 365, 'exactly one year = 365');
  assertEqual(holdingDays('2025-07-09', '2026-07-10'), 366, 'one year + a day = 366');
  assertEqual(holdingDays('', '2026-07-10'), null, 'missing open → null');
  assertEqual(holdingDays('2026-02-12', ''), null, 'missing close → null');
});

describe('splitGains', () => {
  const st = trade({});                                              // 148d equity gain → ST
  const lt = trade({ openDate: '2025-01-02', date: '2026-07-10' }); // 554d equity gain → LT
  const loss = trade({ pl: -500 });                                  // losses excluded
  const opt = trade({ assetType: 'OPTION', strat: 'Short Call', pl: 216, openDate: '2025-01-02' }); // options always ST
  const noBasis = trade({ openDate: '' });                           // unknown basis → ST (conservative)

  assertEqual(splitGains([st]), { shortTermGains: 1300, longTermGains: 0 }, 'held ≤1yr → short-term');
  assertEqual(splitGains([lt]), { shortTermGains: 0, longTermGains: 1300 }, 'held >1yr → long-term');
  assertEqual(splitGains([lt, st, loss]), { shortTermGains: 1300, longTermGains: 1300 }, 'mixed, losses excluded');
  assertEqual(splitGains([opt]), { shortTermGains: 216, longTermGains: 0 }, 'options never long-term');
  assertEqual(splitGains([noBasis]), { shortTermGains: 1300, longTermGains: 0 }, 'missing openDate → short-term');
  assertEqual(splitGains([trade({ openDate: '2025-07-10', date: '2026-07-10' })]),
    { shortTermGains: 1300, longTermGains: 0 }, 'exactly 365 days is NOT long-term (needs >1yr)');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run it — expect FAIL** (module missing)

- [ ] **Step 3: Create `lib/taxBuckets.ts`**

```ts
import type { Trade } from '@/types/trade';

const DAY_MS = 86_400_000;

// Days between two "YYYY-MM-DD" dates (close − open); null when either is
// missing/unparseable. Local-midnight arithmetic, immune to DST via rounding.
export function holdingDays(openDate?: string, closeDate?: string): number | null {
  if (!openDate || openDate.length < 10 || !closeDate || closeDate.length < 10) return null;
  const [oy, om, od] = openDate.slice(0, 10).split('-').map(Number);
  const [cy, cm, cd] = closeDate.slice(0, 10).split('-').map(Number);
  if (!oy || !om || !od || !cy || !cm || !cd) return null;
  return Math.round((new Date(cy, cm - 1, cd).getTime() - new Date(oy, om - 1, od).getTime()) / DAY_MS);
}

export interface GainBuckets {
  shortTermGains: number;
  longTermGains: number;
}

/**
 * Split realized GAINS (losses excluded — matches the existing short-term
 * calc) into short vs long term. Long-term = equity round trips held more
 * than 365 days with a known open date; everything else (options, unknown
 * basis) is short-term. Callers pass non-§1256 closed trades.
 */
export function splitGains(closedNonS1256: Trade[]): GainBuckets {
  let st = 0;
  let lt = 0;
  for (const t of closedNonS1256) {
    if (t.pl <= 0) continue;
    const days = (t.assetType ?? 'OPTION') === 'EQUITY' ? holdingDays(t.openDate, t.date) : null;
    if (days != null && days > 365) lt += t.pl;
    else st += t.pl;
  }
  return {
    shortTermGains: Math.round(st * 100) / 100,
    longTermGains: Math.round(lt * 100) / 100,
  };
}
```

- [ ] **Step 4: Run the test — expect PASS**

- [ ] **Step 5: Wire into `components/tax/TaxView.tsx`**

5a. Add import: `import { splitGains } from '@/lib/taxBuckets';`

5b. Replace:

```ts
  const shortTerm = nonS1256Closed.reduce((s, t) => s + (t.pl > 0 ? t.pl : 0), 0);
  const longTerm = 0;
```

with:

```ts
  const { shortTermGains: shortTerm, longTermGains: longTerm } = splitGains(nonS1256Closed);
```

5c. Update the estimate to include long-term gains at 15%:

```ts
  const estTax = Math.max(0, shortTerm) * 0.24 + Math.max(0, s1256PL * 0.4) * 0.24 + Math.max(0, s1256PL * 0.6) * 0.15;
```

→

```ts
  const estTax = Math.max(0, shortTerm) * 0.24 + longTerm * 0.15 + Math.max(0, s1256PL * 0.4) * 0.24 + Math.max(0, s1256PL * 0.6) * 0.15;
```

(`longTerm` is already gains-only, no `Math.max` needed.)

- [ ] **Step 6: Wire into `components/dashboard/DashboardView.tsx`**

6a. Add import: `import { splitGains } from '@/lib/taxBuckets';`

6b. Replace the tax sidebar calcs:

```ts
  const s1256PL     = trades.filter((t) => s1256set.has(t.sym)).reduce((s, t) => s + t.pl, 0);
  const shortTermPL = closed.filter((t) => !s1256set.has(t.sym)).reduce((s, t) => s + (t.pl > 0 ? t.pl : 0), 0);
  const estTax      = Math.round((shortTermPL * 0.24 + Math.max(0, s1256PL * 0.4) * 0.24 + Math.max(0, s1256PL * 0.6) * 0.15) * 100) / 100;
```

with:

```ts
  const s1256PL = trades.filter((t) => s1256set.has(t.sym)).reduce((s, t) => s + t.pl, 0);
  const { shortTermGains: shortTermPL, longTermGains: longTermPL } = splitGains(closed.filter((t) => !s1256set.has(t.sym)));
  const estTax = Math.round((shortTermPL * 0.24 + longTermPL * 0.15 + Math.max(0, s1256PL * 0.4) * 0.24 + Math.max(0, s1256PL * 0.6) * 0.15) * 100) / 100;
```

6c. In the Tax Exposure panel rows, change:

```ts
              ['Long-term',  fmtUSD(0)],
```

to:

```ts
              ['Long-term',  fmtUSD(longTermPL)],
```

- [ ] **Step 7: Verify + commit**

```bash
npx tsx lib/__tests__/taxBuckets.test.ts
npx tsc --noEmit
git add lib/taxBuckets.ts lib/__tests__/taxBuckets.test.ts components/tax/TaxView.tsx components/dashboard/DashboardView.tsx
git commit -m "feat: short/long-term gain split by holding period"
```

---

### Task 5: Open Positions stays options-only

**Files:**
- Modify: `components/positions/OpenPositionsView.tsx`
- Modify: `components/dashboard/DashboardView.tsx` (openCt)

- [ ] **Step 1: Filter in `OpenPositionsView.tsx`**

1a. At the top of the component body (before the `symbolKey` memo), add:

```ts
  // This tab is options-only by design (spec 2026-07-13): share lots live in
  // the Trades table. Filter before any analytics touch the data.
  const optionTrades = useMemo(
    () => trades.filter((t) => (t.assetType ?? 'OPTION') === 'OPTION'),
    [trades],
  );
```

1b. Replace every subsequent use of `trades` inside the component with `optionTrades` — there are two: the `symbolKey` memo (`for (const t of trades)` → `for (const t of optionTrades)` and its deps array), and the analytics memo (`computeOpenAnalytics(trades, quotes, marks)` → `computeOpenAnalytics(optionTrades, quotes, marks)` and its deps array).

- [ ] **Step 2: Dashboard tile counts options only**

In `components/dashboard/DashboardView.tsx`, change:

```ts
  const openCt       = useMemo(() => trades.filter((t) => t.status === 'Open').length, [trades]);
```

to:

```ts
  // Matches the Open Positions tab, which is options-only; open share lots
  // are visible in the Trades table instead.
  const openCt       = useMemo(() => trades.filter((t) => t.status === 'Open' && (t.assetType ?? 'OPTION') === 'OPTION').length, [trades]);
```

- [ ] **Step 3: Verify + commit**

```bash
npx tsc --noEmit
git add components/positions/OpenPositionsView.tsx components/dashboard/DashboardView.tsx
git commit -m "feat: keep Open Positions tab and tile options-only"
```

---

### Task 6: Trades table Type filter + stock rendering

**Files:**
- Modify: `components/trades/TradesView.tsx`
- Modify: `components/shared/TradesTable.tsx`

- [ ] **Step 1: Type filter in `TradesView.tsx`**

1a. Add state below the existing filters:

```ts
  const [kind, setKind] = useState('All');
```

1b. Extend the row filter — change:

```ts
    let r = trades.filter((t) =>
      (status === 'All' || t.status === status) &&
      (strat === 'All' || t.strat === strat) &&
      (q.trim() === '' || t.sym.toLowerCase().includes(q.trim().toLowerCase())));
```

to:

```ts
    let r = trades.filter((t) =>
      (status === 'All' || t.status === status) &&
      (kind === 'All' || ((t.assetType ?? 'OPTION') === 'EQUITY') === (kind === 'Stocks')) &&
      (strat === 'All' || t.strat === strat) &&
      (q.trim() === '' || t.sym.toLowerCase().includes(q.trim().toLowerCase())));
```

and add `kind` to the memo's dependency array (`[trades, status, kind, strat, q, sort]`).

1c. Add the segmented control in the toolbar, immediately after the status `<div className="seg">…</div>`:

```tsx
        <div className="seg">
          {['All', 'Options', 'Stocks'].map((o) => (
            <button key={o} className={kind === o ? 'on' : ''} onClick={() => setKind(o)}>{o}</button>
          ))}
        </div>
```

1d. Stock rows render '—' for the option-only columns — change:

```tsx
                  <td style={{ ...td, color: 'var(--text-2)' }}>{t.strike}</td>
                  <td style={{ ...td, color: 'var(--text-2)' }}>{t.exp}</td>
```

to:

```tsx
                  <td style={{ ...td, color: 'var(--text-2)' }}>{t.strike || '—'}</td>
                  <td style={{ ...td, color: 'var(--text-2)' }}>{t.exp || '—'}</td>
```

- [ ] **Step 2: Same '—' treatment in `components/shared/TradesTable.tsx`** (used by Dashboard Recent Trades)

Change lines 45-46:

```tsx
            {has('Strike')   && <td style={{ ...cell, color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>{t.strike}</td>}
            {has('Exp')      && <td style={{ ...cell, color: 'var(--text-2)' }}>{t.exp}</td>}
```

to:

```tsx
            {has('Strike')   && <td style={{ ...cell, color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>{t.strike || '—'}</td>}
            {has('Exp')      && <td style={{ ...cell, color: 'var(--text-2)' }}>{t.exp || '—'}</td>}
```

- [ ] **Step 3: Verify + commit**

```bash
npx tsc --noEmit
npm run build
git add components/trades/TradesView.tsx components/shared/TradesTable.tsx
git commit -m "feat: Trades type filter (Options/Stocks) + stock row rendering"
```

---

### Task 7: Docs, full suite, live verification

**Files:**
- Modify: `context/ARCHITECTURE.md`, `context/PROGRESS.md`, `context/DECISIONS.md`

- [ ] **Step 1: Update context docs** (match each file's existing conventions)

`context/ARCHITECTURE.md` — add near the position-history section:

```markdown
### Stock P&L tracking (2026-07-13)
`trades` carries `asset_type` ('OPTION' default | 'EQUITY') and `open_date`
(FIFO-matched open, powers holding-period tax split). The Schwab adapter
emits equity legs from TRADE transactions (strat 'Stock', strike/exp empty,
qty = shares); buildPositions uses a ×1 multiplier for shares (×100 options).
Open Positions tab + Dashboard tile are options-only; stock rows live in
Trades (Type filter) and roll into all realized aggregates. lib/taxBuckets.ts
splits non-§1256 gains short/long-term (>365 days, equity only).
```

`context/PROGRESS.md` — before the Backlog section:

```markdown
## Stock P&L tracking (2026-07-13)
- Schwab equity trades sync through the FIFO pipeline: stock round trips
  (incl. assignment share sales) show realized P&L in Trades and roll into
  Dashboard aggregates; Tax Exposure splits short/long-term by holding
  period. Open Positions stays options-only.
  Spec: docs/superpowers/specs/2026-07-13-stock-pl-tracking-design.md
```

`context/DECISIONS.md` — add entry:

```markdown
## Stock P&L tracking (2026-07-13)
Track ALL equity trades (not just assignment-linked); roll into headline
aggregates with a Trades Type filter; holding-period tax split; Open
Positions tab stays options-only (user preference). Full rationale in
docs/superpowers/specs/2026-07-13-stock-pl-tracking-design.md.
```

- [ ] **Step 2: Full suite + build**

```bash
npx tsx lib/__tests__/stockPl.test.ts
npx tsx lib/__tests__/stockAdapter.test.ts
npx tsx lib/__tests__/taxBuckets.test.ts
npx tsx lib/__tests__/assignmentSync.test.ts
npx tsx lib/__tests__/positionHistory.test.ts
npx tsx lib/__tests__/snapshotPositions.test.ts
npx tsx lib/parser/__tests__/tosParser.test.ts
npx tsx lib/engine/__tests__/taxEngine.test.ts
npx tsc --noEmit
npm run build
```

All pass (the 5 pre-existing `positionBuilder.test.ts` detectStrategy failures are known and tracked separately).

- [ ] **Step 3: Live end-to-end verification** (controller does this in the browser)

1. Start the dev server, log in, Import tab → Sync Now.
2. Trades tab → Stocks filter: expect the HOOD round trip **+$1,300** (buy 2026-02-12 @ 97 → sell 2026-07-10 @ 110, Closed), the earlier HOOD +$1,372 (54 → 67.72), AMD/SAM/HNST/CELH/SMCI/CLSK round trips, and Open lots (BMNR, RGTI, FIG, LCID).
3. Open Positions tab: NO stock rows; option analytics unchanged.
4. Tax Exposure: Long-Term Gains card still $0 (no >1yr stock sales yet — correct), Short-Term includes stock gains.
5. Dashboard: Net Realized P&L includes stock; Open Positions tile counts options only.

- [ ] **Step 4: Commit docs**

```bash
git add context/ARCHITECTURE.md context/PROGRESS.md context/DECISIONS.md
git commit -m "docs: record stock P&L tracking in context files"
```

---

## Self-review notes

- Spec coverage: schema (Task 1), adapter equity legs incl. fee sharing (Task 3), ×1 multiplier + openDate (Task 2), Type filter + '—' rendering incl. shared TradesTable (Task 6), options-only Open Positions + Dashboard tile (Task 5), holding-period tax split with Dashboard sidebar mirror (Task 4), snapshots/CSV untouched (no task touches them; adapter/`buildPositions` changes are additive), acceptance case verified live (Task 7). ✓
- Type consistency: `assetType?: 'OPTION' | 'EQUITY'` optional everywhere with `?? 'OPTION'`; `openDate?: string`; `splitGains`/`holdingDays` names match between lib and both consumers. ✓
- The `legKey` dedup needs no change: stock legs can't collide with option legs (strike/exp always differ) and the existing fields distinguish stock lots by date/qty/fill/side/status. ✓
- No placeholders; every code step shows the exact code. ✓
