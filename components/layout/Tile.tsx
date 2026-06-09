'use client';

import { Delta } from '@/components/shared/Delta';
import { MiniSpark } from '@/components/charts/MiniSpark';

interface TileProps {
  label: string;
  value: string | number;
  tone?: 'pos' | 'neg' | 'neutral';
  delta?: number;
  spark?: number[];
  sparkColor?: string;
}

export function Tile({ label, value, tone, delta, spark, sparkColor }: TileProps) {
  const c = tone === 'pos' ? 'var(--pos)' : tone === 'neg' ? 'var(--neg)' : 'var(--text-1)';
  return (
    <div className="panel" style={{ borderRadius: 9, padding: '11px 13px', display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontSize: 19, fontWeight: 700, color: c, letterSpacing: '-0.3px', lineHeight: 1, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{value}</span>
        {spark
          ? <MiniSpark data={spark} color={sparkColor || 'var(--pos-soft)'} width={52} height={20} />
          : delta != null
            ? <Delta value={delta} />
            : null}
      </div>
    </div>
  );
}
