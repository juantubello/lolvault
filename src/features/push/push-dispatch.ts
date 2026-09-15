import { after } from 'next/server';

import type { Db } from '@/db/client';

import { filterUsersByCategory } from './notification-preferences';
import type { PushDelivery } from './push-events';
import { notifyUsers } from './push-sender';

type AfterScheduler = (task: () => Promise<void>) => void;

/** Programa todos los envíos cuando Next ya respondió; nunca demora ni rompe la acción. */
export function dispatchPushAfter(
  db: Db,
  deliveries: readonly PushDelivery[],
  scheduleAfter: AfterScheduler = after,
): void {
  if (deliveries.length === 0) return;
  try {
    scheduleAfter(() => sendDeliveries(db, deliveries));
  } catch {
    // `after()` requiere un request activo. En scripts/tests no hay nada que despachar.
  }
}

/** Aplica las preferencias de cada destinatario (salvo 'system') y envía. Best-effort. */
export async function sendDeliveries(
  db: Db,
  deliveries: readonly PushDelivery[],
  send: typeof notifyUsers = notifyUsers,
): Promise<void> {
  await Promise.all(
    deliveries.map(async (delivery) => {
      try {
        const userIds =
          delivery.category === 'system'
            ? delivery.userIds
            : filterUsersByCategory(db, delivery.userIds, delivery.category);
        if (userIds.length > 0) await send(db, userIds, delivery.payload);
      } catch (error) {
        console.error('[push] No se pudo despachar un aviso:', error);
      }
    }),
  );
}
