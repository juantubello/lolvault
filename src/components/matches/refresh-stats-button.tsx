'use client';

import { RefreshCw } from 'lucide-react';
import { useState, useTransition } from 'react';

import { refreshPlayerStatsAction } from '@/features/matches/matches.actions';

export function RefreshStatsButton({ userId }: { userId: number }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function refresh(): void {
    setError(null);
    startTransition(async () => {
      try {
        const result = await refreshPlayerStatsAction(userId);
        if (!result.ok) setError(result.error);
      } catch {
        setError('No pudimos actualizar las estadísticas. Probá de nuevo.');
      }
    });
  }

  return (
    <>
      <button
        className="stats-refresh-button"
        disabled={pending}
        onClick={refresh}
        type="button"
      >
        <RefreshCw aria-hidden="true" className={pending ? 'is-spinning' : undefined} size={18} strokeWidth={2} />
        <span>{pending ? 'Actualizando…' : 'Actualizar'}</span>
      </button>
      {error ? (
        <p className="stats-refresh-error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
