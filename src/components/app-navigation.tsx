'use client';

import { CircleUserRound, LockKeyhole, Users, Vote, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Destination = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const destinations: Destination[] = [
  { href: '/', label: 'Votaciones', icon: Vote },
  { href: '/vaults', label: 'Vaults', icon: LockKeyhole },
  { href: '/amigos', label: 'Amigos', icon: Users },
  { href: '/perfil', label: 'Perfil', icon: CircleUserRound },
];

function isCurrent(pathname: string, href: string): boolean {
  return href === '/' ? pathname === href : pathname.startsWith(href);
}

function NavigationItems({ variant }: { variant: 'tabs' | 'sidebar' }) {
  const pathname = usePathname();

  return destinations.map(({ href, label, icon: Icon }) => {
    const active = isCurrent(pathname, href);
    return (
      <Link
        aria-current={active ? 'page' : undefined}
        className={variant === 'tabs' ? 'tab-item' : 'sidebar-item'}
        data-active={active}
        href={href}
        key={href}
      >
        <Icon aria-hidden="true" size={24} strokeWidth={2} />
        <span>{label}</span>
      </Link>
    );
  });
}

export function AppNavigation() {
  return (
    <>
      <aside className="sidebar" aria-label="Navegación principal">
        <div className="sidebar-brand">
          <div className="app-mark app-mark-small" aria-hidden="true">
            LV
          </div>
          <span>LolVault</span>
        </div>
        <nav className="sidebar-list">
          <NavigationItems variant="sidebar" />
        </nav>
      </aside>

      <nav className="tab-bar" aria-label="Navegación principal">
        <NavigationItems variant="tabs" />
      </nav>
    </>
  );
}
