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
