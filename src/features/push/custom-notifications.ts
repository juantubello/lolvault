import { and, eq } from 'drizzle-orm';

import { CUSTOM_NOTIFICATION_MAX_LENGTH } from '@/config';
import type { Db } from '@/db/client';
import { customNotifications } from '@/db/schema';
import { toLocalDateString } from '@/features/vaults/vault-dates';

export type CustomMessageValidation = { ok: true; message: string } | { ok: false; error: string };

export type SentCustomNotification = {
  id: number;
  message: string;
  sentAt: Date;
  recipients: number;
};

export type CreateCustomNotificationResult =
  | { ok: true; notification: SentCustomNotification }
  | { ok: false; reason: 'already-sent'; notification: SentCustomNotification | null };

/** Espacios y saltos colapsados: la notificación se muestra en una o dos líneas. */
export function validateCustomMessage(raw: unknown): CustomMessageValidation {
  const message = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
  if (!message) return { ok: false, error: 'Escribí el aviso.' };
  if (message.length > CUSTOM_NOTIFICATION_MAX_LENGTH) {
    return { ok: false, error: `El aviso puede tener hasta ${CUSTOM_NOTIFICATION_MAX_LENGTH} caracteres.` };
  }
  return { ok: true, message };
}

/** El límite es por día calendario argentino: se habilita de nuevo a las 00:00 AR. */
export function customNotificationDay(now: Date): string {
  return toLocalDateString(now);
}

function toView(row: typeof customNotifications.$inferSelect): SentCustomNotification {
  return { id: row.id, message: row.message, sentAt: row.sentAt, recipients: row.recipients };
}

export function getTodayCustomNotification(
  db: Db,
  senderUserId: number,
  now: Date,
): SentCustomNotification | null {
  const row = db
    .select()
    .from(customNotifications)
    .where(
      and(
        eq(customNotifications.senderUserId, senderUserId),
        eq(customNotifications.localDay, customNotificationDay(now)),
      ),
    )
    .get();
  return row ? toView(row) : null;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}

/** Registra el aviso del día. El UNIQUE (emisor, día) rechaza el segundo aunque lleguen juntos. */
export function createCustomNotification(
  db: Db,
  senderUserId: number,
  message: string,
  now: Date,
): CreateCustomNotificationResult {
  try {
    const row = db
      .insert(customNotifications)
      .values({ senderUserId, message, localDay: customNotificationDay(now), sentAt: now })
      .returning()
      .get();
    return { ok: true, notification: toView(row) };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return { ok: false, reason: 'already-sent', notification: getTodayCustomNotification(db, senderUserId, now) };
  }
}

export function setCustomNotificationRecipients(db: Db, id: number, recipients: number): void {
  db.update(customNotifications).set({ recipients }).where(eq(customNotifications.id, id)).run();
}
