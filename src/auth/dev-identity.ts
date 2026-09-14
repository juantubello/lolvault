import type { Identity } from './identity';

/** Único bypass de identidad permitido, y solamente fuera de producción. */
export function getDevIdentity(
  env: NodeJS.ProcessEnv = process.env,
): Identity | null {
  if (env.NODE_ENV === 'production') return null;

  const email = env.LOLVAULT_DEV_USER_EMAIL?.trim();
  if (!email) return null;

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
