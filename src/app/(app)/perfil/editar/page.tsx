import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/auth/current-user';
import { ProfileForm } from '@/components/profile-form';
import { Screen } from '@/components/screen';
import { formatRiotId } from '@/features/profile/profile-form';

import { updateProfileAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function EditProfilePage() {
  const user = await getCurrentUser();
  if (!user?.displayName) redirect('/onboarding');

  return (
    <Screen back={{ href: '/perfil', label: 'Perfil' }} title="Editar perfil">
      <section className="form-card" aria-label="Nombre y Riot ID">
        <ProfileForm
          action={updateProfileAction}
          initialValues={{
            displayName: user.displayName,
            riotId: formatRiotId(user.riotGameName, user.riotTagLine),
          }}
          riotHelp="¿Te cambiaste el nombre en el juego? Actualizalo acá: tus vaults y votos no se pierden."
          submitLabel="Guardar"
        />
      </section>
    </Screen>
  );
}
