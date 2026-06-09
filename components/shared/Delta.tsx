'use client';

interface DeltaProps {
  value: number;
  suffix?: string;
  invert?: boolean;
}

export function Delta({ value, suffix = '%', invert = false }: DeltaProps) {
  const up = value >= 0;
  const good = invert ? !up : up;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11.5, fontWeight: 600,
      color: good ? 'var(--pos)' : 'var(--neg)', fontVariantNumeric: 'tabular-nums' }}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
        strokeLinecap="round" strokeLinejoin="round"
        style={{ transform: up ? 'none' : 'rotate(180deg)' }}>
        <path d="M12 19V5M6 11l6-6 6 6"/>
      </svg>
      {Math.abs(value)}{suffix}
    </span>
  );
}
