'use server';

import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/auth/current-user';
import { getDb } from '@/db/client';
import { saveOnboardingProfile } from '@/features/profile/profile.queries';

export type OnboardingState = {
  fieldErrors?: {
    displayName?: string;
    riotId?: string;
  };
  formError?: string;
};

const RIOT_ID_PATTERN = /^([^#]{3,16})#([A-Za-z0-9]{3,5})$/;

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function parseRiotId(value: string):
  | { gameName: string | null; tagLine: string | null }
  | { error: string } {
  if (!value) return { gameName: null, tagLine: null };

  const match = RIOT_ID_PATTERN.exec(value);
  if (!match) {
    return {
      error: 'Usá el formato gameName#tagLine (3–16 caracteres y tag de 3–5 letras o números).',
    };
  }

  const gameName = match[1]?.trim();
  const tagLine = match[2];
  if (!gameName || gameName.length < 3 || !tagLine) {
    return { error: 'Revisá el Riot ID e intentá de nuevo.' };
  }

  return { gameName, tagLine };
}

export async function completeOnboardingAction(
  _previousState: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return { formError: 'No pudimos verificar tu sesión. Recargá e intentá de nuevo.' };
  }

  const displayName = formString(formData, 'displayName');
  const riotId = parseRiotId(formString(formData, 'riotId'));
  const fieldErrors: NonNullable<OnboardingState['fieldErrors']> = {};

  if (!displayName) {
    fieldErrors.displayName = 'Ingresá el nombre que van a ver tus amigos.';
  } else if (displayName.length > 40) {
    fieldErrors.displayName = 'El nombre puede tener hasta 40 caracteres.';
  }

  if ('error' in riotId) fieldErrors.riotId = riotId.error;
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };
  if ('error' in riotId) return { fieldErrors };

  // Regla dura: el id sale de la sesión. Cualquier campo `userId` enviado por
  // el cliente queda deliberadamente sin leer.
  saveOnboardingProfile(getDb(), currentUser.id, {
    displayName,
    riotGameName: riotId.gameName,
    riotTagLine: riotId.tagLine,
  });

  redirect('/');
}
