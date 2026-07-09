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
