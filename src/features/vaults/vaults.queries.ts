/**
 * Capa de datos de vaults y votaciones. Quien actúa (propone, vota, cancela) llega siempre
 * como parámetro desde la Server Action, que lo saca de la sesión: nunca del cliente.
 * Toda escritura que decide un resultado corre en una transacción.
 */
import type Database from 'better-sqlite3';
import { and, count, desc, eq, gte, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import { alias, type BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import { VAULT_APPROVALS_REQUIRED } from '@/config';
import type { Db } from '@/db/client';
import * as schema from '@/db/schema';
import { champions, users, vaultProposals, vaultVotes, type VaultProposal } from '@/db/schema';
import { championImageUrl } from '@/features/champions/ddragon-sync';
import { avatarUrl } from '@/features/profile/avatar-url';

import type { ProposalInput } from './proposal-form';
import { addDays } from './vault-dates';
import {
  closesAtFor,
  isVaultInForce,
  vaultStartsAt,
  vaultStatus,
  voteOutcome,
  votingStatus,
  type VaultStatus,
  type VaultTimeline,
  type VotingStatus,
} from './vault-rules';

type Queryable = BaseSQLiteDatabase<'sync', Database.RunResult, typeof schema>;

const RECENT_DAYS = 14;

/** Una regla del vault impide la operación: el mensaje se muestra tal cual en la UI. */
export class VaultRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VaultRuleError';
  }
}

export type Member = { id: number; displayName: string; avatarUrl: string | null };

export type VoteValue = 'yes' | 'no';

function asVault(row: VaultProposal): VaultProposal & VaultTimeline {
  if (row.kind !== 'vault' || !row.startsAt || !row.endsAt) {
    throw new Error(`La propuesta ${row.id} no es un vault`);
  }
  return { ...row, startsAt: row.startsAt, endsAt: row.endsAt };
}

/** Miembros = usuarios con el onboarding completo. Lista del grupo, no dato privado. */
export function listMembers(db: Queryable): Member[] {
  return db
    .select({ id: users.id, displayName: users.displayName, avatarUpdatedAt: users.avatarUpdatedAt })
    .from(users)
    .where(isNotNull(users.displayName))
    .all()
    .map(({ id, displayName, avatarUpdatedAt }) => ({
      id,
      displayName: displayName ?? '',
      avatarUrl: avatarUrl({ id, avatarUpdatedAt }),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'));
}

/** Pueden votar todos los miembros menos el jugador vaulteado. */
function countEligibleVoters(db: Queryable, targetUserId: number): number {
  return (
    db
      .select({ n: count() })
      .from(users)
      .where(and(isNotNull(users.displayName), ne(users.id, targetUserId)))
      .get()?.n ?? 0
  );
}

function insertProposerVote(tx: Queryable, proposalId: number, proposerUserId: number, now: Date) {
  tx.insert(vaultVotes)
    .values({ proposalId, voterUserId: proposerUserId, value: 'yes', votedAt: now })
    .run();
}

export function createVaultProposal(
  db: Db,
  proposerUserId: number,
  input: ProposalInput,
  now: Date,
): number {
  return db.transaction((tx) => {
    const sameVaults = tx
      .select()
      .from(vaultProposals)
      .where(
        and(
          eq(vaultProposals.kind, 'vault'),
          eq(vaultProposals.targetUserId, input.targetUserId),
          eq(vaultProposals.championId, input.championId),
        ),
      )
      .all();

    for (const row of sameVaults) {
      const status = vaultStatus(asVault(row), now);
      if (status === 'open') {
        throw new VaultRuleError('Ya hay una votación abierta para ese jugador y campeón.');
      }
      if (isVaultInForce(status)) {
        throw new VaultRuleError('Ese campeón ya está vaulteado para ese jugador.');
      }
    }

    const { id } = tx
      .insert(vaultProposals)
      .values({
        kind: 'vault',
        targetUserId: input.targetUserId,
        proposerUserId,
        championId: input.championId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        reason: input.reason,
        createdAt: now,
        closesAt: closesAtFor(now, input.endsAt),
      })
      .returning({ id: vaultProposals.id })
      .get();

    // Proponer cuenta como voto a favor, salvo que uno se esté autovaulteando.
    if (proposerUserId !== input.targetUserId) insertProposerVote(tx, id, proposerUserId, now);

    return id;
  });
}

export function createLiftProposal(
  db: Db,
  proposerUserId: number,
  vaultId: number,
  reason: string | null,
  now: Date,
): number {
  return db.transaction((tx) => {
    const row = tx
      .select()
      .from(vaultProposals)
      .where(and(eq(vaultProposals.id, vaultId), eq(vaultProposals.kind, 'vault')))
      .get();
    if (!row) throw new VaultRuleError('Ese vault no existe.');

    const vault = asVault(row);
    if (!isVaultInForce(vaultStatus(vault, now))) {
      throw new VaultRuleError('Ese vault ya no está vigente.');
    }

    const lifts = tx
      .select()
      .from(vaultProposals)
      .where(and(eq(vaultProposals.kind, 'lift'), eq(vaultProposals.vaultId, vaultId)))
      .all();
    if (lifts.some((lift) => votingStatus(lift, now) === 'open')) {
      throw new VaultRuleError('Ya hay una votación abierta para levantar este vault.');
    }

    const { id } = tx
      .insert(vaultProposals)
      .values({
        kind: 'lift',
        vaultId,
        targetUserId: vault.targetUserId,
        proposerUserId,
        championId: vault.championId,
        reason,
        createdAt: now,
        closesAt: closesAtFor(now, vault.endsAt),
      })
      .returning({ id: vaultProposals.id })
      .get();

    if (proposerUserId !== vault.targetUserId) insertProposerVote(tx, id, proposerUserId, now);

    return id;
  });
}

export function castVote(
  db: Db,
  voterUserId: number,
  proposalId: number,
  value: VoteValue,
  now: Date,
): 'approved' | 'rejected' | 'open' {
  return db.transaction((tx) => {
    const proposal = tx.select().from(vaultProposals).where(eq(vaultProposals.id, proposalId)).get();
    if (!proposal) throw new VaultRuleError('Esa votación no existe.');
    if (votingStatus(proposal, now) !== 'open') throw new VaultRuleError('La votación ya cerró.');
    if (proposal.targetUserId === voterUserId) {
      throw new VaultRuleError('No podés votar un vault que es para vos.');
    }

    const voter = tx
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, voterUserId))
      .get();
    if (!voter?.displayName) throw new VaultRuleError('Completá tu perfil antes de votar.');

    if (proposal.kind === 'lift') {
      const vaultRow =
        proposal.vaultId === null
          ? undefined
          : tx.select().from(vaultProposals).where(eq(vaultProposals.id, proposal.vaultId)).get();
      if (!vaultRow || !isVaultInForce(vaultStatus(asVault(vaultRow), now))) {
        throw new VaultRuleError('Ese vault ya no está vigente.');
      }
    }

    tx.insert(vaultVotes)
      .values({ proposalId, voterUserId, value, votedAt: now })
      .onConflictDoUpdate({
        target: [vaultVotes.proposalId, vaultVotes.voterUserId],
        set: { value, votedAt: now },
      })
      .run();

    const tally = tx
      .select({
        yes: sql<number>`coalesce(sum(case when ${vaultVotes.value} = 'yes' then 1 else 0 end), 0)`,
        no: sql<number>`coalesce(sum(case when ${vaultVotes.value} = 'no' then 1 else 0 end), 0)`,
      })
      .from(vaultVotes)
      .where(
        and(eq(vaultVotes.proposalId, proposalId), ne(vaultVotes.voterUserId, proposal.targetUserId)),
      )
      .get();

    const outcome = voteOutcome({
      yes: tally?.yes ?? 0,
      no: tally?.no ?? 0,
      eligibleVoters: countEligibleVoters(tx, proposal.targetUserId),
    });

    if (outcome === 'approved') {
      tx.update(vaultProposals).set({ approvedAt: now }).where(eq(vaultProposals.id, proposalId)).run();
      if (proposal.kind === 'lift' && proposal.vaultId !== null) {
        tx.update(vaultProposals)
          .set({ liftedAt: now })
          .where(eq(vaultProposals.id, proposal.vaultId))
          .run();
      }
    } else if (outcome === 'rejected') {
      tx.update(vaultProposals).set({ rejectedAt: now }).where(eq(vaultProposals.id, proposalId)).run();
    }

    return outcome;
  });
}

export function cancelProposal(db: Db, userId: number, proposalId: number, now: Date): void {
  db.transaction((tx) => {
    const proposal = tx.select().from(vaultProposals).where(eq(vaultProposals.id, proposalId)).get();
    if (!proposal) throw new VaultRuleError('Esa votación no existe.');
    if (proposal.proposerUserId !== userId) {
      throw new VaultRuleError('Solo quien la propuso puede cancelarla.');
    }
    if (votingStatus(proposal, now) !== 'open') throw new VaultRuleError('La votación ya cerró.');

    tx.update(vaultProposals).set({ cancelledAt: now }).where(eq(vaultProposals.id, proposalId)).run();
  });
}

export type ProposalCard = {
  id: number;
  kind: 'vault' | 'lift';
  status: VotingStatus;
  target: { id: number; name: string };
  proposer: { id: number; name: string };
  champion: { id: string; name: string; imageUrl: string };
  /** En 'lift', las fechas del vault que se quiere levantar. */
  startsAt: Date | null;
  endsAt: Date | null;
  reason: string | null;
  closesAt: Date;
  yes: number;
  no: number;
  required: number;
  myVote: VoteValue | null;
  canVote: boolean;
  canCancel: boolean;
};

export type VotingBoard = {
  /** Abiertas donde el viewer puede votar y todavía no votó: van primero. */
  pending: ProposalCard[];
  open: ProposalCard[];
  recent: ProposalCard[];
};

export function listVotingBoard(db: Db, viewerUserId: number, now: Date): VotingBoard {
  const target = alias(users, 'target');
  const proposer = alias(users, 'proposer');
  const vault = alias(vaultProposals, 'vault');

  const rows = db
    .select({
      proposal: vaultProposals,
      targetName: target.displayName,
      proposerName: proposer.displayName,
      championName: champions.name,
      championImage: champions.imageFile,
      championVersion: champions.version,
      vaultStartsAt: vault.startsAt,
      vaultEndsAt: vault.endsAt,
    })
    .from(vaultProposals)
    .innerJoin(target, eq(target.id, vaultProposals.targetUserId))
    .innerJoin(proposer, eq(proposer.id, vaultProposals.proposerUserId))
    .innerJoin(champions, eq(champions.id, vaultProposals.championId))
    .leftJoin(vault, eq(vault.id, vaultProposals.vaultId))
    // Una votación abierta tiene como mucho 48 h, así que siempre entra en esta ventana.
    .where(gte(vaultProposals.createdAt, addDays(now, -RECENT_DAYS)))
    .orderBy(desc(vaultProposals.createdAt))
    .all();

  const ids = rows.map((row) => row.proposal.id);
  const votes = ids.length
    ? db.select().from(vaultVotes).where(inArray(vaultVotes.proposalId, ids)).all()
    : [];

  // Misma regla que castVote: sin perfil completo no se vota (ni aparece como pendiente).
  const viewerIsMember = Boolean(
    db.select({ displayName: users.displayName }).from(users).where(eq(users.id, viewerUserId)).get()
      ?.displayName,
  );

  const cards: ProposalCard[] = rows.map((row) => {
    const { proposal } = row;
    const status = votingStatus(proposal, now);
    const counted = votes.filter(
      (vote) => vote.proposalId === proposal.id && vote.voterUserId !== proposal.targetUserId,
    );
    const myVote =
      votes.find((vote) => vote.proposalId === proposal.id && vote.voterUserId === viewerUserId)
        ?.value ?? null;

    return {
      id: proposal.id,
      kind: proposal.kind,
      status,
      target: { id: proposal.targetUserId, name: row.targetName ?? 'Sin nombre' },
      proposer: { id: proposal.proposerUserId, name: row.proposerName ?? 'Sin nombre' },
      champion: {
        id: proposal.championId,
        name: row.championName,
        imageUrl: championImageUrl(row.championVersion, row.championImage),
      },
      startsAt: proposal.startsAt ?? row.vaultStartsAt,
      endsAt: proposal.endsAt ?? row.vaultEndsAt,
      reason: proposal.reason,
      closesAt: proposal.closesAt,
      yes: counted.filter((vote) => vote.value === 'yes').length,
      no: counted.filter((vote) => vote.value === 'no').length,
      required: VAULT_APPROVALS_REQUIRED,
      myVote,
      canVote: status === 'open' && viewerIsMember && proposal.targetUserId !== viewerUserId,
      canCancel: status === 'open' && proposal.proposerUserId === viewerUserId,
    };
  });

  const isPending = (card: ProposalCard) => card.canVote && !card.myVote;

  return {
    pending: cards
      .filter(isPending)
      .sort((a, b) => a.closesAt.getTime() - b.closesAt.getTime()),
    open: cards.filter((card) => card.status === 'open' && !isPending(card)),
    recent: cards.filter((card) => card.status !== 'open').slice(0, 10),
  };
}

export function countPendingVotes(db: Db, viewerUserId: number, now: Date): number {
  return listVotingBoard(db, viewerUserId, now).pending.length;
}

export type VaultCard = {
  id: number;
  status: VaultStatus;
  target: { id: number; name: string; avatarUrl: string | null };
  champion: { id: string; name: string; imageUrl: string };
  startsAt: Date;
  endsAt: Date;
  liftedAt: Date | null;
  reason: string | null;
  /** Hay una votación abierta para levantarlo. */
  liftVoteOpen: boolean;
};

export function listVaults(db: Db, now: Date): { inForce: VaultCard[]; past: VaultCard[] } {
  const target = alias(users, 'target');

  const rows = db
    .select({
      vault: vaultProposals,
      targetName: target.displayName,
      targetAvatarUpdatedAt: target.avatarUpdatedAt,
      championName: champions.name,
      championImage: champions.imageFile,
      championVersion: champions.version,
    })
    .from(vaultProposals)
    .innerJoin(target, eq(target.id, vaultProposals.targetUserId))
    .innerJoin(champions, eq(champions.id, vaultProposals.championId))
    .where(and(eq(vaultProposals.kind, 'vault'), isNotNull(vaultProposals.approvedAt)))
    .all();

  const ids = rows.map((row) => row.vault.id);
  const lifts = ids.length
    ? db
        .select()
        .from(vaultProposals)
        .where(and(eq(vaultProposals.kind, 'lift'), inArray(vaultProposals.vaultId, ids)))
        .all()
    : [];

  const cards: VaultCard[] = rows.map((row) => {
    const vault = asVault(row.vault);
    return {
      id: vault.id,
      status: vaultStatus(vault, now),
      target: {
        id: vault.targetUserId,
        name: row.targetName ?? 'Sin nombre',
        avatarUrl: avatarUrl({ id: vault.targetUserId, avatarUpdatedAt: row.targetAvatarUpdatedAt }),
      },
      champion: {
        id: vault.championId,
        name: row.championName,
        imageUrl: championImageUrl(row.championVersion, row.championImage),
      },
      startsAt: vaultStartsAt(vault),
      endsAt: vault.endsAt,
      liftedAt: vault.liftedAt,
      reason: vault.reason,
      liftVoteOpen: lifts.some(
        (lift) => lift.vaultId === vault.id && votingStatus(lift, now) === 'open',
      ),
    };
  });

  // Historial completo: con ~6 amigos son pocas filas y los filtros de la pestaña lo acotan.
  return {
    inForce: cards
      .filter((card) => isVaultInForce(card.status))
      .sort((a, b) => a.endsAt.getTime() - b.endsAt.getTime()),
    past: cards
      .filter((card) => !isVaultInForce(card.status))
      .sort((a, b) => (b.liftedAt ?? b.endsAt).getTime() - (a.liftedAt ?? a.endsAt).getTime()),
  };
}
