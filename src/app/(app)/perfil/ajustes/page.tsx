import { AtSign } from 'lucide-react';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/auth/current-user';
import { NotificationPreferencesPanel } from '@/components/notification-preferences-panel';
import { PushNotifications } from '@/components/push-notifications';
import { Screen } from '@/components/screen';
import { getDb } from '@/db/client';
import { getNotificationPreferences } from '@/features/push/notification-preferences';
import { readPushConfig } from '@/features/push/push-config';
import { listPushDeviceViews } from '@/features/push/push-subscriptions';

export const dynamic = 'force-dynamic';

/** Configuración, fuera del perfil: email, notificaciones y qué avisos recibís. */
export default async function ProfileSettingsPage() {
  const user = await getCurrentUser();
  if (!user?.displayName) redirect('/onboarding');

  const db = getDb();
  const pushConfig = readPushConfig();
  const pushDevices = listPushDeviceViews(db, user.id);
  const preferences = getNotificationPreferences(db, user.id);

  return (
    <Screen back={{ href: '/perfil', label: 'Perfil' }} title="Ajustes">
      <section className="grouped-section" aria-labelledby="account-heading">
        <h2 id="account-heading">Cuenta</h2>
        <div className="grouped-list">
          <div className="profile-row">
            <AtSign aria-hidden="true" size={20} strokeWidth={2} />
            <div>
              <span>Email</span>
              <p>{user.email}</p>
            </div>
          </div>
        </div>
      </section>

      <PushNotifications
        enabled={pushConfig.enabled}
        initialDevices={pushDevices}
        publicKey={pushConfig.publicKey}
      />

      <NotificationPreferencesPanel hasDevices={pushDevices.length > 0} initialPreferences={preferences} />
    </Screen>
  );
}
