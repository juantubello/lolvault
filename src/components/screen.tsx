import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

export function Screen({
  title,
  back,
  action,
  children,
}: {
  title: string;
  /** Pantalla de segundo nivel: botón "‹ Anterior" estilo iOS arriba del título. */
  back?: { href: string; label: string };
  /** Acción principal a la derecha del título (ej. "Proponer"). */
  action?: ReactNode;
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
        <div className="screen-title-row">
          <h1>{title}</h1>
          {action}
        </div>
      </header>
      {children}
    </div>
  );
}
