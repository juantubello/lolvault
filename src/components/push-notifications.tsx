'use client';

import { Bell, BellOff, CheckCircle2, Send, Smartphone, Trash2 } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';

import {
  sendTestPushAction,
  subscribePushAction,
  unsubscribePushAction,
  type PushDeviceView,
} from '@/features/push/push.actions';

type PushState =
  | 'checking'
  | 'server-disabled'
  | 'ios-install'
  | 'unsupported'
  | 'denied'
  | 'inactive'
  | 'active';

function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index);
  return output;
}

function isIOS(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

async function serviceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
  return navigator.serviceWorker.ready;
}

function formatAddedAt(value: string): string {
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(value))
    .replace('.', '');
}

export function PushNotifications({
  enabled,
  publicKey,
  initialDevices,
}: {
  enabled: boolean;
  publicKey: string | null;
  initialDevices: PushDeviceView[];
}) {
  const [state, setState] = useState<PushState>(enabled ? 'checking' : 'server-disabled');
  const [devices, setDevices] = useState(initialDevices);
  const [currentSubscription, setCurrentSubscription] = useState<PushSubscription | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!enabled) return;
    if (isIOS() && !isStandalone()) {
      setState('ios-install');
      return;
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }

    let cancelled = false;
    void serviceWorkerRegistration()
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (cancelled) return;
        setCurrentSubscription(subscription);
        const belongsToCurrentUser = Boolean(
          subscription && devices.some((device) => device.endpoint === subscription.endpoint),
        );
        setState(belongsToCurrentUser ? 'active' : 'inactive');
      })
      .catch(() => {
        if (!cancelled) {
          setState('inactive');
          setMessage('No pudimos comprobar el estado. Podés intentar activarlas de nuevo.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [devices, enabled]);

  function activate(): void {
    startTransition(async () => {
      setMessage(null);
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          setState(permission === 'denied' ? 'denied' : 'inactive');
          if (permission !== 'denied') setMessage('No se otorgó el permiso de notificaciones.');
          return;
        }
        const registration = await serviceWorkerRegistration();
        const existing = await registration.pushManager.getSubscription();
        const subscription =
          existing ??
          (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey ?? ''),
          }));
        const result = await subscribePushAction(subscription.toJSON());
        if (!result.success || !result.device) {
          if (!existing) await subscription.unsubscribe();
          setMessage(result.error ?? 'No pudimos activar las notificaciones.');
          return;
        }
        setCurrentSubscription(subscription);
        setDevices((current) => [
          result.device!,
          ...current.filter((device) => device.endpoint !== result.device!.endpoint),
        ]);
        setState('active');
        setMessage('Notificaciones activadas en este dispositivo.');
      } catch {
        setMessage('No pudimos activar las notificaciones. Revisá los permisos y probá de nuevo.');
      }
    });
  }

  function removeDevice(device: PushDeviceView): void {
    startTransition(async () => {
      setMessage(null);
      const result = await unsubscribePushAction(device.endpoint);
      if (!result.success) {
        setMessage(result.error ?? 'No pudimos quitar el dispositivo.');
        return;
      }
      if (currentSubscription?.endpoint === device.endpoint) {
        try {
          await currentSubscription.unsubscribe();
        } catch {
          // El servidor ya dejó de enviar a este endpoint; el estado local puede limpiarse igual.
        }
        setCurrentSubscription(null);
        setState('inactive');
      }
      setDevices((current) => current.filter((item) => item.endpoint !== device.endpoint));
      setMessage('Dispositivo quitado.');
    });
  }

  function sendTest(): void {
    startTransition(async () => {
      setMessage(null);
      const result = await sendTestPushAction();
      setMessage(result.success ? 'Prueba enviada.' : (result.error ?? 'No pudimos enviar la prueba.'));
    });
  }

  const currentDevice = currentSubscription
    ? devices.find((device) => device.endpoint === currentSubscription.endpoint)
    : undefined;

  return (
    <section className="grouped-section push-section" aria-labelledby="notifications-heading">
      <h2 id="notifications-heading">Notificaciones</h2>
      <div className="grouped-list">
        <div className="push-status-row">
          <span className="push-status-icon" aria-hidden="true">
            {state === 'active' ? <CheckCircle2 size={20} /> : <Bell size={20} />}
          </span>
          <div className="push-status-copy">
            <strong>
              {state === 'active'
                ? 'Activadas en este dispositivo'
                : state === 'checking'
                  ? 'Comprobando…'
                  : 'Notificaciones push'}
            </strong>
            {state === 'server-disabled' && (
              <p>Están deshabilitadas en el servidor. Falta configurar las claves VAPID.</p>
            )}
            {state === 'ios-install' && (
              <p>En iPhone, primero agregá LolVault a la pantalla de inicio desde Safari → Compartir.</p>
            )}
            {state === 'unsupported' && <p>Este navegador no admite notificaciones push.</p>}
            {state === 'denied' && (
              <p>
                El permiso está bloqueado. Reactivalo en Ajustes → Notificaciones → LolVault (o en
                la configuración del sitio del navegador).
              </p>
            )}
            {state === 'inactive' && <p>Activalas para recibir lo que elijas abajo: vaults, black list y avisos de amigos.</p>}
            {state === 'active' && <p>Este dispositivo recibirá avisos de LolVault.</p>}
          </div>
        </div>

        {state === 'inactive' && (
          <div className="push-action-row">
            <button className="primary-button" disabled={isPending} onClick={activate} type="button">
              <Bell aria-hidden="true" size={20} />
              {isPending ? 'Activando…' : 'Activar en este dispositivo'}
            </button>
          </div>
        )}

        {state === 'active' && currentDevice && (
          <div className="push-action-row push-action-row-split">
            <button className="push-secondary-button" disabled={isPending} onClick={sendTest} type="button">
              <Send aria-hidden="true" size={20} />
              Enviar prueba
            </button>
            <button
              className="push-secondary-button push-danger-button"
              disabled={isPending}
              onClick={() => removeDevice(currentDevice)}
              type="button"
            >
              <BellOff aria-hidden="true" size={20} />
              Desactivar
            </button>
          </div>
        )}

        {message && (
          <p className="push-feedback" role="status">
            {message}
          </p>
        )}
      </div>

      <h3 className="push-devices-heading">Tus dispositivos</h3>
      <div className="grouped-list">
        {devices.length === 0 ? (
          <div className="push-empty-row">
            <Smartphone aria-hidden="true" size={20} />
            <p>No hay dispositivos activos.</p>
          </div>
        ) : (
          devices.map((device) => (
            <div className="push-device-row" key={device.id}>
              <Smartphone aria-hidden="true" size={20} />
              <div>
                <strong>{device.deviceLabel}</strong>
                <p>
                  {device.endpoint === currentSubscription?.endpoint ? 'Este dispositivo · ' : ''}
                  agregado el {formatAddedAt(device.createdAt)}
                </p>
              </div>
              <button
                aria-label={`Quitar ${device.deviceLabel}`}
                disabled={isPending}
                onClick={() => removeDevice(device)}
                type="button"
              >
                <Trash2 aria-hidden="true" size={20} />
                <span>Quitar</span>
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
