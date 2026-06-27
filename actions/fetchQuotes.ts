'use server';

import { isConnected } from '@/lib/schwab/tokenManager';
import { fetchQuotes, type QuotesMap } from '@/lib/schwab/quotes';

export async function getQuotes(symbols: string[]): Promise<QuotesMap> {
  if (!(await isConnected()) || !symbols.length) return {};
  try {
    return await fetchQuotes(symbols);
  } catch {
    return {};
  }
}
