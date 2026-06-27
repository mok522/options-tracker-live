import { schwabFetch } from './client';

export interface QuoteData {
  last: number;
  change: number;
  changePct: number;
}

export type QuotesMap = Record<string, QuoteData>;

export async function fetchQuotes(symbols: string[]): Promise<QuotesMap> {
  if (!symbols.length) return {};

  const res = await schwabFetch(
    `/marketdata/v1/quotes?symbols=${encodeURIComponent(symbols.join(','))}&fields=quote`
  );

  if (!res.ok) {
    console.error('Schwab quotes error:', res.status, await res.text());
    return {};
  }

  const data = await res.json();
  const out: QuotesMap = {};

  for (const sym of symbols) {
    const entry = data[sym];
    if (!entry?.quote) continue;
    const q = entry.quote;
    out[sym] = {
      last: q.lastPrice ?? q.mark ?? 0,
      change: q.netChange ?? 0,
      changePct: q.netPercentChange ?? 0,
    };
  }

  return out;
}
