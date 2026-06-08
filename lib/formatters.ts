/**
 * Pure utility functions for formatting numbers as currency, percentages, etc.
 */

const USD_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Format as USD currency: 1234.5 → "$1,234.50", -500 → "-$500.00"
 */
export function fmtUSD(value: number): string {
  return USD_FORMATTER.format(value);
}

/**
 * Format with explicit +/- sign: 50 → "+$50.00", -200 → "-$200.00"
 */
export function fmtSigned(value: number): string {
  const formatted = USD_FORMATTER.format(Math.abs(value));
  return value >= 0 ? `+${formatted}` : `-${formatted}`;
}

/**
 * Format as percentage: 0.524 → "52.4%", -0.1 → "-10.0%"
 */
export function fmtPct(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Format a number with commas: 1234567 → "1,234,567"
 */
export function fmtNum(value: number, decimals = 0): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}
