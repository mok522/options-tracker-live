import type { RawTrade, StrategyType } from '@/types';

// ---------------------------------------------------------------------------
// Strategy Detector
// ---------------------------------------------------------------------------

/**
 * Determines the StrategyType for a cluster of legs belonging to the same order.
 * Uses the TOS `Spread` field as a fast path, then inspects leg details.
 */
export function detectStrategy(legs: RawTrade[], spreadLabel: string): StrategyType {
  const spread = spreadLabel.trim().toUpperCase();

  switch (spread) {
    case 'SINGLE':
      return detectSingle(legs);
    case 'VERTICAL':
      return detectVertical(legs);
    case 'CONDOR':
      return 'Iron Condor';
    case 'COVERED':
      return detectCovered(legs);
    case 'STRADDLE':
      return detectStraddleOrStrangle(legs, true);
    case 'STRANGLE':
      return detectStraddleOrStrangle(legs, false);
    case 'CALENDAR':
      return 'Calendar Spread';
    case 'BUTTERFLY':
      return 'Iron Butterfly';
    default:
      return 'Custom / Multi-Leg';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getOpeningLegs(legs: RawTrade[]): RawTrade[] {
  return legs.filter((l) => l.posEffect === 'TO OPEN');
}

/** Single-leg: BUY/SELL TO OPEN → Long/Short Call/Put */
function detectSingle(legs: RawTrade[]): StrategyType {
  const openLegs = getOpeningLegs(legs);
  const leg = openLegs[0] ?? legs[0];
  if (!leg) return 'Custom / Multi-Leg';

  const isBuy = leg.side === 'BUY';
  const isCall = leg.optionType === 'CALL';

  if (isBuy && isCall) return 'Long Call';
  if (isBuy && !isCall) return 'Long Put';
  if (!isBuy && isCall) return 'Short Call';
  return 'Short Put';
}

/** Vertical: 2 legs same type → Bull/Bear Call/Put Spread */
function detectVertical(legs: RawTrade[]): StrategyType {
  const openLegs = getOpeningLegs(legs);
  if (openLegs.length < 2) {
    // Fall back to whatever legs we have
    const allLegs = legs.length >= 2 ? legs : [...legs, ...legs]; // guard
    return classifyVertical(allLegs);
  }
  return classifyVertical(openLegs);
}

function classifyVertical(legs: RawTrade[]): StrategyType {
  const shortLeg = legs.find((l) => l.side === 'SELL');
  const longLeg = legs.find((l) => l.side === 'BUY');

  if (!shortLeg || !longLeg) {
    // Both same side — use first leg type
    const firstOptionType = legs[0]?.optionType;
    if (firstOptionType === 'CALL') return 'Bull Call Spread';
    return 'Bull Put Spread';
  }

  const optType = shortLeg.optionType || longLeg.optionType;

  if (optType === 'CALL') {
    // Bear Call: short strike < long strike
    // Bull Call: short strike > long strike
    return shortLeg.strike < longLeg.strike ? 'Bear Call Spread' : 'Bull Call Spread';
  } else {
    // PUT
    // Bull Put: short strike > long strike
    // Bear Put: short strike < long strike
    return shortLeg.strike > longLeg.strike ? 'Bull Put Spread' : 'Bear Put Spread';
  }
}

/** Covered: stock leg + option leg */
function detectCovered(legs: RawTrade[]): StrategyType {
  const optionLeg = legs.find(
    (l) => l.optionType === 'CALL' || l.optionType === 'PUT'
  );
  if (!optionLeg) return 'Custom / Multi-Leg';
  if (optionLeg.optionType === 'CALL') return 'Covered Call';
  // Covered Put → nearest valid StrategyType is 'Cash-Secured Put'
  return 'Cash-Secured Put';
}

/**
 * Straddle: same strike, 1 Call + 1 Put
 * Strangle: different strikes, 1 Call + 1 Put
 * Long = opening legs are BUY, Short = opening legs are SELL
 */
function detectStraddleOrStrangle(legs: RawTrade[], isStraddle: boolean): StrategyType {
  const openLegs = getOpeningLegs(legs);
  const referenceLegs = openLegs.length > 0 ? openLegs : legs;
  const isLong = referenceLegs.some((l) => l.side === 'BUY');

  if (isStraddle) {
    return isLong ? 'Long Straddle' : 'Short Straddle';
  } else {
    return isLong ? 'Long Strangle' : 'Short Strangle';
  }
}
