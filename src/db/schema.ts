import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

import type { MatchDetail, SummonerProfile } from '@/features/matches/types';

export const champions = sqliteTable('champions', {
  id: text('id').primaryKey(),
  key: integer('key').unique(),
  name: text('name').notNull(),
  title: text('title').notNull(),
  imageFile: text('image_file').notNull(),
  version: text('version').notNull(),
});

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  externalIdentity: text('external_identity').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  riotGameName: text('riot_game_name'),
  riotTagLine: text('riot_tag_line'),
  riotPuuid: text('riot_puuid'),
  avatarChampionId: text('avatar_champion_id').references(() => champions.id),
  /** Cuándo subió su foto de perfil (null = sin foto). Versiona la URL para el caché. */
  avatarUpdatedAt: integer('avatar_updated_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

/** Suscripciones Web Push por navegador/dispositivo, siempre ligadas a un usuario autenticado. */
export const pushSubscriptions = sqliteTable(
  'push_subscriptions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    deviceLabel: text('device_label').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    lastSuccessAt: integer('last_success_at', { mode: 'timestamp_ms' }),
    failureCount: integer('failure_count').notNull().default(0),
  },
  (table) => [index('push_subscriptions_user_idx').on(table.userId)],
);

/** Qué avisos push quiere recibir cada usuario (en todos sus dispositivos). Sin fila = todo encendido. */
export const notificationPreferences = sqliteTable('notification_preferences', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  vaults: integer('vaults', { mode: 'boolean' }).notNull().default(true),
  blacklist: integer('blacklist', { mode: 'boolean' }).notNull().default(true),
  custom: integer('custom', { mode: 'boolean' }).notNull().default(true),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

/**
 * Avisos custom al grupo. Con CUSTOM_NOTIFICATIONS_PER_DAY = 1 el UNIQUE (emisor, día AR) hace
 * cumplir el límite en la base, también ante dos envíos simultáneos. Si el límite sube, reemplazar
 * el UNIQUE por un conteo dentro de una transacción.
 */
export const customNotifications = sqliteTable(
  'custom_notifications',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    senderUserId: integer('sender_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    message: text('message').notNull(),
    /** Día calendario en hora argentina, "YYYY-MM-DD". */
    localDay: text('local_day').notNull(),
    sentAt: integer('sent_at', { mode: 'timestamp_ms' }).notNull(),
    /** Miembros que podían recibirlo (con dispositivo y la preferencia encendida). */
    recipients: integer('recipients').notNull().default(0),
  },
  (table) => [uniqueIndex('custom_notifications_sender_day_unique').on(table.senderUserId, table.localDay)],
);

export const vaultProposals = sqliteTable(
  'vault_proposals',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** 'vault' = vaultear un campeón · 'lift' = levantar antes de tiempo un vault aprobado. */
    kind: text('kind', { enum: ['vault', 'lift'] }).notNull().default('vault'),
    /** Solo en 'lift': el vault que se quiere levantar. */
    vaultId: integer('vault_id').references((): AnySQLiteColumn => vaultProposals.id),
    targetUserId: integer('target_user_id')
      .notNull()
      .references(() => users.id),
    proposerUserId: integer('proposer_user_id')
      .notNull()
      .references(() => users.id),
    championId: text('champion_id')
      .notNull()
      .references(() => champions.id),
    /** Solo en 'vault': 00:00 (hora AR) de "desde". */
    startsAt: integer('starts_at', { mode: 'timestamp_ms' }),
    /** Solo en 'vault': 00:00 del día siguiente a "hasta" (exclusivo). */
    endsAt: integer('ends_at', { mode: 'timestamp_ms' }),
    reason: text('reason'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    closesAt: integer('closes_at', { mode: 'timestamp_ms' }).notNull(),
    approvedAt: integer('approved_at', { mode: 'timestamp_ms' }),
    rejectedAt: integer('rejected_at', { mode: 'timestamp_ms' }),
    cancelledAt: integer('cancelled_at', { mode: 'timestamp_ms' }),
    /** Solo en 'vault': cuándo lo levantó una votación 'lift' aprobada. */
    liftedAt: integer('lifted_at', { mode: 'timestamp_ms' }),
    /** Partida decisiva adjunta (opcional): fuente, id y foto guardada con la propuesta. */
    matchProvider: text('match_provider'),
    matchId: text('match_id'),
    matchSnapshot: text('match_snapshot', { mode: 'json' }).$type<MatchDetail>(),
  },
  (table) => [
    check('vault_proposals_kind_check', sql`${table.kind} IN ('vault', 'lift')`),
    check(
      'vault_proposals_shape_check',
      sql`(${table.kind} = 'vault' AND ${table.vaultId} IS NULL AND ${table.startsAt} IS NOT NULL AND ${table.endsAt} IS NOT NULL AND ${table.endsAt} > ${table.startsAt}) OR (${table.kind} = 'lift' AND ${table.vaultId} IS NOT NULL AND ${table.startsAt} IS NULL AND ${table.endsAt} IS NULL AND ${table.liftedAt} IS NULL)`,
    ),
    index('vault_proposals_target_champion_idx').on(table.targetUserId, table.championId),
    index('vault_proposals_vault_idx').on(table.vaultId),
  ],
);

export const vaultVotes = sqliteTable(
  'vault_votes',
  {
    proposalId: integer('proposal_id')
      .notNull()
      .references(() => vaultProposals.id, { onDelete: 'cascade' }),
    voterUserId: integer('voter_user_id')
      .notNull()
      .references(() => users.id),
    value: text('value', { enum: ['yes', 'no'] }).notNull(),
    votedAt: integer('voted_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.proposalId, table.voterUserId] }),
    check('vault_votes_value_check', sql`${table.value} IN ('yes', 'no')`),
  ],
);

export const blacklistProposals = sqliteTable(
  'blacklist_proposals',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    kind: text('kind', { enum: ['add', 'remove'] }).notNull(),
    /** Solo en 'remove': la entrada aprobada que se quiere sacar. */
    entryId: integer('entry_id').references((): AnySQLiteColumn => blacklistProposals.id),
    playerName: text('player_name').notNull(),
    riotGameName: text('riot_game_name'),
    riotTagLine: text('riot_tag_line'),
    dedupeKey: text('dedupe_key').notNull(),
    proposerUserId: integer('proposer_user_id')
      .notNull()
      .references(() => users.id),
    reason: text('reason'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    closesAt: integer('closes_at', { mode: 'timestamp_ms' }).notNull(),
    approvedAt: integer('approved_at', { mode: 'timestamp_ms' }),
    rejectedAt: integer('rejected_at', { mode: 'timestamp_ms' }),
    cancelledAt: integer('cancelled_at', { mode: 'timestamp_ms' }),
    /** Solo en 'add': cuándo una propuesta 'remove' aprobada sacó la entrada. */
    removedAt: integer('removed_at', { mode: 'timestamp_ms' }),
    matchProvider: text('match_provider'),
    matchId: text('match_id'),
    matchSnapshot: text('match_snapshot', { mode: 'json' }).$type<MatchDetail>(),
  },
  (table) => [
    check('blacklist_proposals_kind_check', sql`${table.kind} IN ('add', 'remove')`),
    check(
      'blacklist_proposals_shape_check',
      sql`(${table.kind} = 'add' AND ${table.entryId} IS NULL) OR (${table.kind} = 'remove' AND ${table.entryId} IS NOT NULL AND ${table.removedAt} IS NULL)`,
    ),
    index('blacklist_proposals_dedupe_idx').on(table.dedupeKey),
    index('blacklist_proposals_entry_idx').on(table.entryId),
  ],
);

export const blacklistVotes = sqliteTable(
  'blacklist_votes',
  {
    proposalId: integer('proposal_id')
      .notNull()
      .references(() => blacklistProposals.id, { onDelete: 'cascade' }),
    voterUserId: integer('voter_user_id')
      .notNull()
      .references(() => users.id),
    value: text('value', { enum: ['yes', 'no'] }).notNull(),
    votedAt: integer('voted_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.proposalId, table.voterUserId] }),
    check('blacklist_votes_value_check', sql`${table.value} IN ('yes', 'no')`),
  ],
);

/** Historial por jugador, cacheado desde la fuente (OP.GG). Una partida jugada no cambia. */
export const playerMatches = sqliteTable(
  'player_matches',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    matchId: text('match_id').notNull(),
    /** Cuenta de Riot de esa partida: si el amigo cambia de cuenta, las viejas no se mezclan. */
    puuid: text('puuid').notNull(),
    playedAt: integer('played_at', { mode: 'timestamp_ms' }).notNull(),
    queue: text('queue').notNull(),
    durationSeconds: integer('duration_seconds').notNull(),
    championId: integer('champion_id').notNull(),
    championName: text('champion_name').notNull(),
    position: text('position'),
    teamKey: text('team_key').notNull(),
    kills: integer('kills').notNull(),
    deaths: integer('deaths').notNull(),
    assists: integer('assists').notNull(),
    championLevel: integer('champion_level').notNull(),
    cs: integer('cs').notNull(),
    damageDealt: integer('damage_dealt').notNull(),
    damageTaken: integer('damage_taken').notNull(),
    teamKills: integer('team_kills').notNull(),
    win: integer('win', { mode: 'boolean' }).notNull(),
    result: text('result').notNull(),
    opScore: real('op_score'),
    opScoreRank: integer('op_score_rank'),
    fetchedAt: integer('fetched_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.provider, table.matchId] }),
    index('player_matches_user_played_idx').on(table.userId, table.playedAt),
  ],
);

/** Detalle completo de una partida (los 10 jugadores). Se guarda una vez y para siempre. */
export const matchDetails = sqliteTable(
  'match_details',
  {
    provider: text('provider').notNull(),
    matchId: text('match_id').notNull(),
    playedAt: integer('played_at', { mode: 'timestamp_ms' }).notNull(),
    data: text('data', { mode: 'json' }).$type<MatchDetail>().notNull(),
    fetchedAt: integer('fetched_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.provider, table.matchId] })],
);

/** Índice consultable de los jugadores que aparecieron en detalles ya cacheados. */
export const matchParticipants = sqliteTable(
  'match_participants',
  {
    provider: text('provider').notNull(),
    matchId: text('match_id').notNull(),
    puuid: text('puuid').notNull(),
    gameName: text('game_name').notNull(),
    tagLine: text('tag_line').notNull(),
    searchName: text('search_name').notNull(),
    championId: integer('champion_id'),
    championName: text('champion_name'),
    teamKey: text('team_key'),
    playedAt: integer('played_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.matchId, table.puuid] }),
    index('match_participants_search_name_idx').on(table.searchName),
    index('match_participants_riot_id_idx').on(table.gameName, table.tagLine),
  ],
);

/**
 * Estado de sincronización por jugador: cuándo se refrescó, con qué Riot ID, el perfil cacheado
 * y el último error. Si la fuente falla o nos bloquea, la UI muestra lo que hay acá y en player_matches.
 */
export const playerStatsSync = sqliteTable('player_stats_sync', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  riotGameName: text('riot_game_name').notNull(),
  riotTagLine: text('riot_tag_line').notNull(),
  puuid: text('puuid'),
  profile: text('profile', { mode: 'json' }).$type<SummonerProfile>(),
  matchesSyncedAt: integer('matches_synced_at', { mode: 'timestamp_ms' }),
  profileSyncedAt: integer('profile_synced_at', { mode: 'timestamp_ms' }),
  /** Último intento (exitoso o no): evita reintentar en cada request cuando la fuente está caída. */
  attemptedAt: integer('attempted_at', { mode: 'timestamp_ms' }),
  lastError: text('last_error'),
  lastErrorAt: integer('last_error_at', { mode: 'timestamp_ms' }),
});

/** Fuerza base de un campeón en un rol para la ventana actualmente cacheada. */
export const draftChampionStats = sqliteTable(
  'draft_champion_stats',
  {
    championKey: integer('champion_key').notNull(),
    role: text('role').notNull(),
    games: integer('games').notNull(),
    wins: integer('wins').notNull(),
    patchWindow: text('patch_window').notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.championKey, table.role] }),
    check('draft_champion_stats_games_check', sql`${table.games} >= 0`),
    check('draft_champion_stats_wins_check', sql`${table.wins} >= 0 AND ${table.wins} <= ${table.games}`),
  ],
);

/** Matchup dirigido: campeón/rol contra enemigo/rol. */
export const draftMatchups = sqliteTable(
  'draft_matchups',
  {
    championKey: integer('champion_key').notNull(),
    role: text('role').notNull(),
    enemyChampionKey: integer('enemy_champion_key').notNull(),
    enemyRole: text('enemy_role').notNull(),
    games: integer('games').notNull(),
    wins: integer('wins').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.championKey, table.role, table.enemyChampionKey, table.enemyRole] }),
    check('draft_matchups_games_check', sql`${table.games} >= 0`),
    check('draft_matchups_wins_check', sql`${table.wins} >= 0 AND ${table.wins} <= ${table.games}`),
    index('draft_matchups_enemy_idx').on(table.enemyChampionKey, table.enemyRole),
  ],
);

/** Sinergia dirigida: campeón/rol con aliado/rol. */
export const draftSynergies = sqliteTable(
  'draft_synergies',
  {
    championKey: integer('champion_key').notNull(),
    role: text('role').notNull(),
    allyChampionKey: integer('ally_champion_key').notNull(),
    allyRole: text('ally_role').notNull(),
    games: integer('games').notNull(),
    wins: integer('wins').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.championKey, table.role, table.allyChampionKey, table.allyRole] }),
    check('draft_synergies_games_check', sql`${table.games} >= 0`),
    check('draft_synergies_wins_check', sql`${table.wins} >= 0 AND ${table.wins} <= ${table.games}`),
    index('draft_synergies_ally_idx').on(table.allyChampionKey, table.allyRole),
  ],
);

/** Rendimiento de un campeón/rol en cada uno de los siete tramos de duración de Lolalytics. */
export const draftChampionScaling = sqliteTable(
  'draft_champion_scaling',
  {
    championKey: integer('champion_key').notNull(),
    role: text('role').notNull(),
    bucket: integer('bucket').notNull(),
    games: integer('games').notNull(),
    wins: integer('wins').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.championKey, table.role, table.bucket] }),
    check('draft_champion_scaling_bucket_check', sql`${table.bucket} >= 1 AND ${table.bucket} <= 7`),
    check('draft_champion_scaling_games_check', sql`${table.games} >= 0`),
    check('draft_champion_scaling_wins_check', sql`${table.wins} >= 0 AND ${table.wins} <= ${table.games}`),
  ],
);

/** Un intento de sync. El cursor permite retomar sin descartar respuestas ya guardadas. */
export const draftSyncRuns = sqliteTable('draft_sync_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
  finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
  patchWindow: text('patch_window').notNull(),
  requestsMade: integer('requests_made').notNull().default(0),
  totalRequests: integer('total_requests').notNull(),
  startRequestIndex: integer('start_request_index').notNull().default(0),
  nextRequestIndex: integer('next_request_index').notNull().default(0),
  failed: integer('failed', { mode: 'boolean' }).notNull().default(false),
  error: text('error'),
}, (table) => [
  check('draft_sync_runs_requests_check', sql`${table.requestsMade} >= 0`),
  check('draft_sync_runs_cursor_check', sql`${table.nextRequestIndex} >= 0 AND ${table.nextRequestIndex} <= ${table.totalRequests}`),
]);

/** Cursor separado: una falla de Scaling nunca cambia el estado del sync principal. */
export const draftScalingSyncRuns = sqliteTable('draft_scaling_sync_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
  finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
  patchWindow: text('patch_window').notNull(),
  requestsMade: integer('requests_made').notNull().default(0),
  totalRequests: integer('total_requests').notNull(),
  startRequestIndex: integer('start_request_index').notNull().default(0),
  nextRequestIndex: integer('next_request_index').notNull().default(0),
  failed: integer('failed', { mode: 'boolean' }).notNull().default(false),
  error: text('error'),
}, (table) => [
  check('draft_scaling_sync_runs_requests_check', sql`${table.requestsMade} >= 0`),
  check('draft_scaling_sync_runs_cursor_check', sql`${table.nextRequestIndex} >= 0 AND ${table.nextRequestIndex} <= ${table.totalRequests}`),
]);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Champion = typeof champions.$inferSelect;
export type VaultProposal = typeof vaultProposals.$inferSelect;
export type VaultVote = typeof vaultVotes.$inferSelect;
export type BlacklistProposal = typeof blacklistProposals.$inferSelect;
export type BlacklistVote = typeof blacklistVotes.$inferSelect;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
