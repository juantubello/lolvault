import { ShieldAlert } from 'lucide-react';

export default function AccessRequiredPage() {
  return (
    <main className="onboarding-screen">
      <section className="onboarding-card access-card">
        <div className="empty-icon" aria-hidden="true">
          <ShieldAlert size={24} strokeWidth={2} />
        </div>
        <h1>Acceso requerido</h1>
        <p>
          Entrá a LolVault desde su dirección protegida por Cloudflare Access. Si tu sesión
          venció, recargá la página para volver a identificarte.
        </p>
      </section>
    </main>
  );
}
