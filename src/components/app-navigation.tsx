'use client';

import { CircleUserRound, LockKeyhole, Telescope, Users, Vote, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { AppLogo } from './app-logo';

type Destination = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const destinations: Destination[] = [
  { href: '/', label: 'Votaciones', icon: Vote },
  { href: '/ripeados?tipo=vaults', label: 'Ripeados', icon: LockKeyhole },
  { href: '/scout?tipo=jugador', label: 'Scout', icon: Telescope },
  { href: '/amigos', label: 'Amigos', icon: Users },
  { href: '/perfil', label: 'Perfil', icon: CircleUserRound },
];

function isCurrent(pathname: string, href: string): boolean {
  const hrefPath = href.split('?')[0] ?? href;
  return hrefPath === '/' ? pathname === hrefPath : pathname.startsWith(hrefPath);
}

function NavigationItems({
  variant,
  pendingVotes,
}: {
  variant: 'tabs' | 'sidebar';
  pendingVotes: number;
}) {
  const pathname = usePathname();

  return destinations.map(({ href, label, icon: Icon }) => {
    const active = isCurrent(pathname, href);
    const badge = href === '/' && pendingVotes > 0 ? pendingVotes : 0;

    return (
      <Link
        aria-current={active ? 'page' : undefined}
        className={variant === 'tabs' ? 'tab-item' : 'sidebar-item'}
        data-active={active}
        href={href}
        key={href}
      >
        <span className="nav-icon">
          <Icon aria-hidden="true" size={24} strokeWidth={2} />
          {badge ? (
            <span aria-hidden="true" className="nav-badge">
              {badge > 9 ? '9+' : badge}
            </span>
          ) : null}
        </span>
        <span className="nav-label">{label}</span>
        {badge ? (
          <span className="sr-only">
            , {badge} {badge === 1 ? 'votación pendiente' : 'votaciones pendientes'}
          </span>
        ) : null}
      </Link>
    );
  });
}

export function AppNavigation({ pendingVotes }: { pendingVotes: number }) {
  return (
    <>
      <aside className="sidebar" aria-label="Navegación principal">
        <div className="sidebar-brand">
          <AppLogo size={44} />
          <span>LolVault</span>
        </div>
        <nav className="sidebar-list">
          <NavigationItems pendingVotes={pendingVotes} variant="sidebar" />
        </nav>
      </aside>

      <nav className="tab-bar" aria-label="Navegación principal">
        <NavigationItems pendingVotes={pendingVotes} variant="tabs" />
      </nav>
    </>
  );
}
