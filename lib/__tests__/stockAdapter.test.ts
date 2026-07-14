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
