import type Database from 'better-sqlite3';
import { and, desc, eq } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import type { Db } from '@/db/client';
import * as schema from '@/db/schema';
import { pushSubscriptions } from '@/db/schema';

type Queryable = BaseSQLiteDatabase<'sync', Database.RunResult, typeof schema>;

export type PushSubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export type PushDeviceView = {
  id: number;
  endpoint: string;
  deviceLabel: string;
  createdAt: string;
  lastSuccessAt: string | null;
  failureCount: number;
};

export type PushSubscriptionValidation =
  | { ok: true; value: PushSubscriptionInput }
  | { ok: false; error: string };

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function validKey(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 512 &&
    /^[A-Za-z0-9_-]+={0,2}$/.test(value)
  );
}

/** Valida datos no confiables serializados por PushSubscription.toJSON(). */
export function validatePushSubscription(value: unknown): PushSubscriptionValidation {
  const input = record(value);
  const keys = record(input?.keys);
  const endpoint = typeof input?.endpoint === 'string' ? input.endpoint.trim() : '';

  if (!endpoint || endpoint.length > 2048) {
    return { ok: false, error: 'La suscripción no tiene un endpoint válido.' };
  }

  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || url.username || url.password) {
      return { ok: false, error: 'El endpoint de push debe usar HTTPS.' };
    }
  } catch {
    return { ok: false, error: 'La suscripción no tiene un endpoint válido.' };
  }

  if (!validKey(keys?.p256dh) || !validKey(keys?.auth)) {
    return { ok: false, error: 'La suscripción no tiene claves válidas.' };
  }

  return {
    ok: true,
    value: { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
  };
}

export function deviceLabelFromUserAgent(userAgent: string | null | undefined): string {
  const ua = userAgent ?? '';
  const isSafari = /Safari/i.test(ua) && !/(Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS)/i.test(ua);
  const browser = /Edg/i.test(ua)
    ? 'Edge'
    : /(Chrome|Chromium|CriOS)/i.test(ua)
      ? 'Chrome'
      : /(Firefox|FxiOS)/i.test(ua)
        ? 'Firefox'
        : isSafari
          ? 'Safari'
          : null;

  if (/iPhone|iPod/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua))) return 'iPad';
  if (/Macintosh|Mac OS X/i.test(ua)) return browser ? `Mac · ${browser}` : 'Mac';
  if (/Android/i.test(ua)) return browser ? `Android · ${browser}` : 'Android';
  if (/Windows/i.test(ua)) return browser ? `PC · ${browser}` : 'PC';
  if (/Linux/i.test(ua)) return browser ? `Linux · ${browser}` : 'Linux';
  return browser ?? 'Este dispositivo';
}

export function upsertPushSubscription(
  db: Db,
  userId: number,
  subscription: PushSubscriptionInput,
  deviceLabel: string,
  now: Date,
) {
  return db
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      deviceLabel,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        deviceLabel,
        createdAt: now,
        lastSuccessAt: null,
        failureCount: 0,
      },
    })
    .returning()
    .get();
}

/** Solo borra si el endpoint pertenece al usuario autenticado. */
export function removePushSubscription(
  db: Queryable,
  userId: number,
  endpoint: string,
): boolean {
  const removed = db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
    .returning({ id: pushSubscriptions.id })
    .get();
  return Boolean(removed);
}

export function listPushSubscriptions(db: Queryable, userId: number) {
  return db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .orderBy(desc(pushSubscriptions.createdAt))
    .all();
}

export function pushDeviceView(
  row: ReturnType<typeof listPushSubscriptions>[number],
): PushDeviceView {
  return {
    id: row.id,
    endpoint: row.endpoint,
    deviceLabel: row.deviceLabel,
    createdAt: row.createdAt.toISOString(),
    lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
    failureCount: row.failureCount,
  };
}

export function listPushDeviceViews(db: Queryable, userId: number): PushDeviceView[] {
  return listPushSubscriptions(db, userId).map(pushDeviceView);
}
