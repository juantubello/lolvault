import Database from 'better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CUSTOM_NOTIFICATION_MAX_LENGTH, CUSTOM_NOTIFICATIONS_PER_DAY } from '@/config';
import { applyPragmas, createDb, type Db } from '@/db/client';
import { pushSubscriptions, users } from '@/db/schema';
import {
  createCustomNotification,
  customNotificationDay,
  getTodayCustomNotification,
  validateCustomMessage,
} from '@/features/push/custom-notifications';
import {
  countUsersWithDevices,
  filterUsersByCategory,
  getNotificationPreferences,
  setNotificationPreference,
} from '@/features/push/notification-preferences';
import { sendDeliveries } from '@/features/push/push-dispatch';
import { customNotificationEvent, vaultProposalCreatedEvent, type PushDelivery } from '@/features/push/push-events';

const NOW = new Date('2026-09-15T15:00:00Z'); // 12:00 en Argentina

let sqlite: Database.Database;
let db: Db;
let ids: number[];

function addUser(name: string): number {
  return db
    .insert(users)
    .values({ externalIdentity: `test:${name}`, email: `${name}@example.com`, displayName: name, createdAt: NOW })
    .returning({ id: users.id })
    .get().id;
}

function addDevice(userId: number, suffix: string): void {
  db.insert(pushSubscriptions)
    .values({
      userId,
      endpoint: `https://push.example.test/${suffix}`,
      p256dh: 'p256dh-key',
      auth: 'auth-key',
      deviceLabel: 'Test',
      createdAt: NOW,
    })
    .run();
}

async function recipientsOf(deliveries: PushDelivery[]): Promise<number[][]> {
  const calls: number[][] = [];
  await sendDeliveries(db, deliveries, async (_db, userIds) => {
    calls.push([...userIds]);
    return { sent: userIds.length, removed: 0, failed: 0 };
  });
  return calls;
}

beforeEach(() => {
  sqlite = new Database(':memory:');
  applyPragmas(sqlite);
  db = createDb(sqlite);
  migrate(db, { migrationsFolder: 'src/db/migrations' });
  ids = ['Alicia', 'Bruno', 'Carla', 'Dante'].map(addUser);
});

afterEach(() => sqlite.close());

describe('preferencias de notificaciones', () => {
  it('sin fila todo está encendido y cambiar una categoría no toca las otras', () => {
    const [alicia] = ids as [number];
    expect(getNotificationPreferences(db, alicia)).toEqual({ vaults: true, blacklist: true, custom: true });

    setNotificationPreference(db, alicia, 'blacklist', false, NOW);
    expect(setNotificationPreference(db, alicia, 'vaults', false, NOW)).toEqual({
      vaults: false,
      blacklist: false,
      custom: true,
    });
  });

  it('filtra solo a quienes apagaron esa categoría', () => {
    const [alicia, bruno, carla] = ids as [number, number, number];
    setNotificationPreference(db, bruno, 'vaults', false, NOW);
    expect(filterUsersByCategory(db, [alicia, bruno, carla], 'vaults')).toEqual([alicia, carla]);
    expect(filterUsersByCategory(db, [alicia, bruno, carla], 'custom')).toEqual([alicia, bruno, carla]);
  });

  it('el envío respeta preferencias salvo en avisos del sistema', async () => {
    const [alicia, bruno, carla, dante] = ids as [number, number, number, number];
    setNotificationPreference(db, carla, 'vaults', false, NOW);
    setNotificationPreference(db, dante, 'custom', false, NOW);

    const vault = vaultProposalCreatedEvent({
      proposalId: 1,
      kind: 'vault',
      memberIds: ids,
      targetUserId: alicia,
      proposerUserId: bruno,
      proposerName: 'Bruno',
      targetName: 'Alicia',
      championName: 'Ahri',
    });
    expect(await recipientsOf(vault)).toEqual([[dante]]);

    const custom = customNotificationEvent({
      notificationId: 1,
      memberIds: ids,
      senderUserId: alicia,
      senderName: 'Alicia',
      message: 'flex?',
    });
    // Carla apagó vaults pero sigue recibiendo avisos de amigos.
    expect(await recipientsOf(custom)).toEqual([[bruno, carla]]);

    const system: PushDelivery = {
      category: 'system',
      userIds: [dante],
      payload: { title: 't', body: 'b', url: '/', tag: 'x' },
    };
    expect(await recipientsOf([system])).toEqual([[dante]]);
  });

  it('cuenta usuarios con al menos un dispositivo', () => {
    const [alicia, bruno] = ids as [number, number];
    addDevice(alicia, 'a1');
    addDevice(alicia, 'a2');
    expect(countUsersWithDevices(db, [alicia, bruno])).toBe(1);
  });
});

describe('aviso custom diario', () => {
  it('valida largo y colapsa espacios', () => {
    expect(validateCustomMessage('   ')).toEqual({ ok: false, error: 'Escribí el aviso.' });
    expect(validateCustomMessage('  hola\n\n  grupo ')).toEqual({ ok: true, message: 'hola grupo' });
    expect(validateCustomMessage('a'.repeat(CUSTOM_NOTIFICATION_MAX_LENGTH)).ok).toBe(true);
    expect(validateCustomMessage('a'.repeat(CUSTOM_NOTIFICATION_MAX_LENGTH + 1)).ok).toBe(false);
  });

  it('permite uno por día argentino y rechaza el segundo aunque sea tarde en UTC', () => {
    expect(CUSTOM_NOTIFICATIONS_PER_DAY).toBe(1);
    const [alicia, bruno] = ids as [number, number];

    expect(createCustomNotification(db, alicia, 'primero', NOW).ok).toBe(true);
    // 23:30 UTC = 20:30 del mismo día en Argentina.
    const second = createCustomNotification(db, alicia, 'segundo', new Date('2026-09-15T23:30:00Z'));
    expect(second).toMatchObject({ ok: false, reason: 'already-sent', notification: { message: 'primero' } });

    // Otro usuario tiene su propio cupo.
    expect(createCustomNotification(db, bruno, 'mío', NOW).ok).toBe(true);
  });

  it('se habilita a las 00:00 de Argentina (03:00 UTC)', () => {
    const [alicia] = ids as [number];
    const lastMinute = new Date('2026-09-16T02:59:00Z'); // 23:59 del 15 en Argentina
    const nextDay = new Date('2026-09-16T03:01:00Z'); // 00:01 del 16

    expect(customNotificationDay(lastMinute)).toBe('2026-09-15');
    expect(customNotificationDay(nextDay)).toBe('2026-09-16');
    expect(createCustomNotification(db, alicia, 'noche', lastMinute).ok).toBe(true);
    expect(getTodayCustomNotification(db, alicia, nextDay)).toBeNull();
    expect(createCustomNotification(db, alicia, 'madrugada', nextDay).ok).toBe(true);
  });

  it('el aviso no le llega a quien lo manda', () => {
    const [alicia] = ids as [number];
    const deliveries = customNotificationEvent({
      notificationId: 7,
      memberIds: ids,
      senderUserId: alicia,
      senderName: 'Alicia',
      message: '¿flex?',
    });
    expect(deliveries[0]?.userIds).not.toContain(alicia);
    expect(deliveries[0]?.payload).toMatchObject({ title: 'Alicia avisa', body: '¿flex?', tag: 'custom-7' });
  });
});
