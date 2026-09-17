import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { applyPragmas, createDb, type Db } from '@/db/client';
import {
  champions,
  draftChampionScaling,
  draftChampionStats,
  draftScalingSyncRuns,
  draftSyncRuns,
} from '@/db/schema';
import { getDraftMatrix, getDraftScalingMatrix } from '@/features/draft/matrix-cache';

let sqlite: Database.Database;
let db: Db;

function addCompletedRun(finishedAt: Date): void {
  db.insert(draftSyncRuns).values({
    startedAt: new Date(finishedAt.getTime() - 1_000),
    finishedAt,
    patchWindow: '30',
    requestsMade: 1,
    totalRequests: 1,
    nextRequestIndex: 1,
    failed: false,
  }).run();
}

describe('caché de la matriz de Draft', () => {
  beforeEach(() => {
    sqlite = new Database(':memory:');
    applyPragmas(sqlite);
    db = createDb(sqlite);
    migrate(db, { migrationsFolder: 'src/db/migrations' });
    db.insert(champions).values({
      id: 'Ahri',
      key: 103,
      name: 'Ahri',
      title: 'la vastaya de nueve colas',
      imageFile: 'Ahri.png',
      version: '16.18.1',
    }).run();
    db.insert(draftChampionStats).values({
      championKey: 103,
      role: 'middle',
      games: 100,
      wins: 50,
      patchWindow: '30',
      updatedAt: new Date('2026-09-17T10:00:00Z'),
    }).run();
  });

  afterEach(() => sqlite.close());

  it('devuelve null si no existe una corrida terminada y exitosa', () => {
    db.insert(draftSyncRuns).values({
      startedAt: new Date('2026-09-17T10:00:00Z'),
      patchWindow: '30',
      totalRequests: 1,
      failed: false,
    }).run();
    db.insert(draftSyncRuns).values({
      startedAt: new Date('2026-09-17T11:00:00Z'),
      finishedAt: new Date('2026-09-17T11:01:00Z'),
      patchWindow: '30',
      totalRequests: 1,
      failed: true,
    }).run();

    expect(getDraftMatrix(db)).toBeNull();
  });

  it('reutiliza el mismo objeto por corrida y recarga al terminar una nueva', () => {
    addCompletedRun(new Date('2026-09-17T10:00:00Z'));
    const first = getDraftMatrix(db);
    expect(getDraftMatrix(db)).toBe(first);

    db.update(draftChampionStats)
      .set({ wins: 55 })
      .where(eq(draftChampionStats.championKey, 103))
      .run();
    expect(getDraftMatrix(db)).toBe(first);

    addCompletedRun(new Date('2026-09-17T12:00:00Z'));
    const reloaded = getDraftMatrix(db);
    expect(reloaded).not.toBe(first);
    expect(reloaded?.championStats.get('103:middle')?.wins).toBe(55);
  });

  it('no publica filas de Scaling hasta que su propia corrida termina bien', () => {
    db.insert(draftChampionScaling).values({
      championKey: 103,
      role: 'middle',
      bucket: 1,
      games: 100,
      wins: 50,
    }).run();
    expect(getDraftScalingMatrix(db)).toBeNull();

    db.insert(draftScalingSyncRuns).values({
      startedAt: new Date('2026-09-17T11:00:00Z'),
      finishedAt: new Date('2026-09-17T11:01:00Z'),
      patchWindow: '30',
      requestsMade: 1,
      totalRequests: 1,
      nextRequestIndex: 0,
      failed: true,
    }).run();
    expect(getDraftScalingMatrix(db)).toBeNull();

    db.insert(draftScalingSyncRuns).values({
      startedAt: new Date('2026-09-17T12:00:00Z'),
      finishedAt: new Date('2026-09-17T12:01:00Z'),
      patchWindow: '30',
      requestsMade: 1,
      totalRequests: 1,
      nextRequestIndex: 1,
      failed: false,
    }).run();
    expect(getDraftScalingMatrix(db)?.get('103:middle')).toHaveLength(1);
  });
});
