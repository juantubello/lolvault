import { ChevronRight, Megaphone, Settings } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/auth/current-user';
import { Suspense } from 'react';

import { AppLogo } from '@/components/app-logo';
import { PlayerStatsLoading, PlayerStatsSection } from '@/components/matches/player-stats-section';
import { Screen } from '@/components/screen';
import { UserAvatar } from '@/components/user-avatar';
import { avatarUrl } from '@/features/profile/avatar-url';

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user?.displayName) redirect('/onboarding');

  const riotId =
    user.riotGameName && user.riotTagLine
      ? `${user.riotGameName}#${user.riotTagLine}`
      : null;

  return (
    <Screen title="Perfil">
      {/* La tarjeta de identidad ES el acceso a editar: sin botón "Editar" repetido en la nav. */}
      <Link aria-label="Editar tu perfil" className="profile-hero profile-hero-link" href="/perfil/editar">
        <UserAvatar id={user.id} name={user.displayName} size="md" src={avatarUrl(user)} />
        <div>
          <h2>{user.displayName}</h2>
          <p>{riotId ?? 'Sin Riot ID'}</p>
        </div>
        <ChevronRight aria-hidden="true" size={16} strokeWidth={2} />
      </Link>

      <section className="grouped-section" aria-label="Accesos">
        <div className="grouped-list">
          <Link className="profile-row profile-row-link" href="/perfil/aviso">
            <Megaphone aria-hidden="true" size={20} strokeWidth={2} />
            <div>
              <span>Mandar aviso al grupo</span>
              <p>Un mensaje por día a todos tus amigos</p>
            </div>
            <ChevronRight aria-hidden="true" size={16} strokeWidth={2} />
          </Link>

          <Link className="profile-row profile-row-link" href="/perfil/ajustes">
            <Settings aria-hidden="true" size={20} strokeWidth={2} />
            <div>
              <span>Ajustes y notificaciones</span>
              <p>Email y avisos que recibís</p>
            </div>
            <ChevronRight aria-hidden="true" size={16} strokeWidth={2} />
          </Link>
        </div>
      </section>

      {/* El grueso del perfil son las partidas. */}
      <Suspense fallback={<PlayerStatsLoading />}>
        <PlayerStatsSection isSelf user={user} />
      </Suspense>

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
