'use client';
import { Sun, Moon } from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const { theme, toggleTheme } = useUIStore();
  return (
    <Button variant="ghost" size="sm" onClick={toggleTheme} className="w-full justify-start gap-3">
      {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      <span className="text-sm">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
    </Button>
  );
}
