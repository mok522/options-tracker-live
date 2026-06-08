import type { RawTrade, Position, PositionStatus, StrategyType } from '@/types';
import { detectStrategy } from './strategyDetector';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SECTION_1256_UNDERLYINGS = new Set([
  'SPX', 'SPXW', 'XSP', 'NDX', 'NDXP', 'RUT', 'VIX',
  '/ES', '/NQ', '/RTY', '/YM', '/GC', '/CL',
]);

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

/**
 * Parse TOS execTime string "MM/DD/YY HH:mm" → Date
 */
function parseExecTime(s: string): Date {
  const [datePart, timePart] = s.split(' ');
  const [mm, dd, yy] = datePart.split('/');
  const [hh, min] = (timePart ?? '00:00').split(':');
  return new Date(
    2000 + parseInt(yy, 10),
    parseInt(mm, 10) - 1,
    parseInt(dd, 10),
    parseInt(hh, 10),
    parseInt(min, 10),
  );
}

/**
 * Parse expiration "MM/DD/YY" → Date (no time component)
 */
function parseExpiration(s: string): Date | null {
  if (!s || s.trim() === '') return null;
  const parts = s.trim().split('/');
  if (parts.length !== 3) return null;
  const [mm, dd, yy] = parts;
  return new Date(2000 + parseInt(yy, 10), parseInt(mm, 10) - 1, parseInt(dd, 10));
}

/** First 14 chars of execTime: "MM/DD/YY HH:mm" (exactly the minute bucket) */
function execTimeMinute(execTime: string): string {
  return execTime.slice(0, 14);
}

// ---------------------------------------------------------------------------
// Clustering
// ---------------------------------------------------------------------------

interface Cluster {
  legs: RawTrade[];
  spread: string;
  underlying: string;
}

/**
 * Group consecutive trades into order clusters.
 * SINGLE trades each form their own cluster (one leg per order).
 * Other spreads are grouped by: same underlying + same spread + execTime within 30s.
 */
function clusterLegs(trades: RawTrade[]): Cluster[] {
  if (trades.length === 0) return [];

  const clusters: Cluster[] = [];
  let current: Cluster | null = null;
  let currentTime: Date | null = null;

  for (const trade of trades) {
    const tradeTime = parseExecTime(trade.execTime);
    const isSingle = trade.spread.toUpperCase() === 'SINGLE';

    // SINGLE trades always start a new cluster (one leg per cluster)
    if (isSingle) {
      if (current) clusters.push(current);
      clusters.push({ legs: [trade], spread: trade.spread, underlying: trade.underlying });
      current = null;
      currentTime = null;
      continue;
    }

    const sameUnderlying = current?.underlying === trade.underlying;
    const sameSpread = current?.spread.toUpperCase() === trade.spread.toUpperCase();
    const timeDeltaMs = currentTime ? Math.abs(tradeTime.getTime() - currentTime.getTime()) : Infinity;
    const within30s = timeDeltaMs <= 30_000;

    if (current && sameUnderlying && sameSpread && within30s) {
      current.legs.push(trade);
      // Don't update currentTime: we use the first leg's time as the anchor
    } else {
      if (current) clusters.push(current);
      current = { legs: [trade], spread: trade.spread, underlying: trade.underlying };
      currentTime = tradeTime;
    }
  }

  if (current) clusters.push(current);

  return clusters;
}

// ---------------------------------------------------------------------------
// Position signature
// ---------------------------------------------------------------------------

/**
 * A stable key representing the legs of an opening position.
 * Sort all opening legs' "underlying|expiration|strike|optionType" strings.
 */
function makePositionSignature(legs: RawTrade[]): string {
  const openingLegs = legs.filter((l) => l.posEffect === 'TO OPEN');
  const refLegs = openingLegs.length > 0 ? openingLegs : legs;
  const parts = refLegs.map(
    (l) => `${l.underlying}|${l.expiration}|${l.strike}|${l.optionType}`,
  );
  parts.sort();
  return parts.join(',');
}

/**
 * Closing clusters reference the same legs (but with TO CLOSE posEffect).
 * We reconstruct the signature using the same leg fields.
 */
function makeCloseSignature(legs: RawTrade[]): string {
  const parts = legs.map(
    (l) => `${l.underlying}|${l.expiration}|${l.strike}|${l.optionType}`,
  );
  parts.sort();
  return parts.join(',');
}

// ---------------------------------------------------------------------------
// P&L helpers
// ---------------------------------------------------------------------------

/** Signed value of a leg from the perspective of the trader (positive = received). */
function legValue(leg: RawTrade): number {
  return leg.price * leg.qty * 100 * (leg.side === 'SELL' ? 1 : -1);
}

function netValue(legs: RawTrade[]): number {
  return legs.reduce((sum, l) => sum + legValue(l), 0);
}

// ---------------------------------------------------------------------------
// Strikes display string
// ---------------------------------------------------------------------------

function buildStrikes(legs: RawTrade[], strategy: StrategyType): string {
  const optionLegs = legs.filter(
    (l) => l.optionType !== 'STOCK' && l.optionType !== 'FUTURE',
  );

  if (optionLegs.length === 0) {
    // Futures or stock-only — return underlying
    return legs[0]?.underlying ?? '';
  }

  const strikes = [...new Set(optionLegs.map((l) => l.strike))].sort((a, b) => a - b);
  const types = [...new Set(optionLegs.map((l) => l.optionType))];

  // Straddle / Strangle: same set of strikes with both C and P
  if (
    strategy === 'Long Straddle' ||
    strategy === 'Short Straddle' ||
    strategy === 'Long Strangle' ||
    strategy === 'Short Strangle'
  ) {
    return `${strikes.join('/')} C/P`;
  }

  // Iron Condor / Iron Butterfly: list all strikes
  if (strategy === 'Iron Condor' || strategy === 'Iron Butterfly') {
    return strikes.join('/');
  }

  // Single leg / vertical — show type suffix
  const typeSuffix = types.length === 1 ? ` ${types[0][0]}` : '';
  return `${strikes.join('/')}${typeSuffix}`;
}

// ---------------------------------------------------------------------------
// Stable ID
// ---------------------------------------------------------------------------

/** Simple deterministic hash-based ID to avoid crypto dependency issues in tests. */
function makeId(signature: string, openDate: Date): string {
  const raw = `${signature}|${openDate.toISOString()}`;
  // djb2 hash → base36
  let h = 5381;
  for (let i = 0; i < raw.length; i++) {
    h = ((h << 5) + h) ^ raw.charCodeAt(i);
    h = h >>> 0; // keep 32-bit unsigned
  }
  return h.toString(36);
}

// ---------------------------------------------------------------------------
// Determine close status from posEffect of closing legs
// ---------------------------------------------------------------------------

function closeStatus(legs: RawTrade[]): PositionStatus {
  const effects = legs.map((l) => l.posEffect);
  if (effects.some((e) => e === 'AUTO')) return 'Assigned';
  if (effects.some((e) => e === 'TO CLOSE (EXPIRED)')) return 'Expired';
  return 'Closed';
}

// ---------------------------------------------------------------------------
// Days held
// ---------------------------------------------------------------------------

function daysHeld(openDate: Date, closeDate: Date): number {
  const ms = closeDate.getTime() - openDate.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildPositions(trades: RawTrade[]): Position[] {
  // Step 1: Sort by execTime ascending
  const sorted = [...trades].sort((a, b) =>
    parseExecTime(a.execTime).getTime() - parseExecTime(b.execTime).getTime(),
  );

  // Step 2: Cluster into order groups
  const clusters = clusterLegs(sorted);

  // Step 3: Open/Close book
  const openBook = new Map<string, Position>();
  const positions: Position[] = [];

  for (const cluster of clusters) {
    const { legs, spread, underlying } = cluster;
    if (legs.length === 0) continue;

    const firstLeg = legs[0];
    const firstPosEffect = firstLeg.posEffect;
    const isOpening =
      firstPosEffect === 'TO OPEN' ||
      // If all legs somehow have mixed effects, treat as opening if majority say so
      (firstPosEffect !== 'TO CLOSE' &&
        firstPosEffect !== 'TO CLOSE (EXPIRED)' &&
        firstPosEffect !== 'AUTO');

    if (isOpening) {
      // ---- Opening cluster: create new Position ----
      const openDate = parseExecTime(firstLeg.execTime);
      const signature = makePositionSignature(legs);
      const strategy = detectStrategy(legs, spread);
      const strikes = buildStrikes(legs, strategy);
      const openNetCredit = netValue(legs);
      const expDate =
        parseExpiration(legs.find((l) => l.expiration)?.expiration ?? '') ?? null;
      const qty = Math.max(...legs.map((l) => l.qty));
      const commissions = legs.reduce((s, l) => s + Math.abs(l.commission), 0);
      const id = makeId(signature, openDate);

      const position: Position = {
        id,
        underlying,
        strategy,
        status: 'Open',
        openDate,
        closeDate: null,
        expiration: expDate,
        qty,
        strikes,
        netCredit: openNetCredit,
        realizedPnl: null,
        commissions,
        isSection1256: SECTION_1256_UNDERLYINGS.has(underlying),
        daysHeld: null,
      };

      openBook.set(signature, position);
    } else {
      // ---- Closing cluster ----
      const closeDate = parseExecTime(firstLeg.execTime);
      const closeSig = makeCloseSignature(legs);
      const existingPosition = openBook.get(closeSig);
      const closeNetCredit = netValue(legs);
      const status = closeStatus(legs);
      const closeCommissions = legs.reduce((s, l) => s + Math.abs(l.commission), 0);

      if (existingPosition) {
        // Close the open position
        const realizedPnl = existingPosition.netCredit + closeNetCredit;
        const closedPosition: Position = {
          ...existingPosition,
          status,
          closeDate,
          realizedPnl,
          commissions: existingPosition.commissions + closeCommissions,
          daysHeld: daysHeld(existingPosition.openDate, closeDate),
        };

        openBook.delete(closeSig);
        positions.push(closedPosition);
      } else {
        // Orphan close: no matching open found
        const strategy = detectStrategy(legs, spread);
        const strikes = buildStrikes(legs, strategy);
        const expDate =
          parseExpiration(legs.find((l) => l.expiration)?.expiration ?? '') ?? null;
        const qty = Math.max(...legs.map((l) => l.qty));
        const id = makeId(closeSig, closeDate);

        const orphanPosition: Position = {
          id,
          underlying,
          strategy,
          status,
          openDate: closeDate, // best we can do without matching open
          closeDate,
          expiration: expDate,
          qty,
          strikes,
          netCredit: 0,
          realizedPnl: closeNetCredit, // proceeds only
          commissions: closeCommissions,
          isSection1256: SECTION_1256_UNDERLYINGS.has(underlying),
          daysHeld: 0,
        };

        positions.push(orphanPosition);
      }
    }
  }

  // Any positions still in openBook are Open
  for (const openPosition of openBook.values()) {
    positions.push(openPosition);
  }

  return positions;
}
