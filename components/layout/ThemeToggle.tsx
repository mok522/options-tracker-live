'use client';
import { Sun, Moon } from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const { theme, toggleTheme } = useUIStore();
  return (
    <button
      onClick={toggleTheme}
      className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[13px] font-medium transition-colors"
      style={{ color: 'var(--text-2)' }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = 'var(--hover)';
        (e.currentTarget as HTMLElement).style.color = 'var(--text-1)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = '';
        (e.currentTarget as HTMLElement).style.color = 'var(--text-2)';
      }}
    >
      {theme === 'dark' ? (
        <Sun className="w-[15px] h-[15px] flex-shrink-0" />
      ) : (
        <Moon className="w-[15px] h-[15px] flex-shrink-0" />
      )}
      {theme === 'dark' ? 'Light mode' : 'Dark mode'}
    </button>
  );
}
