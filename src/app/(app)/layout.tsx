import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { getCurrentUser } from '@/auth/current-user';
import { onboardingRedirectFor } from '@/auth/onboarding-redirect';
import { AppNavigation } from '@/components/app-navigation';
import { getDb } from '@/db/client';
import { countPendingVotes } from '@/features/vaults/vaults.queries';

export const dynamic = 'force-dynamic';

export default async function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const redirectTo = onboardingRedirectFor(user);
  if (redirectTo) redirect(redirectTo);

  // `user` existe: onboardingRedirectFor ya redirigió si no.
  const pendingVotes = user ? countPendingVotes(getDb(), user.id, new Date()) : 0;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Saltar al contenido
      </a>
      <AppNavigation pendingVotes={pendingVotes} />
      <main className="app-content" id="main-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
