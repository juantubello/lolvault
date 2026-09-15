import Link from 'next/link';

import { AppLogo } from '@/components/app-logo';

export default function NotFound() {
  return (
    <main className="onboarding-screen">
      <section aria-labelledby="not-found-title" className="onboarding-card access-card">
        <AppLogo className="app-logo-hero" size={96} />
        <h1 id="not-found-title">No encontramos esto</h1>
        <p>La página no existe o ya no está disponible (por ejemplo, una partida que OP.GG no devolvió).</p>
        <Link className="primary-button app-error-link" href="/">
          Volver a Votaciones
        </Link>
      </section>
    </main>
  );
}
