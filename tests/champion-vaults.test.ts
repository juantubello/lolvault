import Database from 'better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeEach, describe, expect, it } from 'vitest';

import { applyPragmas, createDb, type Db } from '@/db/client';
import { champions, users } from '@/db/schema';
import { addDays, startOfLocalDay } from '@/features/vaults/vault-dates';
import { vaultStatusLabel, vaultTone } from '@/features/vaults/vault-labels';
import { castVote, createVaultProposal, listInForceVaultsByChampionKey } from '@/features/vaults/vaults.queries';

// 15/09/2026 12:00 en Argentina.
const NOW = new Date('2026-09-15T15:00:00Z');
const TODAY = startOfLocalDay('2026-09-15')!;
const MINUTE = 60_000;

let db: Db;
let ids: number[];

function approvedVault(proposer: number, target: number, championId: string, days: number, voters: number[]) {
  const id = createVaultProposal(
    db,
    proposer,
    { targetUserId: target, championId, startsAt: TODAY, endsAt: addDays(TODAY, days), reason: 'prueba' },
    new Date(NOW.getTime() - 10 * MINUTE),
  );
  voters.forEach((voter, i) => castVote(db, voter, id, 'yes', new Date(NOW.getTime() - (5 - i) * MINUTE)));
  return id;
}

beforeEach(() => {
  const sqlite = new Database(':memory:');
  applyPragmas(sqlite);
  db = createDb(sqlite);
  migrate(db, { migrationsFolder: 'src/db/migrations' });

  db.insert(champions)
    .values([
      { id: 'Malphite', key: 54, name: 'Malphite', title: 'x', imageFile: 'Malphite.png', version: '16.18.1' },
      { id: 'Jinx', key: 222, name: 'Jinx', title: 'x', imageFile: 'Jinx.png', version: '16.18.1' },
    ])
    .run();

  ids = ['Juan', 'Cami', 'Tincho', 'Nico'].map(
    (name) =>
      db
        .insert(users)
        .values({ externalIdentity: `test:${name}`, email: `${name}@example.com`, displayName: name, createdAt: NOW })
        .returning()
        .get().id,
  );
});

describe('listInForceVaultsByChampionKey', () => {
  it('indexa por key numérico solo los vaults vigentes de ese jugador', () => {
    const [juan, cami, tincho, nico] = ids as [number, number, number, number];
    const malphite = approvedVault(cami, juan, 'Malphite', 3, [tincho, nico]);
    approvedVault(juan, cami, 'Jinx', 3, [tincho, nico]); // vigente, pero de otro jugador
    createVaultProposal(
      db,
      tincho,
      { targetUserId: juan, championId: 'Jinx', startsAt: TODAY, endsAt: addDays(TODAY, 2), reason: 'abierta' },
      NOW,
    ); // en votación: todavía no cuenta

    const byKey = listInForceVaultsByChampionKey(db, juan, NOW);

    expect([...byKey.keys()]).toEqual([54]);
    expect(byKey.get(54)).toMatchObject({ vaultId: malphite, status: 'active' });
  });
});

describe('vaultStatusLabel y vaultTone', () => {
  const base = { startsAt: TODAY, liftedAt: null };

  it('avisa cuando termina hoy o mañana, en naranja', () => {
    const today = { ...base, status: 'active' as const, endsAt: addDays(TODAY, 1) };
    expect(vaultStatusLabel(today, NOW)).toBe('Vaulteado · termina hoy');
    expect(vaultTone(today, NOW)).toBe('warning');
    expect(vaultStatusLabel({ ...today, endsAt: addDays(TODAY, 2) }, NOW)).toBe('Vaulteado · termina mañana');
  });

  it('muestra hasta cuándo si falta más y usa el tono de vault', () => {
    const later = { ...base, status: 'active' as const, endsAt: addDays(TODAY, 6) };
    expect(vaultStatusLabel(later, NOW)).toMatch(/^Vaulteado · hasta 20 sept?$/);
    expect(vaultTone(later, NOW)).toBe('vault');
  });

  it('terminados usan tono neutro', () => {
    const served = { ...base, status: 'served' as const, endsAt: addDays(TODAY, -1) };
    expect(vaultStatusLabel(served, NOW)).toMatch(/^Cumplido/);
    expect(vaultTone(served, NOW)).toBe('neutral');
  });
});
