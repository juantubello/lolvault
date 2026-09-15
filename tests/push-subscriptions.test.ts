import Database from 'better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { applyPragmas, createDb, type Db } from '@/db/client';
import { pushSubscriptions, users } from '@/db/schema';
import {
  removePushSubscription,
  upsertPushSubscription,
  validatePushSubscription,
} from '@/features/push/push-subscriptions';

const NOW = new Date('2026-09-15T12:00:00Z');
const subscription = {
  endpoint: 'https://push.example.test/subscription/one',
  keys: { p256dh: 'public_key-123', auth: 'auth_key-456' },
};

let sqlite: Database.Database;
let db: Db;
let userA: number;
let userB: number;

function addUser(name: string): number {
  return db
    .insert(users)
    .values({
      externalIdentity: `test:${name}`,
      email: `${name}@example.com`,
      displayName: name,
      createdAt: NOW,
    })
    .returning({ id: users.id })
    .get().id;
}

beforeEach(() => {
  sqlite = new Database(':memory:');
  applyPragmas(sqlite);
  db = createDb(sqlite);
  migrate(db, { migrationsFolder: 'src/db/migrations' });
  userA = addUser('a');
  userB = addUser('b');
});

afterEach(() => sqlite.close());

describe('suscripciones push', () => {
  it('valida endpoint HTTPS y las dos claves', () => {
    expect(validatePushSubscription(subscription)).toEqual({ ok: true, value: subscription });
    expect(validatePushSubscription({ ...subscription, endpoint: 'http://push.example.test/a' })).toMatchObject({
      ok: false,
    });
    expect(validatePushSubscription({ endpoint: subscription.endpoint, keys: { auth: 'ok' } })).toMatchObject({
      ok: false,
    });
    expect(validatePushSubscription(null)).toMatchObject({ ok: false });
  });

  it('hace upsert por endpoint y lo reasigna al usuario actual', () => {
    const first = upsertPushSubscription(db, userA, subscription, 'Mac · Safari', NOW);
    const reassigned = upsertPushSubscription(
      db,
      userB,
      { ...subscription, keys: { p256dh: 'new_public', auth: 'new_auth' } },
      'iPhone',
      new Date(NOW.getTime() + 1000),
    );
    expect(reassigned.id).toBe(first.id);
    expect(db.select().from(pushSubscriptions).all()).toEqual([
      expect.objectContaining({
        userId: userB,
        endpoint: subscription.endpoint,
        p256dh: 'new_public',
        deviceLabel: 'iPhone',
      }),
    ]);
  });

  it('no permite que un usuario borre la suscripción de otro', () => {
    upsertPushSubscription(db, userA, subscription, 'Mac · Chrome', NOW);
    expect(removePushSubscription(db, userB, subscription.endpoint)).toBe(false);
    expect(db.select().from(pushSubscriptions).all()).toHaveLength(1);
    expect(removePushSubscription(db, userA, subscription.endpoint)).toBe(true);
    expect(db.select().from(pushSubscriptions).all()).toHaveLength(0);
  });
});
