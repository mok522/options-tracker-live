import { schwabFetch } from './client';
import { resolveAccount } from './accounts';
import { positionKey, type MarksMap } from '@/lib/openAnalytics';

// Schwab account-positions shapes (subset; verified defensively — any missing
// field skips that row rather than throwing).
interface SchwabPositionInstrument {
  assetType?: string;          // "OPTION" | "EQUITY" | ...
  symbol?: string;             // OCC: "AAP   270319C00060000"
  underlyingSymbol?: string;   // "AAPL"
  putCall?: 'CALL' | 'PUT';
  strikePrice?: number;        // often absent on the positions endpoint
  expirationDate?: string;     // "2026-07-17T00:00:00+0000" — often absent here
}

/**
 * Decode the OCC option symbol Schwab returns (e.g. "AAP   270319C00060000")
 * into strike / expiry / type. The positions endpoint frequently omits
 * `strikePrice` and `expirationDate` as discrete fields, so the symbol is the
 * authoritative source. Format: 6-char root + YYMMDD + C|P + strike×1000 (8 digits).
 */
function parseOccSymbol(symbol: string): { expYMD: string; putCall: 'CALL' | 'PUT'; strike: number } | null {
  const m = /^.{6}(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/.exec(symbol);
  if (!m) return null;
  const [, yy, mm, dd, cp, strikeRaw] = m;
  return { expYMD: `20${yy}-${mm}-${dd}`, putCall: cp === 'C' ? 'CALL' : 'PUT', strike: Number(strikeRaw) / 1000 };
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

    // Prefer the discrete fields, but fall back to the OCC symbol — Schwab's
    // positions endpoint usually omits strikePrice/expirationDate.
    const occ = inst.symbol ? parseOccSymbol(inst.symbol) : null;
    const root = inst.underlyingSymbol || (inst.symbol ? inst.symbol.slice(0, 6).trim() : '');
    const putCall = inst.putCall ?? occ?.putCall ?? null;
    const strike = inst.strikePrice ?? occ?.strike ?? null;
    const expYMD = inst.expirationDate ? inst.expirationDate.slice(0, 10) : occ?.expYMD ?? null;
    if (!root || !putCall || strike == null || !expYMD) continue;

    const qty = Math.abs(p.longQuantity || 0) + Math.abs(p.shortQuantity || 0);
    if (qty === 0 || p.marketValue == null) continue;

    const isShort = (p.shortQuantity || 0) > 0;
    const mark = Math.abs(p.marketValue) / (qty * 100); // per-contract current price
    const openPl = (isShort ? p.shortOpenProfitLoss : p.longOpenProfitLoss) ?? 0;

    const key = positionKey(root, strike, expYMD, putCall, isShort);
    if (key) out[key] = { mark, openPl };
  }

  return out;
}
