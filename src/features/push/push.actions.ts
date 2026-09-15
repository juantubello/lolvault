'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { getCurrentUser } from '@/auth/current-user';
import { getDb } from '@/db/client';

import { listMembers } from '@/features/vaults/vaults.queries';

import {
  createCustomNotification,
  setCustomNotificationRecipients,
  validateCustomMessage,
} from './custom-notifications';
import {
  countUsersWithDevices,
  filterUsersByCategory,
  isNotificationCategory,
  setNotificationPreference,
  type NotificationPreferences,
} from './notification-preferences';
import { readPushConfig } from './push-config';
import { customNotificationEvent } from './push-events';
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
        category: 'system',
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

export type PreferenceActionResult = {
  success: boolean;
  error?: string;
  preferences?: NotificationPreferences;
};

export async function updateNotificationPreferenceAction(
  category: unknown,
  enabled: unknown,
): Promise<PreferenceActionResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: 'Tu sesión venció. Recargá y volvé a entrar.' };
  if (!isNotificationCategory(category) || typeof enabled !== 'boolean') {
    return { success: false, error: 'Esa preferencia no existe.' };
  }

  try {
    const preferences = setNotificationPreference(getDb(), user.id, category, enabled, new Date());
    return { success: true, preferences };
  } catch (error) {
    console.error('[push] No se pudo guardar la preferencia:', error);
    return { success: false, error: 'No pudimos guardar el cambio. Probá de nuevo.' };
  }
}

export type SentNoticeView = { message: string; sentAt: string; recipients: number };

export type CustomNotificationFormState = {
  status: 'idle' | 'sent' | 'error';
  error?: string;
  value?: string;
  notice?: string;
  sent: SentNoticeView | null;
};

function sentView(notification: { message: string; sentAt: Date; recipients: number }): SentNoticeView {
  return {
    message: notification.message,
    sentAt: notification.sentAt.toISOString(),
    recipients: notification.recipients,
  };
}

export async function sendCustomNotificationAction(
  previous: CustomNotificationFormState,
  formData: FormData,
): Promise<CustomNotificationFormState> {
  const raw = formData.get('message');
  const value = typeof raw === 'string' ? raw : '';
  const user = await getCurrentUser();
  if (!user?.displayName) {
    return { status: 'error', error: 'Tu sesión venció. Recargá y volvé a entrar.', value, sent: previous.sent };
  }

  const config = readPushConfig();
  if (!config.enabled) return { status: 'error', error: config.reason, value, sent: previous.sent };

  const validation = validateCustomMessage(value);
  if (!validation.ok) return { status: 'error', error: validation.error, value, sent: previous.sent };

  const db = getDb();
  const now = new Date();
  try {
    const created = createCustomNotification(db, user.id, validation.message, now);
    if (!created.ok) {
      return {
        status: 'error',
        error: 'Ya mandaste tu aviso de hoy. Podés mandar otro a partir de las 00:00.',
        sent: created.notification ? sentView(created.notification) : previous.sent,
      };
    }

    const deliveries = customNotificationEvent({
      notificationId: created.notification.id,
      memberIds: listMembers(db).map((member) => member.id),
      senderUserId: user.id,
      senderName: user.displayName,
      message: validation.message,
    });
    const reachable = countUsersWithDevices(
      db,
      filterUsersByCategory(db, deliveries[0]?.userIds ?? [], 'custom'),
    );
    setCustomNotificationRecipients(db, created.notification.id, reachable);
    dispatchPushAfter(db, deliveries);
    revalidatePath('/perfil');

    return {
      status: 'sent',
      notice:
        reachable === 0
          ? 'Aviso enviado, pero nadie tiene los avisos de amigos activados todavía.'
          : `Aviso enviado a ${reachable} ${reachable === 1 ? 'amigo' : 'amigos'}.`,
      sent: sentView({ ...created.notification, recipients: reachable }),
    };
  } catch (error) {
    console.error('[push] No se pudo enviar el aviso custom:', error);
    return { status: 'error', error: 'No pudimos enviar el aviso. Probá de nuevo.', value, sent: previous.sent };
  }
}
