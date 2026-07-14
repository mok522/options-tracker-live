/**
 * Tests for option-assignment handling in the Schwab sync path:
 *  - adaptTransactions turns a RECEIVE_AND_DELIVER assignment removal into a
 *    $0 closing leg with status 'Assigned' (fixture mirrors a live response)
 *  - recomputePositions matches that leg FIFO against its open and keeps the
 *    'Assigned' status on the resulting round trip
 * Run with: npx tsx lib/__tests__/assignmentSync.test.ts
 */

import { adaptTransactions, type SchwabTransaction } from '../schwab/adapter.js';
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

// Mirrors the live Schwab response for "Removed due to Assignment CALL
// ROBINHOOD MKTS INC $110 EXP 07/10/26" (fields the adapter reads).
const assignmentTx: SchwabTransaction = {
  activityId: 124794484003,
  time: '2026-07-11T07:30:12+0000',
  type: 'RECEIVE_AND_DELIVER',
  description: 'Removed due to Assignment CALL ROBINHOOD MKTS INC $110 EXP 07/10/26',
  netAmount: 0,
  transferItems: [
    {
      instrument: {
        assetType: 'OPTION',
        symbol: 'HOOD  260710C00110000',
        underlyingSymbol: 'HOOD',
        putCall: 'CALL',
        strikePrice: 110,
        expirationDate: '2026-07-10T04:00:00+0000',
      },
      amount: 1,
      price: 0,
      cost: 0,
      positionEffect: 'CLOSING',
    },
  ],
};

describe('adaptTransactions: RECEIVE_AND_DELIVER assignment removal', () => {
  const legs = adaptTransactions([assignmentTx]);
  assertEqual(legs.length, 1, 'assignment produces one option leg');
  const leg = legs[0];
  assertEqual(leg.sym, 'HOOD', 'symbol from underlyingSymbol');
  assertEqual(leg.status, 'Assigned', 'status is Assigned, not Closed/Expired');
  assertEqual(leg.side, 'Buy', 'positive amount closes the short (buy side)');
  assertEqual(leg.fill, 0, 'option removed at $0');
  assertEqual(leg.strike, '110 C', 'strike formatted for FIFO key');
  assertEqual(leg.exp, '10 JUL 26', 'expiration in TOS format');
  assertEqual(leg.date, '2026-07-11', 'date from transaction time');
});

describe('adaptTransactions: non-assignment RECEIVE_AND_DELIVER is skipped', () => {
  const expiration: SchwabTransaction = {
    ...assignmentTx,
    description: 'Removed due to expiration CALL XYZ $50 EXP 07/10/26',
  };
  assertEqual(adaptTransactions([expiration]).length, 0, 'expiration removals not ingested');
});

describe('recomputePositions: assigned close keeps Assigned status + premium P&L', () => {
  const legs: PersistedLeg[] = [
    {
      sym: 'HOOD', strat: 'Short Call', side: 'Sell', qty: 1, strike: '110 C',
      exp: '10 JUL 26', fill: 2.16, optType: 'CALL', pl: 0, status: 'Open',
      date: '2026-07-01', hasPnl: false,
    },
    {
      sym: 'HOOD', strat: 'Short Call', side: 'Buy', qty: 1, strike: '110 C',
      exp: '10 JUL 26', fill: 0, optType: 'CALL', pl: 0, status: 'Assigned',
      date: '2026-07-11', hasPnl: false,
    },
  ];
  const out = recomputePositions(legs);
  assertEqual(out.length, 1, 'open + assigned close collapse to one round trip');
  assertEqual(out[0].status, 'Assigned', 'round trip keeps Assigned status');
  assertEqual(out[0].pl, 216, 'short keeps full premium: 2.16 × 1 × 100');
  assertEqual(out[0].date, '2026-07-11', 'realized on the assignment date');
});

describe('recomputePositions: ordinary close still reports Closed', () => {
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
  assertEqual(out[0].status, 'Closed', 'buy-to-close stays Closed');
  assertEqual(out[0].pl, 150, 'P&L unaffected: (2.00 − 0.50) × 100');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
