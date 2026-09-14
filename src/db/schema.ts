import { sql } from 'drizzle-orm';
import { check, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const vaultProposals = sqliteTable(
  'vault_proposals',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    targetUserId: integer('target_user_id')
      .notNull()
      .references(() => users.id),
    proposerUserId: integer('proposer_user_id')
      .notNull()
      .references(() => users.id),
    championId: text('champion_id')
      .notNull()
      .references(() => champions.id),
    days: integer('days').notNull(),
    reason: text('reason'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    closesAt: integer('closes_at', { mode: 'timestamp_ms' }).notNull(),
    approvedAt: integer('approved_at', { mode: 'timestamp_ms' }),
    vaultEndsAt: integer('vault_ends_at', { mode: 'timestamp_ms' }),
    cancelledAt: integer('cancelled_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    check('vault_proposals_days_check', sql`${table.days} BETWEEN 1 AND 30`),
    check(
      'vault_proposals_different_users_check',
      sql`${table.targetUserId} <> ${table.proposerUserId}`,
    ),
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

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Champion = typeof champions.$inferSelect;
export type VaultProposal = typeof vaultProposals.$inferSelect;
export type VaultVote = typeof vaultVotes.$inferSelect;
