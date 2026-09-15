'use server';

import { revalidatePath } from 'next/cache';

import { getCurrentUser } from '@/auth/current-user';
import { AVATAR_MAX_BYTES } from '@/config';
import { getDb } from '@/db/client';

import { deleteAvatarFile, isJpeg, writeAvatarFile } from './avatar-storage';
import { SESSION_ERROR_MESSAGE } from './profile-form';
import { setAvatarUpdatedAt } from './profile.queries';

export type AvatarResult = { error?: string };

/** Recibe la foto ya recortada y achicada a JPEG por el cliente (ver components/avatar-picker.tsx). */
export async function uploadAvatarAction(formData: FormData): Promise<AvatarResult> {
  const user = await getCurrentUser();
  if (!user) return { error: SESSION_ERROR_MESSAGE };

  const file = formData.get('avatar');
  if (!(file instanceof Blob) || file.size === 0) return { error: 'Elegí una foto.' };
  if (file.size > AVATAR_MAX_BYTES) return { error: 'La foto es muy pesada. Probá con otra.' };

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isJpeg(bytes)) return { error: 'No pudimos procesar esa foto. Probá con otra.' };

  // Regla dura: la foto es del usuario de la sesión, nunca de un id que venga del form.
  await writeAvatarFile(user.id, bytes);
  setAvatarUpdatedAt(getDb(), user.id, new Date());

  // La foto aparece en layouts y en otras pantallas (chips de jugador).
  revalidatePath('/', 'layout');
  return {};
}

export async function removeAvatarAction(): Promise<AvatarResult> {
  const user = await getCurrentUser();
  if (!user) return { error: SESSION_ERROR_MESSAGE };

  setAvatarUpdatedAt(getDb(), user.id, null);
  await deleteAvatarFile(user.id);

  revalidatePath('/', 'layout');
  return {};
}
