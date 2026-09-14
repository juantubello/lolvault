import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/auth/current-user';

import { OnboardingForm } from './onboarding-form';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/acceso-requerido');
  if (user.displayName) redirect('/');

  return (
    <main className="onboarding-screen">
      <section className="onboarding-card" aria-labelledby="onboarding-title">
        <div className="app-mark" aria-hidden="true">
          LV
        </div>
        <p className="eyebrow">Primera vez en LolVault</p>
        <h1 id="onboarding-title">Completá tu perfil</h1>
        <p className="onboarding-intro">
          Elegí cómo te van a ver tus amigos. El Riot ID es opcional por ahora.
        </p>
        <OnboardingForm />
      </section>
    </main>
  );
}
