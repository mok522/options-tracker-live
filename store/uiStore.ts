import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { PositionStatus, StrategyType } from '@/types';

interface TradesFilter {
  status: PositionStatus | 'All';
  strategy: StrategyType | 'All';
  symbolSearch: string;
}

interface UIState {
  theme: 'light' | 'dark';
  tradesFilter: TradesFilter;
  toggleTheme: () => void;
  setTradesFilter: (patch: Partial<TradesFilter>) => void;
  resetFilter: () => void;
}

const DEFAULT_FILTER: TradesFilter = {
  status: 'All',
  strategy: 'All',
  symbolSearch: '',
};

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: 'light',
      tradesFilter: DEFAULT_FILTER,
      toggleTheme: () =>
        set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
      setTradesFilter: (patch) =>
        set((s) => ({ tradesFilter: { ...s.tradesFilter, ...patch } })),
      resetFilter: () => set({ tradesFilter: DEFAULT_FILTER }),
    }),
    {
      name: 'ott-ui',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
