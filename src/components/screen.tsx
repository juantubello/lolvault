import type { ReactNode } from 'react';

export function Screen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="screen">
      <header className="screen-header">
        <h1>{title}</h1>
      </header>
      {children}
    </div>
  );
}
