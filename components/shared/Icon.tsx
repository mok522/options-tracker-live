'use client';

import type { CSSProperties } from 'react';

type IconName =
  | 'grid' | 'table' | 'tax' | 'upload' | 'search' | 'bell' | 'gear'
  | 'arrowUp' | 'chevDown' | 'chevRight' | 'calendar' | 'filter'
  | 'download' | 'flag' | 'shield' | 'spark' | 'dot';

interface IconProps {
  name: IconName;
  size?: number;
  stroke?: number;
  style?: CSSProperties;
}

export function Icon({ name, size = 16, stroke = 1.7, style }: IconProps) {
  const p = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: stroke, strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    style: { display: 'block' as const, ...style },
  };
  switch (name) {
    case 'grid':
      return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>;
    case 'table':
      return <svg {...p}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14h18M9 9v11"/></svg>;
    case 'tax':
      return <svg {...p}><path d="M9 7h6M9 12h6M9 17h3"/><rect x="4" y="3" width="16" height="18" rx="2"/></svg>;
    case 'upload':
      return <svg {...p}><path d="M12 15V4M8 8l4-4 4 4"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>;
    case 'search':
      return <svg {...p}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>;
    case 'bell':
      return <svg {...p}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/></svg>;
    case 'gear':
      return <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.36.86 1.2 1.4 2.1 1.4H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
    case 'arrowUp':
      return <svg {...p}><path d="M12 19V5M6 11l6-6 6 6"/></svg>;
    case 'chevDown':
      return <svg {...p}><path d="M6 9l6 6 6-6"/></svg>;
    case 'chevRight':
      return <svg {...p}><path d="M9 6l6 6-6 6"/></svg>;
    case 'calendar':
      return <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>;
    case 'filter':
      return <svg {...p}><path d="M3 5h18M6 12h12M10 19h4"/></svg>;
    case 'download':
      return <svg {...p}><path d="M12 4v11M8 11l4 4 4-4"/><path d="M4 20h16"/></svg>;
    case 'flag':
      return <svg {...p}><path d="M4 21V4M4 4h13l-2 4 2 4H4"/></svg>;
    case 'shield':
      return <svg {...p}><path d="M12 3l8 3v6c0 4.5-3.2 7.5-8 9-4.8-1.5-8-4.5-8-9V6z"/></svg>;
    case 'spark':
      return <svg {...p}><path d="M3 13l4-4 4 3 6-7"/><path d="M17 5h4v4"/></svg>;
    case 'dot':
      return <svg {...p}><circle cx="12" cy="12" r="3"/></svg>;
    default:
      return null;
  }
}
