import { and, eq, inArray } from 'drizzle-orm';

import type { Db } from '@/db/client';
import { notificationPreferences, pushSubscriptions } from '@/db/schema';

export const NOTIFICATION_CATEGORIES = ['vaults', 'blacklist', 'custom'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
export type NotificationPreferences = Record<NotificationCategory, boolean>;

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  vaults: true,
  blacklist: true,
  custom: true,
};

export function isNotificationCategory(value: unknown): value is NotificationCategory {
  return typeof value === 'string' && (NOTIFICATION_CATEGORIES as readonly string[]).includes(value);
}

export function getNotificationPreferences(db: Db, userId: number): NotificationPreferences {
  const row = db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .get();
  if (!row) return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  return { vaults: row.vaults, blacklist: row.blacklist, custom: row.custom };
}

/** Cambia una sola categoría: dos toques casi simultáneos en switches distintos no se pisan. */
export function setNotificationPreference(
  db: Db,
  userId: number,
  category: NotificationCategory,
  enabled: boolean,
  now: Date,
): NotificationPreferences {
  const initial = { ...getNotificationPreferences(db, userId), [category]: enabled };
  db.insert(notificationPreferences)
    .values({ userId, ...initial, updatedAt: now })
    .onConflictDoUpdate({
      target: notificationPreferences.userId,
      set: { [category]: enabled, updatedAt: now },
    })
    .run();
  return getNotificationPreferences(db, userId);
}

/** Quita a quienes apagaron la categoría. Sin fila de preferencias = todo encendido. */
export function filterUsersByCategory(
  db: Db,
  userIds: readonly number[],
  category: NotificationCategory,
): number[] {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return [];

  const optedOut = new Set(
    db
      .select({ userId: notificationPreferences.userId })
      .from(notificationPreferences)
      .where(
        and(
          inArray(notificationPreferences.userId, unique),
          eq(notificationPreferences[category], false),
        ),
      )
      .all()
      .map((row) => row.userId),
  );
  return unique.filter((id) => !optedOut.has(id));
}

/** Cuántos de esos usuarios tienen al menos un dispositivo suscripto. */
export function countUsersWithDevices(db: Db, userIds: readonly number[]): number {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return 0;
  const withDevices = db
    .selectDistinct({ userId: pushSubscriptions.userId })
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, unique))
    .all();
  return withDevices.length;
}
