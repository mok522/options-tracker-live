import type { Trade } from '@/types/trade';
import type { QuotesMap } from '@/lib/schwab/quotes';

// Open-position analytics — decision support for *when to close* an open option.
// Pure functions, no side effects. Live underlying quotes are optional: every
// metric that needs them degrades to `null` (rendered as "—") when absent, so
// the deterministic time-decay / premium signals always work.

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAY_MS = 86_400_000;

function todayMidnight(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

// Parse Trade.exp — "15 JAN 27" (adapter/TOS format) or ISO "YYYY-MM-DD" — to a
// local-midnight Date. Returns null on anything unparseable.
export function parseExp(exp: string): Date | null {
  if (!exp) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(exp);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
  const m = /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2,4})$/.exec(exp.trim());
  if (!m) return null;
  const mon = MONTHS.indexOf(m[2].toUpperCase());
  if (mon < 0) return null;
  let yr = +m[3];
  if (yr < 100) yr += 2000;
  return new Date(yr, mon, +m[1]);
}

function parseOpenDate(date?: string): Date | null {
  if (!date || date.length < 10) return null;
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function daysFrom(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / DAY_MS);
}

// Numeric strike from "200 C" / "200.5 P" / "200".
function parseStrike(s: string): number | null {
  const m = /(-?\d+(?:\.\d+)?)/.exec(s ?? '');
  return m ? parseFloat(m[1]) : null;
}

function optKind(t: Trade): 'CALL' | 'PUT' | null {
  const o = (t.optType ?? '').toUpperCase();
  if (o === 'CALL' || o === 'C') return 'CALL';
  if (o === 'PUT' || o === 'P') return 'PUT';
  if (/\bC\b/.test(t.strike)) return 'CALL';
  if (/\bP\b/.test(t.strike)) return 'PUT';
  return null;
}

// Live last price for an underlying — tries the bare ticker then Schwab index
// notation ($SPX.X). Returns null (→ "—") when no quote is available.
export function resolveUnderlying(sym: string, quotes: QuotesMap): number | null {
  const q = quotes[sym] ?? quotes[`$${sym}.X`];
  return q && q.last > 0 ? q.last : null;
}

// Date → "YYYY-MM-DD" (local), for stable position-key matching.
function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Current per-contract mark for a held option, keyed for matching open legs to
// the Schwab account-positions response. Built identically on both sides.
export interface MarkData {
  mark: number;   // per-contract current price
  openPl: number; // Schwab's own open P&L for the position (fallback / cross-check)
}
export type MarksMap = Record<string, MarkData>;

// Stable key matching an open leg to its Schwab position. expYMD is the
// expiration as "YYYY-MM-DD"; strike is the numeric strike.
export function positionKey(
  sym: string,
  strike: number | null,
  expYMD: string | null,
  kind: 'CALL' | 'PUT' | null,
  isShort: boolean,
): string | null {
  if (strike == null || !expYMD || !kind) return null;
  return `${sym.toUpperCase()}|${strike}|${expYMD}|${kind}|${isShort ? 'short' : 'long'}`;
}

export type CloseSignal = 'assignment' | 'profit' | 'expiring' | 'decay' | 'manage' | 'hold' | 'unknown';

export interface OpenRow {
  trade: Trade;
  isShort: boolean;            // opening side was Sell (credit)
  kind: 'CALL' | 'PUT' | null;
  strikeNum: number | null;
  dte: number | null;          // days to expiration (today=0)
  daysHeld: number | null;     // days since opened
  premium: number;             // signed $: + credit (short), − debit (long)
  underlying: number | null;   // live last price
  itm: boolean | null;         // in-the-money (null when no quote)
  distancePct: number | null;  // signed fraction of underlying: + = OTM cushion, − = ITM depth
  mark: number | null;         // live per-contract option mark
  unrealizedPl: number | null; // gross mark-to-market P&L since open ($)
  pctCaptured: number | null;  // shorts only: fraction of collected premium captured (0..1)
  signal: CloseSignal;
  signalLabel: string;
}

function classify(isShort: boolean, dte: number | null, itm: boolean | null): { signal: CloseSignal; label: string } {
  if (dte == null) return { signal: 'unknown', label: '—' };
  if (isShort) {
    if (itm === true) return { signal: 'assignment', label: 'ITM · assignment risk' };
    if (dte <= 7) return { signal: 'decay', label: dte <= 1 ? 'Expiring · keep premium' : 'OTM · ride to expiry' };
    if (dte <= 21) return { signal: 'manage', label: '≤21 DTE · manage' };
    return { signal: 'hold', label: 'Hold' };
  }
  // long (debit)
  if (itm === true) return { signal: 'profit', label: 'ITM · take profit' };
  if (dte <= 7) return { signal: 'expiring', label: dte <= 1 ? 'Expiring · exit' : '≤7 DTE · theta risk' };
  if (dte <= 21) return { signal: 'manage', label: '≤21 DTE · decaying' };
  return { signal: 'hold', label: 'Hold' };
}

export interface OpenAnalyticsResult {
  rows: OpenRow[];
  count: number;
  netPremium: number;     // signed: credits collected − debits paid
  creditPremium: number;  // total credit at risk (short positions)
  debitPremium: number;   // total debit deployed (long positions)
  expiringCount: number;  // DTE <= 7
  itmCount: number;       // among quoted positions
  quotedCount: number;    // positions with a resolved underlying
  avgDte: number | null;
  maxDaysHeld: number | null;
  totalUnrealizedPl: number | null; // sum of mark-to-market P&L (null when no marks)
  pnlQuotedCount: number; // positions with a resolved option mark
}

export function computeOpenAnalytics(trades: Trade[], quotes: QuotesMap = {}, marks: MarksMap = {}): OpenAnalyticsResult {
  const today = todayMidnight();
  const open = trades.filter((t) => t.status === 'Open');

  const rows: OpenRow[] = open.map((t) => {
    const isShort = t.side === 'Sell';
    const kind = optKind(t);
    const strikeNum = parseStrike(t.strike);
    const expDate = parseExp(t.exp);
    const openDate = parseOpenDate(t.date);

    const dte = expDate ? daysFrom(expDate, today) : null;
    const daysHeld = openDate ? Math.max(0, daysFrom(today, openDate)) : null;

    const premiumAbs = Math.round(Math.abs(t.fill) * t.qty * 100);
    const premium = isShort ? premiumAbs : -premiumAbs;

    const underlying = resolveUnderlying(t.sym, quotes);

    // Moneyness: signed distance to strike as a fraction of the underlying.
    // + = out-of-the-money cushion, − = in-the-money depth.
    let itm: boolean | null = null;
    let distancePct: number | null = null;
    if (underlying != null && strikeNum != null && kind) {
      const otmAmount = kind === 'CALL' ? strikeNum - underlying : underlying - strikeNum;
      distancePct = otmAmount / underlying;
      itm = otmAmount < 0;
    }

    // Unrealized P&L since open (gross mark-to-market) from the live option mark.
    const expYMD = expDate ? toYMD(expDate) : null;
    const key = positionKey(t.sym, strikeNum, expYMD, kind, isShort);
    const md = key ? marks[key] : undefined;
    let mark: number | null = null;
    let unrealizedPl: number | null = null;
    let pctCaptured: number | null = null;
    if (md && md.mark >= 0) {
      mark = md.mark;
      const entry = Math.abs(t.fill);
      unrealizedPl = Math.round((isShort ? entry - mark : mark - entry) * t.qty * 100);
      if (isShort && entry > 0) pctCaptured = (entry - mark) / entry;
    }

    const { signal, label } = classify(isShort, dte, itm);

    return { trade: t, isShort, kind, strikeNum, dte, daysHeld, premium, underlying, itm, distancePct, mark, unrealizedPl, pctCaptured, signal, signalLabel: label };
  });

  // Sort by urgency: assignment risk first, then soonest expiry, then largest premium.
  const URGENCY: Record<CloseSignal, number> = { assignment: 0, expiring: 1, profit: 2, decay: 3, manage: 4, hold: 5, unknown: 6 };
  rows.sort((a, b) => {
    if (URGENCY[a.signal] !== URGENCY[b.signal]) return URGENCY[a.signal] - URGENCY[b.signal];
    const ad = a.dte ?? Infinity, bd = b.dte ?? Infinity;
    if (ad !== bd) return ad - bd;
    return Math.abs(b.premium) - Math.abs(a.premium);
  });

  const creditPremium = rows.filter((r) => r.isShort).reduce((s, r) => s + Math.abs(r.premium), 0);
  const debitPremium = rows.filter((r) => !r.isShort).reduce((s, r) => s + Math.abs(r.premium), 0);
  const dted = rows.map((r) => r.dte).filter((d): d is number => d != null);
  const held = rows.map((r) => r.daysHeld).filter((d): d is number => d != null);
  const pnls = rows.map((r) => r.unrealizedPl).filter((p): p is number => p != null);

  return {
    rows,
    count: rows.length,
    netPremium: creditPremium - debitPremium,
    creditPremium,
    debitPremium,
    expiringCount: rows.filter((r) => r.dte != null && r.dte <= 7).length,
    itmCount: rows.filter((r) => r.itm === true).length,
    quotedCount: rows.filter((r) => r.underlying != null).length,
    avgDte: dted.length ? Math.round(dted.reduce((s, d) => s + d, 0) / dted.length) : null,
    maxDaysHeld: held.length ? Math.max(...held) : null,
    totalUnrealizedPl: pnls.length ? pnls.reduce((s, p) => s + p, 0) : null,
    pnlQuotedCount: pnls.length,
  };
}
