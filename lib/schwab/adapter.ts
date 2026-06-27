import type { Trade } from '@/types/trade';

// Schwab Trader API transaction shapes (relevant fields only)
export interface SchwabInstrument {
  symbol: string;           // OCC: "AAPL  250620C00200000"
  underlyingSymbol: string; // "AAPL"
  putCall?: 'CALL' | 'PUT';
  strikePrice?: number;
  expirationDate?: string;  // "2025-06-20T00:00:00+0000"
  type: string;             // "OPTION" | "EQUITY" | etc.
}

export interface SchwabTransferItem {
  instrument: SchwabInstrument;
  amount: number;        // negative = sell (for options), positive = buy
  price: number;         // per-contract premium (e.g. 5.00 for a $5 option)
  cost?: number;
  positionEffect?: 'OPENING' | 'CLOSING' | 'AUTOMATIC' | 'AUTOMATIC_EXERCISE' | 'AUTOMATIC_ASSIGNMENT';
}

export interface SchwabTransaction {
  activityId?: number;
  time: string;          // "2025-06-15T14:30:00+0000"
  type: string;          // "TRADE" | "RECEIVE_AND_DELIVER" | etc.
  description?: string;
  netAmount: number;
  transferItems: SchwabTransferItem[];
}

const MONTH_ABBR = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

// ISO date string → "15 JAN 27" (TOS-compatible exp format used as the FIFO match key)
function fmtExp(isoDate: string): string {
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return '';
  const day = d.getUTCDate();
  const mon = MONTH_ABBR[d.getUTCMonth()];
  const yr = String(d.getUTCFullYear()).slice(2);
  return `${day} ${mon} ${yr}`;
}

// ISO datetime → "YYYY-MM-DD"
function fmtDate(isoDatetime: string): string {
  return isoDatetime.slice(0, 10);
}

// Strategy name based on opening direction + option type
function strategyName(openingSide: 'Buy' | 'Sell', optType: 'CALL' | 'PUT'): string {
  if (openingSide === 'Buy') return optType === 'CALL' ? 'Long Call' : 'Long Put';
  return optType === 'CALL' ? 'Short Call' : 'Short Put';
}

// Format strike as "200 C" or "200.5 P" — matches the buildPositions FIFO key format
function fmtStrike(strike: number, putCall: 'CALL' | 'PUT'): string {
  const n = strike % 1 === 0 ? String(strike) : strike.toFixed(2).replace(/\.?0+$/, '');
  return `${n} ${putCall === 'CALL' ? 'C' : 'P'}`;
}

export function adaptTransactions(transactions: SchwabTransaction[]): Trade[] {
  const legs: Trade[] = [];

  for (const tx of transactions) {
    if (tx.type !== 'TRADE') continue;

    for (const item of tx.transferItems) {
      const { instrument } = item;
      if (instrument.type !== 'OPTION') continue;
      if (!instrument.putCall || instrument.strikePrice == null || !instrument.expirationDate) continue;

      const qty = Math.abs(item.amount);
      if (qty === 0) continue;

      // amount < 0 → selling contracts (credit), amount > 0 → buying contracts (debit)
      const side: 'Buy' | 'Sell' = item.amount < 0 ? 'Sell' : 'Buy';

      // positionEffect: OPENING → 'Open', CLOSING/AUTOMATIC* → 'Closed'/'Expired'
      const effect = item.positionEffect ?? 'OPENING';
      let status: Trade['status'];
      if (effect === 'OPENING') {
        status = 'Open';
      } else if (effect === 'AUTOMATIC' || effect === 'AUTOMATIC_EXERCISE' || effect === 'AUTOMATIC_ASSIGNMENT') {
        status = 'Expired';
      } else {
        status = 'Closed';
      }

      const fill = Math.abs(item.price);
      const optType = instrument.putCall;
      const exp = fmtExp(instrument.expirationDate);

      // Commission: gross dollar value vs net amount received/paid
      // Sell: gross = +fill * qty * 100; netAmount is positive; commission is negative delta
      // Buy:  gross = -fill * qty * 100; netAmount is negative; commission is negative delta
      const grossSigned = side === 'Sell' ? fill * qty * 100 : -(fill * qty * 100);
      const totalComm = tx.netAmount - grossSigned; // always ≤ 0 (a cost)
      const commPerContract = qty > 0 ? totalComm / qty : 0;

      // Opening side used for strategy naming (closing legs invert)
      const openingSide: 'Buy' | 'Sell' = status === 'Open' ? side : side === 'Buy' ? 'Sell' : 'Buy';
      const strat = strategyName(openingSide, optType);

      legs.push({
        sym: instrument.underlyingSymbol.toUpperCase(),
        strat,
        side,
        qty,
        strike: fmtStrike(instrument.strikePrice, optType),
        exp,
        fill,
        optType,
        comm: commPerContract !== 0 ? commPerContract : null,
        pl: 0,
        status,
        date: fmtDate(tx.time),
      });
    }
  }

  return legs;
}
