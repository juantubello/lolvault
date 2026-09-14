'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/auth/current-user';
import { getDb } from '@/db/client';
import {
  readProfileValues,
  SESSION_ERROR_MESSAGE,
  validateProfile,
  type ProfileFormState,
} from '@/features/profile/profile-form';
import { saveProfile } from '@/features/profile/profile.queries';

export async function completeOnboardingAction(
  _previousState: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const values = readProfileValues(formData);

  const currentUser = await getCurrentUser();
  if (!currentUser) return { formError: SESSION_ERROR_MESSAGE, values };

  const result = validateProfile(values);
  if (!result.ok) return { fieldErrors: result.fieldErrors, values };

  // Regla dura: el id sale de la sesión. Cualquier campo `userId` enviado por
  // el cliente queda deliberadamente sin leer.
  saveProfile(getDb(), currentUser.id, result.profile);

  // El nombre se muestra también en layouts (ej. selector de dev): un redirect solo
  // re-renderiza la página y dejaría el layout con el dato viejo.
  revalidatePath('/', 'layout');
  redirect('/');
}
