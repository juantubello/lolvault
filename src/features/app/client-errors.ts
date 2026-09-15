export type ClientErrorKind = 'connection' | 'unknown';

/**
 * Cuando vence la sesión de Cloudflare Access, las Server Actions no llegan a la app: Access
 * redirige al login (otro origen) y el fetch falla con mensajes distintos según el navegador, o
 * Next recibe HTML en vez de su respuesta. Lo mismo pasa sin internet. En todos esos casos lo que
 * sirve es recargar la página, así que se agrupan como 'connection'.
 */
const CONNECTION_PATTERNS = [
  /failed to fetch/i, // Chrome
  /load failed/i, // Safari / iOS
  /networkerror/i, // Firefox
  /network request failed/i,
  /unexpected response was received from the server/i, // Next: la respuesta no era de la acción
  /fetch failed/i,
];

export function classifyClientError(error: unknown, online: boolean): ClientErrorKind {
  if (!online) return 'connection';
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return CONNECTION_PATTERNS.some((pattern) => pattern.test(message)) ? 'connection' : 'unknown';
}
