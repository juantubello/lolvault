import { MatchProviderError } from '@/features/matches/types';

const DEFAULT_ENDPOINT = 'https://mcp-api.op.gg/mcp';
const DEFAULT_TIMEOUT_MS = 15_000;
/** Tope de una llamada completa (initialize + notificación + tools/call + reintento de sesión). */
const DEFAULT_TOTAL_TIMEOUT_MS = 20_000;

type JsonObject = Record<string, unknown>;

type OpggClientOptions = {
  endpoint?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  totalTimeoutMs?: number;
};

class SessionExpiredError extends Error {
  constructor() {
    super('La sesión MCP expiró');
    this.name = 'SessionExpiredError';
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidResponse(message: string, cause?: unknown): MatchProviderError {
  const detail = cause instanceof Error ? `: ${cause.message}` : '';
  return new MatchProviderError(`${message}${detail}`, 'invalid-response');
}

function unavailable(message: string, cause?: unknown): MatchProviderError {
  const detail = cause instanceof Error ? `: ${cause.message}` : '';
  return new MatchProviderError(`${message}${detail}`, 'unavailable');
}

function parseSse(body: string): unknown[] {
  const values: unknown[] = [];
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trimStart();
    if (data === '' || data === '[DONE]') continue;
    try {
      values.push(JSON.parse(data) as unknown);
    } catch (error) {
      throw invalidResponse('Respuesta SSE ilegible', error);
    }
  }
  if (values.length === 0) throw invalidResponse('La respuesta SSE no contiene datos JSON-RPC');
  return values;
}

async function readRpcEnvelope(response: Response, expectedId: number): Promise<JsonObject> {
  let body: string;
  try {
    body = await response.text();
  } catch (error) {
    throw invalidResponse('No se pudo leer la respuesta de OP.GG', error);
  }

  let candidates: unknown[];
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (contentType.includes('text/event-stream') || /^\s*data:/m.test(body)) {
    candidates = parseSse(body);
  } else {
    try {
      candidates = [JSON.parse(body) as unknown];
    } catch (error) {
      throw invalidResponse('Respuesta JSON ilegible', error);
    }
  }

  let envelope: unknown;
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index];
    if (isObject(candidate) && candidate.id === expectedId) {
      envelope = candidate;
      break;
    }
  }
  if (!isObject(envelope)) {
    throw invalidResponse(`Falta la respuesta JSON-RPC para el id ${expectedId}`);
  }
  if (envelope.jsonrpc !== '2.0') throw invalidResponse('Versión JSON-RPC inválida');
  return envelope;
}

function rpcErrorMessage(error: JsonObject): string {
  return typeof error.message === 'string' ? error.message : 'Error JSON-RPC de OP.GG';
}

function isSessionError(error: JsonObject): boolean {
  const message = rpcErrorMessage(error);
  let data = '';
  try {
    data = JSON.stringify(error.data ?? '');
  } catch {
    // Un dato no serializable no cambia la clasificación basada en el mensaje.
  }
  return /session/i.test(`${message} ${data}`);
}

function throwRpcError(errorValue: unknown, sessionSensitive: boolean): never {
  if (!isObject(errorValue)) throw invalidResponse('Error JSON-RPC con formato inválido');
  const message = rpcErrorMessage(errorValue);
  if (/summoner\s+not\s+found/i.test(message)) {
    throw new MatchProviderError(message, 'not-found');
  }
  if (sessionSensitive && isSessionError(errorValue)) throw new SessionExpiredError();
  throw unavailable(message);
}

export function createOpggClient(options: OpggClientOptions = {}): {
  callTool(name: string, args: Record<string, unknown>): Promise<string>;
} {
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const totalTimeoutMs = options.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS;
  let nextId = 1;
  let sessionId: string | null = null;
  let initializeInFlight: Promise<void> | null = null;

  async function post(
    payload: JsonObject,
    currentSession: string | null,
    sessionSensitive: boolean,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      'User-Agent': 'LolVault/1.0 (private app)',
    };
    if (currentSession !== null) headers['mcp-session-id'] = currentSession;

    let response: Response;
    try {
      response = await fetchFn(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw unavailable('No se pudo conectar con OP.GG', error);
    }

    if (!response.ok) {
      if (sessionSensitive && (response.status === 400 || response.status === 404)) {
        throw new SessionExpiredError();
      }
      if (response.status === 429 || response.status >= 500) {
        throw unavailable(`OP.GG respondió HTTP ${response.status}`);
      }
      throw unavailable(`OP.GG respondió HTTP ${response.status}`);
    }
    return response;
  }

  async function initialize(): Promise<void> {
    const id = nextId;
    nextId += 1;
    const response = await post({
      jsonrpc: '2.0',
      id,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'lolvault', version: '1.0.0' },
      },
    }, null, false);
    const envelope = await readRpcEnvelope(response, id);
    if ('error' in envelope) throwRpcError(envelope.error, false);
    if (!isObject(envelope.result)) throw invalidResponse('Initialize de OP.GG sin resultado');

    const newSessionId = response.headers.get('mcp-session-id')?.trim();
    if (!newSessionId) throw invalidResponse('Initialize de OP.GG sin mcp-session-id');

    await post({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    }, newSessionId, false);
    sessionId = newSessionId;
  }

  async function ensureSession(): Promise<void> {
    if (sessionId !== null) return;
    if (initializeInFlight === null) {
      initializeInFlight = initialize().finally(() => {
        initializeInFlight = null;
      });
    }
    await initializeInFlight;
  }

  async function callToolOnce(name: string, args: Record<string, unknown>): Promise<string> {
    await ensureSession();

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const currentSession = sessionId;
      if (currentSession === null) {
        await ensureSession();
        continue;
      }

      try {
        const id = nextId;
        nextId += 1;
        const response = await post({
          jsonrpc: '2.0',
          id,
          method: 'tools/call',
          params: { name, arguments: args },
        }, currentSession, true);
        const envelope = await readRpcEnvelope(response, id);
        if ('error' in envelope) throwRpcError(envelope.error, true);
        if (!isObject(envelope.result)) throw invalidResponse('tools/call sin resultado');
        if (envelope.result.isError === true) {
          throw unavailable('OP.GG devolvió un error al ejecutar la herramienta');
        }

        const content = envelope.result.content;
        if (!Array.isArray(content)) throw invalidResponse('tools/call sin contenido');
        const texts = content.flatMap((item) => (
          isObject(item) && item.type === 'text' && typeof item.text === 'string'
            ? [item.text]
            : []
        ));
        if (texts.length === 0) throw invalidResponse('tools/call sin contenido de texto');
        return texts.join('\n');
      } catch (error) {
        if (!(error instanceof SessionExpiredError)) throw error;
        if (attempt === 1) throw unavailable('La sesión MCP expiró nuevamente');
        if (sessionId === currentSession) sessionId = null;
        await ensureSession();
      }
    }

    throw unavailable('No se pudo ejecutar la herramienta de OP.GG');
  }

  /**
   * Cada POST tiene su timeout, pero una llamada en frío hace varios: sin un tope total, una
   * página que espera a OP.GG podía quedar colgada hasta que Cloudflare corta (524 a los 100 s).
   */
  async function callTool(name: string, args: Record<string, unknown>): Promise<string> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(unavailable(`OP.GG no respondió en ${Math.round(totalTimeoutMs / 1000)} s`)),
        totalTimeoutMs,
      );
    });
    try {
      return await Promise.race([callToolOnce(name, args), deadline]);
    } finally {
      clearTimeout(timer);
    }
  }

  return { callTool };
}
