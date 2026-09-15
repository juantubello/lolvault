'use client';

/**
 * Último recurso: falló el layout raíz, así que no hay CSS de la app ni navegación. Estilos
 * inline mínimos, respetando claro/oscuro con los colores del sistema.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="es">
      <body
        style={{
          display: 'grid',
          minHeight: '100dvh',
          margin: 0,
          padding: '1.5rem',
          placeItems: 'center',
          background: 'Canvas',
          color: 'CanvasText',
          colorScheme: 'light dark',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          textAlign: 'center',
        }}
      >
        <main style={{ maxWidth: '24rem' }}>
          <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.375rem' }}>LolVault no pudo cargar</h1>
          <p style={{ margin: '0 0 1.25rem', lineHeight: 1.4 }}>
            Recargá la página. Si tu sesión venció, vas a pasar por el login y volver acá.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              minHeight: '2.75rem',
              padding: '0 1.25rem',
              border: 0,
              borderRadius: '0.75rem',
              background: '#0066d6',
              color: '#ffffff',
              font: 'inherit',
              fontWeight: 600,
            }}
            type="button"
          >
            Recargar
          </button>
          {error.digest ? (
            <p style={{ marginTop: '1rem', fontSize: '0.75rem', opacity: 0.7 }}>Código: {error.digest}</p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
