// Canonical options P&L and strategy-detection engine.
// This TypeScript spec mirrors test_options_pnl.py's compute_pnl / detect_strategy
// reference implementation exactly. Tested via tests/conftest.py (pytest subprocess adapter).

const COMMISSION_PER_CONTRACT = 0.65;
const BTC_FREE_AT_OR_BELOW = 0.05;
const MULTIPLIER = 100;

export interface EngExecution {
  side: 'BUY' | 'SELL';
  pos_effect: 'TO OPEN' | 'TO CLOSE';
  qty: number;
  price: number;
  misc_fee: number;
  date: string;
}

export interface EngLeg {
  symbol: string;
  option_type: 'CALL' | 'PUT';
  strike: number;
  expiration: string;
  executions: EngExecution[];
}

export interface EngStockResult {
  side: 'BUY' | 'SELL';
  qty: number;
  price: number;
}

export interface EngTrade {
  symbol: string;
  legs: EngLeg[];
  outcome: 'CLOSED' | 'EXPIRED' | 'ASSIGNED' | 'ROLL';
  stock_result?: EngStockResult | null;
}

export interface PnlResult {
  gross: number;
  commissions: number;
  fees: number;
  net: number;
}

function execCommission(e: EngExecution): number {
  if (e.side === 'BUY' && e.price <= BTC_FREE_AT_OR_BELOW) return 0;
  return Math.round(COMMISSION_PER_CONTRACT * e.qty * 100) / 100;
}

export function computePnl(trade: EngTrade): PnlResult {
  const execs = trade.legs.flatMap((l) => l.executions);
  let gross = 0;
  for (const e of execs) {
    const sign = e.side === 'SELL' ? 1 : -1;
    gross += sign * e.price * MULTIPLIER * e.qty;
  }
  const commissions = execs.reduce((s, e) => s + execCommission(e), 0);
  const fees = execs.reduce((s, e) => s + e.misc_fee, 0);
  return {
    gross: Math.round(gross * 100) / 100,
    commissions: Math.round(commissions * 100) / 100,
    fees: Math.round(fees * 100) / 100,
    net: Math.round((gross - commissions - fees) * 100) / 100,
  };
}

function openingDirectionIsLong(leg: EngLeg): boolean {
  const opens = leg.executions.filter((e) => e.pos_effect === 'TO OPEN');
  if (opens.length > 0) return opens[0].side === 'BUY';
  return leg.executions[0].side === 'BUY';
}

export function detectStrategy(trade: EngTrade): string {
  const { legs } = trade;

  if (legs.length === 1) {
    const leg = legs[0];
    const long = openingDirectionIsLong(leg);
    const map: Record<string, string> = {
      'CALL-true':  'Long Call',  'CALL-false': 'Short Call',
      'PUT-true':   'Long Put',   'PUT-false':  'Short Put',
    };
    return map[`${leg.option_type}-${long}`] ?? 'Unknown / Custom';
  }

  if (legs.length === 2) {
    const [a, b] = [...legs].sort((x, y) => x.strike - y.strike);
    const sameType   = a.option_type === b.option_type;
    const sameStrike = a.strike === b.strike;
    const sameExp    = a.expiration === b.expiration;
    if (sameType && sameStrike && !sameExp)  return 'Calendar Spread';
    if (sameType && !sameStrike && !sameExp) return 'Diagonal Spread';
    if (sameType && sameExp && !sameStrike)  return 'Vertical Spread';
    if (!sameType && sameExp) return sameStrike ? 'Straddle' : 'Strangle';
  }

  return 'Unknown / Custom';
}
