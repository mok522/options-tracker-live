'use client';

import { useMemo, useRef, useCallback } from 'react';
import type { Position, PositionStatus, StrategyType } from '@/types';
import { useUIStore } from '@/store/uiStore';
import { fmtUSD, fmtSigned, fmtPct } from '@/lib/formatters';
import { TradesTable } from './TradesTable';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface Props {
  positions: Position[];
}

const STATUS_TABS: (PositionStatus | 'All')[] = [
  'All',
  'Open',
  'Closed',
  'Expired',
  'Assigned',
];

function StatCard({
  label,
  value,
  valueStyle,
}: {
  label: string;
  value: string;
  valueStyle?: React.CSSProperties;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card px-4 py-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold tabular-nums" style={valueStyle}>
        {value}
      </span>
    </div>
  );
}

export function TradesView({ positions }: Props) {
  const { tradesFilter, setTradesFilter, resetFilter } = useUIStore();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Apply filters
  const filtered = useMemo(() => {
    let result = positions;

    if (tradesFilter.status !== 'All') {
      result = result.filter((p) => p.status === tradesFilter.status);
    }
    if (tradesFilter.strategy !== 'All') {
      result = result.filter((p) => p.strategy === tradesFilter.strategy);
    }
    if (tradesFilter.symbolSearch !== '') {
      const q = tradesFilter.symbolSearch.toLowerCase();
      result = result.filter((p) => p.underlying.toLowerCase().includes(q));
    }

    return result;
  }, [positions, tradesFilter]);

  // Stats computed from filtered positions
  const stats = useMemo(() => {
    const closedPositions = filtered.filter(
      (p) => p.status !== 'Open' && p.realizedPnl !== null,
    );
    const filteredPnl = closedPositions.reduce(
      (sum, p) => sum + (p.realizedPnl ?? 0),
      0,
    );
    const wins = closedPositions.filter((p) => (p.realizedPnl ?? 0) > 0).length;
    const winRate =
      closedPositions.length > 0 ? wins / closedPositions.length : 0;
    const openCount = filtered.filter((p) => p.status === 'Open').length;
    const avgPerTrade =
      closedPositions.length > 0
        ? filteredPnl / closedPositions.length
        : 0;

    return { filteredPnl, winRate, openCount, avgPerTrade, closedCount: closedPositions.length };
  }, [filtered]);

  // Unique strategies from all positions (not just filtered)
  const strategies = useMemo(() => {
    const seen = new Set<StrategyType>();
    for (const p of positions) seen.add(p.strategy);
    return [...seen].sort();
  }, [positions]);

  // Debounced symbol search
  const handleSearch = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setTradesFilter({ symbolSearch: val });
      }, 200);
    },
    [setTradesFilter],
  );

  // Export CSV
  function handleExportCsv() {
    const headers = [
      'Symbol',
      'Strategy',
      'Status',
      'Open Date',
      'Close Date',
      'Expiry',
      'Qty',
      'P&L',
      'Commission',
    ];

    function fmtDateCsv(d: Date | null): string {
      if (!d) return '';
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const yy = String(d.getFullYear()).slice(-2);
      return `${mm}/${dd}/${yy}`;
    }

    const rows = filtered.map((p) => [
      p.underlying,
      p.strategy,
      p.status,
      fmtDateCsv(p.openDate),
      fmtDateCsv(p.closeDate),
      fmtDateCsv(p.expiration),
      String(p.qty),
      p.realizedPnl !== null ? String(p.realizedPnl.toFixed(2)) : '',
      String(p.commissions.toFixed(2)),
    ]);

    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((cell) =>
            cell.includes(',') || cell.includes('"')
              ? `"${cell.replace(/"/g, '""')}"`
              : cell,
          )
          .join(','),
      )
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'trades.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const hasActiveFilter =
    tradesFilter.status !== 'All' ||
    tradesFilter.strategy !== 'All' ||
    tradesFilter.symbolSearch !== '';

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Filtered P&L"
          value={stats.closedCount > 0 ? fmtSigned(stats.filteredPnl) : '—'}
          valueStyle={{
            color:
              stats.closedCount === 0
                ? 'var(--color-neutral)'
                : stats.filteredPnl >= 0
                ? 'var(--color-pos)'
                : 'var(--color-neg)',
          }}
        />
        <StatCard
          label="Win Rate"
          value={stats.closedCount > 0 ? fmtPct(stats.winRate) : '—'}
        />
        <StatCard
          label="Open Positions"
          value={String(stats.openCount)}
        />
        <StatCard
          label="Avg / Trade"
          value={stats.closedCount > 0 ? fmtSigned(stats.avgPerTrade) : '—'}
          valueStyle={{
            color:
              stats.closedCount === 0
                ? 'var(--color-neutral)'
                : stats.avgPerTrade >= 0
                ? 'var(--color-pos)'
                : 'var(--color-neg)',
          }}
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Status segmented control */}
        <div className="flex rounded-md border border-border overflow-hidden">
          {STATUS_TABS.map((s) => (
            <button
              key={s}
              onClick={() => setTradesFilter({ status: s })}
              className={`px-3 py-1.5 text-xs font-medium transition-colors border-r border-border last:border-r-0 ${
                tradesFilter.status === s
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Strategy select */}
        <Select
          value={tradesFilter.strategy}
          onValueChange={(val) =>
            setTradesFilter({ strategy: val as StrategyType | 'All' })
          }
        >
          <SelectTrigger className="h-8 w-48 text-xs">
            <SelectValue placeholder="All Strategies" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Strategies</SelectItem>
            {strategies.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Symbol search */}
        <Input
          placeholder="Search symbol…"
          defaultValue={tradesFilter.symbolSearch}
          onChange={handleSearch}
          className="h-8 w-36 text-xs"
        />

        {/* Reset filter */}
        {hasActiveFilter && (
          <Button
            variant="ghost"
            size="sm"
            onClick={resetFilter}
            className="h-8 text-xs text-muted-foreground"
          >
            Reset
          </Button>
        )}

        {/* Spacer */}
        <div className="ml-auto" />

        {/* Export CSV */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportCsv}
          className="h-8 text-xs"
        >
          Export CSV
        </Button>
      </div>

      {/* Table */}
      <TradesTable positions={filtered} />
    </div>
  );
}
