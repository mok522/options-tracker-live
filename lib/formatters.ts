/** Format as USD: 1234 → '$1,234', -500 → '−$500'. Unicode minus for negatives. */
export function fmtUSD(n: number, dp = 0): string {
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  return (n < 0 ? '−$' : '$') + s;
}

/** Format with explicit sign: +$1,234 or −$1,234 */
export function fmtSigned(n: number, dp = 0): string {
  return (n >= 0 ? '+' : '−') + '$' +
    Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

/** Format a plain number: 12.40 */
export function fmtNum(n: number, dp = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

/** Format percentage: 0.524 → '52.4%' */
export function fmtPct(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}
