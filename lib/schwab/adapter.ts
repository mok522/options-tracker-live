import type { Trade } from '@/types/trade';

// Schwab Trader API transaction shapes (verified against live responses).
export interface SchwabInstrument {
  assetType: string;         // "OPTION" | "CURRENCY" | "EQUITY" | ... (NOT `type`)
  symbol: string;            // OCC: "TEM   270319C00050000"
  underlyingSymbol?: string; // "TEM"
  putCall?: 'CALL' | 'PUT';
  strikePrice?: number;
  expirationDate?: string;   // "2027-03-19T04:00:00+0000"
}

export interface SchwabTransferItem {
  instrument: SchwabInstrument;
  amount: number;        // options: signed contracts (neg = sell). currency: fee magnitude
  price?: number;        // per-contract premium (option legs only)
  cost?: number;         // signed dollar amount; fee items carry the (negative) charge
  feeType?: string;      // present on CURRENCY fee rows: COMMISSION | SEC_FEE | OPT_REG_FEE | TAF_FEE
  positionEffect?: 'OPENING' | 'CLOSING' | 'AUTOMATIC' | 'AUTOMATIC_EXERCISE' | 'AUTOMATIC_ASSIGNMENT';
}

export interface SchwabTransaction {
  activityId?: number;
  time: string;          // "2026-06-26T17:53:21+0000"
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
    // Assignments don't arrive as TRADE — Schwab books them as a
    // RECEIVE_AND_DELIVER ("Removed due to Assignment CALL ... $110 EXP ...")
    // that removes the option at $0, plus a separate TRADE for the shares.
    const isAssignment =
      tx.type === 'RECEIVE_AND_DELIVER' && /assignment/i.test(tx.description ?? '');
    if (tx.type !== 'TRADE' && !isAssignment) continue;

    const items = tx.transferItems ?? [];

    // Option legs in this order/transaction.
    const optionItems = items.filter(
      (i) =>
        i.instrument?.assetType === 'OPTION' &&
        i.instrument.putCall &&
        i.instrument.strikePrice != null &&
        i.instrument.expirationDate &&
        i.instrument.underlyingSymbol
    );
    // Share legs — ordinary stock trades AND assignment share sales (Schwab
    // books those as plain equity TRADEs). Only from TRADE transactions:
    // RECEIVE_AND_DELIVER equity items are transfers, not trades.
    const equityItems = tx.type === 'TRADE'
      ? items.filter((i) => i.instrument?.assetType === 'EQUITY' && i.instrument.symbol)
      : [];
    if (optionItems.length === 0 && equityItems.length === 0) continue;

    // Fees/commission are separate CURRENCY line items (COMMISSION, SEC_FEE,
    // OPT_REG_FEE, TAF_FEE) carrying a negative `cost`. Total them for the
    // whole order, then allocate to each leg by its share of contracts.
    const totalFees = items
      .filter((i) => i.instrument?.assetType === 'CURRENCY')
      .reduce((s, i) => s + (i.cost ?? 0), 0);
    // Fee pool is shared pro-rata across every unit in the order
    // (option contracts + shares — mixed orders are rare and small).
    const totalUnits =
      optionItems.reduce((s, i) => s + Math.abs(i.amount), 0) +
      equityItems.reduce((s, i) => s + Math.abs(i.amount), 0);

    for (const item of optionItems) {
      const inst = item.instrument;
      const qty = Math.abs(item.amount);
      if (qty === 0) continue;

      // amount < 0 → selling contracts (credit), amount > 0 → buying contracts (debit)
      const side: 'Buy' | 'Sell' = item.amount < 0 ? 'Sell' : 'Buy';

      // positionEffect: OPENING → 'Open', CLOSING → 'Closed', AUTOMATIC* → 'Expired';
      // assignment removals (option taken away at $0) → 'Assigned'.
      const effect = item.positionEffect ?? 'OPENING';
      let status: Trade['status'];
      if (isAssignment) {
        status = 'Assigned';
      } else if (effect === 'OPENING') {
        status = 'Open';
      } else if (effect.startsWith('AUTOMATIC')) {
        status = 'Expired';
      } else {
        status = 'Closed';
      }

      const fill = Math.abs(item.price ?? 0);
      const optType = inst.putCall!;
      const exp = fmtExp(inst.expirationDate!);

      // Leg-total commission (negative = charge), this leg's share of order fees.
      const legComm = totalUnits > 0 ? (totalFees * qty) / totalUnits : 0;

      // Opening side used for strategy naming (closing legs invert)
      const openingSide: 'Buy' | 'Sell' = status === 'Open' ? side : side === 'Buy' ? 'Sell' : 'Buy';
      const strat = strategyName(openingSide, optType);

      legs.push({
        sym: inst.underlyingSymbol!.toUpperCase(),
        strat,
        side,
        qty,
        strike: fmtStrike(inst.strikePrice!, optType),
        exp,
        fill,
        optType,
        assetType: 'OPTION',
        comm: legComm !== 0 ? Math.round(legComm * 100) / 100 : null,
        pl: 0,
        status,
        date: fmtDate(tx.time),
      });
    }

    for (const item of equityItems) {
      const shares = Math.abs(item.amount);
      if (shares === 0) continue;

      const side: 'Buy' | 'Sell' = item.amount < 0 ? 'Sell' : 'Buy';
      const effect = item.positionEffect ?? 'OPENING';
      const status: Trade['status'] = effect === 'OPENING' ? 'Open' : 'Closed';
      const legComm = totalUnits > 0 ? (totalFees * shares) / totalUnits : 0;

      legs.push({
        sym: item.instrument.symbol.toUpperCase(),
        strat: 'Stock',
        side,
        qty: shares,
        strike: '',
        exp: '',
        fill: Math.abs(item.price ?? 0),
        optType: '',
        assetType: 'EQUITY',
        comm: legComm !== 0 ? Math.round(legComm * 100) / 100 : null,
        pl: 0,
        status,
        date: fmtDate(tx.time),
      });
    }
  }

  return legs;
}
