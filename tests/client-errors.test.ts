import { describe, expect, it } from 'vitest';

import { classifyClientError } from '@/features/app/client-errors';

describe('classifyClientError', () => {
  it.each([
    'Failed to fetch',
    'Load failed',
    'NetworkError when attempting to fetch resource.',
    'An unexpected response was received from the server.',
  ])('"%s" es un corte de conexión o sesión vencida', (message) => {
    expect(classifyClientError(new TypeError(message), true)).toBe('connection');
  });

  it('sin internet siempre es conexión', () => {
    expect(classifyClientError(new Error('lo que sea'), false)).toBe('connection');
  });

  it('un error de la app no se confunde con la sesión', () => {
    expect(classifyClientError(new Error('Cannot read properties of undefined'), true)).toBe('unknown');
    expect(classifyClientError(null, true)).toBe('unknown');
  });
});
