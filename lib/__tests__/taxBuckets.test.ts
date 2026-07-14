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
