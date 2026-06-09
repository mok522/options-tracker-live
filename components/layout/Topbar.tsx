'use client';

import { Logo } from '@/components/shared/Logo';
import { Icon } from '@/components/shared/Icon';

type Tab = 'Dashboard' | 'Trades' | 'Tax Exposure' | 'Import';

interface TopbarProps {
  dark: boolean;
  setDark: (fn: (d: boolean) => boolean) => void;
  tab: Tab;
  setTab: (t: Tab) => void;
}

const TABS: Tab[] = ['Dashboard', 'Trades', 'Tax Exposure', 'Import'];

function Quote({ sym, px, chg }: { sym: string; px: string; chg: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-2)' }}>{sym}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>{px}</span>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: chg >= 0 ? 'var(--pos)' : 'var(--neg)', fontVariantNumeric: 'tabular-nums' }}>
        {chg >= 0 ? '+' : '−'}{Math.abs(chg)}%
      </span>
    </div>
  );
}

export function Topbar({ dark, setDark, tab, setTab }: TopbarProps) {
  return (
    <header style={{ height: 50, flex: '0 0 auto', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 18, padding: '0 18px' }}>
      <Logo compact />
      <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            font: 'inherit', cursor: 'pointer', border: 0,
            fontSize: 12.5, fontWeight: tab === t ? 600 : 500, padding: '6px 11px', borderRadius: 7,
            color: tab === t ? 'var(--text-1)' : 'var(--text-2)',
            background: tab === t ? 'var(--inset)' : 'transparent',
          }}>{t}</button>
        ))}
      </div>
      <div style={{ width: 1, height: 18, background: 'var(--border)' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <Quote sym="SPX" px="5,431.20" chg={0.4} />
        <Quote sym="NDX" px="19,284.6" chg={0.6} />
        <Quote sym="VIX" px="13.84" chg={-2.1} />
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: 'var(--text-3)' }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--pos-soft)' }} /> Synced 2:14 PM
      </div>
      <button
        onClick={() => setDark((d) => !d)}
        title="Toggle theme"
        style={{ font: 'inherit', cursor: 'pointer', width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {dark
          ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8L6 18M18 6l1.8-1.8"/></svg>
          : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
        }
      </button>
      <button onClick={() => setTab('Import')} style={{ font: 'inherit', cursor: 'pointer', border: 0, display: 'flex', alignItems: 'center', gap: 7, height: 32, padding: '0 13px', borderRadius: 8, background: 'var(--text-1)', color: 'var(--surface)', fontSize: 12.5, fontWeight: 600 }}>
        <Icon name="upload" size={14} /> Import CSV
      </button>
      <div style={{ width: 31, height: 31, borderRadius: 8, background: 'var(--accent-wash)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 700 }}>JM</div>
    </header>
  );
}
