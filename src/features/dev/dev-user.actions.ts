'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { DEV_USER_COOKIE, isDevBypassEnabled, normalizeDevEmail } from '@/auth/dev-identity';

/** Selector de usuario de desarrollo. Email vacío = volver a LOLVAULT_DEV_USER_EMAIL. */
export async function switchDevUserAction(formData: FormData): Promise<void> {
  // Doble candado: en producción esta acción no hace nada y dev-identity ignora la cookie.
  if (!isDevBypassEnabled()) return;

  const value = formData.get('email');
  const email = normalizeDevEmail(typeof value === 'string' ? value : null);
  const cookieStore = await cookies();

  if (email) {
    cookieStore.set(DEV_USER_COOKIE, email, { httpOnly: true, path: '/', sameSite: 'lax' });
  } else {
    cookieStore.delete(DEV_USER_COOKIE);
  }

  redirect('/');
}
