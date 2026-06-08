import type { Position, TaxEvent, TaxSummary, TaxSettings } from '@/types';

/**
 * Check if a date is within 30 calendar days of another date.
 * Used for wash-sale detection.
 */
function isWithin30Days(closeDate: Date, openDate: Date): boolean {
  const diffMs = Math.abs(closeDate.getTime() - openDate.getTime());
  return diffMs <= 30 * 24 * 60 * 60 * 1000;
}

/**
 * Compute tax summary from closed positions.
 *
 * Steps:
 * 1. Filter to closed positions with realized P&L
 * 2. Detect Section 1256 status (already flagged on Position)
 * 3. Classify holding period
 * 4. For §1256: split realized P&L into 60% long-term, 40% short-term
 * 5. Detect wash sales (loss position within 30 days of buy position)
 * 6. Aggregate totals and compute estimated tax
 */
export function computeTax(positions: Position[], settings: TaxSettings): TaxSummary {
  const events: TaxEvent[] = [];

  // Step 1: Filter to closed positions with realized P&L
  const closedPositions = positions.filter(
    (p) => p.status !== 'Open' && p.realizedPnl !== null && p.closeDate !== null,
  );

  // Step 2, 3, 4: Process each closed position into a TaxEvent
  for (const position of closedPositions) {
    const treatmentType: 'short-term' | 'long-term' | 'section-1256' = position.isSection1256
      ? 'section-1256'
      : position.daysHeld !== null && position.daysHeld > 365
        ? 'long-term'
        : 'short-term';

    // Compute §1256 portions
    const ltPortion = treatmentType === 'section-1256' ? position.realizedPnl! * 0.6 : null;
    const stPortion = treatmentType === 'section-1256' ? position.realizedPnl! * 0.4 : null;

    // Step 5: Check for wash sale (only for losses, not §1256)
    let washSaleFlag = false;
    let washSaleDisallowed = 0;

    if (position.realizedPnl! < 0 && !position.isSection1256) {
      // This is a loss position. Check if any other position with same underlying
      // was opened within 30 days of this position's close date.
      const isWashSale = closedPositions.some(
        (other) =>
          other.underlying === position.underlying &&
          other.id !== position.id &&
          isWithin30Days(position.closeDate!, other.openDate),
      );

      if (isWashSale) {
        washSaleFlag = true;
        washSaleDisallowed = Math.abs(position.realizedPnl!);
      }
    }

    events.push({
      positionId: position.id,
      underlying: position.underlying,
      strategy: position.strategy,
      closeDate: position.closeDate!,
      realizedPnl: position.realizedPnl!,
      holdingPeriodDays: position.daysHeld ?? 0,
      treatmentType,
      ltPortion,
      stPortion,
      washSaleFlag,
      washSaleDisallowed,
    });
  }

  // Step 6: Aggregate totals
  const shortTermEvents = events.filter((e) => e.treatmentType === 'short-term');
  const longTermEvents = events.filter((e) => e.treatmentType === 'long-term');
  const section1256Events = events.filter((e) => e.treatmentType === 'section-1256');

  // Short-term gains minus wash-sale adjustments
  const shortTermGains = shortTermEvents.reduce((sum, e) => sum + e.realizedPnl, 0) -
    shortTermEvents.reduce((sum, e) => sum + e.washSaleDisallowed, 0);

  // Long-term gains (no wash-sale adjustment for long-term)
  const longTermGains = longTermEvents.reduce((sum, e) => sum + e.realizedPnl, 0);

  // §1256 gains (raw total before split)
  const section1256Gains = section1256Events.reduce((sum, e) => sum + e.realizedPnl, 0);

  // Compute §1256 split portions for tax estimation
  const s1256_st = section1256Events.reduce((sum, e) => sum + (e.stPortion ?? 0), 0);
  const s1256_lt = section1256Events.reduce((sum, e) => sum + (e.ltPortion ?? 0), 0);

  // Total wash-sale adjustment
  const washSaleAdjustment = events.reduce((sum, e) => sum + e.washSaleDisallowed, 0);

  // Simplified estimated tax (NOT financial advice):
  // Short-term and §1256 short-term portions taxed at marginal bracket
  // Long-term and §1256 long-term portions taxed at 15% (simplified LTCG)
  const estimatedTax =
    shortTermGains * settings.marginalBracketRate +
    s1256_st * settings.marginalBracketRate +
    s1256_lt * 0.15 +
    longTermGains * 0.15;

  return {
    shortTermGains,
    longTermGains,
    section1256Gains,
    washSaleAdjustment,
    estimatedTax,
    marginalBracketRate: settings.marginalBracketRate,
    events,
  };
}
