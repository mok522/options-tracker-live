/**
 * Tests for positionBuilder.ts and strategyDetector.ts
 * Run with: npx tsx lib/engine/__tests__/positionBuilder.test.ts
 */

import { buildPositions } from '../positionBuilder.js';
import { detectStrategy } from '../strategyDetector.js';
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
// Helper: build a RawTrade with defaults
// ---------------------------------------------------------------------------

let dedupCounter = 0;

function makeTrade(overrides: Partial<RawTrade>): RawTrade {
  dedupCounter++;
  const base: RawTrade = {
    execTime: '05/15/24 09:30',
    spread: 'SINGLE',
    side: 'BUY',
    qty: 1,
    posEffect: 'TO OPEN',
    symbol: 'AAPL',
    underlying: 'AAPL',
    expiration: '06/21/24',
    strike: 185,
    optionType: 'CALL',
    price: 2.50,
    netPrice: 2.51,
    commission: 0.01,
    dedupKey: `key-${dedupCounter}`,
  };
  return { ...base, ...overrides };
}

// ---------------------------------------------------------------------------
// Test 1: Single open + close — Long Call, pnl = +50
// ---------------------------------------------------------------------------

describe('Test 1: Single open + close → Long Call, realizedPnl = +50', () => {
  const trades: RawTrade[] = [
    makeTrade({
      execTime: '05/15/24 09:30',
      spread: 'SINGLE',
      side: 'BUY',
      qty: 1,
      posEffect: 'TO OPEN',
      underlying: 'AAPL',
      expiration: '06/21/24',
      strike: 185,
      optionType: 'CALL',
      price: 2.50,
      commission: -0.65,
    }),
    makeTrade({
      execTime: '05/17/24 10:00',
      spread: 'SINGLE',
      side: 'SELL',
      qty: 1,
      posEffect: 'TO CLOSE',
      underlying: 'AAPL',
      expiration: '06/21/24',
      strike: 185,
      optionType: 'CALL',
      price: 3.00,
      commission: -0.65,
    }),
  ];

  const positions = buildPositions(trades);

  assertEqual(positions.length, 1, '1 position created');
  assertEqual(positions[0].strategy, 'Long Call', 'strategy = Long Call');
  assertEqual(positions[0].status, 'Closed', 'status = Closed');
  // openValue: 2.50 × 1 × 100 × -1 = -250  (BUY at open)
  // closeValue: 3.00 × 1 × 100 × +1 = +300  (SELL at close)
  // pnl = -250 + 300 = +50
  assertEqual(positions[0].realizedPnl, 50, 'realizedPnl = +50');
  assert(positions[0].closeDate !== null, 'closeDate is set');
  assert(positions[0].daysHeld !== null, 'daysHeld is not null');
});

// ---------------------------------------------------------------------------
// Test 2: Credit spread open + close → Bull Put Spread, pnl > 0
// ---------------------------------------------------------------------------

describe('Test 2: Bull Put Spread open + close → pnl > 0', () => {
  // Sell 5200P at 4.00, Buy 5100P at 1.00 → net credit +300/spread
  // Close: Buy 5200P at 1.50, Sell 5100P at 0.25 → net debit -125/spread
  // pnl = 300 - 125 = +175
  const openTime = '05/15/24 09:30';
  const closeTime = '05/20/24 14:00';

  const trades: RawTrade[] = [
    // Open: sell 5200P (short leg, higher strike)
    makeTrade({
      execTime: openTime,
      spread: 'VERTICAL',
      side: 'SELL',
      qty: 1,
      posEffect: 'TO OPEN',
      underlying: 'SPX',
      expiration: '05/31/24',
      strike: 5200,
      optionType: 'PUT',
      price: 4.00,
      commission: -1.30,
    }),
    // Open: buy 5100P (long leg, lower strike)
    makeTrade({
      execTime: openTime,
      spread: 'VERTICAL',
      side: 'BUY',
      qty: 1,
      posEffect: 'TO OPEN',
      underlying: 'SPX',
      expiration: '05/31/24',
      strike: 5100,
      optionType: 'PUT',
      price: 1.00,
      commission: -1.30,
    }),
    // Close: buy 5200P back
    makeTrade({
      execTime: closeTime,
      spread: 'VERTICAL',
      side: 'BUY',
      qty: 1,
      posEffect: 'TO CLOSE',
      underlying: 'SPX',
      expiration: '05/31/24',
      strike: 5200,
      optionType: 'PUT',
      price: 1.50,
      commission: -1.30,
    }),
    // Close: sell 5100P
    makeTrade({
      execTime: closeTime,
      spread: 'VERTICAL',
      side: 'SELL',
      qty: 1,
      posEffect: 'TO CLOSE',
      underlying: 'SPX',
      expiration: '05/31/24',
      strike: 5100,
      optionType: 'PUT',
      price: 0.25,
      commission: -1.30,
    }),
  ];

  const positions = buildPositions(trades);

  assertEqual(positions.length, 1, '1 position created');
  assertEqual(positions[0].strategy, 'Bull Put Spread', 'strategy = Bull Put Spread');
  assertEqual(positions[0].status, 'Closed', 'status = Closed');
  assert(positions[0].realizedPnl !== null && positions[0].realizedPnl > 0, `realizedPnl > 0 (got ${positions[0].realizedPnl})`);
  assertEqual(positions[0].realizedPnl, 175, 'realizedPnl = +175');
});

// ---------------------------------------------------------------------------
// Test 3: Expired option → status = Expired, realizedPnl = -250
// ---------------------------------------------------------------------------

describe('Test 3: Expired option → status = Expired, realizedPnl = -250', () => {
  const trades: RawTrade[] = [
    makeTrade({
      execTime: '05/15/24 09:30',
      spread: 'SINGLE',
      side: 'BUY',
      qty: 1,
      posEffect: 'TO OPEN',
      underlying: 'AAPL',
      expiration: '05/17/24',
      strike: 185,
      optionType: 'CALL',
      price: 2.50,
      commission: -0.65,
    }),
    makeTrade({
      execTime: '05/17/24 16:00',
      spread: 'SINGLE',
      side: 'SELL',
      qty: 1,
      posEffect: 'TO CLOSE (EXPIRED)',
      underlying: 'AAPL',
      expiration: '05/17/24',
      strike: 185,
      optionType: 'CALL',
      price: 0.00,
      commission: 0,
    }),
  ];

  const positions = buildPositions(trades);

  assertEqual(positions.length, 1, '1 position created');
  assertEqual(positions[0].status, 'Expired', 'status = Expired');
  // openValue: 2.50 × 1 × 100 × -1 = -250
  // closeValue: 0.00 × 1 × 100 × +1 = 0
  // pnl = -250
  assertEqual(positions[0].realizedPnl, -250, 'realizedPnl = -250');
});

// ---------------------------------------------------------------------------
// Test 4: Still open → 1 Open position, realizedPnl = null
// ---------------------------------------------------------------------------

describe('Test 4: No close trade → 1 Open position, realizedPnl = null', () => {
  const trades: RawTrade[] = [
    makeTrade({
      execTime: '05/15/24 09:30',
      spread: 'SINGLE',
      side: 'BUY',
      qty: 1,
      posEffect: 'TO OPEN',
      underlying: 'AAPL',
      expiration: '06/21/24',
      strike: 190,
      optionType: 'CALL',
      price: 1.50,
      commission: -0.65,
    }),
  ];

  const positions = buildPositions(trades);

  assertEqual(positions.length, 1, '1 position created');
  assertEqual(positions[0].status, 'Open', 'status = Open');
  assertEqual(positions[0].realizedPnl, null, 'realizedPnl = null');
  assertEqual(positions[0].closeDate, null, 'closeDate = null');
  assertEqual(positions[0].daysHeld, null, 'daysHeld = null');
});

// ---------------------------------------------------------------------------
// Test 5: Iron Condor (4-leg cluster) → strategy = Iron Condor
// ---------------------------------------------------------------------------

describe('Test 5: Iron Condor → strategy = Iron Condor', () => {
  const baseTime = '05/15/24 09:30';

  // 4 legs within 30s of each other
  const times = [
    '05/15/24 09:30',
    '05/15/24 09:30',
    '05/15/24 09:30',
    '05/15/24 09:30',
  ];

  const trades: RawTrade[] = [
    // Put spread legs
    makeTrade({ execTime: times[0], spread: 'CONDOR', side: 'SELL', qty: 1, posEffect: 'TO OPEN', underlying: 'SPX', expiration: '06/21/24', strike: 5100, optionType: 'PUT', price: 3.00, commission: -1.30 }),
    makeTrade({ execTime: times[1], spread: 'CONDOR', side: 'BUY', qty: 1, posEffect: 'TO OPEN', underlying: 'SPX', expiration: '06/21/24', strike: 5000, optionType: 'PUT', price: 1.00, commission: -1.30 }),
    // Call spread legs
    makeTrade({ execTime: times[2], spread: 'CONDOR', side: 'SELL', qty: 1, posEffect: 'TO OPEN', underlying: 'SPX', expiration: '06/21/24', strike: 5400, optionType: 'CALL', price: 2.50, commission: -1.30 }),
    makeTrade({ execTime: times[3], spread: 'CONDOR', side: 'BUY', qty: 1, posEffect: 'TO OPEN', underlying: 'SPX', expiration: '06/21/24', strike: 5500, optionType: 'CALL', price: 0.75, commission: -1.30 }),
  ];

  const positions = buildPositions(trades);

  // Should group all 4 legs into 1 position
  assertEqual(positions.length, 1, '1 Iron Condor position');
  assertEqual(positions[0].strategy, 'Iron Condor', 'strategy = Iron Condor');
  assertEqual(positions[0].status, 'Open', 'status = Open (no close)');
  assertEqual(positions[0].underlying, 'SPX', 'underlying = SPX');
});

// ---------------------------------------------------------------------------
// Test 6: Section 1256 underlying → isSection1256 = true
// ---------------------------------------------------------------------------

describe('Test 6: SPX → isSection1256 = true, AAPL → false', () => {
  const spxTrade = makeTrade({ underlying: 'SPX', spread: 'SINGLE', side: 'SELL', posEffect: 'TO OPEN' });
  const aaplTrade = makeTrade({ underlying: 'AAPL', spread: 'SINGLE', side: 'SELL', posEffect: 'TO OPEN', execTime: '05/15/24 10:00' });

  const positions = buildPositions([spxTrade, aaplTrade]);

  const spxPos = positions.find((p) => p.underlying === 'SPX');
  const aaplPos = positions.find((p) => p.underlying === 'AAPL');

  assert(spxPos !== undefined, 'SPX position exists');
  assert(aaplPos !== undefined, 'AAPL position exists');
  assertEqual(spxPos!.isSection1256, true, 'SPX → isSection1256 = true');
  assertEqual(aaplPos!.isSection1256, false, 'AAPL → isSection1256 = false');
});

// ---------------------------------------------------------------------------
// Test 7: Orphan close — no matching open → Closed position, no crash
// ---------------------------------------------------------------------------

describe('Test 7: Orphan close → Closed position, no crash', () => {
  const trades: RawTrade[] = [
    makeTrade({
      execTime: '05/17/24 10:00',
      spread: 'SINGLE',
      side: 'SELL',
      qty: 1,
      posEffect: 'TO CLOSE',
      underlying: 'TSLA',
      expiration: '05/31/24',
      strike: 200,
      optionType: 'CALL',
      price: 1.00,
      commission: -0.65,
    }),
  ];

  let positions: ReturnType<typeof buildPositions> | undefined;
  let error: unknown;

  try {
    positions = buildPositions(trades);
  } catch (e) {
    error = e;
  }

  assert(error === undefined, 'No crash on orphan close');
  assert(positions !== undefined && positions.length === 1, '1 orphan position created');
  assertEqual(positions![0].status, 'Closed', 'status = Closed');
  assertEqual(positions![0].underlying, 'TSLA', 'underlying = TSLA');
});

// ---------------------------------------------------------------------------
// Test 8: Strategy detector — direct unit tests
// ---------------------------------------------------------------------------

describe('Test 8: detectStrategy — SINGLE variants', () => {
  const buyCall = makeTrade({ side: 'BUY', optionType: 'CALL', posEffect: 'TO OPEN' });
  const buyPut = makeTrade({ side: 'BUY', optionType: 'PUT', posEffect: 'TO OPEN' });
  const sellCall = makeTrade({ side: 'SELL', optionType: 'CALL', posEffect: 'TO OPEN' });
  const sellPut = makeTrade({ side: 'SELL', optionType: 'PUT', posEffect: 'TO OPEN' });

  assertEqual(detectStrategy([buyCall], 'SINGLE'), 'Long Call', 'BUY CALL → Long Call');
  assertEqual(detectStrategy([buyPut], 'SINGLE'), 'Long Put', 'BUY PUT → Long Put');
  assertEqual(detectStrategy([sellCall], 'SINGLE'), 'Short Call', 'SELL CALL → Short Call');
  assertEqual(detectStrategy([sellPut], 'SINGLE'), 'Short Put', 'SELL PUT → Short Put');
});

describe('Test 8b: detectStrategy — VERTICAL variants', () => {
  // Bull Call Spread: short strike > long strike (CALL)
  const bullCallLegs = [
    makeTrade({ side: 'SELL', optionType: 'CALL', strike: 190, posEffect: 'TO OPEN' }),
    makeTrade({ side: 'BUY', optionType: 'CALL', strike: 185, posEffect: 'TO OPEN' }),
  ];
  assertEqual(detectStrategy(bullCallLegs, 'VERTICAL'), 'Bull Call Spread', 'Bull Call Spread');

  // Bear Call Spread: short strike < long strike (CALL)
  const bearCallLegs = [
    makeTrade({ side: 'SELL', optionType: 'CALL', strike: 185, posEffect: 'TO OPEN' }),
    makeTrade({ side: 'BUY', optionType: 'CALL', strike: 190, posEffect: 'TO OPEN' }),
  ];
  assertEqual(detectStrategy(bearCallLegs, 'VERTICAL'), 'Bear Call Spread', 'Bear Call Spread');

  // Bull Put Spread: short strike > long strike (PUT)
  const bullPutLegs = [
    makeTrade({ side: 'SELL', optionType: 'PUT', strike: 190, posEffect: 'TO OPEN' }),
    makeTrade({ side: 'BUY', optionType: 'PUT', strike: 185, posEffect: 'TO OPEN' }),
  ];
  assertEqual(detectStrategy(bullPutLegs, 'VERTICAL'), 'Bull Put Spread', 'Bull Put Spread');

  // Bear Put Spread: short strike < long strike (PUT)
  const bearPutLegs = [
    makeTrade({ side: 'SELL', optionType: 'PUT', strike: 185, posEffect: 'TO OPEN' }),
    makeTrade({ side: 'BUY', optionType: 'PUT', strike: 190, posEffect: 'TO OPEN' }),
  ];
  assertEqual(detectStrategy(bearPutLegs, 'VERTICAL'), 'Bear Put Spread', 'Bear Put Spread');
});

describe('Test 8c: detectStrategy — special spread types', () => {
  const leg = makeTrade({ posEffect: 'TO OPEN' });
  assertEqual(detectStrategy([leg], 'CONDOR'), 'Iron Condor', 'CONDOR → Iron Condor');
  assertEqual(detectStrategy([leg], 'BUTTERFLY'), 'Iron Butterfly', 'BUTTERFLY → Iron Butterfly');
  assertEqual(detectStrategy([leg], 'CALENDAR'), 'Calendar Spread', 'CALENDAR → Calendar Spread');
  assertEqual(detectStrategy([leg], 'DIAGONAL'), 'Custom / Multi-Leg', 'DIAGONAL → Custom / Multi-Leg');

  const buyCallLeg = makeTrade({ side: 'BUY', optionType: 'CALL', posEffect: 'TO OPEN', strike: 185 });
  const buyPutLeg = makeTrade({ side: 'BUY', optionType: 'PUT', posEffect: 'TO OPEN', strike: 185 });
  assertEqual(detectStrategy([buyCallLeg, buyPutLeg], 'STRADDLE'), 'Long Straddle', 'BUY straddle → Long Straddle');

  const sellCallLeg = makeTrade({ side: 'SELL', optionType: 'CALL', posEffect: 'TO OPEN', strike: 185 });
  const sellPutLeg = makeTrade({ side: 'SELL', optionType: 'PUT', posEffect: 'TO OPEN', strike: 185 });
  assertEqual(detectStrategy([sellCallLeg, sellPutLeg], 'STRADDLE'), 'Short Straddle', 'SELL straddle → Short Straddle');
});

// ---------------------------------------------------------------------------
// Test 9: Assigned status (AUTO posEffect)
// ---------------------------------------------------------------------------

describe('Test 9: AUTO posEffect → status = Assigned', () => {
  const trades: RawTrade[] = [
    makeTrade({
      execTime: '05/15/24 09:30',
      spread: 'COVERED',
      side: 'SELL',
      qty: 1,
      posEffect: 'TO OPEN',
      underlying: 'AAPL',
      expiration: '06/21/24',
      strike: 190,
      optionType: 'CALL',
      price: 1.50,
      commission: -0.65,
    }),
    makeTrade({
      execTime: '06/21/24 16:00',
      spread: 'COVERED',
      side: 'BUY',
      qty: 1,
      posEffect: 'AUTO',
      underlying: 'AAPL',
      expiration: '06/21/24',
      strike: 190,
      optionType: 'CALL',
      price: 0.00,
      commission: 0,
    }),
  ];

  const positions = buildPositions(trades);
  assertEqual(positions.length, 1, '1 position');
  assertEqual(positions[0].status, 'Assigned', 'status = Assigned');
});

// ---------------------------------------------------------------------------
// Test 10: Commission accumulation
// ---------------------------------------------------------------------------

describe('Test 10: Commissions are summed from all legs', () => {
  const trades: RawTrade[] = [
    makeTrade({
      execTime: '05/15/24 09:30',
      spread: 'VERTICAL',
      side: 'SELL',
      qty: 1,
      posEffect: 'TO OPEN',
      underlying: 'AAPL',
      expiration: '06/21/24',
      strike: 190,
      optionType: 'CALL',
      price: 2.00,
      commission: -0.65,
    }),
    makeTrade({
      execTime: '05/15/24 09:30',
      spread: 'VERTICAL',
      side: 'BUY',
      qty: 1,
      posEffect: 'TO OPEN',
      underlying: 'AAPL',
      expiration: '06/21/24',
      strike: 195,
      optionType: 'CALL',
      price: 1.00,
      commission: -0.65,
    }),
  ];

  const positions = buildPositions(trades);
  assertEqual(positions.length, 1, '1 position');
  // Two legs × |−0.65| = 1.30
  assert(Math.abs(positions[0].commissions - 1.30) < 0.001, `commissions ≈ 1.30, got ${positions[0].commissions}`);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
