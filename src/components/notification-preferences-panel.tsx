'use client';

import { Ban, LockKeyhole, Megaphone, type LucideIcon } from 'lucide-react';
import { useState, useTransition } from 'react';

import { updateNotificationPreferenceAction } from '@/features/push/push.actions';
import type {
  NotificationCategory,
  NotificationPreferences,
} from '@/features/push/notification-preferences';

const ROWS: { category: NotificationCategory; label: string; detail: string; icon: LucideIcon }[] = [
  { category: 'vaults', label: 'Vaults', detail: 'Votaciones nuevas, aprobados y levantados', icon: LockKeyhole },
  { category: 'blacklist', label: 'Black list', detail: 'Propuestas para agregar o sacar jugadores', icon: Ban },
  { category: 'custom', label: 'Avisos de amigos', detail: 'Hasta un aviso por día de cada amigo', icon: Megaphone },
];

/** Preferencias del usuario (valen para todos sus dispositivos). Se guardan al tocar. */
export function NotificationPreferencesPanel({
  initialPreferences,
  hasDevices,
}: {
  initialPreferences: NotificationPreferences;
  hasDevices: boolean;
}) {
  const [preferences, setPreferences] = useState(initialPreferences);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggle(category: NotificationCategory): void {
    const previous = preferences;
    const enabled = !previous[category];
    setError(null);
    setPreferences({ ...previous, [category]: enabled });
    startTransition(async () => {
      const result = await updateNotificationPreferenceAction(category, enabled);
      if (!result.success || !result.preferences) {
        setPreferences(previous);
        setError(result.error ?? 'No pudimos guardar el cambio.');
        return;
      }
      setPreferences(result.preferences);
    });
  }

  return (
    <section className="grouped-section" aria-labelledby="notification-prefs-heading">
      <h2 id="notification-prefs-heading">Qué recibís</h2>
      <div className="grouped-list">
        {ROWS.map(({ category, label, detail, icon: Icon }) => {
          const id = `pref-${category}`;
          return (
            <div className="pref-row" key={category}>
              <Icon aria-hidden="true" size={20} strokeWidth={2} />
              <div className="pref-copy">
                <strong id={`${id}-label`}>{label}</strong>
                <p id={`${id}-detail`}>{detail}</p>
              </div>
              <button
                aria-checked={preferences[category]}
                aria-describedby={`${id}-detail`}
                aria-labelledby={`${id}-label`}
                className="ios-switch"
                onClick={() => toggle(category)}
                role="switch"
                type="button"
              >
                <span aria-hidden="true" className="ios-switch-thumb" />
              </button>
            </div>
          );
        })}
        {error ? (
          <p className="push-feedback" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      {!hasDevices ? (
        <p className="grouped-footer">
          Se aplican a todos tus dispositivos. Todavía no activaste las notificaciones en ninguno.
        </p>
      ) : (
        <p className="grouped-footer">Se aplican a todos tus dispositivos.</p>
      )}
    </section>
  );
}
