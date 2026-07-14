import type { Trade } from '@/types/trade';

const DAY_MS = 86_400_000;

// Days between two "YYYY-MM-DD" dates (close − open); null when either is
// missing/unparseable. Local-midnight arithmetic, immune to DST via rounding.
export function holdingDays(openDate?: string, closeDate?: string): number | null {
  if (!openDate || openDate.length < 10 || !closeDate || closeDate.length < 10) return null;
  const [oy, om, od] = openDate.slice(0, 10).split('-').map(Number);
  const [cy, cm, cd] = closeDate.slice(0, 10).split('-').map(Number);
  if (!oy || !om || !od || !cy || !cm || !cd) return null;
  return Math.round((new Date(cy, cm - 1, cd).getTime() - new Date(oy, om - 1, od).getTime()) / DAY_MS);
}

export interface GainBuckets {
  shortTermGains: number;
  longTermGains: number;
}

/**
 * Split realized GAINS (losses excluded — matches the existing short-term
 * calc) into short vs long term. Long-term = equity round trips held more
 * than 365 days with a known open date; everything else (options, unknown
 * basis) is short-term. Callers pass non-§1256 closed trades.
 */
export function splitGains(closedNonS1256: Trade[]): GainBuckets {
  let st = 0;
  let lt = 0;
  for (const t of closedNonS1256) {
    if (t.pl <= 0) continue;
    const days = (t.assetType ?? 'OPTION') === 'EQUITY' ? holdingDays(t.openDate, t.date) : null;
    if (days != null && days > 365) lt += t.pl;
    else st += t.pl;
  }
  return {
    shortTermGains: Math.round(st * 100) / 100,
    longTermGains: Math.round(lt * 100) / 100,
  };
}
