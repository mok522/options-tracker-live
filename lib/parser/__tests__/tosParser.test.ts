/**
 * Tests for tosParser.ts and deduplicator.ts
 * Run with: npx tsx lib/parser/__tests__/tosParser.test.ts
 */

import { parseTOS } from '../tosParser.js';
import { deduplicateTrades } from '../deduplicator.js';
import type { RawTrade } from '../../../types/index.js';

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
// Fixture CSV (matches the spec)
// ---------------------------------------------------------------------------

const FIXTURE_CSV = `Account Statement for XYZ-12345,,,,,,,,,,,
Date Printed: 05/18/24,,,,,,,,,,,
,,,,,,,,,,,
Account Trade History
,,,,,,,,,,,
"Exec Time","Spread","Side","Qty","Pos Effect","Symbol","Exp","Strike","Type","Price","Net Price","Order Type"
"05/15/24 09:30","SINGLE","BUY","1","TO OPEN","AAPL","05/17/24","185","CALL","2.50","2.51","MKT"
"05/17/24 16:00","SINGLE","SELL","1","TO CLOSE","AAPL","05/17/24","185","CALL","3.00","2.99","LMT"
"05/15/24 10:15","VERTICAL","SELL","2","TO OPEN","SPX","05/31/24","5200","CALL","4.25","4.24","LMT"
,,,,,,,,,,,
Account Order History
,,,,,,,,,,,
"some","other","data"
`;

// ---------------------------------------------------------------------------
// Test 1: Basic single-leg BUY TO OPEN
// ---------------------------------------------------------------------------

describe('Test 1: Basic single-leg option (SINGLE BUY TO OPEN)', () => {
  const { trades, warnings } = parseTOS(FIXTURE_CSV);

  const trade = trades[0];

  assert(trades.length === 3, `Should parse 3 trades, got ${trades.length}`);
  assertEqual(trade.execTime, '05/15/24 09:30', 'execTime');
  assertEqual(trade.spread, 'SINGLE', 'spread');
  assertEqual(trade.side, 'BUY', 'side');
  assertEqual(trade.qty, 1, 'qty');
  assertEqual(trade.posEffect, 'TO OPEN', 'posEffect');
  assertEqual(trade.symbol, 'AAPL', 'symbol');
  assertEqual(trade.underlying, 'AAPL', 'underlying');
  assertEqual(trade.expiration, '05/17/24', 'expiration');
  assertEqual(trade.strike, 185, 'strike');
  assertEqual(trade.optionType, 'CALL', 'optionType');
  assertEqual(trade.price, 2.5, 'price');
  assertEqual(trade.netPrice, 2.51, 'netPrice');
  assert(Math.abs(trade.commission - 0.01) < 0.0001, `commission ~0.01, got ${trade.commission}`);
  assertEqual(
    trade.dedupKey,
    '05/15/24 09:30|AAPL|BUY|1|2.5',
    'dedupKey'
  );
  assert(warnings.length === 0, `No warnings, got: ${JSON.stringify(warnings)}`);
});

// ---------------------------------------------------------------------------
// Test 2: Vertical spread SELL TO OPEN
// ---------------------------------------------------------------------------

describe('Test 2: Vertical spread (VERTICAL SELL TO OPEN)', () => {
  const { trades } = parseTOS(FIXTURE_CSV);

  const vertical = trades[2];

  assertEqual(vertical.spread, 'VERTICAL', 'spread = VERTICAL');
  assertEqual(vertical.side, 'SELL', 'side = SELL');
  assertEqual(vertical.qty, 2, 'qty = 2');
  assertEqual(vertical.posEffect, 'TO OPEN', 'posEffect = TO OPEN');
  assertEqual(vertical.symbol, 'SPX', 'symbol = SPX');
  assertEqual(vertical.underlying, 'SPX', 'underlying = SPX');
  assertEqual(vertical.strike, 5200, 'strike = 5200');
  assertEqual(vertical.price, 4.25, 'price = 4.25');
});

// ---------------------------------------------------------------------------
// Test 3: Section detection — only Account Trade History is parsed
// ---------------------------------------------------------------------------

describe('Test 3: Section detection (multiple sections)', () => {
  const { trades, warnings } = parseTOS(FIXTURE_CSV);

  // "Account Order History" rows should NOT appear
  assert(trades.length === 3, `Exactly 3 trades from Account Trade History section`);
  // None of the trades should have "some" as a field value
  assert(
    !trades.some((t) => t.symbol === 'some' || t.execTime === 'some'),
    'No data from Account Order History section'
  );
  assert(warnings.length === 0, 'No warnings');
});

// ---------------------------------------------------------------------------
// Test 4: Deduplication — 1 new, 1 skipped
// ---------------------------------------------------------------------------

describe('Test 4: Deduplication (2 incoming, 1 matches existing)', () => {
  const { trades } = parseTOS(FIXTURE_CSV);

  // Pretend first trade is already in DB
  const existing: RawTrade[] = [trades[0]];
  const incoming: RawTrade[] = [trades[0], trades[1]];

  const { newTrades, skipped } = deduplicateTrades(incoming, existing);

  assertEqual(newTrades.length, 1, 'newTrades.length = 1');
  assertEqual(skipped, 1, 'skipped = 1');
  assertEqual(newTrades[0].execTime, trades[1].execTime, 'newTrade is the second trade');
});

// ---------------------------------------------------------------------------
// Test 5: Bad row — missing symbol → warning, row skipped
// ---------------------------------------------------------------------------

describe('Test 5: Bad row with empty symbol → warning + skipped', () => {
  const csvWithBadRow = `Account Statement,,,,,,,,,,,
,,,,,,,,,,,
Account Trade History
,,,,,,,,,,,
"Exec Time","Spread","Side","Qty","Pos Effect","Symbol","Exp","Strike","Type","Price","Net Price","Order Type"
"05/15/24 09:30","SINGLE","BUY","1","TO OPEN","","05/17/24","185","CALL","2.50","2.51","MKT"
"05/15/24 10:00","SINGLE","BUY","1","TO OPEN","AAPL","05/17/24","185","CALL","2.50","2.51","MKT"
,,,,,,,,,,,
`;

  const { trades, warnings } = parseTOS(csvWithBadRow);

  assertEqual(trades.length, 1, 'Only 1 valid trade parsed');
  assert(warnings.length > 0, 'At least one warning generated');
  assert(
    warnings.some((w) => w.toLowerCase().includes('symbol')),
    'Warning mentions "symbol"'
  );
});

// ---------------------------------------------------------------------------
// Test 6: OCC symbol underlying extraction
// ---------------------------------------------------------------------------

describe('Test 6: OCC symbol ".AAPL240517C00185000" → underlying = "AAPL"', () => {
  const csvWithOCC = `Account Statement,,,,,,,,,,,
,,,,,,,,,,,
Account Trade History
,,,,,,,,,,,
"Exec Time","Spread","Side","Qty","Pos Effect","Symbol","Exp","Strike","Type","Price","Net Price","Order Type"
"05/15/24 09:30","SINGLE","BUY","1","TO OPEN",".AAPL240517C00185000","05/17/24","185","CALL","2.50","2.51","MKT"
,,,,,,,,,,,
`;

  const { trades, warnings } = parseTOS(csvWithOCC);

  assertEqual(trades.length, 1, '1 trade parsed');
  assertEqual(trades[0].symbol, '.AAPL240517C00185000', 'symbol preserved as-is');
  assertEqual(trades[0].underlying, 'AAPL', 'underlying extracted = AAPL');
});

// ---------------------------------------------------------------------------
// Additional edge-case tests
// ---------------------------------------------------------------------------

describe('Test 7: posEffect "AUTOMATIC" → AUTO with no warning', () => {
  const csv = `Account Statement,,,,,,,
,,,,,,,
Account Trade History
,,,,,,,
"Exec Time","Spread","Side","Qty","Pos Effect","Symbol","Exp","Strike","Type","Price","Net Price","Order Type"
"05/17/24 16:00","SINGLE","SELL","1","AUTOMATIC","AAPL","05/17/24","185","CALL","0.00","0.00","MKT"
,,,,,,,
`;
  const { trades, warnings } = parseTOS(csv);
  assertEqual(trades.length, 1, '1 trade parsed');
  assertEqual(trades[0].posEffect, 'AUTO', 'posEffect = AUTO');
  assert(warnings.length === 0, 'No warnings for AUTOMATIC');
});

describe('Test 8: Section not found → warning returned', () => {
  const csv = `Some other CSV,,,\n,,,\nSome Section\n,,,\n"col1","col2"\n"a","b"\n,,,\n`;
  const { trades, warnings } = parseTOS(csv);
  assertEqual(trades.length, 0, 'No trades');
  assert(warnings.length > 0, 'Warning about missing section');
  assert(
    warnings[0].includes('Account Trade History'),
    'Warning mentions section name'
  );
});

describe('Test 9: BOT/SLD side aliases', () => {
  const csv = `Account Statement,,,,,,,,,,,
,,,,,,,,,,,
Account Trade History
,,,,,,,,,,,
"Exec Time","Spread","Side","Qty","Pos Effect","Symbol","Exp","Strike","Type","Price","Net Price","Order Type"
"05/15/24 09:30","SINGLE","BOT","1","TO OPEN","AAPL","05/17/24","185","CALL","2.50","2.51","MKT"
"05/17/24 16:00","SINGLE","SLD","1","TO CLOSE","AAPL","05/17/24","185","CALL","3.00","2.99","LMT"
,,,,,,,,,,,
`;
  const { trades } = parseTOS(csv);
  assertEqual(trades.length, 2, '2 trades');
  assertEqual(trades[0].side, 'BUY', 'BOT → BUY');
  assertEqual(trades[1].side, 'SELL', 'SLD → SELL');
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
