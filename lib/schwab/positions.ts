import { schwabFetch } from './client';
import { resolveAccount } from './accounts';
import { positionKey, type MarksMap } from '@/lib/openAnalytics';

// Schwab account-positions shapes (subset; verified defensively — any missing
// field skips that row rather than throwing).
interface SchwabPositionInstrument {
  assetType?: string;          // "OPTION" | "EQUITY" | ...
  underlyingSymbol?: string;   // "AAPL"
  putCall?: 'CALL' | 'PUT';
  strikePrice?: number;
  expirationDate?: string;     // "2026-07-17T00:00:00+0000"
}
interface SchwabPosition {
  instrument?: SchwabPositionInstrument;
  longQuantity?: number;
  shortQuantity?: number;
  marketValue?: number;          // signed: + long, − short
  longOpenProfitLoss?: number;
  shortOpenProfitLoss?: number;
}
interface SchwabAccountPositions {
  securitiesAccount?: { positions?: SchwabPosition[] };
}

/**
 * Current per-contract option marks for every held option, keyed to match open
 * legs (see `positionKey`). Source: GET /trader/v1/accounts/{hash}?fields=positions,
 * which returns each position's `marketValue` and instrument — so we derive the
 * mark without reconstructing OCC symbols. Marks are live only during market
 * hours; outside RTH Schwab returns the last close. Returns {} on any failure.
 */
export async function fetchOpenOptionMarks(): Promise<MarksMap> {
  const { hashValue } = await resolveAccount();
  const res = await schwabFetch(`/trader/v1/accounts/${hashValue}?fields=positions`);
  if (!res.ok) {
    console.error('Schwab positions error:', res.status, await res.text());
    return {};
  }

  const data = (await res.json()) as SchwabAccountPositions;
  const positions = data?.securitiesAccount?.positions ?? [];
  const out: MarksMap = {};

  for (const p of positions) {
    const inst = p.instrument;
    if (inst?.assetType !== 'OPTION') continue;
    if (!inst.underlyingSymbol || !inst.putCall || inst.strikePrice == null || !inst.expirationDate) continue;

    const qty = Math.abs(p.longQuantity || 0) + Math.abs(p.shortQuantity || 0);
    if (qty === 0 || p.marketValue == null) continue;

    const isShort = (p.shortQuantity || 0) > 0;
    const mark = Math.abs(p.marketValue) / (qty * 100); // per-contract current price
    const openPl = (isShort ? p.shortOpenProfitLoss : p.longOpenProfitLoss) ?? 0;
    const expYMD = inst.expirationDate.slice(0, 10);

    const key = positionKey(inst.underlyingSymbol, inst.strikePrice, expYMD, inst.putCall, isShort);
    if (key) out[key] = { mark, openPl };
  }

  return out;
}
