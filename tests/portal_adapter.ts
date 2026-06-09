// Stdin → stdout bridge for pytest: reads JSON array of EngTrade objects,
// runs computePnl + detectStrategy on each, writes JSON results to stdout.
// Called once per pytest session from tests/conftest.py via tsx subprocess.

import { computePnl, detectStrategy } from '../lib/pnlEngine';
import type { EngTrade } from '../lib/pnlEngine';

const chunks: Buffer[] = [];
process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
process.stdin.on('end', () => {
  const trades: EngTrade[] = JSON.parse(Buffer.concat(chunks).toString());
  const results = trades.map((t) => ({
    pnl: computePnl(t),
    strategy: detectStrategy(t),
  }));
  process.stdout.write(JSON.stringify(results));
});
