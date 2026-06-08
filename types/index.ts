export interface RawTrade {
  execTime: string;          // "05/15/24 09:30" — used as dedup anchor
  spread: string;            // TOS "Spread" field: SINGLE | VERTICAL | CONDOR | COVERED | …
  side: 'BUY' | 'SELL';
  qty: number;
  posEffect: 'TO OPEN' | 'TO CLOSE' | 'TO CLOSE (EXPIRED)' | 'AUTO';
  symbol: string;            // full OCC symbol or underlying
  underlying: string;        // normalized: "AAPL", "SPX"
  expiration: string;        // "05/17/24"
  strike: number;
  optionType: 'CALL' | 'PUT' | 'STOCK' | 'FUTURE';
  price: number;             // per-contract fill price
  netPrice: number;          // price ± commission per contract
  commission: number;        // negative
  dedupKey: string;          // computed: `${execTime}|${symbol}|${side}|${qty}|${price}`
}

export type StrategyType =
  | 'Long Call'
  | 'Long Put'
  | 'Short Call'
  | 'Short Put'
  | 'Covered Call'
  | 'Cash-Secured Put'
  | 'Bull Call Spread'
  | 'Bear Call Spread'
  | 'Bull Put Spread'
  | 'Bear Put Spread'
  | 'Iron Condor'
  | 'Iron Butterfly'
  | 'Long Straddle'
  | 'Short Straddle'
  | 'Long Strangle'
  | 'Short Strangle'
  | 'Calendar Spread'
  | 'Diagonal Spread'
  | 'Custom / Multi-Leg';

export type PositionStatus = 'Open' | 'Closed' | 'Expired' | 'Assigned';

export interface Position {
  id: string;                // stable hash of position
  underlying: string;        // "AAPL", "SPX"
  strategy: StrategyType;
  status: PositionStatus;
  openDate: Date;
  closeDate: Date | null;
  expiration: Date | null;   // earliest leg expiration
  qty: number;               // number of spreads/contracts
  strikes: string;           // display: "5200/5400 C" or "185 C"
  netCredit: number;         // positive = credit received at open
  realizedPnl: number | null; // null if still open
  commissions: number;       // total commissions for this position
  isSection1256: boolean;    // SPX, NDX, RUT, /ES, /NQ, /RTY etc.
  daysHeld: number | null;   // null if still open
}

export interface TaxEvent {
  positionId: string;
  underlying: string;
  strategy: StrategyType;
  closeDate: Date;
  realizedPnl: number;
  holdingPeriodDays: number;
  treatmentType: 'short-term' | 'long-term' | 'section-1256';
  ltPortion: number | null;   // §1256 only: realizedPnl * 0.6
  stPortion: number | null;   // §1256 only: realizedPnl * 0.4
  washSaleFlag: boolean;
  washSaleDisallowed: number; // amount deferred (0 if no wash sale)
}

export interface TaxSummary {
  shortTermGains: number;
  longTermGains: number;
  section1256Gains: number;
  washSaleAdjustment: number;
  estimatedTax: number;
  marginalBracketRate: number;  // e.g. 0.24
  events: TaxEvent[];
}

export interface ImportMeta {
  id: string;
  fileName: string;
  importedAt: string;        // ISO string
  rowCount: number;          // number of new trades inserted
  dedupSkipped: number;      // duplicates skipped
}

export interface ImportResult {
  inserted: number;
  skipped: number;
  warnings: string[];
}

export interface TaxSettings {
  marginalBracketRate: number;  // default 0.24
  taxYear: number;              // default current year
}
