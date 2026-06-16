'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Trade } from '@/types/trade';
import { importTrades } from '@/actions/upsertTrades';
import { clearAllData } from '@/actions/clearData';
import { Topbar } from '@/components/layout/Topbar';
import { DashboardView } from '@/components/dashboard/DashboardView';
import { AnalyticsView } from '@/components/analytics/AnalyticsView';
import { TradesView } from '@/components/trades/TradesView';
import { TaxView } from '@/components/tax/TaxView';
import { ImportView } from '@/components/import/ImportView';

type Tab = 'Dashboard' | 'Analytics' | 'Trades' | 'Tax Exposure' | 'Import';

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

export function TrackerApp({ initialTrades = [] }: { initialTrades?: Trade[] }) {
  const router = useRouter();
  const [dark, setDark] = useTheme();
  const [tab, setTab] = useState<Tab>(initialTrades.length ? 'Dashboard' : 'Import');
  const [trades, setTrades] = useState<Trade[]>(initialTrades);
  const [lastImport, setLastImport] = useState<string>('');

  const onImport = async (legs: Trade[], hasPnl: boolean) => {
    if (legs.length) {
      // Persist legs + recompute positions across all imported files,
      // then show the full accumulated set (not just this file).
      const recomputed = await importTrades(legs, hasPnl);
      setTrades(recomputed);
    }
    const now = new Date();
    const stamp = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' · ' + now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    setLastImport(stamp);
    router.refresh();
    setTab('Dashboard');
  };

  const onClear = async () => {
    await clearAllData();
    setTrades([]);
    setLastImport('');
    router.refresh();
  };

  const view = () => {
    switch (tab) {
      case 'Analytics':    return <AnalyticsView trades={trades} />;
      case 'Trades':       return <TradesView trades={trades} />;
      case 'Tax Exposure': return <TaxView trades={trades} />;
      case 'Import':       return <ImportView onImport={onImport} onClear={onClear} hasData={trades.length > 0} lastImport={lastImport} />;
      default:             return <DashboardView trades={trades} setTab={(t) => setTab(t as Tab)} />;
    }
  };

  return (
    <div className="dash" style={{ display: 'flex', flexDirection: 'column' }}>
      <Topbar dark={dark} setDark={setDark} tab={tab} setTab={setTab} />
      {view()}
    </div>
  );
}
