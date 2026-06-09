import type { Trade } from '@/types/trade';

const S1256_SYMS = ['SPX', 'NDX', 'RUT', 'SPXW', 'XSP', 'VIX'];

const FIELD_SYNS: Record<string, string[]> = {
  ExecTime: ['exec time', 'execution time'],
  Symbol:   ['symbol', 'underlying', 'ticker', 'instrument'],
  Strategy: ['strategy', 'spread', 'description', 'strat', 'type'],  // spread before type
  Side:     ['side', 'action', 'buy/sell', 'b/s'],
  Qty:      ['qty', 'quantity', 'contracts'],
  Strike:   ['strike', 'strikes'],
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

function rowsToTrades(dataRows: string[][], map: Record<string, number>): Trade[] {
  const num = (v: string) => { const n = parseFloat(String(v).replace(/[$,+\s]/g, '')); return isNaN(n) ? 0 : n; };
  return dataRows.map((r) => {
    const get = (f: string) => (map[f] != null && map[f] !== -1 ? (r[map[f]] ?? '') : '');
    const side = (get('Side') || 'Sell').trim();
    return {
      sym:    (get('Symbol') || '').trim().toUpperCase(),
      strat:  (get('Strategy') || '').trim() || '—',
      side:   (side.toLowerCase().startsWith('b') ? 'Buy' : 'Sell') as 'Buy' | 'Sell',
      qty:    Math.abs(num(get('Qty'))) || 1,
      strike: (get('Strike') || '').trim(),
      exp:    (get('Exp') || '').trim(),
      fill:   num(get('Fill')),
      comm:   map['Comm'] !== -1 ? num(get('Comm')) : null,
      pl:     num(get('P&L')),
      status: parseStatus(get('Status')),
      date:   parseExecDate(get('ExecTime')),
    };
  }).filter((t) => t.sym && /^[A-Z]{1,6}$/.test(t.sym) && t.exp);
}

function buildId(t: Trade): string {
  return btoa(`${t.exp}|${t.sym}|${t.fill}|${t.qty}`).replace(/=/g, '');
}

// Match opening and closing legs into round trips and compute realized P&L.
// Used when the CSV has no P&L column (TOS Account Trade History format).
// Legs come newest-first from TOS; reverse to process oldest-first for correct FIFO.
function buildPositions(legs: Trade[]): Trade[] {
  const today = new Date();
  const ordered = [...legs].reverse();
  const openQueues = new Map<string, Trade[]>();
  const results: Trade[] = [];

  for (const leg of ordered) {
    const key = `${leg.sym}|${leg.exp}|${leg.strike}`;

    if (leg.status === 'Open') {
      const q = openQueues.get(key) ?? [];
      q.push(leg);
      openQueues.set(key, q);
    } else {
      // Closing leg — match FIFO with the earliest open for this option
      const q = openQueues.get(key) ?? [];
      if (q.length > 0) {
        const open = q.shift()!;
        const contracts = Math.min(open.qty, leg.qty);
        const isBuyOpen = open.side === 'Buy';
        const pl = Math.round((isBuyOpen ? leg.fill - open.fill : open.fill - leg.fill) * contracts * 100 * 100) / 100;
        results.push({
          ...open,
          qty: contracts,
          pl,
          status: 'Closed',
          date: leg.date || open.date || '',
          // Unique ID per round trip: combines both fill prices
          id: btoa(`${open.exp}|${open.sym}|${open.fill}|${leg.fill}|${contracts}`).replace(/=/g, ''),
        });
        // If open had more contracts than the close, push the remainder back
        if (open.qty > contracts) {
          q.unshift({ ...open, qty: open.qty - contracts });
          openQueues.set(key, q);
        }
      } else {
        // Orphaned close — position opened before the statement period
        results.push({ ...leg, pl: 0, id: buildId(leg) });
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
        id: buildId(leg),
      });
    }
  }

  return results;
}

export interface ParseResult {
  headers: string[];
  map: Record<string, number>;
  trades: Trade[];
}

export function parseTradeCSV(text: string): ParseResult {
  const delimiter = detectDelimiter(text);
  const rows = parseCSV(text, delimiter);
  if (rows.length < 2) return { headers: [], map: {}, trades: [] };
  const headerIdx = findBestHeaderRow(rows);
  const headers = rows[headerIdx];
  const map = mapHeaders(headers);
  const legs = rowsToTrades(rows.slice(headerIdx + 1), map);

  // When a P&L column is present in the CSV, use those values directly.
  // When absent (TOS Account Trade History), match legs into round trips.
  const trades = map['P&L'] !== -1
    ? legs.map((t) => ({ ...t, id: buildId(t) }))
    : buildPositions(legs);

  return { headers, map, trades };
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
