import {
  isSpectatorClientError,
  type SpectatorClientErrorKind,
} from '@/features/scout/spectator-client';

export type LiveDraftActionStatus =
  | 'idle'
  | 'loaded'
  | 'unconfigured'
  | 'no-riot-id'
  | 'missing-puuid'
  | 'not-in-game'
  | 'invalid-key'
  | 'rate-limited'
  | 'unavailable'
  | 'error';

export type LiveDraftActionState = {
  status: LiveDraftActionStatus;
  message?: string;
  href?: string;
};

const ERROR_COPY: Record<SpectatorClientErrorKind, LiveDraftActionState> = {
  'not-in-game': {
    status: 'not-in-game',
    message: 'No estás en una partida ahora. Riot sólo muestra partidas que ya empezaron.',
  },
  'invalid-key': {
    status: 'invalid-key',
    message: 'La key de Riot no sirve o venció. Las Development Keys vencen cada 24 h.',
  },
  'rate-limited': {
    status: 'rate-limited',
    message: 'Riot limitó temporalmente las consultas. Esperá un minuto y probá de nuevo.',
  },
  unavailable: {
    status: 'unavailable',
    message: 'Riot no está respondiendo. Probá de nuevo más tarde.',
  },
  'invalid-response': {
    status: 'error',
    message: 'Riot devolvió una respuesta que LolVault no pudo leer.',
  },
};

export function liveDraftErrorState(error: unknown): LiveDraftActionState {
  return isSpectatorClientError(error)
    ? ERROR_COPY[error.kind]
    : { status: 'error', message: 'No pudimos traer la partida. Probá de nuevo.' };
}
