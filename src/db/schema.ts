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

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Champion = typeof champions.$inferSelect;
export type VaultProposal = typeof vaultProposals.$inferSelect;
export type VaultVote = typeof vaultVotes.$inferSelect;
