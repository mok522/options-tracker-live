import Papa from 'papaparse';
import type { RawTrade } from '@/types';
import { buildDedupKey } from './deduplicator';

export interface ParseResult {
  trades: RawTrade[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Header synonym map
// Maps every known TOS column header variant → canonical RawTrade field name
// ---------------------------------------------------------------------------
type FieldKey =
  | 'execTime'
  | 'spread'
  | 'side'
  | 'qty'
  | 'posEffect'
  | 'symbol'
  | 'expiration'
  | 'strike'
  | 'optionType'
  | 'price'
  | 'netPrice'
  | '_ignore';

const HEADER_SYNONYMS: Record<string, FieldKey> = {
  'exec time': 'execTime',
  time: 'execTime',
  'date/time': 'execTime',

  spread: 'spread',
  'spread type': 'spread',
  strategy: 'spread',

  side: 'side',
  action: 'side',
  'buy/sell': 'side',

  qty: 'qty',
  quantity: 'qty',
  contracts: 'qty',

  'pos effect': 'posEffect',
  'position effect': 'posEffect',
  'open/close': 'posEffect',

  symbol: 'symbol',
  instrument: 'symbol',
  description: 'symbol',

  exp: 'expiration',
  expiration: 'expiration',
  expiry: 'expiration',
  'expiration date': 'expiration',

  strike: 'strike',
  'strike price': 'strike',

  type: 'optionType',
  'option type': 'optionType',
  'put/call': 'optionType',

  price: 'price',
  'fill price': 'price',
  'avg price': 'price',

  'net price': 'netPrice',
  'net fill': 'netPrice',
  'commission net price': 'netPrice',

  'order type': '_ignore',
};

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

/** Extract the underlying ticker from a full OCC symbol or plain symbol. */
function normalizeUnderlying(symbol: string): string {
  if (!symbol) return '';

  // OCC-style symbols: optional leading dot, then ticker letters, then 6-digit date + C/P + 8-digit strike
  // e.g. ".AAPL240517C00185000" or "AAPL240517C00185000"
  const occMatch = symbol.match(/^\.?([A-Z]+)\d{6}[CP]\d+$/i);
  if (occMatch) return occMatch[1].toUpperCase();

  // Futures: starts with "/"
  if (symbol.startsWith('/')) return symbol;

  return symbol.toUpperCase();
}

function normalizeSide(raw: string): 'BUY' | 'SELL' | null {
  const v = raw.trim().toUpperCase();
  if (v === 'BUY' || v === 'BUY +' || v === 'BOT') return 'BUY';
  if (v === 'SELL' || v === 'SELL -' || v === 'SLD') return 'SELL';
  return null;
}

function normalizePosEffect(
  raw: string
): { value: RawTrade['posEffect']; warn: string | null } {
  const v = raw.trim().toUpperCase();
  if (v === 'TO OPEN') return { value: 'TO OPEN', warn: null };
  if (v === 'TO CLOSE') return { value: 'TO CLOSE', warn: null };
  if (v === 'TO CLOSE (EXPIRED)') return { value: 'TO CLOSE (EXPIRED)', warn: null };
  if (v === 'AUTOMATIC' || v === 'AUTO') return { value: 'AUTO', warn: null };
  return {
    value: 'TO OPEN',
    warn: `Unknown posEffect "${raw}" — defaulting to TO OPEN`,
  };
}

function normalizeOptionType(
  raw: string,
  symbol: string,
  expiration: string
): RawTrade['optionType'] {
  const v = raw.trim().toUpperCase();
  if (v === 'CALL' || v === 'C') return 'CALL';
  if (v === 'PUT' || v === 'P') return 'PUT';
  if (v === 'STOCK' || v === 'EQUITY') return 'STOCK';
  if (symbol.startsWith('/')) return 'FUTURE';
  // Empty type with no expiration → stock
  if (!expiration || expiration.trim() === '') return 'STOCK';
  return 'CALL'; // fallback — caller can warn separately
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export function parseTOS(csvText: string): ParseResult {
  const warnings: string[] = [];
  const trades: RawTrade[] = [];

  // Parse the entire CSV without headers so we can handle multi-section files
  const result = Papa.parse<string[]>(csvText, {
    header: false,
    skipEmptyLines: false, // we need to track blank rows for section boundaries
  });

  const rows: string[][] = result.data as string[][];

  for (const err of result.errors) {
    warnings.push(`CSV parse error at row ${err.row ?? '?'}: ${err.message}`);
  }

  // ------------------------------------------------------------------
  // 1. Locate the "Account Trade History" section
  // ------------------------------------------------------------------
  let sectionStart = -1;
  for (let i = 0; i < rows.length; i++) {
    const firstCell = (rows[i][0] ?? '').trim();
    if (firstCell === 'Account Trade History') {
      sectionStart = i;
      break;
    }
  }

  if (sectionStart === -1) {
    warnings.push('Could not find "Account Trade History" section in CSV.');
    return { trades, warnings };
  }

  // ------------------------------------------------------------------
  // 2. Find the header row (first non-blank row after the section title)
  // ------------------------------------------------------------------
  function isBlankRow(row: string[]): boolean {
    return row.every((cell) => cell.trim() === '');
  }

  let headerRowIndex = -1;
  for (let i = sectionStart + 1; i < rows.length; i++) {
    if (!isBlankRow(rows[i])) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    warnings.push('Could not find column headers in "Account Trade History" section.');
    return { trades, warnings };
  }

  // ------------------------------------------------------------------
  // 3. Build the column→field mapping from the header row
  // ------------------------------------------------------------------
  const headerRow = rows[headerRowIndex];
  const columnMap: Array<FieldKey | null> = headerRow.map((h) => {
    const key = h.trim().toLowerCase();
    return HEADER_SYNONYMS[key] ?? null;
  });

  // ------------------------------------------------------------------
  // 4. Parse data rows until the next blank row
  // ------------------------------------------------------------------
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];

    if (isBlankRow(row)) break; // end of section

    // Build a loose record from the column map
    const rec: Partial<Record<FieldKey, string>> = {};
    for (let col = 0; col < columnMap.length; col++) {
      const field = columnMap[col];
      if (field && field !== '_ignore') {
        rec[field] = (row[col] ?? '').trim();
      }
    }

    const rowLabel = `Row ${i + 1} (execTime="${rec.execTime ?? ''}")`;

    // ------------------------------------------------------------------
    // Validate required fields
    // ------------------------------------------------------------------
    if (!rec.symbol || rec.symbol === '') {
      warnings.push(`${rowLabel}: missing symbol — row skipped.`);
      continue;
    }
    if (!rec.execTime || rec.execTime === '') {
      warnings.push(`${rowLabel}: missing execTime — row skipped.`);
      continue;
    }

    // ------------------------------------------------------------------
    // Normalise side
    // ------------------------------------------------------------------
    const side = normalizeSide(rec.side ?? '');
    if (side === null) {
      warnings.push(`${rowLabel}: unrecognised side "${rec.side}" — row skipped.`);
      continue;
    }

    // ------------------------------------------------------------------
    // Normalise posEffect
    // ------------------------------------------------------------------
    const { value: posEffect, warn: posWarn } = normalizePosEffect(rec.posEffect ?? '');
    if (posWarn) warnings.push(`${rowLabel}: ${posWarn}`);

    // ------------------------------------------------------------------
    // Numeric fields
    // ------------------------------------------------------------------
    const qty = parseFloat(rec.qty ?? '');
    if (isNaN(qty)) {
      warnings.push(`${rowLabel}: invalid qty "${rec.qty}" — row skipped.`);
      continue;
    }

    const price = parseFloat(rec.price ?? '');
    if (isNaN(price)) {
      warnings.push(`${rowLabel}: invalid price "${rec.price}" — row skipped.`);
      continue;
    }

    const netPrice = parseFloat(rec.netPrice ?? '');
    const strike = parseFloat(rec.strike ?? '');

    // ------------------------------------------------------------------
    // Underlying / optionType
    // ------------------------------------------------------------------
    const symbol = rec.symbol;
    const expiration = rec.expiration ?? '';
    const underlying = normalizeUnderlying(symbol);
    const optionType = normalizeOptionType(rec.optionType ?? '', symbol, expiration);

    // commission = netPrice - price  (negative when commission charged)
    // If netPrice is missing, fall back to 0 commission
    const commission = isNaN(netPrice) ? 0 : netPrice - price;

    const trade: RawTrade = {
      execTime: rec.execTime,
      spread: rec.spread ?? '',
      side,
      qty,
      posEffect,
      symbol,
      underlying,
      expiration,
      strike: isNaN(strike) ? 0 : strike,
      optionType,
      price,
      netPrice: isNaN(netPrice) ? price : netPrice,
      commission,
      dedupKey: buildDedupKey({ execTime: rec.execTime, symbol, side, qty, price }),
    };

    trades.push(trade);
  }

  return { trades, warnings };
}
