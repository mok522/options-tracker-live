'use client';

import type { ReactNode, CSSProperties } from 'react';

interface PanelProps {
  title?: string;
  sub?: string;
  right?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
  bodyStyle?: CSSProperties;
  pad?: string;
}

export function Panel({ title, sub, right, children, style, bodyStyle, pad = '10px 13px 13px' }: PanelProps) {
  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', borderRadius: 9, minHeight: 0, ...style }}>
      {title && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 13px 0', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.1px', whiteSpace: 'nowrap' }}>{title}</span>
            {sub && <span style={{ fontSize: 10.5, color: 'var(--text-3)', whiteSpace: 'nowrap', fontWeight: 450 }}>{sub}</span>}
          </div>
          {right}
        </div>
      )}
      <div style={{ padding: pad, flex: 1, minHeight: 0, ...bodyStyle }}>{children}</div>
    </div>
  );
}
