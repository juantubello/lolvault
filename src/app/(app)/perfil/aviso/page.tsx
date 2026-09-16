import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/auth/current-user';
import { CustomNotificationForm } from '@/components/custom-notification-form';
import { Screen } from '@/components/screen';
import { getDb } from '@/db/client';
import { getTodayCustomNotification } from '@/features/push/custom-notifications';
import { readPushConfig } from '@/features/push/push-config';

export const dynamic = 'force-dynamic';

/** Aviso al grupo: uno por día, con su propia pantalla para que esté a un toque del perfil. */
export default async function GroupNoticePage() {
  const user = await getCurrentUser();
  if (!user?.displayName) redirect('/onboarding');

  const db = getDb();
  const pushConfig = readPushConfig();
  const todayNotice = getTodayCustomNotification(db, user.id, new Date());

  return (
    <Screen back={{ href: '/perfil', label: 'Perfil' }} title="Aviso al grupo">
      <CustomNotificationForm
        disabledReason={pushConfig.enabled ? null : pushConfig.reason}
        enabled={pushConfig.enabled}
        initialSent={
          todayNotice
            ? { message: todayNotice.message, sentAt: todayNotice.sentAt.toISOString(), recipients: todayNotice.recipients }
            : null
        }
      />
    </Screen>
  );
}
