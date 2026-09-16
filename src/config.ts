export const VAULT_APPROVALS_REQUIRED = 3;
export const VOTING_WINDOW_MS = 48 * 60 * 60 * 1000;
/** Duración máxima de un vault (desde → hasta, inclusive). */
export const VAULT_MAX_DAYS = 30;
/** Hasta cuántos días en el futuro puede arrancar un vault propuesto. */
export const VAULT_MAX_START_AHEAD_DAYS = 30;
export const VAULT_REASON_MAX_LENGTH = 280;
export const BLACKLIST_APPROVALS_REQUIRED = 2;
export const BLACKLIST_NAME_MAX_LENGTH = 40;
export const BLACKLIST_REASON_MAX_LENGTH = VAULT_REASON_MAX_LENGTH;
/** "Por expirar": vigentes a los que les quedan como mucho estos días contando hoy (2 = hoy o mañana). */
export const VAULT_EXPIRING_DAYS = 2;

export const APP_TIME_ZONE = 'America/Argentina/Buenos_Aires';

/** Avisos custom al grupo por usuario, por día calendario argentino (el límite vive en un UNIQUE). */
export const CUSTOM_NOTIFICATIONS_PER_DAY = 1;
export const CUSTOM_NOTIFICATION_MAX_LENGTH = 140;

/** Foto de perfil: se achica en el teléfono a un cuadrado de este lado antes de subir. */
export const AVATAR_SIZE_PX = 256;
/** Tope del archivo ya achicado (un JPEG de 256 px pesa ~30 KB). */
export const AVATAR_MAX_BYTES = 512 * 1024;

/** Historial de partidas vía OP.GG (sin key). Ver docs/APIS-LOL.md. */
export const OPGG_REGION = 'LAS';
/**
 * Regiones que acepta Scout. Es la lista que devuelve el propio validador de OP.GG al mandarle
 * una region invalida, verificada contra lol_get_summoner_profile (la herramienta que usa Scout).
 * Los codigos de plataforma (LA2, NA1, EUW1...) son alias de estos mismos, asi que no se ofrecen:
 * LAS y LA2 son la misma region y elegir entre las dos solo confunde.
 * Ordenadas por cercania a LAS, que es el default (OPGG_REGION).
 */
export const OPGG_SCOUT_REGIONS = [
  'LAS', 'LAN', 'BR', 'NA', 'EUW', 'EUNE', 'KR', 'OCE', 'JP',
  'TR', 'RU', 'TW', 'VN', 'TH', 'PH', 'SG', 'SEA', 'ME',
] as const;
export type OpggScoutRegion = (typeof OPGG_SCOUT_REGIONS)[number];
/** Cada cuánto se puede volver a pedir el historial de un jugador. Mientras tanto, caché. */
export const MATCHES_REFRESH_MS = 10 * 60 * 1000;
/** Límite entre refrescos manuales del mismo jugador, incluso si el anterior falló. */
export const MATCHES_FORCE_REFRESH_MS = 60 * 1000;
/** Si la fuente falló, esperar esto antes de reintentar (no martillar a OP.GG si nos bloquea). */
export const MATCHES_RETRY_AFTER_ERROR_MS = 5 * 60 * 1000;
/** Partidas que se piden por jugador (OP.GG acepta 5–20). */
export const MATCHES_LIMIT = 20;
/** Detalles faltantes que se hidratan, de a uno, después de cada sync exitoso. */
export const MATCH_DETAILS_PER_SYNC = 5;
/** Máximo de jugadores conocidos que devuelve el autocompletado de black list. */
export const BLACKLIST_SUGGESTIONS_LIMIT = 8;

/** Ingesta server-side de Lolalytics para Draft. `30` significa los últimos 30 días. */
export const LOLALYTICS_PATCH_WINDOW = process.env.LOLALYTICS_PATCH_WINDOW?.trim() || '30';
/**
 * Pausa prudente entre requests. Medido contra la fuente: cada request tarda ~0,32 s de red, asi
 * que con esta pausa cada uno sale ~0,82 s y los 5.190 (173 campeones x 30) dan unos 71 minutos.
 */
export const LOLALYTICS_REQUEST_DELAY_MS = 500;
/** Cada request tiene su propio corte; además el cliente limita la operación completa. */
export const LOLALYTICS_REQUEST_TIMEOUT_MS = 15_000;
export const LOLALYTICS_CLIENT_TOTAL_TIMEOUT_MS = 20_000;
/**
 * Tope de una ejecucion. Dos horas: la pasada completa medida tarda ~71 minutos, y con una hora se
 * cortaba siempre por la mitad. Si igual no llega, la corrida guarda su cursor y retoma sola.
 */
export const LOLALYTICS_SYNC_TOTAL_TIMEOUT_MS = 2 * 60 * 60 * 1000;
/** El disparador programático no inicia otra pasada completa antes de 24 horas. */
export const LOLALYTICS_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** Las sinergias con menos partidas son demasiado chicas para conservarlas. */
export const LOLALYTICS_MIN_SYNERGY_GAMES = 10;

export const RIOT_PLATFORM = 'la2';
export const RIOT_REGION = 'americas';
