import type { User } from '@/db/schema';

/** Destino obligatorio para una identidad sin perfil completo. */
export function onboardingRedirectFor(user: User | null): string | null {
  if (!user) return '/acceso-requerido';
  if (!user.displayName) return '/onboarding';
  return null;
}
