'use client';

import { CheckCircle2, Megaphone } from 'lucide-react';
import { useActionState, useState } from 'react';

import { CUSTOM_NOTIFICATION_MAX_LENGTH } from '@/config';
import {
  sendCustomNotificationAction,
  type CustomNotificationFormState,
  type SentNoticeView,
} from '@/features/push/push.actions';

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date(iso));
}

/** Un aviso por día calendario argentino a todo el grupo. El límite lo hace cumplir la base. */
export function CustomNotificationForm({
  enabled,
  disabledReason,
  initialSent,
}: {
  enabled: boolean;
  disabledReason: string | null;
  initialSent: SentNoticeView | null;
}) {
  const [state, formAction, pending] = useActionState<CustomNotificationFormState, FormData>(
    sendCustomNotificationAction,
    { status: 'idle', sent: initialSent },
  );
  const [message, setMessage] = useState(state.value ?? '');
  const sent = state.sent;

  return (
    // Vive en su propia pantalla (/perfil/aviso): el título ya lo pone el encabezado.
    <section className="grouped-section" aria-label="Aviso al grupo">
      <div className="grouped-list">
        {sent ? (
          <div className="custom-notice-sent" role="status">
            <CheckCircle2 aria-hidden="true" size={20} />
            <div>
              <strong>Ya mandaste tu aviso de hoy</strong>
              <p className="custom-notice-message">“{sent.message}”</p>
              <p>
                A las {formatTime(sent.sentAt)}.{' '}
                {state.notice ??
                  (sent.recipients === 0
                    ? 'No le llegó a nadie: ningún amigo tenía los avisos activados.'
                    : `Le podía llegar a ${sent.recipients} ${sent.recipients === 1 ? 'amigo' : 'amigos'}.`)}{' '}
                Podés mandar otro a partir de las 00:00.
              </p>
            </div>
          </div>
        ) : (
          <form action={formAction} className="custom-notice-form">
            <div className="form-field">
              <label htmlFor="custom-notice-message">
                Mensaje{' '}
                <span aria-hidden="true">
                  {message.length}/{CUSTOM_NOTIFICATION_MAX_LENGTH}
                </span>
              </label>
              <textarea
                aria-describedby="custom-notice-help"
                aria-invalid={state.status === 'error' ? true : undefined}
                disabled={!enabled || pending}
                id="custom-notice-message"
                maxLength={CUSTOM_NOTIFICATION_MAX_LENGTH}
                name="message"
                onChange={(event) => setMessage(event.target.value)}
                placeholder="¿Quién se suma a unas flex hoy?"
                rows={3}
                value={message}
              />
              <p className="field-help" id="custom-notice-help">
                {enabled
                  ? 'Les llega a todos los que tengan “Avisos de amigos” activado. Uno por día.'
                  : (disabledReason ?? 'Las notificaciones están deshabilitadas en el servidor.')}
              </p>
              {state.status === 'error' && state.error ? (
                <p className="field-error" role="alert">
                  {state.error}
                </p>
              ) : null}
            </div>
            <button className="primary-button" disabled={!enabled || pending || message.trim().length === 0} type="submit">
              <Megaphone aria-hidden="true" size={20} />
              {pending ? 'Enviando…' : 'Enviar aviso'}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
