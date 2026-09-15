/** Validación del perfil (nombre + Riot ID), compartida por el onboarding y "Editar perfil". */

export type ProfileValues = {
  displayName: string;
  riotId: string;
};

export type ProfileFormState = {
  fieldErrors?: {
    displayName?: string;
    riotId?: string;
  };
  formError?: string;
  /** Lo que escribió el usuario, para no vaciar el form cuando falla la validación. */
  values?: ProfileValues;
};

export type ProfileInput = {
  displayName: string;
  riotGameName: string | null;
  riotTagLine: string | null;
};

export const DISPLAY_NAME_MAX_LENGTH = 40;

export const SESSION_ERROR_MESSAGE = 'No pudimos verificar tu sesión. Recargá e intentá de nuevo.';

const RIOT_ID_PATTERN = /^([^#]{3,16})#([A-Za-z0-9]{3,5})$/;
export const RIOT_ID_ERROR =
  'Usá el formato gameName#tagLine (3–16 caracteres y tag de 3–5 letras o números).';

export type ParsedRiotId = { gameName: string; tagLine: string };

/** Parser único del Riot ID para perfil, black list y futuras entradas del servidor. */
export function parseRiotId(value: string): ParsedRiotId | null {
  const match = RIOT_ID_PATTERN.exec(value.trim());
  const gameName = match?.[1]?.trim();
  const tagLine = match?.[2];
  return gameName && gameName.length >= 3 && tagLine ? { gameName, tagLine } : null;
}

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

export function readProfileValues(formData: FormData): ProfileValues {
  return {
    displayName: formString(formData, 'displayName'),
    riotId: formString(formData, 'riotId'),
  };
}

export function formatRiotId(gameName: string | null, tagLine: string | null): string {
  return gameName && tagLine ? `${gameName}#${tagLine}` : '';
}

export function validateProfile(
  values: ProfileValues,
):
  | { ok: true; profile: ProfileInput }
  | { ok: false; fieldErrors: NonNullable<ProfileFormState['fieldErrors']> } {
  const fieldErrors: NonNullable<ProfileFormState['fieldErrors']> = {};
  const { displayName, riotId } = values;

  if (!displayName) {
    fieldErrors.displayName = 'Ingresá el nombre que van a ver tus amigos.';
  } else if (displayName.length > DISPLAY_NAME_MAX_LENGTH) {
    fieldErrors.displayName = `El nombre puede tener hasta ${DISPLAY_NAME_MAX_LENGTH} caracteres.`;
  }

  let riotGameName: string | null = null;
  let riotTagLine: string | null = null;

  if (riotId) {
    const parsed = parseRiotId(riotId);
    if (!parsed) {
      fieldErrors.riotId = RIOT_ID_ERROR;
    } else {
      riotGameName = parsed.gameName;
      riotTagLine = parsed.tagLine;
    }
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, profile: { displayName, riotGameName, riotTagLine } };
}
