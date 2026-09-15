import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/auth/current-user';
import { AppLogo } from '@/components/app-logo';
import { ProfileForm } from '@/components/profile-form';

import { completeOnboardingAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/acceso-requerido');
  if (user.displayName) redirect('/');

  return (
    <main className="onboarding-screen">
      <section className="onboarding-card" aria-labelledby="onboarding-title">
        <AppLogo className="app-logo-hero" size={96} />
        <p className="eyebrow">Primera vez en LolVault</p>
        <h1 id="onboarding-title">Completá tu perfil</h1>
        <p className="onboarding-intro">
          Elegí cómo te van a ver tus amigos. El Riot ID es opcional por ahora.
        </p>
        <ProfileForm
          action={completeOnboardingAction}
          riotHelp="Podés agregarlo más adelante desde Perfil."
          submitLabel="Continuar"
        />
      </section>
    </main>
  );
}
