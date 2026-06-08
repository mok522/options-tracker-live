interface MetricTileProps {
  label: string;
  value: string;
  delta?: string;
  className?: string;
}

export function MetricTile({ label, value, delta, className }: MetricTileProps) {
  const deltaColor = delta
    ? delta.startsWith('+')
      ? 'text-[var(--color-pos)]'
      : delta.startsWith('-')
        ? 'text-[var(--color-neg)]'
        : 'text-muted-foreground'
    : '';

  return (
    <div className={`rounded-lg border border-border bg-card p-3 ${className ?? ''}`}>
      <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
      <p className="text-xl font-bold leading-tight">{value}</p>
      {delta && (
        <p className={`text-xs mt-1 ${deltaColor}`}>{delta}</p>
      )}
    </div>
  );
}
