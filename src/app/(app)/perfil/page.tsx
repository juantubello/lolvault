import { AtSign } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/auth/current-user';
import { getDb } from '@/db/client';
import { Suspense } from 'react';

import { AppLogo } from '@/components/app-logo';
import { PlayerStatsLoading, PlayerStatsSection } from '@/components/matches/player-stats-section';
import { PushNotifications } from '@/components/push-notifications';
import { Screen } from '@/components/screen';
import { UserAvatar } from '@/components/user-avatar';
import { avatarUrl } from '@/features/profile/avatar-url';
import { readPushConfig } from '@/features/push/push-config';
import { listPushDeviceViews } from '@/features/push/push-subscriptions';

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user?.displayName) redirect('/onboarding');

  const riotId =
    user.riotGameName && user.riotTagLine
      ? `${user.riotGameName}#${user.riotTagLine}`
      : null;
  const pushConfig = readPushConfig();
  const pushDevices = listPushDeviceViews(getDb(), user.id);

  return (
    <Screen
      action={
        <Link className="screen-text-action" href="/perfil/editar">
          Editar
        </Link>
      }
      title="Perfil"
    >
      <section className="profile-hero" aria-label="Tu identidad">
        <UserAvatar id={user.id} name={user.displayName} size="md" src={avatarUrl(user)} />
        <div>
          <h2>{user.displayName}</h2>
          <p>{riotId ?? 'Sin Riot ID'}</p>
        </div>
      </section>

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

      <Suspense fallback={<PlayerStatsLoading />}>
        <PlayerStatsSection isSelf user={user} />
      </Suspense>

      <PushNotifications
        enabled={pushConfig.enabled}
        initialDevices={pushDevices}
        publicKey={pushConfig.publicKey}
      />

      <footer className="about-footer" aria-labelledby="about-heading">
        <AppLogo size={72} />
        <h2 id="about-heading">LolVault</h2>
        <p>
          LolVault no está respaldado por Riot Games ni refleja sus opiniones. League of Legends y Riot Games
          son marcas registradas de Riot Games, Inc. Historial de partidas vía OP.GG.
        </p>
      </footer>
    </Screen>
  );
}
