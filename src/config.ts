export const VAULT_APPROVALS_REQUIRED = 3;
export const VOTING_WINDOW_MS = 48 * 60 * 60 * 1000;
/** Duración máxima de un vault (desde → hasta, inclusive). */
export const VAULT_MAX_DAYS = 30;
/** Hasta cuántos días en el futuro puede arrancar un vault propuesto. */
export const VAULT_MAX_START_AHEAD_DAYS = 30;
export const VAULT_REASON_MAX_LENGTH = 280;
/** "Por expirar": vigentes a los que les quedan como mucho estos días contando hoy (2 = hoy o mañana). */
export const VAULT_EXPIRING_DAYS = 2;

export const APP_TIME_ZONE = 'America/Argentina/Buenos_Aires';

/** Foto de perfil: se achica en el teléfono a un cuadrado de este lado antes de subir. */
export const AVATAR_SIZE_PX = 256;
/** Tope del archivo ya achicado (un JPEG de 256 px pesa ~30 KB). */
export const AVATAR_MAX_BYTES = 512 * 1024;

/** Historial de partidas vía OP.GG (sin key). Ver docs/APIS-LOL.md. */
export const OPGG_REGION = 'LAS';
/** Cada cuánto se puede volver a pedir el historial de un jugador. Mientras tanto, caché. */
export const MATCHES_REFRESH_MS = 10 * 60 * 1000;
/** Si la fuente falló, esperar esto antes de reintentar (no martillar a OP.GG si nos bloquea). */
export const MATCHES_RETRY_AFTER_ERROR_MS = 5 * 60 * 1000;
/** Partidas que se piden por jugador (OP.GG acepta 5–20). */
export const MATCHES_LIMIT = 20;

export const RIOT_PLATFORM = 'la2';
export const RIOT_REGION = 'americas';
