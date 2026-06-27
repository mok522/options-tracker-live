'use server';

import { isConnected } from '@/lib/schwab/tokenManager';
import { fetchOpenOptionMarks } from '@/lib/schwab/positions';
import type { MarksMap } from '@/lib/openAnalytics';

export async function getOpenPositionMarks(): Promise<MarksMap> {
  if (!(await isConnected())) return {};
  try {
    return await fetchOpenOptionMarks();
  } catch {
    return {};
  }
}
