import Database from 'better-sqlite3';
import { count, desc } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyPragmas, createDb, type Db } from '@/db/client';
import {
  champions,
  draftChampionScaling,
  draftChampionStats,
  draftScalingSyncRuns,
  draftSyncRuns,
} from '@/db/schema';
import type { DraftScalingSource } from '@/features/draft/lolalytics/lolalytics-scaling-source';
import { syncDraftScaling } from '@/features/draft/scaling-sync';
import { DraftDataSourceError, type DraftRole } from '@/features/draft/types';

let sqlite: Database.Database;
let db: Db;

const series = (offset = 0) => Array.from({ length: 7 }, (_, index) => ({
  bucket: index + 1,
  games: 2_000 + index,
  wins: 1_000 + index + offset,
}));

function addChampion(key: number, id: string, role: DraftRole = 'middle'): void {
  db.insert(champions).values({
    id,
    key,
    name: id,
    title: 'campeón de prueba',
    imageFile: `${id}.png`,
    version: '16.18.1',
  }).run();
  db.insert(draftChampionStats).values({
    championKey: key,
    role,
    games: 10_000,
    wins: 5_000,
    patchWindow: '30',
    updatedAt: new Date('2026-09-17T12:00:00Z'),
  }).run();
}

function completeMainSync(): void {
  db.insert(draftSyncRuns).values({
    startedAt: new Date('2026-09-17T11:00:00Z'),
    finishedAt: new Date('2026-09-17T12:00:00Z'),
    patchWindow: '30',
    requestsMade: 1,
    totalRequests: 1,
    nextRequestIndex: 1,
    failed: false,
  }).run();
}

function workingSource(): DraftScalingSource {
  return {
    name: 'fixture',
    getScaling: vi.fn(async () => series()),
  };
}

describe('sync de Scaling', () => {
  beforeEach(() => {
    sqlite = new Database(':memory:');
    applyPragmas(sqlite);
    db = createDb(sqlite);
    migrate(db, { migrationsFolder: 'src/db/migrations' });
    completeMainSync();
  });

  afterEach(() => sqlite.close());

  it('pide sólo pares que pasan playsRole y reemplaza sus siete tramos', async () => {
    addChampion(103, 'Ahri');
    db.insert(draftChampionStats).values({
      championKey: 103,
      role: 'support',
      games: 999,
      wins: 500,
      patchWindow: '30',
      updatedAt: new Date('2026-09-17T12:00:00Z'),
    }).run();
    const source = workingSource();

    await syncDraftScaling(db, { source, requestDelayMs: 0 });
    source.getScaling = vi.fn(async () => series(25));
    await syncDraftScaling(db, { source, requestDelayMs: 0 });

    expect(source.getScaling).toHaveBeenCalledTimes(1);
    expect(source.getScaling).toHaveBeenCalledWith(expect.objectContaining({
      championKey: 103,
      role: 'middle',
    }));
    expect(db.select({ value: count() }).from(draftChampionScaling).get()?.value).toBe(7);
    expect(db.select().from(draftChampionScaling).all()[0]).toMatchObject({ wins: 1_025 });
  });

  it('conserva el cursor y retoma el par que falló', async () => {
    addChampion(1, 'Annie');
    addChampion(2, 'Olaf');
    let calls = 0;
    const failing: DraftScalingSource = {
      name: 'fixture',
      getScaling: vi.fn(async () => {
        calls += 1;
        if (calls === 2) throw new Error('corte de prueba');
        return series();
      }),
    };

    await expect(syncDraftScaling(db, { source: failing, requestDelayMs: 0 }))
      .rejects.toThrow('corte de prueba');
    expect(db.select({ value: count() }).from(draftChampionScaling).get()?.value).toBe(7);

    const resumed = await syncDraftScaling(db, {
      source: workingSource(),
      requestDelayMs: 0,
    });
    expect(resumed).toMatchObject({ resumedFromRequest: 1, requestsMade: 1, totalRequests: 2 });
    expect(db.select({ value: count() }).from(draftChampionScaling).get()?.value).toBe(14);
  });

  it('saltea not-found e invalid-response, pero corta ante unavailable', async () => {
    addChampion(1, 'Annie');
    addChampion(2, 'Olaf');
    addChampion(3, 'Galio');
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const source: DraftScalingSource = {
      name: 'fixture',
      getScaling: vi.fn(async ({ championKey }) => {
        if (championKey === 1) throw new DraftDataSourceError('no existe', 'not-found');
        if (championKey === 2) throw new DraftDataSourceError('forma rota', 'invalid-response');
        throw new DraftDataSourceError('fuente caída', 'unavailable');
      }),
    };

    await expect(syncDraftScaling(db, { source, requestDelayMs: 0 }))
      .rejects.toMatchObject({ kind: 'unavailable' });

    expect(source.getScaling).toHaveBeenCalledTimes(3);
    expect(warning).toHaveBeenCalledTimes(2);
    expect(db.select().from(draftScalingSyncRuns).orderBy(desc(draftScalingSyncRuns.id)).get())
      .toMatchObject({ nextRequestIndex: 2, requestsMade: 3, failed: true });
    warning.mockRestore();
  });

  it('una falla de Scaling no invalida la sincronización principal', async () => {
    addChampion(103, 'Ahri');
    const source: DraftScalingSource = {
      name: 'fixture',
      getScaling: vi.fn(async () => {
        throw new DraftDataSourceError('fuente caída', 'unavailable');
      }),
    };

    await expect(syncDraftScaling(db, { source, requestDelayMs: 0 })).rejects.toThrow('fuente caída');

    expect(db.select().from(draftSyncRuns).get()).toMatchObject({
      failed: false,
      nextRequestIndex: 1,
      totalRequests: 1,
    });
    expect(db.select().from(draftScalingSyncRuns).get()).toMatchObject({ failed: true });
  });
});
