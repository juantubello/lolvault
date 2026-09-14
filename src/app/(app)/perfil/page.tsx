import { AtSign, Gamepad2 } from 'lucide-react';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/auth/current-user';
import { Screen } from '@/components/screen';

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
        <div className="profile-avatar" aria-hidden="true">
          {user.displayName.charAt(0).toLocaleUpperCase('es-AR')}
        </div>
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
    </Screen>
  );
}
