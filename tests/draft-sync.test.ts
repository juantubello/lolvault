import Database from 'better-sqlite3';
import { count, eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyPragmas, createDb, type Db } from '@/db/client';
import {
  champions,
  draftChampionStats,
  draftMatchups,
  draftSynergies,
  draftSyncRuns,
} from '@/db/schema';
import { syncDraftData, syncDraftDataIfStale } from '@/features/draft/sync';
import type { DraftDataSource, DraftSynergy } from '@/features/draft/types';

let sqlite: Database.Database;
let db: Db;

function sourceThatWorks(): DraftDataSource {
  return {
    name: 'fixture',
    getMatchups: vi.fn(async ({ championKey, role, enemyRole }) => ({
      stats: { championKey, role, games: 25, wins: 13 },
      matchups: [{ enemyChampionKey: 89, enemyRole, games: 17, wins: 11 }],
    })),
    getSynergies: vi.fn(async (): Promise<DraftSynergy[]> => [{
      allyChampionKey: 64,
      allyRole: 'jungle',
      games: 21,
      wins: 12,
    }]),
  };
}

describe('sync de Draft', () => {
  beforeEach(() => {
    sqlite = new Database(':memory:');
    applyPragmas(sqlite);
    db = createDb(sqlite);
    migrate(db, { migrationsFolder: 'src/db/migrations' });
    db.insert(champions).values({
      id: 'Ahri',
      key: 103,
      name: 'Ahri',
      title: 'la Vastaya de Nueve Colas',
      imageFile: 'Ahri.png',
      version: '16.18.1',
    }).run();
  });

  afterEach(() => {
    sqlite.close();
  });

  it('hace upsert por claves compuestas y una segunda corrida no duplica filas', async () => {
    const source = sourceThatWorks();
    const options = {
      source,
      patchWindow: '30',
      requestDelayMs: 0,
      minimumSynergyGames: 0,
    };

    await syncDraftData(db, options);
    await syncDraftData(db, options);

    expect(db.select({ value: count() }).from(draftChampionStats).get()?.value).toBe(5);
    expect(db.select({ value: count() }).from(draftMatchups).get()?.value).toBe(25);
    expect(db.select({ value: count() }).from(draftSynergies).get()?.value).toBe(5);
    expect(db.select({ value: count() }).from(draftSyncRuns).get()?.value).toBe(2);
    expect(db.select().from(draftMatchups).where(eq(draftMatchups.enemyRole, 'top')).get())
      .toMatchObject({ games: 17, wins: 11 });
  });

  it('conserva el progreso parcial y retoma desde el request que falló', async () => {
    const working = sourceThatWorks();
    let calls = 0;
    const failing: DraftDataSource = {
      ...working,
      getMatchups: vi.fn(async (input) => {
        calls += 1;
        if (calls === 3) throw new Error('corte de prueba');
        return working.getMatchups(input);
      }),
    };

    await expect(syncDraftData(db, {
      source: failing,
      requestDelayMs: 0,
      minimumSynergyGames: 0,
    })).rejects.toThrow('corte de prueba');
    expect(db.select({ value: count() }).from(draftMatchups).get()?.value).toBe(2);
    expect(db.select().from(draftSyncRuns).orderBy(draftSyncRuns.id).get())
      .toMatchObject({ requestsMade: 3, nextRequestIndex: 2, failed: true });

    const resumed = await syncDraftData(db, {
      source: working,
      requestDelayMs: 0,
      minimumSynergyGames: 0,
    });

    expect(resumed).toMatchObject({ resumedFromRequest: 2, requestsMade: 28, totalRequests: 30 });
    expect(db.select({ value: count() }).from(draftMatchups).get()?.value).toBe(25);
  });

  it('guarda una lane vacía como sin datos y filtra sinergias de muestra chica', async () => {
    await syncDraftData(db, {
      source: sourceThatWorks(),
      requestDelayMs: 0,
      minimumSynergyGames: 0,
    });
    const emptySource = sourceThatWorks();
    emptySource.getMatchups = vi.fn(async ({ championKey, role }) => ({
      stats: { championKey, role, games: 0, wins: 0 },
      matchups: [],
    }));
    emptySource.getSynergies = vi.fn(async (): Promise<DraftSynergy[]> => [{
      allyChampionKey: 64,
      allyRole: 'jungle',
      games: 9,
      wins: 5,
    }]);

    await syncDraftData(db, {
      source: emptySource,
      requestDelayMs: 0,
      minimumSynergyGames: 10,
    });

    expect(db.select({ value: count() }).from(draftMatchups).get()?.value).toBe(0);
    expect(db.select({ value: count() }).from(draftSynergies).get()?.value).toBe(0);
    expect(db.select().from(draftChampionStats).all()).toSatisfy(
      (rows: { games: number; wins: number }[]) => rows.every((row) => row.games === 0 && row.wins === 0),
    );
  });

  it('no dispara otra pasada programática mientras el último sync está fresco', async () => {
    const source = sourceThatWorks();
    const first = await syncDraftDataIfStale(db, {
      source,
      requestDelayMs: 0,
      minimumSynergyGames: 0,
    });
    const second = await syncDraftDataIfStale(db, {
      source,
      requestDelayMs: 0,
      minimumSynergyGames: 0,
    });

    expect(first.status).toBe('synced');
    expect(second).toEqual({ status: 'fresh' });
    expect(source.getMatchups).toHaveBeenCalledTimes(25);
    expect(source.getSynergies).toHaveBeenCalledTimes(5);
  });
});
