import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { applyPragmas, createDb, type Db } from '@/db/client';
import { blacklistProposals, blacklistVotes, users } from '@/db/schema';
import {
  BlacklistRuleError,
  cancelBlacklistProposal,
  castBlacklistVote,
  countPendingBlacklistVotes,
  createAddProposal,
  createRemoveProposal,
  findActiveBlacklistByRiotIds,
  listBlacklist,
  listBlacklistVotingBoard,
  type CreateBlacklistInput,
} from '@/features/blacklist/blacklist.queries';

const NOW = new Date('2026-09-15T12:00:00Z');
const MINUTE = 60_000;
const at = (offset: number) => new Date(NOW.getTime() + offset);

let sqlite: Database.Database;
let db: Db;
let members: number[];

function addMember(name: string): number {
  return db
    .insert(users)
    .values({
      externalIdentity: `test:${name.toLowerCase()}`,
      email: `${name.toLowerCase()}@example.com`,
      displayName: name,
      createdAt: NOW,
    })
    .returning({ id: users.id })
    .get().id;
}

function input(overrides: Partial<CreateBlacklistInput> = {}): CreateBlacklistInput {
  return {
    playerName: 'Jugador externo',
    riotGameName: 'RivalAnonimo',
    riotTagLine: 'LAS',
    reason: 'Abandonó una partida compartida.',
    ...overrides,
  };
}

beforeEach(() => {
  sqlite = new Database(':memory:');
  applyPragmas(sqlite);
  db = createDb(sqlite);
  migrate(db, { migrationsFolder: 'src/db/migrations' });
  members = [addMember('Miembro A'), addMember('Miembro B'), addMember('Miembro C')];
});

afterEach(() => sqlite.close());

describe('consultas de black list', () => {
  it('crea con voto automático y aprueba al segundo sí', () => {
    const id = createAddProposal(db, members[0]!, input(), NOW);
    expect(db.select().from(blacklistVotes).where(eq(blacklistVotes.proposalId, id)).all()).toEqual([
      expect.objectContaining({ voterUserId: members[0], value: 'yes', votedAt: NOW }),
    ]);

    expect(castBlacklistVote(db, members[1]!, id, 'yes', at(MINUTE))).toBe('approved');
    expect(
      db.select().from(blacklistProposals).where(eq(blacklistProposals.id, id)).get()?.approvedAt,
    ).toEqual(at(MINUTE));
    expect(listBlacklist(db, at(2 * MINUTE)).active.map((entry) => entry.id)).toEqual([id]);
  });

  it('rechaza matemáticamente según la cantidad dinámica de miembros', () => {
    const id = createAddProposal(db, members[0]!, input(), NOW);
    expect(castBlacklistVote(db, members[1]!, id, 'no', at(MINUTE))).toBe('open');
    expect(castBlacklistVote(db, members[2]!, id, 'no', at(2 * MINUTE))).toBe('rejected');
  });

  it('deduplica por Riot ID sin distinguir mayúsculas', () => {
    createAddProposal(db, members[0]!, input(), NOW);
    expect(() =>
      createAddProposal(
        db,
        members[1]!,
        input({ playerName: 'Otro alias', riotGameName: 'rivalanonimo', riotTagLine: 'las' }),
        at(MINUTE),
      ),
    ).toThrowError(BlacklistRuleError);
  });

  it('deduplica por nombre sin tildes ni espacios cuando no hay Riot ID', () => {
    createAddProposal(
      db,
      members[0]!,
      input({ playerName: '  Álvaro   Núñez ', riotGameName: null, riotTagLine: null }),
      NOW,
    );
    expect(() =>
      createAddProposal(
        db,
        members[1]!,
        input({ playerName: 'alvaro nunez', riotGameName: null, riotTagLine: null }),
        at(MINUTE),
      ),
    ).toThrowError(BlacklistRuleError);
  });

  it('un remove aprobado setea removed_at en la entrada', () => {
    const entryId = createAddProposal(db, members[0]!, input(), NOW);
    castBlacklistVote(db, members[1]!, entryId, 'yes', at(MINUTE));
    const removeId = createRemoveProposal(
      db,
      members[1]!,
      entryId,
      'Se resolvió el conflicto.',
      at(2 * MINUTE),
    );

    expect(castBlacklistVote(db, members[2]!, removeId, 'yes', at(3 * MINUTE))).toBe('approved');
    const entry = db
      .select()
      .from(blacklistProposals)
      .where(eq(blacklistProposals.id, entryId))
      .get();
    expect(entry?.removedAt).toEqual(at(3 * MINUTE));
    expect(listBlacklist(db, at(4 * MINUTE)).history.map((card) => card.id)).toContain(entryId);
  });

  it('cancela solo por el proposer y refleja pendientes del viewer', () => {
    const id = createAddProposal(db, members[0]!, input(), NOW);
    const board = listBlacklistVotingBoard(db, members[1]!, at(MINUTE));
    expect(board.pending[0]).toMatchObject({ id, yes: 1, required: 2, canVote: true });
    expect(countPendingBlacklistVotes(db, members[1]!, at(MINUTE))).toBe(1);
    expect(() => cancelBlacklistProposal(db, members[1]!, id, at(2 * MINUTE))).toThrow(
      'Solo quien la propuso puede cancelarla.',
    );
    cancelBlacklistProposal(db, members[0]!, id, at(2 * MINUTE));
    expect(listBlacklistVotingBoard(db, members[1]!, at(3 * MINUTE)).recent[0]?.status).toBe(
      'cancelled',
    );
  });

  it('encuentra entradas activas por Riot ID para marcar participantes', () => {
    const id = createAddProposal(db, members[0]!, input(), NOW);
    castBlacklistVote(db, members[1]!, id, 'yes', at(MINUTE));
    const found = findActiveBlacklistByRiotIds(db, [
      { gameName: 'RIVALANONIMO', tagLine: 'las' },
      { gameName: 'Otro', tagLine: 'LAS' },
    ]);
    expect(found.get('rivalanonimo#las')).toMatchObject({ entryId: id });
    expect(found.has('otro#las')).toBe(false);
  });
});
