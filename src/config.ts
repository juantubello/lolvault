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

export const RIOT_PLATFORM = 'la2';
export const RIOT_REGION = 'americas';
