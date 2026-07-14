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
