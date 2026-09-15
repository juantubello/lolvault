import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { VOTING_WINDOW_MS } from '@/config';
import { applyPragmas, createDb, type Db } from '@/db/client';
import { champions, users, vaultProposals, vaultVotes } from '@/db/schema';
import type { ProposalInput } from '@/features/vaults/proposal-form';
import {
  cancelProposal,
  castVote,
  countPendingVotes,
  createLiftProposal,
  createVaultProposal,
  listVaults,
  listVotingBoard,
  VaultRuleError,
} from '@/features/vaults/vaults.queries';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const NOW = new Date('2026-09-14T15:00:00.000Z');

type FixtureUsers = {
  target: number;
  proposer: number;
  voter1: number;
  voter2: number;
  voter3: number;
  incomplete: number;
};

let sqlite: Database.Database;
let db: Db;
let member: FixtureUsers;

function at(offsetMs: number): Date {
  return new Date(NOW.getTime() + offsetMs);
}

function insertUser(displayName: string | null): number {
  const suffix = displayName ?? 'sin-perfil';
  return db
    .insert(users)
    .values({
      externalIdentity: `test:${suffix.toLocaleLowerCase('es')}`,
      email: `${suffix.toLocaleLowerCase('es')}@example.com`,
      displayName,
      createdAt: at(-30 * DAY),
    })
    .returning({ id: users.id })
    .get().id;
}

function proposalInput(overrides: Partial<ProposalInput> = {}): ProposalInput {
  return {
    targetUserId: member.target,
    championId: 'Ahri',
    startsAt: at(-DAY),
    endsAt: at(7 * DAY),
    reason: 'Se lo ganó en la última partida.',
    ...overrides,
  };
}

function proposal(id: number) {
  return db.select().from(vaultProposals).where(eq(vaultProposals.id, id)).get();
}

function votesFor(proposalId: number) {
  return db.select().from(vaultVotes).where(eq(vaultVotes.proposalId, proposalId)).all();
}

function insertApprovedVault(
  championId = 'Ahri',
  overrides: Partial<typeof vaultProposals.$inferInsert> = {},
) {
  return db
    .insert(vaultProposals)
    .values({
      kind: 'vault',
      targetUserId: member.target,
      proposerUserId: member.proposer,
      championId,
      startsAt: at(-DAY),
      endsAt: at(7 * DAY),
      reason: 'Vault aprobado de fixture.',
      createdAt: at(-2 * HOUR),
      closesAt: at(46 * HOUR),
      approvedAt: at(-HOUR),
      ...overrides,
    })
    .returning()
    .get();
}

describe('consultas de vaults', () => {
  beforeEach(() => {
    sqlite = new Database(':memory:');
    applyPragmas(sqlite);
    db = createDb(sqlite);
    migrate(db, { migrationsFolder: 'src/db/migrations' });

    db.insert(champions)
      .values([
        { id: 'Ahri', key: 103, name: 'Ahri', title: 'la Vastaya', imageFile: 'Ahri.png', version: '16.18.1' },
        { id: 'Yasuo', key: 157, name: 'Yasuo', title: 'el Imperdonable', imageFile: 'Yasuo.png', version: '16.18.1' },
        { id: 'Lux', key: 99, name: 'Lux', title: 'la Dama Luminosa', imageFile: 'Lux.png', version: '16.18.1' },
        { id: 'Garen', key: 86, name: 'Garen', title: 'el Poder de Demacia', imageFile: 'Garen.png', version: '16.18.1' },
      ])
      .run();

    member = {
      target: insertUser('Alicia'),
      proposer: insertUser('Bruno'),
      voter1: insertUser('Carla'),
      voter2: insertUser('Diego'),
      voter3: insertUser('Eva'),
      incomplete: insertUser(null),
    };
  });

  afterEach(() => {
    sqlite.close();
  });

  describe('createVaultProposal', () => {
    it('crea la propuesta y suma automáticamente el voto a favor del proposer', () => {
      const id = createVaultProposal(db, member.proposer, proposalInput(), NOW);

      expect(proposal(id)).toMatchObject({
        kind: 'vault',
        targetUserId: member.target,
        proposerUserId: member.proposer,
        championId: 'Ahri',
        createdAt: NOW,
      });
      expect(votesFor(id)).toEqual([
        expect.objectContaining({
          proposalId: id,
          voterUserId: member.proposer,
          value: 'yes',
          votedAt: NOW,
        }),
      ]);
    });

    it('permite autovault sin insertar voto automático', () => {
      const id = createVaultProposal(
        db,
        member.target,
        proposalInput({ targetUserId: member.target }),
        NOW,
      );

      expect(proposal(id)?.proposerUserId).toBe(member.target);
      expect(votesFor(id)).toHaveLength(0);
    });

    it('bloquea un duplicado mientras la primera votación sigue abierta', () => {
      createVaultProposal(db, member.proposer, proposalInput(), NOW);

      expect(() =>
        createVaultProposal(db, member.voter1, proposalInput(), at(MINUTE)),
      ).toThrowError(VaultRuleError);
    });

    it('bloquea un duplicado si el vault está activo o programado', () => {
      insertApprovedVault('Ahri');
      insertApprovedVault('Yasuo', { startsAt: at(DAY), endsAt: at(8 * DAY) });

      expect(() =>
        createVaultProposal(db, member.voter1, proposalInput({ championId: 'Ahri' }), NOW),
      ).toThrow('Ese campeón ya está vaulteado para ese jugador.');
      expect(() =>
        createVaultProposal(db, member.voter1, proposalInput({ championId: 'Yasuo' }), NOW),
      ).toThrow('Ese campeón ya está vaulteado para ese jugador.');
    });

    it('cierra a las 48 horas o en endsAt si el vault termina antes', () => {
      const longId = createVaultProposal(db, member.proposer, proposalInput(), NOW);
      const shortId = createVaultProposal(
        db,
        member.proposer,
        proposalInput({ championId: 'Yasuo', endsAt: at(12 * HOUR) }),
        NOW,
      );

      expect(proposal(longId)?.closesAt).toEqual(at(VOTING_WINDOW_MS));
      expect(proposal(shortId)?.closesAt).toEqual(at(12 * HOUR));
    });
  });

  describe('castVote', () => {
    it('impide que el target vote y devuelve VaultRuleError', () => {
      const id = createVaultProposal(db, member.proposer, proposalInput(), NOW);

      expect(() => castVote(db, member.target, id, 'yes', at(MINUTE))).toThrowError(
        VaultRuleError,
      );
      expect(votesFor(id)).toHaveLength(1);
    });

    it('impide votar a un usuario sin displayName', () => {
      const id = createVaultProposal(db, member.proposer, proposalInput(), NOW);

      expect(() => castVote(db, member.incomplete, id, 'yes', at(MINUTE))).toThrow(
        'Completá tu perfil antes de votar.',
      );
    });

    it('aprueba al tercer voto a favor y guarda approvedAt', () => {
      const id = createVaultProposal(db, member.proposer, proposalInput(), NOW);

      expect(castVote(db, member.voter1, id, 'yes', at(MINUTE))).toBe('open');
      expect(castVote(db, member.voter2, id, 'yes', at(2 * MINUTE))).toBe('approved');
      expect(proposal(id)?.approvedAt).toEqual(at(2 * MINUTE));
    });

    it('rechaza cuando los votos pendientes ya no alcanzan para llegar a tres sí', () => {
      const id = createVaultProposal(db, member.proposer, proposalInput(), NOW);

      expect(castVote(db, member.voter1, id, 'no', at(MINUTE))).toBe('open');
      expect(castVote(db, member.voter2, id, 'no', at(2 * MINUTE))).toBe('rejected');
      expect(proposal(id)?.rejectedAt).toEqual(at(2 * MINUTE));
    });

    it('cambia el voto existente sin duplicarlo', () => {
      const id = createVaultProposal(db, member.proposer, proposalInput(), NOW);

      castVote(db, member.voter1, id, 'no', at(MINUTE));
      castVote(db, member.voter1, id, 'yes', at(2 * MINUTE));

      const voterVotes = votesFor(id).filter((vote) => vote.voterUserId === member.voter1);
      expect(voterVotes).toEqual([
        expect.objectContaining({ value: 'yes', votedAt: at(2 * MINUTE) }),
      ]);
    });

    it('no permite votar al llegar a closesAt', () => {
      const id = createVaultProposal(db, member.proposer, proposalInput(), NOW);
      const closesAt = proposal(id)?.closesAt;

      expect(closesAt).toBeDefined();
      expect(() => castVote(db, member.voter1, id, 'yes', closesAt!)).toThrow(
        'La votación ya cerró.',
      );
    });
  });

  describe('createLiftProposal y votos de lift', () => {
    it('solo permite pedir lift de un vault vigente', () => {
      const openId = createVaultProposal(db, member.proposer, proposalInput(), NOW);
      const served = insertApprovedVault('Yasuo', {
        startsAt: at(-8 * DAY),
        endsAt: at(-DAY),
      });

      expect(() => createLiftProposal(db, member.voter1, openId, null, NOW)).toThrow(
        'Ese vault ya no está vigente.',
      );
      expect(() => createLiftProposal(db, member.voter1, served.id, null, NOW)).toThrow(
        'Ese vault ya no está vigente.',
      );
    });

    it('el target puede pedir el lift sin voto automático', () => {
      const vault = insertApprovedVault();

      const liftId = createLiftProposal(db, member.target, vault.id, 'Prometo portarme bien.', NOW);

      expect(proposal(liftId)).toMatchObject({
        kind: 'lift',
        vaultId: vault.id,
        targetUserId: member.target,
        proposerUserId: member.target,
      });
      expect(votesFor(liftId)).toHaveLength(0);
    });

    it('al aprobar el lift marca liftedAt y mueve el vault de vigentes a pasados', () => {
      const vault = insertApprovedVault();
      expect(listVaults(db, NOW).inForce.map(({ id }) => id)).toContain(vault.id);

      const liftId = createLiftProposal(db, member.proposer, vault.id, null, NOW);
      castVote(db, member.voter1, liftId, 'yes', at(MINUTE));
      expect(castVote(db, member.voter2, liftId, 'yes', at(2 * MINUTE))).toBe('approved');

      expect(proposal(liftId)?.approvedAt).toEqual(at(2 * MINUTE));
      expect(proposal(vault.id)?.liftedAt).toEqual(at(2 * MINUTE));
      const listed = listVaults(db, at(3 * MINUTE));
      expect(listed.inForce.map(({ id }) => id)).not.toContain(vault.id);
      expect(listed.past).toEqual([
        expect.objectContaining({ id: vault.id, status: 'lifted', liftedAt: at(2 * MINUTE) }),
      ]);
    });

    it('no permite dos lifts abiertos para el mismo vault', () => {
      const vault = insertApprovedVault();
      createLiftProposal(db, member.proposer, vault.id, null, NOW);

      expect(() => createLiftProposal(db, member.voter1, vault.id, null, at(MINUTE))).toThrow(
        'Ya hay una votación abierta para levantar este vault.',
      );
    });
  });

  describe('cancelProposal', () => {
    it('solo deja cancelar al proposer mientras está abierta', () => {
      const id = createVaultProposal(db, member.proposer, proposalInput(), NOW);

      expect(() => cancelProposal(db, member.voter1, id, at(MINUTE))).toThrow(
        'Solo quien la propuso puede cancelarla.',
      );
      cancelProposal(db, member.proposer, id, at(2 * MINUTE));
      expect(proposal(id)?.cancelledAt).toEqual(at(2 * MINUTE));
    });

    it('no deja cancelar una propuesta que ya fue aprobada', () => {
      const id = createVaultProposal(db, member.proposer, proposalInput(), NOW);
      castVote(db, member.voter1, id, 'yes', at(MINUTE));
      castVote(db, member.voter2, id, 'yes', at(2 * MINUTE));

      expect(() => cancelProposal(db, member.proposer, id, at(3 * MINUTE))).toThrow(
        'La votación ya cerró.',
      );
    });
  });

  describe('listVotingBoard y countPendingVotes', () => {
    it('separa pendientes, abiertas ya votadas o propias y recientes resueltas', () => {
      const pendingId = createVaultProposal(db, member.proposer, proposalInput(), NOW);
      db.insert(vaultVotes)
        .values({
          proposalId: pendingId,
          voterUserId: member.target,
          value: 'no',
          votedAt: at(MINUTE),
        })
        .run();

      const votedId = createVaultProposal(
        db,
        member.proposer,
        proposalInput({ championId: 'Yasuo' }),
        at(MINUTE),
      );
      castVote(db, member.voter1, votedId, 'no', at(2 * MINUTE));

      const ownId = createVaultProposal(
        db,
        member.proposer,
        proposalInput({ targetUserId: member.voter1, championId: 'Lux' }),
        at(2 * MINUTE),
      );

      const resolvedId = createVaultProposal(
        db,
        member.proposer,
        proposalInput({ championId: 'Garen' }),
        at(3 * MINUTE),
      );
      cancelProposal(db, member.proposer, resolvedId, at(4 * MINUTE));

      const board = listVotingBoard(db, member.voter1, at(5 * MINUTE));

      expect(board.pending.map(({ id }) => id)).toEqual([pendingId]);
      expect(board.open.map(({ id }) => id)).toEqual(expect.arrayContaining([votedId, ownId]));
      expect(board.recent.map(({ id }) => id)).toContain(resolvedId);
      expect(board.pending[0]).toMatchObject({ yes: 1, no: 0, myVote: null, canVote: true });
      expect(board.open.find(({ id }) => id === votedId)).toMatchObject({ myVote: 'no' });
      expect(board.open.find(({ id }) => id === ownId)).toMatchObject({ canVote: false });
      expect(countPendingVotes(db, member.voter1, at(5 * MINUTE))).toBe(board.pending.length);
    });

    it('no marca pendientes para un viewer sin displayName, que no puede votar', () => {
      const id = createVaultProposal(db, member.proposer, proposalInput(), NOW);

      const board = listVotingBoard(db, member.incomplete, at(MINUTE));

      expect(board.pending).toHaveLength(0);
      expect(board.open.map((card) => card.id)).toContain(id);
    });

    it('countPendingVotes coincide con pending.length', () => {
      createVaultProposal(db, member.proposer, proposalInput(), NOW);
      createVaultProposal(
        db,
        member.proposer,
        proposalInput({ championId: 'Yasuo' }),
        at(MINUTE),
      );

      const board = listVotingBoard(db, member.voter2, at(2 * MINUTE));
      expect(countPendingVotes(db, member.voter2, at(2 * MINUTE))).toBe(board.pending.length);
      expect(board.pending).toHaveLength(2);
    });
  });
});
