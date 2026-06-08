'use client';

import Link from 'next/link';
import type { TaxEvent, TaxSummary, TaxSettings } from '@/types';
import { fmtUSD } from '@/lib/formatters';
import { Panel } from '@/components/shared/Panel';
import { MetricTile } from '@/components/shared/MetricTile';

interface TaxViewProps {
  taxSummary: TaxSummary;
  settings: TaxSettings;
}

const TAX_BRACKETS = [
  { rate: 0.10, label: '10% Ordinary' },
  { rate: 0.12, label: '12% Ordinary' },
  { rate: 0.22, label: '22% Ordinary' },
  { rate: 0.24, label: '24% Ordinary' },
  { rate: 0.32, label: '32% Ordinary' },
  { rate: 0.35, label: '35% Ordinary' },
  { rate: 0.37, label: '37% Ordinary' },
];

export function TaxView({ taxSummary, settings }: TaxViewProps) {
  // Empty state
  if (taxSummary.events.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-muted-foreground text-lg">
          Import trades to see tax exposure
        </p>
        <Link
          href="/import"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Import CSV
        </Link>
      </div>
    );
  }

  const section1256Events: TaxEvent[] = taxSummary.events.filter(
    (e) => e.treatmentType === 'section-1256',
  );
  const washSaleEvents: TaxEvent[] = taxSummary.events.filter(
    (e) => e.washSaleFlag,
  );

  return (
    <div className="p-6 space-y-6">
      {/* Disclaimer chip */}
      <div className="inline-flex items-center rounded-full border border-yellow-400/60 bg-yellow-400/10 px-3 py-1 text-xs font-medium text-yellow-600 dark:text-yellow-400">
        Estimates only — not tax advice
      </div>

      {/* 5 headline metric tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <MetricTile
          label="Short-Term Gains"
          value={fmtUSD(taxSummary.shortTermGains)}
          className={taxSummary.shortTermGains < 0 ? '[&>p:last-of-type]:text-[var(--color-neg)]' : ''}
        />
        <MetricTile
          label="Long-Term Gains"
          value={fmtUSD(taxSummary.longTermGains)}
          className={taxSummary.longTermGains < 0 ? '[&>p:last-of-type]:text-[var(--color-neg)]' : ''}
        />
        <MetricTile
          label="Section 1256 (60/40)"
          value={fmtUSD(taxSummary.section1256Gains)}
        />
        <MetricTile
          label="Wash-Sale Adj."
          value={fmtUSD(-taxSummary.washSaleAdjustment)}
          className={taxSummary.washSaleAdjustment > 0 ? '[&>p:last-of-type]:text-[var(--color-neg)]' : ''}
        />
        <MetricTile
          label="Est. Tax Owed"
          value={fmtUSD(taxSummary.estimatedTax)}
        />
      </div>

      {/* 2-column: §1256 table | Wash-sale cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Section 1256 table */}
        <Panel title="Section 1256 Contracts">
          {section1256Events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No Section 1256 trades detected</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="pb-2 text-left font-medium text-muted-foreground">Symbol</th>
                    <th className="pb-2 text-right font-medium text-muted-foreground">Realized P&L</th>
                    <th className="pb-2 text-right font-medium text-muted-foreground">60% LT</th>
                    <th className="pb-2 text-right font-medium text-muted-foreground">40% ST</th>
                  </tr>
                </thead>
                <tbody>
                  {section1256Events.map((event) => (
                    <tr
                      key={event.positionId}
                      className="border-b border-border/50 last:border-0"
                    >
                      <td className="py-2 font-medium">{event.underlying}</td>
                      <td
                        className="py-2 text-right tabular-nums"
                        style={{ color: event.realizedPnl >= 0 ? 'var(--color-pos)' : 'var(--color-neg)' }}
                      >
                        {fmtUSD(event.realizedPnl)}
                      </td>
                      <td
                        className="py-2 text-right tabular-nums"
                        style={{ color: (event.ltPortion ?? 0) >= 0 ? 'var(--color-pos)' : 'var(--color-neg)' }}
                      >
                        {fmtUSD(event.ltPortion ?? 0)}
                      </td>
                      <td
                        className="py-2 text-right tabular-nums"
                        style={{ color: (event.stPortion ?? 0) >= 0 ? 'var(--color-pos)' : 'var(--color-neg)' }}
                      >
                        {fmtUSD(event.stPortion ?? 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {/* Wash-sale cards */}
        <Panel title="Wash-Sale Flags">
          {washSaleEvents.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
              <span className="text-base">&#10003;</span>
              <span>No wash-sale issues detected</span>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {washSaleEvents.map((event) => (
                <div
                  key={event.positionId}
                  className="rounded-md border border-red-300/60 dark:border-red-700/50 bg-red-50/60 dark:bg-red-950/30 px-3 py-2 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{event.underlying}</span>
                    <span
                      className="tabular-nums"
                      style={{ color: 'var(--color-neg)' }}
                    >
                      {fmtUSD(event.realizedPnl)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
                    <span>Disallowed loss</span>
                    <span
                      className="tabular-nums"
                      style={{ color: 'var(--color-neg)' }}
                    >
                      {fmtUSD(-event.washSaleDisallowed)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* Tax bracket grid */}
      <Panel title="Estimated Tax Brackets">
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {TAX_BRACKETS.map((bracket) => {
            const isActive = bracket.rate === settings.marginalBracketRate;
            return (
              <div
                key={bracket.rate}
                className={
                  isActive
                    ? 'rounded-md border-2 border-primary bg-primary/10 px-2 py-3 text-center'
                    : 'rounded-md border border-border bg-muted/30 px-2 py-3 text-center'
                }
              >
                <p className={`text-sm font-bold ${isActive ? 'text-primary' : ''}`}>
                  {Math.round(bracket.rate * 100)}%
                </p>
                <p className={`text-xs mt-0.5 ${isActive ? 'text-primary/80' : 'text-muted-foreground'}`}>
                  Ordinary
                </p>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
