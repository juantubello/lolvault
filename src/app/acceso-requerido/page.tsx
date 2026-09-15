import { AppLogo } from '@/components/app-logo';

export default function AccessRequiredPage() {
  return (
    <main className="onboarding-screen">
      <section className="onboarding-card access-card">
        <AppLogo className="app-logo-hero" size={96} />
        <h1>Acceso requerido</h1>
        <p>
          Entrá a LolVault desde su dirección protegida por Cloudflare Access. Si tu sesión
          venció, recargá la página para volver a identificarte.
        </p>
      </section>
    </main>
  );
}
