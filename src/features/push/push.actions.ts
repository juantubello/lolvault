'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { getCurrentUser } from '@/auth/current-user';
import { getDb } from '@/db/client';

import { readPushConfig } from './push-config';
import { dispatchPushAfter } from './push-dispatch';
import {
  deviceLabelFromUserAgent,
  listPushSubscriptions,
  pushDeviceView,
  removePushSubscription,
  upsertPushSubscription,
  validatePushSubscription,
  type PushDeviceView,
} from './push-subscriptions';

export type { PushDeviceView } from './push-subscriptions';

export type PushActionResult = {
  success: boolean;
  error?: string;
  device?: PushDeviceView;
};

export async function subscribePushAction(subscriptionJSON: unknown): Promise<PushActionResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: 'Tu sesión venció. Recargá y volvé a entrar.' };

  const config = readPushConfig();
  if (!config.enabled) return { success: false, error: config.reason };

  const parsed = validatePushSubscription(subscriptionJSON);
  if (!parsed.ok) return { success: false, error: parsed.error };

  try {
    const headerList = await headers();
    const row = upsertPushSubscription(
      getDb(),
      user.id,
      parsed.value,
      deviceLabelFromUserAgent(headerList.get('user-agent')),
      new Date(),
    );
    revalidatePath('/perfil');
    return { success: true, device: pushDeviceView(row) };
  } catch (error) {
    console.error('[push] No se pudo guardar la suscripción:', error);
    return { success: false, error: 'No pudimos activar las notificaciones. Probá de nuevo.' };
  }
}

export async function unsubscribePushAction(endpoint: string): Promise<PushActionResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: 'Tu sesión venció. Recargá y volvé a entrar.' };
  if (typeof endpoint !== 'string' || endpoint.length === 0 || endpoint.length > 2048) {
    return { success: false, error: 'La suscripción no es válida.' };
  }

  try {
    const removed = removePushSubscription(getDb(), user.id, endpoint);
    if (!removed) return { success: false, error: 'Ese dispositivo no pertenece a tu cuenta.' };
    revalidatePath('/perfil');
    return { success: true };
  } catch (error) {
    console.error('[push] No se pudo quitar la suscripción:', error);
    return { success: false, error: 'No pudimos quitar el dispositivo. Probá de nuevo.' };
  }
}

export async function sendTestPushAction(): Promise<PushActionResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: 'Tu sesión venció. Recargá y volvé a entrar.' };

  const config = readPushConfig();
  if (!config.enabled) return { success: false, error: config.reason };
  if (listPushSubscriptions(getDb(), user.id).length === 0) {
    return { success: false, error: 'No tenés dispositivos activos.' };
  }

  dispatchPushAfter(
    getDb(),
    [
      {
        userIds: [user.id],
        payload: {
          title: 'Prueba de LolVault',
          body: 'Las notificaciones están funcionando.',
          url: '/perfil',
          tag: 'lolvault-test',
        },
      },
    ],
  );
  return { success: true };
}
