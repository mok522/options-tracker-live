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
    <aside className="w-[220px] flex-shrink-0 border-r border-border flex flex-col min-h-screen">
      {/* Logo */}
      <div className="p-4 border-b border-border">
        <span className="font-mono font-semibold text-sm tracking-tight">Options Tracker</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom: Import + Theme */}
      <div className="p-3 border-t border-border space-y-2">
        <Link
          href="/import"
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors w-full"
        >
          <Upload className="w-4 h-4" />
          Import CSV
        </Link>
        <ThemeToggle />
      </div>
    </aside>
  );
}
