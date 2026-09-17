import {
  LOLALYTICS_CLIENT_TOTAL_TIMEOUT_MS,
  LOLALYTICS_REQUEST_TIMEOUT_MS,
} from '@/config';
import { DraftDataSourceError, type DraftRole } from '@/features/draft/types';

const DEFAULT_ENDPOINT = 'https://a1.lolalytics.com/mega/';
const DEFAULT_Q_DATA_ENDPOINT = 'https://lolalytics.com/lol/';

type LolalyticsClientOptions = {
  endpoint?: string;
  qDataEndpoint?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  totalTimeoutMs?: number;
};

type CommonInput = {
  championKey: number;
  /** Id de Data Dragon (ej. "Ahri"): Lolalytics no acepta la key numérica. */
  championId: string;
  role: DraftRole;
  patchWindow: string;
};

/**
 * Lolalytics identifica al campeón por su id en minúsculas ("ahri"). Con la key numérica responde
 * 200 con {"status":404} en el cuerpo. Probados los 173 campeones contra la fuente: el único que no
 * coincide con Data Dragon es MonkeyKing, que allá se llama "wukong".
 */
export function lolalyticsSlug(championId: string): string {
  const slug = championId.toLocaleLowerCase('en-US');
  return slug === 'monkeyking' ? 'wukong' : slug;
}

function unavailable(message: string, cause?: unknown): DraftDataSourceError {
  const detail = cause instanceof Error ? `: ${cause.message}` : '';
  return new DraftDataSourceError(`${message}${detail}`, 'unavailable');
}

export function createLolalyticsClient(options: LolalyticsClientOptions = {}): {
  getCounter(input: CommonInput & { enemyRole: DraftRole }): Promise<string>;
  getTeam(input: CommonInput): Promise<string>;
  getQData(input: CommonInput): Promise<string>;
} {
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const qDataEndpoint = options.qDataEndpoint ?? DEFAULT_Q_DATA_ENDPOINT;
  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = options.timeoutMs ?? LOLALYTICS_REQUEST_TIMEOUT_MS;
  const totalTimeoutMs = options.totalTimeoutMs ?? LOLALYTICS_CLIENT_TOTAL_TIMEOUT_MS;

  async function request(
    url: URL,
    options: { httpNotFound?: boolean } = {},
  ): Promise<string> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(unavailable(
        `Lolalytics no respondió en ${Math.round(totalTimeoutMs / 1000)} s`,
      )), totalTimeoutMs);
    });

    const execute = async (): Promise<string> => {
      let response: Response;
      try {
        response = await fetchFn(url, {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'LolVault/1.0 (private app)',
          },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        throw unavailable('No se pudo conectar con Lolalytics', error);
      }
      if (options.httpNotFound && response.status === 404) {
        throw new DraftDataSourceError('Lolalytics indicó que el campeón no existe', 'not-found');
      }
      if (!response.ok) {
        throw unavailable(`Lolalytics respondió HTTP ${response.status}`);
      }
      try {
        return await response.text();
      } catch (error) {
        throw unavailable('No se pudo leer la respuesta de Lolalytics', error);
      }
    };

    try {
      return await Promise.race([execute(), deadline]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function requestMega(params: Record<string, string>): Promise<string> {
    const url = new URL(endpoint);
    const common = {
      v: '1',
      tier: 'emerald_plus',
      queue: 'ranked',
      region: 'all',
      ...params,
    };
    for (const [key, value] of Object.entries(common)) url.searchParams.set(key, value);

    return request(url);
  }

  return {
    getCounter(input) {
      return requestMega({
        ep: 'counter',
        lane: input.role,
        vslane: input.enemyRole,
        patch: input.patchWindow,
        c: lolalyticsSlug(input.championId),
      });
    },
    getTeam(input) {
      return requestMega({
        ep: 'build-team',
        lane: input.role,
        patch: input.patchWindow,
        c: lolalyticsSlug(input.championId),
      });
    },
    getQData(input) {
      const base = qDataEndpoint.endsWith('/') ? qDataEndpoint : `${qDataEndpoint}/`;
      const url = new URL(`${lolalyticsSlug(input.championId)}/build/q-data.json`, base);
      url.searchParams.set('tier', 'emerald_plus');
      url.searchParams.set('region', 'all');
      url.searchParams.set('patch', input.patchWindow);
      url.searchParams.set('lane', input.role);
      return request(url, { httpNotFound: true });
    },
  };
}
