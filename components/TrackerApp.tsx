'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Trade } from '@/types/trade';
import { clearAllData } from '@/actions/clearData';
import { getQuotes } from '@/actions/fetchQuotes';
import { Topbar } from '@/components/layout/Topbar';
import { DashboardView } from '@/components/dashboard/DashboardView';
import { AnalyticsView } from '@/components/analytics/AnalyticsView';
import { TradesView } from '@/components/trades/TradesView';
import { TaxView } from '@/components/tax/TaxView';
import { ImportView } from '@/components/import/ImportView';
import type { QuotesMap } from '@/lib/schwab/quotes';

type Tab = 'Dashboard' | 'Analytics' | 'Trades' | 'Tax Exposure' | 'Import';

const TOPBAR_SYMBOLS = ['$SPX.X', '$NDX.X', '$VIX.X', 'SPX', 'NDX', 'VIX'];
const QUOTE_INTERVAL_MS = 60_000;

function useTheme(): [boolean, (fn: (d: boolean) => boolean) => void] {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('ott-theme') === 'dark'; } catch { return false; }
  });
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try { localStorage.setItem('ott-theme', dark ? 'dark' : 'light'); } catch { /* noop */ }
  }, [dark]);
  return [dark, setDark];
}

interface TrackerAppProps {
  initialTrades?: Trade[];
  isConnected: boolean;
  lastSyncAt: string | null;
}

export function TrackerApp({ initialTrades = [], isConnected: initialConnected, lastSyncAt: initialLastSyncAt }: TrackerAppProps) {
  const router = useRouter();
  const [dark, setDark] = useTheme();
  const [tab, setTab] = useState<Tab>(initialTrades.length ? 'Dashboard' : 'Import');
  const [trades, setTrades] = useState<Trade[]>(initialTrades);
  const [connected, setConnected] = useState(initialConnected);
  const [lastSyncAt, setLastSyncAt] = useState(initialLastSyncAt);
  const [quotes, setQuotes] = useState<QuotesMap>({});

  const refreshQuotes = useCallback(async () => {
    if (!connected) return;
    const q = await getQuotes(TOPBAR_SYMBOLS);
    if (Object.keys(q).length) setQuotes(q);
  }, [connected]);

  // Fetch quotes on mount and on interval
  useEffect(() => {
    refreshQuotes();
    const id = setInterval(refreshQuotes, QUOTE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refreshQuotes]);

  const onSync = (synced: Trade[]) => {
    if (synced.length) setTrades(synced);
    setLastSyncAt(new Date().toISOString());
    router.refresh();
    if (synced.length) setTab('Dashboard');
  };

  const onDisconnect = () => {
    setConnected(false);
    setQuotes({});
    router.refresh();
  };

  const onClear = async () => {
    await clearAllData();
    setTrades([]);
    setLastSyncAt(null);
    router.refresh();
  };

  const view = () => {
    switch (tab) {
      case 'Analytics':    return <AnalyticsView trades={trades} />;
      case 'Trades':       return <TradesView trades={trades} />;
      case 'Tax Exposure': return <TaxView trades={trades} />;
      case 'Import':
        return (
          <ImportView
            isConnected={connected}
            lastSyncAt={lastSyncAt}
            onSync={onSync}
            onDisconnect={onDisconnect}
            onClear={onClear}
            hasData={trades.length > 0}
          />
        );
      default: return <DashboardView trades={trades} setTab={(t) => setTab(t as Tab)} />;
    }
  };

  return (
    <div className="dash" style={{ display: 'flex', flexDirection: 'column' }}>
      <Topbar
        dark={dark}
        setDark={setDark}
        tab={tab}
        setTab={setTab}
        isConnected={connected}
        quotes={quotes}
      />
      {view()}
    </div>
  );
}
