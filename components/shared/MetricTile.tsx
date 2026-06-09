interface MetricTileProps {
  label: string;
  value: string;
  delta?: string;
  className?: string;
}

export function MetricTile({ label, value, delta, className }: MetricTileProps) {
  const deltaColor = delta
    ? delta.startsWith('+')
      ? 'var(--color-pos)'
      : delta.startsWith('-')
        ? 'var(--color-neg)'
        : 'var(--text-3)'
    : 'var(--text-3)';

  return (
    <div
      className={`rounded-[10px] border border-border bg-card p-3 flex flex-col gap-1.5 ${className ?? ''}`}
      style={{ boxShadow: 'var(--shadow-panel)' }}
    >
      <p
        className="text-[10.5px] font-semibold uppercase tracking-[0.2px]"
        style={{ color: 'var(--text-3)' }}
      >
        {label}
      </p>
      <p
        className="text-[22px] font-bold leading-none tracking-[-0.5px] tabular-nums"
        style={{ color: 'var(--text-1)' }}
      >
        {value}
      </p>
      {delta && (
        <p className="text-[11.5px] font-medium tabular-nums" style={{ color: deltaColor }}>
          {delta}
        </p>
      )}
    </div>
  );
}
