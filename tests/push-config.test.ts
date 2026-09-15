import { describe, expect, it } from 'vitest';

import { readPushConfig } from '@/features/push/push-config';

const complete = {
  NODE_ENV: 'test',
  LOLVAULT_VAPID_PUBLIC_KEY: 'A'.repeat(87),
  LOLVAULT_VAPID_PRIVATE_KEY: 'B'.repeat(43),
  LOLVAULT_VAPID_SUBJECT: 'mailto:admin@example.com',
} satisfies NodeJS.ProcessEnv;

describe('configuración push', () => {
  it.each([
    'LOLVAULT_VAPID_PUBLIC_KEY',
    'LOLVAULT_VAPID_PRIVATE_KEY',
    'LOLVAULT_VAPID_SUBJECT',
  ] as const)('queda deshabilitada si falta %s', (key) => {
    const env = { ...complete };
    delete env[key];
    expect(readPushConfig(env)).toMatchObject({ enabled: false, publicKey: null });
  });

  it('queda habilitada únicamente con el trío válido', () => {
    expect(readPushConfig(complete)).toEqual({
      enabled: true,
      publicKey: complete.LOLVAULT_VAPID_PUBLIC_KEY,
      privateKey: complete.LOLVAULT_VAPID_PRIVATE_KEY,
      subject: complete.LOLVAULT_VAPID_SUBJECT,
    });
  });
});
