'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, List, Calculator, Upload } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/trades', label: 'Trades', icon: List },
  { href: '/tax', label: 'Tax', icon: Calculator },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="w-[212px] flex-shrink-0 border-r border-border flex flex-col min-h-screen"
      style={{ background: 'var(--card)' }}
    >
      {/* Logo */}
      <div className="px-4 py-3.5 border-b border-border">
        <span
          className="text-[13px] font-semibold tracking-tight"
          style={{ color: 'var(--text-1)' }}
        >
          Options Tracker
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2.5 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors"
              style={
                isActive
                  ? {
                      background: 'var(--color-accent-wash)',
                      color: 'var(--color-accent-ds)',
                    }
                  : {
                      color: 'var(--text-2)',
                    }
              }
              onMouseEnter={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = 'var(--hover)';
                  (e.currentTarget as HTMLElement).style.color = 'var(--text-1)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = '';
                  (e.currentTarget as HTMLElement).style.color = 'var(--text-2)';
                }
              }}
            >
              <Icon className="w-[15px] h-[15px] flex-shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom: Import + Theme */}
      <div className="p-2.5 border-t border-border space-y-1">
        <Link
          href="/import"
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-opacity w-full"
          style={{ background: 'var(--text-1)', color: 'var(--background)' }}
        >
          <Upload className="w-[15px] h-[15px] flex-shrink-0" />
          Import CSV
        </Link>
        <ThemeToggle />
      </div>
    </aside>
  );
}
