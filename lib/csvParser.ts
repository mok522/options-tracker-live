import type { Trade } from '@/types/trade';

const S1256_SYMS = ['SPX', 'NDX', 'RUT', 'SPXW', 'XSP', 'VIX'];

const FIELD_SYNS: Record<string, string[]> = {
  ExecTime: ['exec time', 'execution time'],
  Symbol:   ['symbol', 'underlying', 'ticker', 'instrument'],
  Strategy: ['strategy', 'spread', 'description', 'strat'],
  Side:     ['side', 'action', 'buy/sell', 'b/s'],
  Qty:      ['qty', 'quantity', 'contracts'],
  Strike:   ['strike', 'strikes'],
  OptType:  ['type', 'call/put', 'put/call', 'c/p', 'option type'],
  Exp:      ['exp', 'expiration', 'expiry', 'exp date', 'expdate'],
  Fill:     ['fill', 'fill price', 'price', 'net price', 'trade price', 'avg price'],
  'P&L':    ['p/l', 'pnl', 'p&l', 'realized p/l', 'realized', 'gain/loss', 'profit', 'net p/l'],
  Comm:     ['commission', 'comm', 'fees', 'commissions & fees', 'fees & comm'],
  Status:   ['status', 'state', 'pos effect'],
};

function detectDelimiter(text: string): string {
  const sample = text.slice(0, 2000);
  const tabs = (sample.match(/\t/g) || []).length;
  const commas = (sample.match(/,/g) || []).length;
  return tabs > commas ? '\t' : ',';
}

function parseCSV(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cur = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === delimiter) { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); rows.push(row); row = []; cur = '';
      }
      else cur += ch;
    }
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function mapHeaders(headers: string[]): Record<string, number> {
  const norm = headers.map((h) => h.trim().toLowerCase());
  const map: Record<string, number> = {};
  Object.keys(FIELD_SYNS).forEach((field) => {
    let idx = -1;
    for (const syn of FIELD_SYNS[field]) {
      idx = norm.findIndex((h) => h === syn);
      if (idx === -1) idx = norm.findIndex((h) => h.includes(syn));
      if (idx !== -1) break;
    }
    map[field] = idx;
  });
  return map;
}

// Score each row by how many FIELD_SYNS synonyms it contains.
// >= ensures the LAST best-scoring row wins (Account Trade History beats
// Account Order History since it appears later in the TOS file).
function findBestHeaderRow(rows: string[][]): number {
  const allSyns = Object.values(FIELD_SYNS).flat();
  let bestScore = 0, bestIdx = 0;
  rows.forEach((row, i) => {
    const norm = row.map((c) => c.trim().toLowerCase());
    const score = allSyns.filter((syn) => norm.some((h) => h === syn || h.includes(syn))).length;
    if (score >= bestScore) { bestScore = score; bestIdx = i; }
  });
  return bestScore >= 3 ? bestIdx : 0;
}

function parseStatus(raw: string): Trade['status'] {
  const v = raw.toLowerCase();
  if (v.includes('open'))   return 'Open';
  if (v.includes('close'))  return 'Closed';
  if (v.includes('expire')) return 'Expired';
  if (v.includes('assign')) return 'Assigned';
  return 'Open';
}

const MONTHS: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

// Parse TOS exec time "M/D/YY HH:MM:SS" → ISO date "YYYY-MM-DD".
function parseExecDate(raw: string): string {
  if (!raw || !raw.trim()) return '';
  const datePart = raw.trim().split(' ')[0];
  const parts = datePart.split('/');
  if (parts.length < 3) return '';
  const month = parts[0].padStart(2, '0');
  const day   = parts[1].padStart(2, '0');
  const yrRaw = parseInt(parts[2], 10);
  const year  = yrRaw < 100 ? 2000 + yrRaw : yrRaw;
  return `${year}-${month}-${day}`;
}

// Parse TOS expiration format "15 JAN 27" → Date object.
function parseExpDate(exp: string): Date | null {
  const parts = exp.trim().split(/\s+/);
  if (parts.length < 3) return null;
  const day = parseInt(parts[0]);
  const mon = MONTHS[parts[1].toUpperCase()];
  const yr = 2000 + parseInt(parts[2]);
  if (isNaN(day) || mon === undefined || isNaN(yr)) return null;
  return new Date(yr, mon, day);
}

// Single-leg directional strategy from the position's OPENING side + option type.
// Returns null when the option type is unknown (caller falls back to CSV label).
function classifySingle(openingSide: 'Buy' | 'Sell', optType: string): string | null {
  const isCall = optType === 'CALL';
  const isPut = optType === 'PUT';
  if (!isCall && !isPut) return null;
  if (openingSide === 'Buy') return isCall ? 'Long Call' : 'Long Put';
  return isCall ? 'Short Call' : 'Short Put';
}

function rowsToTrades(dataRows: string[][], map: Record<string, number>): Trade[] {
  const num = (v: string) => { const n = parseFloat(String(v).replace(/[$,+\s]/g, '')); return isNaN(n) ? 0 : n; };
  return dataRows.map((r) => {
    const get = (f: string) => (map[f] != null && map[f] !== -1 ? (r[map[f]] ?? '') : '');
    const side: 'Buy' | 'Sell' = (get('Side') || 'Sell').trim().toLowerCase().startsWith('b') ? 'Buy' : 'Sell';
    const status = parseStatus(get('Status'));
    const rawType = get('OptType').trim().toUpperCase();
    const optType = rawType.startsWith('C') ? 'CALL' : rawType.startsWith('P') ? 'PUT' : '';
    // The displayed strategy is per-position directional. For a closing leg the
    // row's side is the close side, so invert it to recover the opening direction.
    const openingSide: 'Buy' | 'Sell' = status === 'Open' ? side : side === 'Buy' ? 'Sell' : 'Buy';
    const csvStrat = (get('Strategy') || '').trim() || '—';
    return {
      sym:    (get('Symbol') || '').trim().toUpperCase(),
      strat:  classifySingle(openingSide, optType) ?? csvStrat,
      side,
      qty:    Math.abs(num(get('Qty'))) || 1,
      strike: (get('Strike') || '').trim(),
      optType,
      exp:    (get('Exp') || '').trim(),
      fill:   num(get('Fill')),
      comm:   map['Comm'] !== -1 ? num(get('Comm')) : null,
      pl:     num(get('P&L')),
      status,
      date:   parseExecDate(get('ExecTime')),
    };
  }).filter((t) => t.sym && /^[A-Z]{1,6}$/.test(t.sym) && t.exp);
}

function buildId(t: Trade): string {
  return btoa(`${t.exp}|${t.sym}|${t.fill}|${t.qty}`).replace(/=/g, '');
}

// Match opening and closing legs into round trips and compute realized P&L.
// Used when the CSV has no P&L column (TOS Account Trade History format).
// Input MUST be oldest-first so FIFO matching is correct; callers order the legs.
function buildPositions(ordered: Trade[]): Trade[] {
  const today = new Date();
  const openQueues = new Map<string, Trade[]>();
  const results: Trade[] = [];

  // Monotonic per-run sequence so every emitted row gets a unique id even when
  // two lots share identical fills. The trades-table insert is onConflictDoNothing,
  // so colliding ids would silently drop a lot (qty loss). Input order is
  // deterministic (callers sort), so these ids stay stable across re-syncs.
  let seq = 0;
  const uid = (...parts: Array<string | number>) => btoa(parts.join('|') + `|#${seq++}`).replace(/=/g, '');

  for (const leg of ordered) {
    const key = `${leg.sym}|${leg.exp}|${leg.strike}|${leg.optType ?? ''}`;

    if (leg.status === 'Open') {
      const q = openQueues.get(key) ?? [];
      q.push(leg);
      openQueues.set(key, q);
    } else {
      // Closing leg — match FIFO against the earliest opens for this option.
      // A single close can cover MULTIPLE smaller opens (e.g. two 1-lot opens
      // closed by one 2-lot order), so consume opens until the close qty is
      // exhausted, emitting one round trip per opening lot (distinct cost basis).
      const q = openQueues.get(key) ?? [];
      let remaining = leg.qty;
      while (remaining > 0 && q.length > 0) {
        const open = q.shift()!;
        const contracts = Math.min(open.qty, remaining);
        const isBuyOpen = open.side === 'Buy';
        const pl = Math.round((isBuyOpen ? leg.fill - open.fill : open.fill - leg.fill) * contracts * 100 * 100) / 100;
        results.push({
          ...open,
          qty: contracts,
          pl,
          // Assignment closes keep their status so the UI can distinguish
          // "assigned away" from an ordinary buy-to-close.
          status: leg.status === 'Assigned' ? 'Assigned' : 'Closed',
          date: leg.date || open.date || '',
          // Unique ID per round trip: both fill prices + a per-run sequence so
          // same-fill lots closed together don't collide.
          id: uid(open.exp, open.sym, open.fill, leg.fill, contracts),
        });
        // If this open had more contracts than the close consumed, push the
        // remainder back to the front for the next close to match.
        if (open.qty > contracts) {
          q.unshift({ ...open, qty: open.qty - contracts });
        }
        remaining -= contracts;
      }
      openQueues.set(key, q);
      if (remaining > 0) {
        // Close qty exceeded all available opens — the remainder was opened
        // before the statement period (orphaned close, no cost basis).
        results.push({ ...leg, qty: remaining, pl: 0, id: uid(leg.exp, leg.sym, leg.fill, remaining, 'orphan') });
      }
    }
  }

  // Remaining unmatched opens: mark Expired if the expiry date has passed.
  // For expired positions compute the premium outcome: short keeps premium (profit),
  // long loses premium (loss). Open positions have unrealized P&L = 0.
  for (const q of openQueues.values()) {
    for (const leg of q) {
      const expDate = parseExpDate(leg.exp);
      const expired = expDate != null && expDate < today;
      const pl = expired
        ? Math.round((leg.side === 'Sell' ? leg.fill : -leg.fill) * leg.qty * 100 * 100) / 100
        : 0;
      // Expired: use the actual expiration date as the realization date
      let date = leg.date || '';
      if (expired && expDate) {
        const m = String(expDate.getMonth() + 1).padStart(2, '0');
        const d = String(expDate.getDate()).padStart(2, '0');
        date = `${expDate.getFullYear()}-${m}-${d}`;
      }
      results.push({
        ...leg,
        pl,
        status: expired ? 'Expired' : 'Open',
        date,
        id: uid(leg.exp, leg.sym, leg.fill, leg.qty, expired ? 'Expired' : 'Open'),
      });
    }
  }

  return results;
}

export interface ParseResult {
  headers: string[];
  map: Record<string, number>;
  trades: Trade[];
  // Raw per-execution legs (before round-trip matching) + whether this file
  // carried a realized-P&L column. These are persisted so positions can be
  // recomputed across multiple imported files.
  legs: Trade[];
  hasPnl: boolean;
}

// Compute the displayed Trade[] from a single file's legs.
// P&L column present → trust the CSV's per-row values. Absent → FIFO-match
// legs (newest-first from TOS) into round trips.
function computeFromFile(legs: Trade[], hasPnl: boolean): Trade[] {
  return hasPnl
    ? legs.map((t) => ({ ...t, id: buildId(t) }))
    : buildPositions([...legs].reverse());
}

export function parseTradeCSV(text: string): ParseResult {
  const delimiter = detectDelimiter(text);
  const rows = parseCSV(text, delimiter);
  if (rows.length < 2) return { headers: [], map: {}, trades: [], legs: [], hasPnl: false };
  const headerIdx = findBestHeaderRow(rows);
  const headers = rows[headerIdx];
  const map = mapHeaders(headers);
  const legs = rowsToTrades(rows.slice(headerIdx + 1), map);
  const hasPnl = map['P&L'] !== -1;

  return { headers, map, trades: computeFromFile(legs, hasPnl), legs, hasPnl };
}

// A raw execution leg tagged with the parsing mode of the file it came from.
export interface PersistedLeg extends Trade {
  hasPnl: boolean;
}

// Stable identity for a raw leg, used to dedupe across re-imports / overlapping
// date ranges. Date is day-level (TOS exec time-of-day is dropped on parse).
export function legKey(t: Trade): string {
  return [t.date ?? '', t.sym, t.exp, t.strike, t.optType ?? '', t.side, t.qty, t.fill, t.status].join('|');
}

// Recompute every position from the UNION of all persisted legs. This is what
// lets a trade that opens in one file and closes in another match correctly:
// both legs live in the union, so FIFO pairing resolves the real P&L.
export function recomputePositions(legs: PersistedLeg[]): Trade[] {
  const out: Trade[] = [];

  // P&L-column files: rows are already realized — trust them, dedupe by id.
  const pnlLegs = legs.filter((l) => l.hasPnl);
  out.push(...pnlLegs.map((t) => ({ ...t, id: buildId(t) })));

  // Trade-history files: FIFO-match the union oldest-first. On the same day,
  // opens are processed before closes so a same-day round trip pairs correctly.
  const matchLegs = legs.filter((l) => !l.hasPnl);
  if (matchLegs.length) {
    const ordered = [...matchLegs].sort((a, b) => {
      const d = (a.date ?? '').localeCompare(b.date ?? '');
      if (d !== 0) return d;
      return (a.status === 'Open' ? 0 : 1) - (b.status === 'Open' ? 0 : 1);
    });
    out.push(...buildPositions(ordered));
  }

  return out;
}

export function deduplicateTrades(incoming: Trade[], existing: Trade[]): { added: Trade[]; skipped: number } {
  const existingIds = new Set(existing.map((t) => t.id).filter(Boolean));
  const added = incoming.filter((t) => !existingIds.has(t.id));
  return { added, skipped: incoming.length - added.length };
}

export function buildSampleCSV(trades: Trade[]): string {
  const commOf = (t: Trade) => (t.comm != null ? t.comm : -(Math.round((t.qty * 0.66) * 100) / 100));
  const head = 'Symbol,Strategy,Side,Qty,Strike,Exp,Fill Price,Commission,Realized P/L,Status';
  const lines = trades.map((t) =>
    [t.sym, t.strat, t.side, t.qty, t.strike, t.exp, t.fill.toFixed(2), commOf(t).toFixed(2), t.pl, t.status].join(',')
  );
  return head + '\n' + lines.join('\n');
}

export { S1256_SYMS };
