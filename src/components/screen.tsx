import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

export function Screen({
  title,
  back,
  children,
}: {
  title: string;
  /** Pantalla de segundo nivel: botón "‹ Anterior" estilo iOS arriba del título. */
  back?: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <div className="screen">
      <header className="screen-header">
        {back ? (
          <Link className="screen-back" href={back.href}>
            <ChevronLeft aria-hidden="true" size={24} strokeWidth={2} />
            <span>{back.label}</span>
          </Link>
        ) : null}
        <h1>{title}</h1>
      </header>
      {children}
    </div>
  );
}
