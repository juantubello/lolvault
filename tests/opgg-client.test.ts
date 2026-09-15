import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { createOpggClient } from '@/features/matches/opgg/opgg-client';

type RpcPayload = Record<string, unknown>;

const jsonFixture = (name: string): RpcPayload => JSON.parse(readFileSync(
  new URL(`./fixtures/opgg/${name}`, import.meta.url),
  'utf8',
)) as RpcPayload;

function payloadFrom(init?: RequestInit): RpcPayload {
  return JSON.parse(String(init?.body)) as RpcPayload;
}

function jsonResponse(payload: unknown, options: ResponseInit = {}): Response {
  const headers = new Headers(options.headers);
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  return new Response(JSON.stringify(payload), { ...options, headers });
}

function initialized(id: unknown, session = 'session-1'): Response {
  const fixture = jsonFixture('rpc-initialize.json');
  return jsonResponse({ ...fixture, id }, {
    headers: { 'mcp-session-id': session },
  });
}

function toolSuccess(id: unknown, text = 'resultado'): Response {
  return jsonResponse({
    jsonrpc: '2.0',
    id,
    result: { content: [{ type: 'text', text }] },
  });
}

function fakeFetch(
  implementation: (payload: RpcPayload, init?: RequestInit) => Promise<Response> | Response,
): typeof fetch {
  return vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => (
    implementation(payloadFrom(init), init)
  )) as unknown as typeof fetch;
}

describe('cliente MCP de OP.GG', () => {
  it('inicializa una vez, notifica y reutiliza el header de sesión', async () => {
    const calls: { payload: RpcPayload; headers: Headers }[] = [];
    const fetchFn = fakeFetch((payload, init) => {
      calls.push({ payload, headers: new Headers(init?.headers) });
      if (payload.method === 'initialize') return initialized(payload.id);
      if (payload.method === 'notifications/initialized') return new Response(null, { status: 202 });
      return toolSuccess(payload.id, `texto-${String(payload.id)}`);
    });
    const client = createOpggClient({ fetchFn });

    await expect(client.callTool('tool-a', { value: 1 })).resolves.toBe('texto-2');
    await expect(client.callTool('tool-b', {})).resolves.toBe('texto-3');

    expect(calls.map(({ payload }) => payload.method)).toEqual([
      'initialize',
      'notifications/initialized',
      'tools/call',
      'tools/call',
    ]);
    expect(calls[0]?.headers.get('user-agent')).toBe('LolVault/1.0 (private app)');
    expect(calls[0]?.headers.get('accept')).toBe('application/json, text/event-stream');
    expect(calls[1]?.headers.get('mcp-session-id')).toBe('session-1');
    expect(calls[2]?.headers.get('mcp-session-id')).toBe('session-1');
    expect(calls[2]?.payload.params).toEqual({
      name: 'tool-a',
      arguments: { value: 1 },
    });
  });

  it('acepta respuestas JSON-RPC por SSE', async () => {
    const fetchFn = fakeFetch((payload) => {
      if (payload.method === 'initialize') return initialized(payload.id);
      if (payload.method === 'notifications/initialized') return new Response(null, { status: 202 });
      return new Response(
        `event: message\ndata: ${JSON.stringify({
          jsonrpc: '2.0',
          id: payload.id,
          result: { content: [{ type: 'text', text: 'desde SSE' }] },
        })}\n\n`,
        { headers: { 'content-type': 'text/event-stream' } },
      );
    });

    await expect(createOpggClient({ fetchFn }).callTool('tool', {}))
      .resolves.toBe('desde SSE');
  });

  it('mapea Summoner not found a not-found', async () => {
    const notFound = jsonFixture('rpc-error-not-found.json');
    const fetchFn = fakeFetch((payload) => {
      if (payload.method === 'initialize') return initialized(payload.id);
      if (payload.method === 'notifications/initialized') return new Response(null, { status: 202 });
      return jsonResponse({ ...notFound, id: payload.id });
    });

    await expect(createOpggClient({ fetchFn }).callTool('tool', {}))
      .rejects.toMatchObject({ kind: 'not-found' });
  });

  it('mapea HTTP 503 a unavailable', async () => {
    const fetchFn = fakeFetch((payload) => {
      if (payload.method === 'initialize') return initialized(payload.id);
      if (payload.method === 'notifications/initialized') return new Response(null, { status: 202 });
      return new Response('caído', { status: 503 });
    });

    await expect(createOpggClient({ fetchFn }).callTool('tool', {}))
      .rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('mapea el timeout a unavailable', async () => {
    const fetchFn = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      })
    )) as unknown as typeof fetch;

    await expect(createOpggClient({ fetchFn, timeoutMs: 5 }).callTool('tool', {}))
      .rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('reinicializa una sola vez cuando la sesión venció', async () => {
    let initializeCount = 0;
    let toolCount = 0;
    const fetchFn = fakeFetch((payload) => {
      if (payload.method === 'initialize') {
        initializeCount += 1;
        return initialized(payload.id, `session-${initializeCount}`);
      }
      if (payload.method === 'notifications/initialized') return new Response(null, { status: 202 });
      toolCount += 1;
      return toolCount === 1
        ? new Response('sesión vencida', { status: 404 })
        : toolSuccess(payload.id, 'recuperado');
    });

    await expect(createOpggClient({ fetchFn }).callTool('tool', {})).resolves.toBe('recuperado');
    expect(initializeCount).toBe(2);
    expect(toolCount).toBe(2);
  });

  it('comparte un solo initialize entre llamadas concurrentes', async () => {
    let initializeCount = 0;
    const fetchFn = fakeFetch(async (payload) => {
      if (payload.method === 'initialize') {
        initializeCount += 1;
        await Promise.resolve();
        return initialized(payload.id);
      }
      if (payload.method === 'notifications/initialized') return new Response(null, { status: 202 });
      return toolSuccess(payload.id, String((payload.params as RpcPayload).name));
    });
    const client = createOpggClient({ fetchFn });

    await expect(Promise.all([
      client.callTool('uno', {}),
      client.callTool('dos', {}),
    ])).resolves.toEqual(['uno', 'dos']);
    expect(initializeCount).toBe(1);
  });
});
