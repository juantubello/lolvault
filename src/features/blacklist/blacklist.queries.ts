/** Persistencia y lecturas de black list. Las escrituras que resuelven votos son transaccionales. */
import type Database from 'better-sqlite3';
import { and, count, desc, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import { alias, type BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import { BLACKLIST_APPROVALS_REQUIRED } from '@/config';
import type { Db } from '@/db/client';
import * as schema from '@/db/schema';
import {
  blacklistProposals,
  blacklistVotes,
  users,
  type BlacklistProposal,
} from '@/db/schema';
import type { MatchDetail, RiotId } from '@/features/matches/types';

import {
  blacklistClosesAt,
  blacklistVoteOutcome,
  blacklistVotingStatus,
  dedupeKey,
  isBlacklistEntryActive,
  riotIdKey,
  type BlacklistVotingStatus,
} from './blacklist-rules';

type Queryable = BaseSQLiteDatabase<'sync', Database.RunResult, typeof schema>;
const RECENT_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

export type BlacklistVoteValue = 'yes' | 'no';

export type CreateBlacklistInput = {
  playerName: string;
  riotGameName: string | null;
  riotTagLine: string | null;
  reason: string;
};

export type BlacklistMatchAttachment = {
  provider: string;
  matchId: string;
  snapshot: MatchDetail;
};

export type BlacklistRuleErrorCode =
  | 'duplicate-active'
  | 'duplicate-open'
  | 'entry-not-active'
  | 'remove-open'
  | 'proposal-not-found'
  | 'voting-closed'
  | 'not-member'
  | 'not-proposer';

export class BlacklistRuleError extends Error {
  constructor(
    readonly code: BlacklistRuleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BlacklistRuleError';
  }
}

function inputRiotId(input: CreateBlacklistInput): RiotId | null {
  return input.riotGameName && input.riotTagLine
    ? { gameName: input.riotGameName, tagLine: input.riotTagLine }
    : null;
}

function insertProposerVote(
  tx: Queryable,
  proposalId: number,
  proposerUserId: number,
  now: Date,
): void {
  tx.insert(blacklistVotes)
    .values({ proposalId, voterUserId: proposerUserId, value: 'yes', votedAt: now })
    .run();
}

function countEligibleVoters(db: Queryable): number {
  return db.select({ n: count() }).from(users).where(isNotNull(users.displayName)).get()?.n ?? 0;
}

export function createAddProposal(
  db: Db,
  proposerUserId: number,
  input: CreateBlacklistInput,
  now: Date,
  attachment: BlacklistMatchAttachment | null = null,
): number {
  return db.transaction((tx) => {
    const key = dedupeKey(input.playerName, inputRiotId(input));
    const same = tx
      .select()
      .from(blacklistProposals)
      .where(eq(blacklistProposals.dedupeKey, key))
      .all();

    if (same.some(isBlacklistEntryActive)) {
      throw new BlacklistRuleError('duplicate-active', 'Ese jugador ya está en la black list.');
    }
    if (same.some((proposal) => blacklistVotingStatus(proposal, now) === 'open')) {
      throw new BlacklistRuleError(
        'duplicate-open',
        'Ya hay una votación abierta para ese jugador.',
      );
    }

    const { id } = tx
      .insert(blacklistProposals)
      .values({
        kind: 'add',
        playerName: input.playerName,
        riotGameName: input.riotGameName,
        riotTagLine: input.riotTagLine,
        dedupeKey: key,
        proposerUserId,
        reason: input.reason,
        createdAt: now,
        closesAt: blacklistClosesAt(now),
        matchProvider: attachment?.provider ?? null,
        matchId: attachment?.matchId ?? null,
        matchSnapshot: attachment?.snapshot ?? null,
      })
      .returning({ id: blacklistProposals.id })
      .get();
    insertProposerVote(tx, id, proposerUserId, now);
    return id;
  });
}

export function createRemoveProposal(
  db: Db,
  proposerUserId: number,
  entryId: number,
  reason: string | null,
  now: Date,
): number {
  return db.transaction((tx) => {
    const entry = tx
      .select()
      .from(blacklistProposals)
      .where(and(eq(blacklistProposals.id, entryId), eq(blacklistProposals.kind, 'add')))
      .get();
    if (!entry || !isBlacklistEntryActive(entry)) {
      throw new BlacklistRuleError('entry-not-active', 'Esa entrada ya no está vigente.');
    }

    const removals = tx
      .select()
      .from(blacklistProposals)
      .where(
        and(
          eq(blacklistProposals.kind, 'remove'),
          eq(blacklistProposals.entryId, entryId),
        ),
      )
      .all();
    if (removals.some((proposal) => blacklistVotingStatus(proposal, now) === 'open')) {
      throw new BlacklistRuleError(
        'remove-open',
        'Ya hay una votación abierta para sacar a ese jugador.',
      );
    }

    const { id } = tx
      .insert(blacklistProposals)
      .values({
        kind: 'remove',
        entryId,
        playerName: entry.playerName,
        riotGameName: entry.riotGameName,
        riotTagLine: entry.riotTagLine,
        dedupeKey: entry.dedupeKey,
        proposerUserId,
        reason,
        createdAt: now,
        closesAt: blacklistClosesAt(now),
      })
      .returning({ id: blacklistProposals.id })
      .get();
    insertProposerVote(tx, id, proposerUserId, now);
    return id;
  });
}

export function castBlacklistVote(
  db: Db,
  voterUserId: number,
  proposalId: number,
  value: BlacklistVoteValue,
  now: Date,
): 'approved' | 'rejected' | 'open' {
  return db.transaction((tx) => {
    const proposal = tx
      .select()
      .from(blacklistProposals)
      .where(eq(blacklistProposals.id, proposalId))
      .get();
    if (!proposal) {
      throw new BlacklistRuleError('proposal-not-found', 'Esa votación no existe.');
    }
    if (blacklistVotingStatus(proposal, now) !== 'open') {
      throw new BlacklistRuleError('voting-closed', 'La votación ya cerró.');
    }

    const voter = tx
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, voterUserId))
      .get();
    if (!voter?.displayName) {
      throw new BlacklistRuleError('not-member', 'Completá tu perfil antes de votar.');
    }

    if (proposal.kind === 'remove') {
      const entry = proposal.entryId
        ? tx
            .select()
            .from(blacklistProposals)
            .where(eq(blacklistProposals.id, proposal.entryId))
            .get()
        : undefined;
      if (!entry || !isBlacklistEntryActive(entry)) {
        throw new BlacklistRuleError('entry-not-active', 'Esa entrada ya no está vigente.');
      }
    }

    tx.insert(blacklistVotes)
      .values({ proposalId, voterUserId, value, votedAt: now })
      .onConflictDoUpdate({
        target: [blacklistVotes.proposalId, blacklistVotes.voterUserId],
        set: { value, votedAt: now },
      })
      .run();

    const tally = tx
      .select({
        yes: sql<number>`coalesce(sum(case when ${blacklistVotes.value} = 'yes' then 1 else 0 end), 0)`,
        no: sql<number>`coalesce(sum(case when ${blacklistVotes.value} = 'no' then 1 else 0 end), 0)`,
      })
      .from(blacklistVotes)
      .where(eq(blacklistVotes.proposalId, proposalId))
      .get();
    const outcome = blacklistVoteOutcome({
      yes: tally?.yes ?? 0,
      no: tally?.no ?? 0,
      eligibleVoters: countEligibleVoters(tx),
    });

    if (outcome === 'approved') {
      tx.update(blacklistProposals)
        .set({ approvedAt: now })
        .where(eq(blacklistProposals.id, proposalId))
        .run();
      if (proposal.kind === 'remove' && proposal.entryId !== null) {
        tx.update(blacklistProposals)
          .set({ removedAt: now })
          .where(eq(blacklistProposals.id, proposal.entryId))
          .run();
      }
    } else if (outcome === 'rejected') {
      tx.update(blacklistProposals)
        .set({ rejectedAt: now })
        .where(eq(blacklistProposals.id, proposalId))
        .run();
    }
    return outcome;
  });
}

export function cancelBlacklistProposal(
  db: Db,
  userId: number,
  proposalId: number,
  now: Date,
): void {
  db.transaction((tx) => {
    const proposal = tx
      .select()
      .from(blacklistProposals)
      .where(eq(blacklistProposals.id, proposalId))
      .get();
    if (!proposal) {
      throw new BlacklistRuleError('proposal-not-found', 'Esa votación no existe.');
    }
    if (proposal.proposerUserId !== userId) {
      throw new BlacklistRuleError('not-proposer', 'Solo quien la propuso puede cancelarla.');
    }
    if (blacklistVotingStatus(proposal, now) !== 'open') {
      throw new BlacklistRuleError('voting-closed', 'La votación ya cerró.');
    }
    tx.update(blacklistProposals)
      .set({ cancelledAt: now })
      .where(eq(blacklistProposals.id, proposalId))
      .run();
  });
}

export type BlacklistMatchSummary = {
  provider: string;
  matchId: string;
  memberId: number | null;
  playedAt: Date;
  queue: string;
  durationSeconds: number;
  target: {
    championName: string;
    kills: number;
    deaths: number;
    assists: number;
  } | null;
};

function matchSummary(db: Queryable, proposal: BlacklistProposal): BlacklistMatchSummary | null {
  const snapshot = proposal.matchSnapshot;
  if (!proposal.matchProvider || !proposal.matchId || !snapshot) return null;
  const member = db
    .select({ id: users.id })
    .from(schema.playerMatches)
    .innerJoin(users, eq(users.id, schema.playerMatches.userId))
    .where(
      and(
        eq(schema.playerMatches.provider, proposal.matchProvider),
        eq(schema.playerMatches.matchId, proposal.matchId),
        isNotNull(users.displayName),
      ),
    )
    .get();
  const riotId = proposal.riotGameName && proposal.riotTagLine
    ? { gameName: proposal.riotGameName, tagLine: proposal.riotTagLine }
    : null;
  const target = riotId
    ? snapshot.teams
        .flatMap((team) => team.participants)
        .find((participant) => riotIdKey(participant) === riotIdKey(riotId))
    : undefined;
  return {
    provider: proposal.matchProvider,
    matchId: proposal.matchId,
    memberId: member?.id ?? null,
    playedAt: new Date(snapshot.playedAt),
    queue: snapshot.queue,
    durationSeconds: snapshot.durationSeconds,
    target: target
      ? {
          championName: target.championName,
          kills: target.kills,
          deaths: target.deaths,
          assists: target.assists,
        }
      : null,
  };
}

export type BlacklistEntryCard = {
  id: number;
  status: 'active' | 'removed';
  playerName: string;
  riotId: RiotId | null;
  proposer: { id: number; name: string };
  addedAt: Date;
  removedAt: Date | null;
  reason: string | null;
  match: BlacklistMatchSummary | null;
  removeProposalOpen: boolean;
};

export function listBlacklist(
  db: Db,
  now: Date,
): { active: BlacklistEntryCard[]; history: BlacklistEntryCard[] } {
  const proposer = alias(users, 'blacklist_entry_proposer');
  const rows = db
    .select({ entry: blacklistProposals, proposerName: proposer.displayName })
    .from(blacklistProposals)
    .innerJoin(proposer, eq(proposer.id, blacklistProposals.proposerUserId))
    .where(and(eq(blacklistProposals.kind, 'add'), isNotNull(blacklistProposals.approvedAt)))
    .all();
  const entryIds = rows.map(({ entry }) => entry.id);
  const removals = entryIds.length
    ? db
        .select()
        .from(blacklistProposals)
        .where(
          and(
            eq(blacklistProposals.kind, 'remove'),
            inArray(blacklistProposals.entryId, entryIds),
          ),
        )
        .all()
    : [];

  const cards = rows.flatMap<BlacklistEntryCard>(({ entry, proposerName }) => {
    if (!entry.approvedAt) return [];
    return [
      {
        id: entry.id,
        status: entry.removedAt ? 'removed' : 'active',
        playerName: entry.playerName,
        riotId:
          entry.riotGameName && entry.riotTagLine
            ? { gameName: entry.riotGameName, tagLine: entry.riotTagLine }
            : null,
        proposer: { id: entry.proposerUserId, name: proposerName ?? 'Sin nombre' },
        addedAt: entry.approvedAt,
        removedAt: entry.removedAt,
        reason: entry.reason,
        match: matchSummary(db, entry),
        removeProposalOpen: removals.some(
          (proposal) =>
            proposal.entryId === entry.id && blacklistVotingStatus(proposal, now) === 'open',
        ),
      },
    ];
  });

  return {
    active: cards
      .filter((card) => card.status === 'active')
      .sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime()),
    history: cards
      .filter((card) => card.status === 'removed')
      .sort(
        (a, b) =>
          (b.removedAt?.getTime() ?? 0) - (a.removedAt?.getTime() ?? 0),
      ),
  };
}

export type BlacklistProposalCard = {
  id: number;
  createdAt: Date;
  kind: 'add' | 'remove';
  entryId: number | null;
  status: BlacklistVotingStatus;
  playerName: string;
  riotId: RiotId | null;
  proposer: { id: number; name: string };
  reason: string | null;
  match: BlacklistMatchSummary | null;
  closesAt: Date;
  yes: number;
  no: number;
  required: number;
  myVote: BlacklistVoteValue | null;
  canVote: boolean;
  canCancel: boolean;
};

export type BlacklistVotingBoard = {
  pending: BlacklistProposalCard[];
  open: BlacklistProposalCard[];
  recent: BlacklistProposalCard[];
};

export function listBlacklistVotingBoard(
  db: Db,
  viewerUserId: number,
  now: Date,
): BlacklistVotingBoard {
  const proposer = alias(users, 'blacklist_vote_proposer');
  const entry = alias(blacklistProposals, 'blacklist_vote_entry');
  const rows = db
    .select({
      proposal: blacklistProposals,
      proposerName: proposer.displayName,
      entryMatchProvider: entry.matchProvider,
      entryMatchId: entry.matchId,
      entryMatchSnapshot: entry.matchSnapshot,
    })
    .from(blacklistProposals)
    .innerJoin(proposer, eq(proposer.id, blacklistProposals.proposerUserId))
    .leftJoin(entry, eq(entry.id, blacklistProposals.entryId))
    .where(gte(blacklistProposals.createdAt, new Date(now.getTime() - RECENT_DAYS_MS)))
    .orderBy(desc(blacklistProposals.createdAt))
    .all();
  const ids = rows.map(({ proposal }) => proposal.id);
  const votes = ids.length
    ? db.select().from(blacklistVotes).where(inArray(blacklistVotes.proposalId, ids)).all()
    : [];
  const viewerIsMember = Boolean(
    db.select({ displayName: users.displayName }).from(users).where(eq(users.id, viewerUserId)).get()
      ?.displayName,
  );

  const cards = rows.map<BlacklistProposalCard>((row) => {
    const { proposal } = row;
    const proposalVotes = votes.filter((vote) => vote.proposalId === proposal.id);
    const source =
      proposal.matchSnapshot || !row.entryMatchSnapshot
        ? proposal
        : {
            ...proposal,
            matchProvider: row.entryMatchProvider,
            matchId: row.entryMatchId,
            matchSnapshot: row.entryMatchSnapshot,
          };
    const status = blacklistVotingStatus(proposal, now);
    return {
      id: proposal.id,
      createdAt: proposal.createdAt,
      kind: proposal.kind,
      entryId: proposal.entryId,
      status,
      playerName: proposal.playerName,
      riotId:
        proposal.riotGameName && proposal.riotTagLine
          ? { gameName: proposal.riotGameName, tagLine: proposal.riotTagLine }
          : null,
      proposer: { id: proposal.proposerUserId, name: row.proposerName ?? 'Sin nombre' },
      reason: proposal.reason,
      match: matchSummary(db, source),
      closesAt: proposal.closesAt,
      yes: proposalVotes.filter((vote) => vote.value === 'yes').length,
      no: proposalVotes.filter((vote) => vote.value === 'no').length,
      required: BLACKLIST_APPROVALS_REQUIRED,
      myVote:
        proposalVotes.find((vote) => vote.voterUserId === viewerUserId)?.value ?? null,
      canVote: status === 'open' && viewerIsMember,
      canCancel: status === 'open' && proposal.proposerUserId === viewerUserId,
    };
  });
  const isPending = (card: BlacklistProposalCard) => card.canVote && !card.myVote;

  return {
    pending: cards
      .filter(isPending)
      .sort((a, b) => a.closesAt.getTime() - b.closesAt.getTime()),
    open: cards.filter((card) => card.status === 'open' && !isPending(card)),
    recent: cards.filter((card) => card.status !== 'open').slice(0, 10),
  };
}

export function countPendingBlacklistVotes(db: Db, viewerUserId: number, now: Date): number {
  return listBlacklistVotingBoard(db, viewerUserId, now).pending.length;
}

export type ActiveBlacklistPlayer = {
  entryId: number;
  playerName: string;
  reason: string | null;
};

/** Resultado indexado por `gameName#tagLine` en minúsculas, listo para un badge de partida. */
export function findActiveBlacklistByRiotIds(
  db: Db,
  riotIds: readonly RiotId[],
): Map<string, ActiveBlacklistPlayer> {
  const keys = [...new Set(riotIds.map((riotId) => `riot:${riotIdKey(riotId)}`))];
  if (keys.length === 0) return new Map();

  const result = new Map<string, ActiveBlacklistPlayer>();
  for (const row of db
    .select()
    .from(blacklistProposals)
    .where(
      and(
        eq(blacklistProposals.kind, 'add'),
        isNotNull(blacklistProposals.approvedAt),
        inArray(blacklistProposals.dedupeKey, keys),
      ),
    )
    .all()) {
    if (row.removedAt || !row.riotGameName || !row.riotTagLine) continue;
    result.set(riotIdKey({ gameName: row.riotGameName, tagLine: row.riotTagLine }), {
      entryId: row.id,
      playerName: row.playerName,
      reason: row.reason,
    });
  }
  return result;
}
