import { and, desc, eq, isNotNull } from 'drizzle-orm';

import type { Db } from '@/db/client';
import { draftSyncRuns } from '@/db/schema';
import type { DraftMatrix } from '@/features/draft/analysis';
import { loadDraftMatrix } from '@/features/draft/analysis-data';

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
