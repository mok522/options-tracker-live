import type { RawTrade, StrategyType } from '@/types';

// ---------------------------------------------------------------------------
// Strategy Detector
// ---------------------------------------------------------------------------

/**
 * Determines the StrategyType for a cluster of legs belonging to the same order.
 * Classification is purely structural — the TOS Spread field is ignored because
 * it only carries SINGLE / DIAGONAL / CUSTOM / STOCK, which is not enough
 * information to distinguish vertical from calendar from diagonal, etc.
 */
export function detectStrategy(legs: RawTrade[], _spreadLabel: string): StrategyType {
  const optLegs = legs.filter(
    (l) => l.optionType !== 'STOCK' && l.optionType !== 'FUTURE',
  );
  const n = optLegs.length;

  if (n === 0) return 'Custom / Multi-Leg';
  if (n === 1) return detectSingle(optLegs);
  if (n === 2) return detectTwoLeg(optLegs);
  if (n === 4) return detectFourLeg(optLegs);
  return 'Custom / Multi-Leg';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function openingLeg(legs: RawTrade[]): RawTrade {
  return legs.find((l) => l.posEffect === 'TO OPEN') ?? legs[0];
}

/** Single option leg → Long/Short Call/Put based on the opening side. */
function detectSingle(legs: RawTrade[]): StrategyType {
  const leg = openingLeg(legs);
  if (!leg) return 'Custom / Multi-Leg';

  const isBuy  = leg.side === 'BUY';
  const isCall = leg.optionType === 'CALL';

  if (isBuy  && isCall)  return 'Long Call';
  if (isBuy  && !isCall) return 'Long Put';
  if (!isBuy && isCall)  return 'Short Call';
  return 'Short Put';
}

/** Two option legs — classify by type / strike / expiration structure. */
function detectTwoLeg(legs: RawTrade[]): StrategyType {
  const [a, b] = [...legs].sort((x, y) => x.strike - y.strike);

  const sameType   = a.optionType === b.optionType;
  const sameStrike = a.strike === b.strike;
  const sameExp    = a.expiration === b.expiration;

  if (sameType && sameStrike && !sameExp) return 'Calendar Spread';
  if (sameType && !sameStrike && !sameExp) return 'Diagonal Spread';

  if (sameType && sameExp && !sameStrike) {
    return classifyVertical(legs);
  }

  if (!sameType && sameExp) {
    return sameStrike ? 'Long Straddle' : 'Long Strangle';
  }

  return 'Custom / Multi-Leg';
}

function classifyVertical(legs: RawTrade[]): StrategyType {
  const shortLeg = legs.find((l) => l.side === 'SELL');
  const longLeg  = legs.find((l) => l.side === 'BUY');

  if (!shortLeg || !longLeg) {
    return legs[0]?.optionType === 'CALL' ? 'Bull Call Spread' : 'Bull Put Spread';
  }

  if (shortLeg.optionType === 'CALL') {
    return shortLeg.strike < longLeg.strike ? 'Bear Call Spread' : 'Bull Call Spread';
  } else {
    return shortLeg.strike > longLeg.strike ? 'Bull Put Spread' : 'Bear Put Spread';
  }
}

/** Four option legs — Iron Condor or Iron Butterfly. */
function detectFourLeg(legs: RawTrade[]): StrategyType {
  const strikes = [...new Set(legs.map((l) => l.strike))];
  // Iron Butterfly: only 3 distinct strikes (short call + short put share the body)
  if (strikes.length === 3) return 'Iron Butterfly';
  return 'Iron Condor';
}
