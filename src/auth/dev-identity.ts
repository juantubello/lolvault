import type { Identity } from './identity';

/** Cookie del selector de usuario de desarrollo. Solo se lee fuera de producción. */
export const DEV_USER_COOKIE = 'lolvault_dev_email';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/;

export function normalizeDevEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLocaleLowerCase('en-US');
  return email && EMAIL_PATTERN.test(email) ? email : null;
}

/** Modo dev = no es producción y hay un email de desarrollo configurado. */
export function isDevBypassEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== 'production' && Boolean(env.LOLVAULT_DEV_USER_EMAIL?.trim());
}

/**
 * Único bypass de identidad permitido, y solamente fuera de producción.
 * `switchedEmail` viene de la cookie del selector de usuario de dev; sin ella se usa
 * `LOLVAULT_DEV_USER_EMAIL`.
 */
export function getDevIdentity(
  env: NodeJS.ProcessEnv = process.env,
  switchedEmail?: string | null,
): Identity | null {
  if (env.NODE_ENV === 'production') return null;

  const defaultEmail = env.LOLVAULT_DEV_USER_EMAIL?.trim();
  if (!defaultEmail) return null;

  const email = normalizeDevEmail(switchedEmail) ?? defaultEmail;

  return {
    externalIdentity: `dev:${email}`,
    email,
    source: 'dev',
  };
}

/** Impide arrancar producción si se filtró el bypass de desarrollo. */
export function assertDevBypassDisabledInProduction(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV !== 'production') return;
  if (!env.LOLVAULT_DEV_USER_EMAIL?.trim()) return;

  throw new Error(
    'LOLVAULT_DEV_USER_EMAIL está seteada con NODE_ENV=production. ' +
      'Quitala del entorno antes de levantar LolVault.',
  );
}
