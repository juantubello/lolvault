import { AtSign, ChevronRight, Gamepad2, Pencil } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/auth/current-user';
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
      <section className="profile-hero" aria-label="Tu identidad">
        <UserAvatar name={user.displayName} size="md" src={avatarUrl(user)} />
        <div>
          <h2>{user.displayName}</h2>
          <p>{user.email}</p>
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
          <div className="profile-row">
            <Gamepad2 aria-hidden="true" size={20} strokeWidth={2} />
            <div>
              <span>Riot ID</span>
              <p>{riotId ?? 'Todavía no agregaste tu Riot ID.'}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grouped-section" aria-label="Editar perfil">
        <div className="grouped-list">
          <Link className="profile-row profile-row-link" href="/perfil/editar">
            <Pencil aria-hidden="true" size={20} strokeWidth={2} />
            <div>
              <span>Editar foto, nombre y Riot ID</span>
            </div>
            <ChevronRight aria-hidden="true" size={16} strokeWidth={2} />
          </Link>
        </div>
      </section>
    </Screen>
  );
}
