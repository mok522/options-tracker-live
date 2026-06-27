'use client';

import { useState } from 'react';
import { syncSchwab } from '@/actions/syncSchwab';
import { testSchwabConnection } from '@/actions/testConnection';
import { disconnectSchwab } from '@/actions/disconnectSchwab';
import { Icon } from '@/components/shared/Icon';
import type { Trade } from '@/types/trade';

interface ImportViewProps {
  isConnected: boolean;
  lastSyncAt: string | null;
  onSync: (trades: Trade[]) => void;
  onDisconnect: () => void;
  onClear?: () => Promise<void>;
  hasData?: boolean;
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function ImportView({ isConnected, lastSyncAt, onSync, onDisconnect, onClear, hasData }: ImportViewProps) {
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    const result = await syncSchwab();
    setSyncing(false);
    if (result.error) {
      setSyncMsg({ type: 'err', text: result.error });
    } else {
      setSyncMsg({ type: 'ok', text: `Synced ${result.newCount} transaction${result.newCount === 1 ? '' : 's'}` });
      onSync(result.trades);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setSyncMsg(null);
    const result = await testSchwabConnection();
    setTesting(false);
    setSyncMsg({ type: result.ok ? 'ok' : 'err', text: result.message });
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    await disconnectSchwab();
    setDisconnecting(false);
    onDisconnect();
  };

  const handleClear = async () => {
    if (!onClear) return;
    if (!confirmClear) { setConfirmClear(true); return; }
    setClearing(true);
    await onClear();
    setClearing(false);
    setConfirmClear(false);
    setSyncMsg(null);
  };

  return (
    <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, overflow: 'auto' }}>

      {/* Header */}
      <div style={{ textAlign: 'center', maxWidth: 460 }}>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.4px' }}>
          {isConnected ? 'Schwab account connected' : 'Connect to Charles Schwab'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 6, lineHeight: 1.5 }}>
          {isConnected
            ? 'Your trades sync directly from Schwab — no CSV exports needed.'
            : 'Link your Schwab account to automatically sync option trades and get live quotes.'}
        </div>
      </div>

      {/* Connection card */}
      <div style={{
        width: 'min(480px, 90%)', borderRadius: 14,
        border: `1px solid ${isConnected ? 'var(--pos-soft)' : 'var(--border-2)'}`,
        background: isConnected ? 'var(--pos-wash)' : 'var(--surface)',
        padding: '28px 32px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18,
      }}>

        {/* Status dot + label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 9, height: 9, borderRadius: '50%',
            background: isConnected ? 'var(--pos)' : 'var(--text-3)',
            flexShrink: 0,
          }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: isConnected ? 'var(--pos)' : 'var(--text-2)' }}>
            {isConnected ? 'Connected' : 'Not connected'}
          </span>
        </div>

        {isConnected ? (
          <>
            {/* Last sync info */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Last synced</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{relativeTime(lastSyncAt)}</div>
            </div>

            {/* Sync Now button */}
            <button
              onClick={handleSync}
              disabled={syncing}
              style={{
                font: 'inherit', cursor: syncing ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
                height: 42, padding: '0 24px', borderRadius: 10,
                border: 0, background: 'var(--text-1)', color: 'var(--surface)',
                fontSize: 13.5, fontWeight: 700, opacity: syncing ? 0.7 : 1,
                width: '100%', justifyContent: 'center',
              }}
            >
              {syncing ? (
                <>
                  <SpinnerIcon /> Syncing…
                </>
              ) : (
                <>
                  <Icon name="upload" size={15} /> Sync Now
                </>
              )}
            </button>

            {/* Test connection button */}
            <button
              onClick={handleTest}
              disabled={testing || syncing}
              style={{
                font: 'inherit', cursor: testing || syncing ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
                height: 38, padding: '0 24px', borderRadius: 10,
                border: '1px solid var(--border-2)', background: 'transparent', color: 'var(--text-1)',
                fontSize: 13, fontWeight: 600, opacity: testing ? 0.7 : 1,
                width: '100%', justifyContent: 'center',
              }}
            >
              {testing ? (
                <>
                  <SpinnerIcon /> Testing…
                </>
              ) : (
                <>
                  <Icon name="shield" size={14} /> Test connection
                </>
              )}
            </button>

            {/* Result message */}
            {syncMsg && (
              <div style={{
                width: '100%', padding: '9px 13px', borderRadius: 8, fontSize: 12.5,
                background: syncMsg.type === 'ok' ? 'var(--pos-wash)' : 'var(--neg-wash)',
                border: `1px solid ${syncMsg.type === 'ok' ? 'var(--pos-soft)' : 'var(--neg-soft)'}`,
                color: syncMsg.type === 'ok' ? 'var(--pos)' : 'var(--neg)',
              }}>
                {syncMsg.text}
              </div>
            )}

            {/* Disconnect */}
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              style={{
                font: 'inherit', cursor: disconnecting ? 'default' : 'pointer',
                border: 0, background: 'transparent',
                fontSize: 12, color: 'var(--text-3)', opacity: disconnecting ? 0.5 : 1,
              }}
            >
              {disconnecting ? 'Disconnecting…' : 'Disconnect Schwab account'}
            </button>
          </>
        ) : (
          <a
            href="/api/auth/schwab"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              height: 42, padding: '0 24px', borderRadius: 10, textDecoration: 'none',
              border: 0, background: 'var(--text-1)', color: 'var(--surface)',
              fontSize: 13.5, fontWeight: 700, width: '100%',
            }}
          >
            <Icon name="upload" size={15} /> Connect to Schwab
          </a>
        )}
      </div>

      {/* Privacy note */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: 'var(--text-3)' }}>
        <Icon name="shield" size={13} /> Read-only access — we cannot place trades on your behalf.
      </div>

      {/* Clear data */}
      {onClear && hasData && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={handleClear}
            disabled={clearing}
            style={{
              font: 'inherit', cursor: clearing ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 7,
              height: 32, padding: '0 13px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              border: `1px solid ${confirmClear ? 'var(--neg)' : 'var(--border-2)'}`,
              background: confirmClear ? 'var(--neg-wash)' : 'transparent',
              color: confirmClear ? 'var(--neg)' : 'var(--text-2)', opacity: clearing ? 0.6 : 1,
            }}
          >
            <Icon name="flag" size={12} />
            {clearing ? 'Clearing…' : confirmClear ? 'Click again to confirm — deletes all synced data' : 'Clear all data'}
          </button>
          {confirmClear && !clearing && (
            <button
              onClick={() => setConfirmClear(false)}
              style={{ font: 'inherit', cursor: 'pointer', border: 0, background: 'transparent', color: 'var(--text-3)', fontSize: 12, fontWeight: 600 }}
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SpinnerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
    </svg>
  );
}
