import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyPragmas, createDb, type Db } from '@/db/client';
import { pushSubscriptions, users } from '@/db/schema';
import { notifyUsers, PUSH_TTL_SECONDS, type PushSender } from '@/features/push/push-sender';

const NOW = new Date('2026-09-15T12:00:00Z');
const config = {
  enabled: true as const,
  publicKey: 'A'.repeat(87),
  privateKey: 'B'.repeat(43),
  subject: 'mailto:admin@example.com',
};
const payload = { title: 'Título', body: 'Cuerpo', url: '/', tag: 'vote-1' };

let sqlite: Database.Database;
let db: Db;
let userId: number;

function addSubscription(endpoint: string) {
  return db
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint,
      p256dh: 'public_key',
      auth: 'auth_key',
      deviceLabel: 'Test',
      createdAt: NOW,
    })
    .returning()
    .get();
}

beforeEach(() => {
  sqlite = new Database(':memory:');
  applyPragmas(sqlite);
  db = createDb(sqlite);
  migrate(db, { migrationsFolder: 'src/db/migrations' });
  userId = db
    .insert(users)
    .values({
      externalIdentity: 'test:user',
      email: 'user@example.com',
      displayName: 'User',
      createdAt: NOW,
    })
    .returning({ id: users.id })
    .get().id;
});

afterEach(() => sqlite.close());

describe('envío push', () => {
  it('borra endpoints 404/410, registra éxitos y conserva las opciones VAPID', async () => {
    const gone404 = addSubscription('https://push.test/404');
    const gone410 = addSubscription('https://push.test/410');
    const good = addSubscription('https://push.test/ok');
    const sender = vi.fn<PushSender>(async (subscription, serialized, options) => {
      expect(JSON.parse(serialized)).toMatchObject({ title: 'Título', data: { url: '/' } });
      expect(options).toMatchObject({
        TTL: PUSH_TTL_SECONDS,
        urgency: 'normal',
        vapidDetails: {
          subject: config.subject,
          publicKey: config.publicKey,
          privateKey: config.privateKey,
        },
      });
      if (subscription.endpoint.endsWith('/404')) throw Object.assign(new Error('gone'), { statusCode: 404 });
      if (subscription.endpoint.endsWith('/410')) throw Object.assign(new Error('gone'), { statusCode: 410 });
      return {};
    });

    const result = await notifyUsers(db, [userId], payload, sender, config, NOW);
    expect(result).toEqual({ sent: 1, removed: 2, failed: 0 });
    expect(sender).toHaveBeenCalledTimes(3);
    expect(db.select().from(pushSubscriptions).where(eq(pushSubscriptions.id, gone404.id)).get()).toBeUndefined();
    expect(db.select().from(pushSubscriptions).where(eq(pushSubscriptions.id, gone410.id)).get()).toBeUndefined();
    expect(db.select().from(pushSubscriptions).where(eq(pushSubscriptions.id, good.id)).get()?.lastSuccessAt).toEqual(NOW);
  });

  it('incrementa failure_count en otros errores y nunca los propaga', async () => {
    const row = addSubscription('https://push.test/error');
    const sender: PushSender = async () => {
      throw Object.assign(new Error('unavailable'), { statusCode: 503 });
    };
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(notifyUsers(db, [userId], payload, sender, config, NOW)).resolves.toEqual({
      sent: 0,
      removed: 0,
      failed: 1,
    });
    expect(db.select().from(pushSubscriptions).where(eq(pushSubscriptions.id, row.id)).get()?.failureCount).toBe(1);
    warning.mockRestore();
  });
});
