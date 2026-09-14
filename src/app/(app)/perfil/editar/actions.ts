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

export async function updateProfileAction(
  _previousState: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const values = readProfileValues(formData);

  const currentUser = await getCurrentUser();
  if (!currentUser) return { formError: SESSION_ERROR_MESSAGE, values };

  const result = validateProfile(values);
  if (!result.ok) return { fieldErrors: result.fieldErrors, values };

  // Regla dura: solo se edita el perfil de la sesión, nunca un userId del form.
  saveProfile(getDb(), currentUser.id, result.profile);

  // Layout incluido: el nombre también aparece fuera de la página de Perfil.
  revalidatePath('/', 'layout');
  redirect('/perfil');
}
