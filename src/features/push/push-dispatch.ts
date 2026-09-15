import { after } from 'next/server';

import type { Db } from '@/db/client';

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
    scheduleAfter(async () => {
      await Promise.all(
        deliveries.map((delivery) => notifyUsers(db, delivery.userIds, delivery.payload)),
      );
    });
  } catch {
    // `after()` requiere un request activo. En scripts/tests no hay nada que despachar.
  }
}
