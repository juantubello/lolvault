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
      {/* Fuera del <header>: un elemento sticky solo se sostiene mientras su contenedor está a la
          vista, así que colgado de .screen queda fijo durante todo el scroll. */}
      {back ? (
        <Link className="screen-back" href={back.href}>
          <ChevronLeft aria-hidden="true" size={24} strokeWidth={2} />
          <span>{back.label}</span>
        </Link>
      ) : null}
      <header className="screen-header">
        <div className="screen-title-row">
          <h1>{title}</h1>
          {action}
        </div>
      </header>
      {children}
    </div>
  );
}
