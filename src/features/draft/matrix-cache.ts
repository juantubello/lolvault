import { and, desc, eq, isNotNull } from 'drizzle-orm';

import type { Db } from '@/db/client';
import { draftChampionScaling, draftScalingSyncRuns, draftSyncRuns } from '@/db/schema';
import type { DraftMatrix } from '@/features/draft/analysis';
import { loadDraftMatrix } from '@/features/draft/analysis-data';
import {
  buildDraftScalingMatrix,
  scalingRowsFromDb,
  type DraftScalingMatrix,
} from '@/features/draft/scaling';

export type CompletedDraftSyncRun = {
  id: number;
  finishedAt: Date;
  patchWindow: string;
};

type CacheEntry = {
  runKey: string;
  matrix: DraftMatrix;
};

const matrixCache = new WeakMap<Db, CacheEntry>();

type ScalingCacheEntry = {
  runKey: string;
  matrix: DraftScalingMatrix;
};

const scalingMatrixCache = new WeakMap<Db, ScalingCacheEntry>();

export function getLatestCompletedDraftRun(db: Db): CompletedDraftSyncRun | null {
  const run = db.select({
    id: draftSyncRuns.id,
    finishedAt: draftSyncRuns.finishedAt,
    patchWindow: draftSyncRuns.patchWindow,
  })
    .from(draftSyncRuns)
    .where(and(eq(draftSyncRuns.failed, false), isNotNull(draftSyncRuns.finishedAt)))
    .orderBy(desc(draftSyncRuns.id))
    .limit(1)
    .get();

  if (!run?.finishedAt) return null;
  return { ...run, finishedAt: run.finishedAt };
}

/** La matriz se vuelve a materializar únicamente cuando termina una corrida nueva. */
export function getDraftMatrix(db: Db): DraftMatrix | null {
  const run = getLatestCompletedDraftRun(db);
  if (!run) return null;

  const runKey = `${run.id}:${run.finishedAt.getTime()}`;
  const cached = matrixCache.get(db);
  if (cached?.runKey === runKey) return cached.matrix;

  const matrix = loadDraftMatrix(db);
  matrixCache.set(db, { runKey, matrix });
  return matrix;
}

/** Sólo publica Scaling después de una corrida propia completa; A-D no dependen de este estado. */
export function getDraftScalingMatrix(db: Db): DraftScalingMatrix | null {
  const run = db.select({
    id: draftScalingSyncRuns.id,
    finishedAt: draftScalingSyncRuns.finishedAt,
  }).from(draftScalingSyncRuns)
    .where(and(eq(draftScalingSyncRuns.failed, false), isNotNull(draftScalingSyncRuns.finishedAt)))
    .orderBy(desc(draftScalingSyncRuns.id))
    .limit(1)
    .get();
  if (!run?.finishedAt) return null;

  const runKey = `${run.id}:${run.finishedAt.getTime()}`;
  const cached = scalingMatrixCache.get(db);
  if (cached?.runKey === runKey) return cached.matrix;

  const rows = db.select().from(draftChampionScaling).all();
  const matrix = buildDraftScalingMatrix(scalingRowsFromDb(rows));
  scalingMatrixCache.set(db, { runKey, matrix });
  return matrix;
}
