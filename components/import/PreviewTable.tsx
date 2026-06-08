'use client';

import type { RawTrade } from '@/types';

interface PreviewTableProps {
  trades: RawTrade[];
  maxRows?: number;
}

const COLUMNS = [
  { label: 'Exec Time', key: 'execTime' as const },
  { label: 'Symbol', key: 'symbol' as const },
  { label: 'Side', key: 'side' as const },
  { label: 'Strategy', key: 'spread' as const },
  { label: 'Expiry', key: 'expiration' as const },
  { label: 'Strike', key: 'strike' as const },
  { label: 'Type', key: 'optionType' as const },
  { label: 'Price', key: 'price' as const },
  { label: 'P&L Effect', key: 'posEffect' as const },
];

export function PreviewTable({ trades, maxRows = 7 }: PreviewTableProps) {
  const rows = trades.slice(0, maxRows);

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-max text-xs">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((trade, idx) => (
            <tr
              key={trade.dedupKey ?? idx}
              className="border-b border-border last:border-0 hover:bg-muted/30"
            >
              <td className="px-3 py-2 whitespace-nowrap font-mono text-foreground">
                {trade.execTime}
              </td>
              <td className="px-3 py-2 whitespace-nowrap font-medium text-foreground">
                {trade.symbol}
              </td>
              <td
                className={`px-3 py-2 whitespace-nowrap font-medium ${
                  trade.side === 'BUY'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {trade.side}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                {trade.spread}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                {trade.expiration}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-foreground">
                {trade.strike > 0 ? trade.strike : '—'}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                {trade.optionType}
              </td>
              <td className="px-3 py-2 whitespace-nowrap font-mono text-foreground">
                ${trade.price.toFixed(2)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                {trade.posEffect}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {trades.length > maxRows && (
        <p className="px-3 py-2 text-xs text-muted-foreground border-t border-border">
          Showing {maxRows} of {trades.length} trades
        </p>
      )}
    </div>
  );
}
