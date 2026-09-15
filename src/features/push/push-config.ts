export type PushConfig =
  | {
      enabled: true;
      publicKey: string;
      privateKey: string;
      subject: string;
    }
  | {
      enabled: false;
      publicKey: null;
      reason: string;
    };

const BASE64_URL = /^[A-Za-z0-9_-]+$/;

function isVapidKey(value: string, expectedLength: number): boolean {
  return value.length === expectedLength && BASE64_URL.test(value);
}

/**
 * Único lugar que lee las variables VAPID. La clave pública sale al cliente únicamente como
 * prop de un Server Component; la privada nunca cruza el límite del servidor.
 */
export function readPushConfig(env: NodeJS.ProcessEnv = process.env): PushConfig {
  const publicKey = env.LOLVAULT_VAPID_PUBLIC_KEY?.trim() ?? '';
  const privateKey = env.LOLVAULT_VAPID_PRIVATE_KEY?.trim() ?? '';
  const subject = env.LOLVAULT_VAPID_SUBJECT?.trim() ?? '';

  if (!publicKey || !privateKey || !subject) {
    return {
      enabled: false,
      publicKey: null,
      reason: 'Falta configurar VAPID en el servidor.',
    };
  }

  if (
    !isVapidKey(publicKey, 87) ||
    !isVapidKey(privateKey, 43) ||
    !/^mailto:[^\s@]+@[^\s@]+$/i.test(subject)
  ) {
    return {
      enabled: false,
      publicKey: null,
      reason: 'La configuración VAPID del servidor no es válida.',
    };
  }

  return { enabled: true, publicKey, privateKey, subject };
}
