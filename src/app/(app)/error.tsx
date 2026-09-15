'use client';

import { RefreshCw, WifiOff, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';

import { classifyClientError } from '@/features/app/client-errors';

/**
 * Error de una pantalla o de una acción (votar, proponer, activar notificaciones…). El caso más
 * común en producción es la sesión de Cloudflare Access vencida: la acción no llega a la app y lo
 * único que lo arregla es recargar, que pasa por el login de Access y vuelve.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [kind, setKind] = useState<'connection' | 'unknown'>('unknown');

  useEffect(() => {
    setKind(classifyClientError(error, navigator.onLine));
    console.error(error);
  }, [error]);

  const connection = kind === 'connection';
  const Icon = connection ? WifiOff : TriangleAlert;

  return (
    <div className="screen">
      <section aria-labelledby="app-error-title" className="empty-state app-error" role="alert">
        <div aria-hidden="true" className="empty-icon">
          <Icon size={24} strokeWidth={2} />
        </div>
        <h2 id="app-error-title">{connection ? 'Se cortó la conexión' : 'Algo salió mal'}</h2>
        <p>
          {connection
            ? 'Puede que tu sesión haya vencido o que te hayas quedado sin internet. Recargá la página para volver a entrar; lo que ya estaba guardado no se pierde.'
            : 'No pudimos completar esto. Probá de nuevo y, si sigue pasando, recargá la app.'}
        </p>
        <div className="app-error-actions">
          <button className="primary-button" onClick={() => window.location.reload()} type="button">
            <RefreshCw aria-hidden="true" size={20} />
            Recargar
          </button>
          {connection ? null : (
            <button className="text-button" onClick={reset} type="button">
              Reintentar
            </button>
          )}
        </div>
        {error.digest ? <p className="app-error-code">Código: {error.digest}</p> : null}
      </section>
    </div>
  );
}
