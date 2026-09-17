import { RIOT_PLATFORM } from '@/config';

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_CACHE_TTL_MS = 60_000;

export type SpectatorParticipant = {
  puuid: string;
  championId: number;
  teamId: number;
};

export type SpectatorGame = {
  gameId: number;
  gameStartTime: number;
  participants: SpectatorParticipant[];
};

export type SpectatorClientErrorKind =
  | 'not-in-game'
  | 'invalid-key'
  | 'rate-limited'
  | 'unavailable'
  | 'invalid-response';

export class SpectatorClientError extends Error {
  readonly isSpectatorClientError = true;

  constructor(
    message: string,
    readonly kind: SpectatorClientErrorKind,
  ) {
    super(message);
    this.name = 'SpectatorClientError';
  }
}

export function isSpectatorClientError(error: unknown): error is SpectatorClientError {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as Partial<SpectatorClientError>;
  return candidate.isSpectatorClientError === true
    && candidate.name === 'SpectatorClientError'
    && typeof candidate.message === 'string'
    && [
      'not-in-game',
      'invalid-key',
      'rate-limited',
      'unavailable',
      'invalid-response',
    ].includes(candidate.kind ?? '');
}

type SpectatorClientOptions = {
  apiKey: string;
  platform?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  cacheTtlMs?: number;
  now?: () => number;
};

type CachedRequest = {
  expiresAt: number;
  request: Promise<SpectatorGame>;
};

function invalidResponse(message: string, cause?: unknown): SpectatorClientError {
  const detail = cause instanceof Error ? `: ${cause.message}` : '';
  return new SpectatorClientError(`${message}${detail}`, 'invalid-response');
}

function objectValue(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidResponse(`${path} debe ser un objeto`);
  }
  return value as Record<string, unknown>;
}

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw invalidResponse(`${path} debe ser un número`);
  }
  return value;
}

function parseGame(value: unknown): SpectatorGame {
  const game = objectValue(value, 'La respuesta de Spectator-v5');
  if (!Array.isArray(game.participants)) {
    throw invalidResponse('participants debe ser una lista');
  }
  const participants = game.participants.map((value, index) => {
    const participant = objectValue(value, `participants[${index}]`);
    if (typeof participant.puuid !== 'string' || participant.puuid.trim() === '') {
      throw invalidResponse(`participants[${index}].puuid debe ser texto`);
    }
    return {
      puuid: participant.puuid,
      championId: finiteNumber(participant.championId, `participants[${index}].championId`),
      teamId: finiteNumber(participant.teamId, `participants[${index}].teamId`),
    };
  });
  return {
    gameId: finiteNumber(game.gameId, 'gameId'),
    gameStartTime: finiteNumber(game.gameStartTime, 'gameStartTime'),
    participants,
  };
}

/** Cliente mínimo de Spectator-v5. La key sólo existe en este módulo server-side. */
export function createSpectatorClient(options: SpectatorClientOptions): {
  getActiveGame(puuid: string): Promise<SpectatorGame>;
} {
  const apiKey = options.apiKey.trim();
  const platform = options.platform ?? RIOT_PLATFORM;
  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const now = options.now ?? Date.now;
  const cache = new Map<string, CachedRequest>();

  async function request(puuid: string): Promise<SpectatorGame> {
    let response: Response;
    try {
      response = await fetchFn(
        `https://${platform}.api.riotgames.com/lol/spectator/v5/active-games/by-puuid/${encodeURIComponent(puuid)}`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'X-Riot-Token': apiKey,
          },
          signal: AbortSignal.timeout(timeoutMs),
        },
      );
    } catch (error) {
      const detail = error instanceof Error ? `: ${error.message}` : '';
      throw new SpectatorClientError(`No se pudo conectar con Riot${detail}`, 'unavailable');
    }

    if (response.status === 404) {
      throw new SpectatorClientError('El jugador no está en una partida en curso', 'not-in-game');
    }
    if (response.status === 401 || response.status === 403) {
      throw new SpectatorClientError(
        'La key de Riot no sirve o venció; las Development Keys vencen cada 24 h',
        'invalid-key',
      );
    }
    if (response.status === 429) {
      throw new SpectatorClientError('Riot limitó temporalmente las consultas', 'rate-limited');
    }
    if (response.status >= 500) {
      throw new SpectatorClientError(`Riot respondió HTTP ${response.status}`, 'unavailable');
    }
    if (!response.ok) {
      throw new SpectatorClientError(`Riot respondió HTTP ${response.status}`, 'unavailable');
    }

    let parsed: unknown;
    try {
      parsed = await response.json() as unknown;
    } catch (error) {
      throw invalidResponse('La respuesta de Riot no es JSON válido', error);
    }
    return parseGame(parsed);
  }

  function getActiveGame(puuid: string): Promise<SpectatorGame> {
    const cached = cache.get(puuid);
    if (cached && cached.expiresAt > now()) return cached.request;

    const pending = request(puuid);
    // También se cachean por un minuto 404, rate limits y errores de key: dos taps seguidos no
    // deben duplicar el pedido ni agravar un límite de Riot.
    cache.set(puuid, { expiresAt: now() + cacheTtlMs, request: pending });
    return pending;
  }

  return { getActiveGame };
}
