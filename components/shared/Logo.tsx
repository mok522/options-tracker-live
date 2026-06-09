'use client';

interface LogoProps {
  compact?: boolean;
}

export function Logo({ compact = false }: LogoProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <div style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--text-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ display: 'block' }}>
          <path d="M3 16l5-6 4 3 7-9" stroke="var(--pos-soft)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="19" cy="4" r="2" fill="var(--pos-soft)"/>
        </svg>
      </div>
      {!compact && (
        <div style={{ lineHeight: 1.05 }}>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.2px', color: 'var(--text-1)' }}>Tradesheet</div>
          <div style={{ fontSize: 9.5, fontWeight: 500, letterSpacing: '0.4px', color: 'var(--text-3)', textTransform: 'uppercase' }}>Options Tracker</div>
        </div>
      )}
    </div>
  );
}
