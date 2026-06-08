import type { RawTrade } from '@/types';

export function buildDedupKey(
  trade: Pick<RawTrade, 'execTime' | 'symbol' | 'side' | 'qty' | 'price'>
): string {
  return `${trade.execTime}|${trade.symbol}|${trade.side}|${trade.qty}|${trade.price}`;
}

export function deduplicateTrades(
  incoming: RawTrade[],
  existing: RawTrade[]
): { newTrades: RawTrade[]; skipped: number } {
  const existingKeys = new Set(existing.map((t) => t.dedupKey));
  const newTrades = incoming.filter((t) => !existingKeys.has(t.dedupKey));
  return { newTrades, skipped: incoming.length - newTrades.length };
}
