/**
 * Tests for taxEngine.ts
 * Run with: npx tsx lib/engine/__tests__/taxEngine.test.ts
 */

import { computeTax } from '../taxEngine.js';
import type { Position, TaxSettings } from '../../../types/index.js';

// ---------------------------------------------------------------------------
// Minimal test harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    failed++;
  } else {
    console.log(`  PASS: ${message}`);
    passed++;
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    console.error(`  FAIL: ${message}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual  : ${JSON.stringify(actual)}`);
    failed++;
  } else {
    console.log(`  PASS: ${message}`);
    passed++;
  }
}

function describe(name: string, fn: () => void): void {
  console.log(`\n${name}`);
  fn();
}

// ---------------------------------------------------------------------------
// Helper: build a Position with sensible defaults
// ---------------------------------------------------------------------------

let posCounter = 0;

function makePosition(overrides: Partial<Position>): Position {
  posCounter++;
  const base: Position = {
    id: `pos-${posCounter}`,
    underlying: 'AAPL',
    strategy: 'Long Call',
    status: 'Closed',
    openDate: new Date('2024-01-01'),
    closeDate: new Date('2024-02-01'),
    expiration: null,
    qty: 1,
    strikes: '185 C',
    netCredit: 0,
    realizedPnl: 100,
    commissions: -1.30,
    isSection1256: false,
    daysHeld: 31,
  };
  return { ...base, ...overrides };
}

// Default tax settings
const defaultSettings: TaxSettings = {
  marginalBracketRate: 0.24,
  taxYear: 2024,
};

// ---------------------------------------------------------------------------
// Test 1: §1256 — SPX, realizedPnl=1000, daysHeld=5
// ---------------------------------------------------------------------------

describe('Test 1: §1256 — SPX, realizedPnl=1000, daysHeld=5', () => {
  const positions = [
    makePosition({
      underlying: 'SPX',
      realizedPnl: 1000,
      daysHeld: 5,
      isSection1256: true,
    }),
  ];

  const summary = computeTax(positions, defaultSettings);

  assertEqual(summary.events.length, 1, '1 tax event');
  assertEqual(summary.events[0].treatmentType, 'section-1256', 'treatmentType = section-1256');
  assertEqual(summary.events[0].ltPortion, 600, 'ltPortion = 600 (60%)');
  assertEqual(summary.events[0].stPortion, 400, 'stPortion = 400 (40%)');
});

// ---------------------------------------------------------------------------
// Test 2: Short-term — AAPL, realizedPnl=500, daysHeld=30
// ---------------------------------------------------------------------------

describe('Test 2: Short-term — AAPL, realizedPnl=500, daysHeld=30', () => {
  const positions = [
    makePosition({
      underlying: 'AAPL',
      realizedPnl: 500,
      daysHeld: 30,
      isSection1256: false,
    }),
  ];

  const summary = computeTax(positions, defaultSettings);

  assertEqual(summary.events.length, 1, '1 tax event');
  assertEqual(summary.events[0].treatmentType, 'short-term', 'treatmentType = short-term');
  assertEqual(summary.events[0].ltPortion, null, 'ltPortion = null');
  assertEqual(summary.events[0].stPortion, null, 'stPortion = null');
});

// ---------------------------------------------------------------------------
// Test 3: Long-term — MSFT, realizedPnl=800, daysHeld=400
// ---------------------------------------------------------------------------

describe('Test 3: Long-term — MSFT, realizedPnl=800, daysHeld=400', () => {
  const positions = [
    makePosition({
      underlying: 'MSFT',
      realizedPnl: 800,
      daysHeld: 400,
      isSection1256: false,
    }),
  ];

  const summary = computeTax(positions, defaultSettings);

  assertEqual(summary.events.length, 1, '1 tax event');
  assertEqual(summary.events[0].treatmentType, 'long-term', 'treatmentType = long-term');
  assertEqual(summary.events[0].ltPortion, null, 'ltPortion = null');
  assertEqual(summary.events[0].stPortion, null, 'stPortion = null');
});

// ---------------------------------------------------------------------------
// Test 4: Wash sale — AAPL loss -200, another AAPL opened 10 days after close
// ---------------------------------------------------------------------------

describe('Test 4: Wash sale — AAPL loss -200, new AAPL opened 10 days later', () => {
  // Loss position closes on 2024-03-01
  const closeDate = new Date('2024-03-01');
  // Replacement position opens 10 days after close (within 30-day window)
  const replacementOpenDate = new Date('2024-03-11');

  const lossPosition = makePosition({
    underlying: 'AAPL',
    realizedPnl: -200,
    daysHeld: 30,
    isSection1256: false,
    closeDate,
    openDate: new Date('2024-01-30'),
    status: 'Closed',
  });

  // Replacement is also a closed position with same underlying opened within 30 days
  const replacementPosition = makePosition({
    underlying: 'AAPL',
    realizedPnl: 50,
    daysHeld: 10,
    isSection1256: false,
    openDate: replacementOpenDate,
    closeDate: new Date('2024-03-21'),
    status: 'Closed',
  });

  const summary = computeTax([lossPosition, replacementPosition], defaultSettings);

  const lossEvent = summary.events.find((e) => e.realizedPnl === -200);
  assert(lossEvent !== undefined, 'loss event exists');
  assertEqual(lossEvent!.washSaleFlag, true, 'washSaleFlag = true');
  assertEqual(lossEvent!.washSaleDisallowed, 200, 'washSaleDisallowed = 200');
  assertEqual(summary.washSaleAdjustment, 200, 'washSaleAdjustment = 200');
});

// ---------------------------------------------------------------------------
// Test 5: No wash sale — AAPL loss -200, no other AAPL position
// ---------------------------------------------------------------------------

describe('Test 5: No wash sale — AAPL loss -200, no replacement position', () => {
  const positions = [
    makePosition({
      underlying: 'AAPL',
      realizedPnl: -200,
      daysHeld: 30,
      isSection1256: false,
    }),
  ];

  const summary = computeTax(positions, defaultSettings);

  assertEqual(summary.events.length, 1, '1 tax event');
  assertEqual(summary.events[0].washSaleFlag, false, 'washSaleFlag = false');
  assertEqual(summary.events[0].washSaleDisallowed, 0, 'washSaleDisallowed = 0');
  assertEqual(summary.washSaleAdjustment, 0, 'washSaleAdjustment = 0');
});

// ---------------------------------------------------------------------------
// Test 6: Estimated tax — shortTermGains=1000, rate=0.24 → estimatedTax includes 240
// ---------------------------------------------------------------------------

describe('Test 6: Estimated tax — shortTermGains=1000, rate=0.24', () => {
  const positions = [
    makePosition({
      underlying: 'AAPL',
      realizedPnl: 1000,
      daysHeld: 30,
      isSection1256: false,
    }),
  ];

  const settings: TaxSettings = {
    marginalBracketRate: 0.24,
    taxYear: 2024,
  };

  const summary = computeTax(positions, settings);

  assertEqual(summary.shortTermGains, 1000, 'shortTermGains = 1000');
  assert(summary.estimatedTax >= 240, `estimatedTax (${summary.estimatedTax}) includes 240 from short-term`);
  // With only short-term: estimatedTax = 1000 * 0.24 = 240
  assertEqual(summary.estimatedTax, 240, 'estimatedTax = 240 (1000 * 0.24)');
  assertEqual(summary.marginalBracketRate, 0.24, 'marginalBracketRate stored in summary');
});

// ---------------------------------------------------------------------------
// Test 7: Open positions excluded from tax events
// ---------------------------------------------------------------------------

describe('Test 7: Open positions are excluded from tax events', () => {
  const positions = [
    // Open position — should be excluded
    makePosition({
      underlying: 'AAPL',
      realizedPnl: null,
      daysHeld: null,
      status: 'Open',
      closeDate: null,
    }),
    // Closed position — should be included
    makePosition({
      underlying: 'MSFT',
      realizedPnl: 300,
      daysHeld: 60,
      status: 'Closed',
    }),
  ];

  const summary = computeTax(positions, defaultSettings);

  assertEqual(summary.events.length, 1, 'only 1 event (open position excluded)');
  assertEqual(summary.events[0].underlying, 'MSFT', 'event is for MSFT (the closed position)');
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
