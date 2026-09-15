import webpush, {
  type PushSubscription as WebPushSubscription,
  type RequestOptions,
} from 'web-push';
import { eq, inArray, sql } from 'drizzle-orm';

import type { Db } from '@/db/client';
import { pushSubscriptions } from '@/db/schema';

import { readPushConfig, type PushConfig } from './push-config';

export const PUSH_TTL_SECONDS = 12 * 60 * 60;

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
};

export type PushSender = (
  subscription: WebPushSubscription,
  payload: string,
  options: RequestOptions,
) => Promise<unknown>;

export type PushSendSummary = { sent: number; removed: number; failed: number };

function statusCode(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) return null;
  const value = (error as { statusCode?: unknown }).statusCode;
  return typeof value === 'number' ? value : null;
}

/**
 * Envía a todos los dispositivos de los usuarios. Es best-effort por diseño: registra el
 * resultado por suscripción y nunca propaga errores a la Server Action que originó el evento.
 */
export async function notifyUsers(
  db: Db,
  userIds: readonly number[],
  payload: PushPayload,
  sender: PushSender = webpush.sendNotification,
  config: PushConfig = readPushConfig(),
  now: Date = new Date(),
): Promise<PushSendSummary> {
  const summary: PushSendSummary = { sent: 0, removed: 0, failed: 0 };
  const recipients = [...new Set(userIds)];
  if (!config.enabled || recipients.length === 0) return summary;

  try {
    const rows = db
      .select()
      .from(pushSubscriptions)
      .where(inArray(pushSubscriptions.userId, recipients))
      .all();
    const serialized = JSON.stringify({
      title: payload.title,
      body: payload.body,
      tag: payload.tag,
      data: { url: payload.url },
    });
    const options: RequestOptions = {
      TTL: PUSH_TTL_SECONDS,
      urgency: 'normal',
      vapidDetails: {
        subject: config.subject,
        publicKey: config.publicKey,
        privateKey: config.privateKey,
      },
    };

    await Promise.all(
      rows.map(async (row) => {
        try {
          await sender(
            {
              endpoint: row.endpoint,
              keys: { p256dh: row.p256dh, auth: row.auth },
            },
            serialized,
            options,
          );
          db.update(pushSubscriptions)
            .set({ lastSuccessAt: now })
            .where(eq(pushSubscriptions.id, row.id))
            .run();
          summary.sent += 1;
        } catch (error) {
          const code = statusCode(error);
          try {
            if (code === 404 || code === 410) {
              db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, row.id)).run();
              summary.removed += 1;
              return;
            }
            db.update(pushSubscriptions)
              .set({ failureCount: sql`${pushSubscriptions.failureCount} + 1` })
              .where(eq(pushSubscriptions.id, row.id))
              .run();
          } catch (persistenceError) {
            console.error('[push] No se pudo registrar el resultado del envío:', persistenceError);
          }
          summary.failed += 1;
          console.warn(`[push] Falló un envío${code ? ` (HTTP ${code})` : ''}.`);
        }
      }),
    );
  } catch (error) {
    console.error('[push] No se pudieron cargar o enviar las suscripciones:', error);
  }

  return summary;
}
