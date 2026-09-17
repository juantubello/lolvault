import { and, desc, eq, isNotNull } from 'drizzle-orm';

import {
  LOLALYTICS_PATCH_WINDOW,
  LOLALYTICS_REQUEST_DELAY_MS,
  LOLALYTICS_SYNC_INTERVAL_MS,
  LOLALYTICS_SYNC_TOTAL_TIMEOUT_MS,
} from '@/config';
import type { Db } from '@/db/client';
import {
  champions,
  draftChampionScaling,
  draftScalingSyncRuns,
} from '@/db/schema';
import type { DraftMatrix } from '@/features/draft/analysis';
import {
  createLolalyticsScalingSource,
  type DraftScalingSource,
} from '@/features/draft/lolalytics/lolalytics-scaling-source';
import type { QwikScalingBucket } from '@/features/draft/lolalytics/qwik-data';
import { getDraftMatrix, getLatestCompletedDraftRun } from '@/features/draft/matrix-cache';
import { playsRole } from '@/features/draft/suggestion-grid';
import { DRAFT_ROLES, isDraftDataSourceError, type DraftRole } from '@/features/draft/types';

type ScalingTask = {
  championKey: number;
  championId: string;
  role: DraftRole;
};

export type DraftScalingSyncProgress = {
  runId: number;
  completedRequests: number;
  totalRequests: number;
  requestsMadeThisRun: number;
  task: ScalingTask;
};

export type DraftScalingSyncResult = {
  runId: number;
  patchWindow: string;
  resumedFromRequest: number;
  requestsMade: number;
  totalRequests: number;
};

type ScalingSyncOptions = {
  source?: DraftScalingSource;
  patchWindow?: string;
  requestDelayMs?: number;
  totalTimeoutMs?: number;
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
  onProgress?: (progress: DraftScalingSyncProgress) => void;
};

class ScalingSyncDeadlineError extends Error {
  constructor(milliseconds: number) {
    super(`El sync de Scaling alcanzó el tope total de ${Math.round(milliseconds / 60_000)} minutos`);
    this.name = 'ScalingSyncDeadlineError';
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Error desconocido durante el sync de Scaling';
}

function sleepFor(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function taskKey(task: Pick<ScalingTask, 'championKey' | 'role'>): string {
  return `${task.championKey}:${task.role}`;
}

function buildTasks(
  championRows: { key: number; id: string }[],
  matrix: DraftMatrix,
): ScalingTask[] {
  return championRows.flatMap(({ key: championKey, id: championId }) => (
    DRAFT_ROLES
      .filter((role) => playsRole(matrix, championKey, role, 'medium'))
      .map((role) => ({ championKey, championId, role }))
  ));
}

function validateSeries(series: readonly QwikScalingBucket[]): void {
  if (series.length !== 7) throw new Error('La serie de Scaling no tiene siete tramos');
  series.forEach((row, index) => {
    if (
      row.bucket !== index + 1
      || !Number.isInteger(row.games)
      || row.games <= 0
      || !Number.isInteger(row.wins)
      || row.wins < 0
      || row.wins > row.games
    ) {
      throw new Error(`El tramo ${index + 1} de Scaling es inválido`);
    }
  });
}

function replaceScaling(
  tx: Parameters<Parameters<Db['transaction']>[0]>[0],
  task: ScalingTask,
  series: readonly QwikScalingBucket[],
): void {
  tx.delete(draftChampionScaling).where(and(
    eq(draftChampionScaling.championKey, task.championKey),
    eq(draftChampionScaling.role, task.role),
  )).run();
  for (const row of series) {
    tx.insert(draftChampionScaling).values({
      championKey: task.championKey,
      role: task.role,
      bucket: row.bucket,
      games: row.games,
      wins: row.wins,
    }).run();
  }
}

function pruneIneligibleRows(db: Db, tasks: readonly ScalingTask[]): void {
  const eligible = new Set(tasks.map(taskKey));
  const seen = new Set<string>();
  for (const row of db.select({
    championKey: draftChampionScaling.championKey,
    role: draftChampionScaling.role,
  }).from(draftChampionScaling).all()) {
    const key = taskKey({ championKey: row.championKey, role: row.role as DraftRole });
    if (seen.has(key) || eligible.has(key)) continue;
    seen.add(key);
    db.delete(draftChampionScaling).where(and(
      eq(draftChampionScaling.championKey, row.championKey),
      eq(draftChampionScaling.role, row.role),
    )).run();
  }
}

/** Pasada independiente y reanudable. Sus corridas nunca escriben en `draft_sync_runs`. */
export async function syncDraftScaling(
  db: Db,
  options: ScalingSyncOptions = {},
): Promise<DraftScalingSyncResult> {
  const source = options.source ?? createLolalyticsScalingSource();
  const patchWindow = options.patchWindow ?? LOLALYTICS_PATCH_WINDOW;
  const requestDelayMs = options.requestDelayMs ?? LOLALYTICS_REQUEST_DELAY_MS;
  const totalTimeoutMs = options.totalTimeoutMs ?? LOLALYTICS_SYNC_TOTAL_TIMEOUT_MS;
  const now = options.now ?? (() => new Date());
  const sleep = options.sleep ?? sleepFor;
  const mainRun = getLatestCompletedDraftRun(db);
  const matrix = getDraftMatrix(db);
  if (!mainRun || !matrix) {
    throw new Error('No hay un sync principal completo; corré primero el sync de Draft');
  }
  if (mainRun.patchWindow !== patchWindow) {
    throw new Error(`El sync principal usa la ventana ${mainRun.patchWindow}, no ${patchWindow}`);
  }

  const championRows = db.select({ key: champions.key, id: champions.id })
    .from(champions)
    .orderBy(champions.key)
    .all()
    .flatMap(({ key, id }) => key === null ? [] : [{ key, id }]);
  const tasks = buildTasks(championRows, matrix);
  const latest = db.select().from(draftScalingSyncRuns)
    .where(eq(draftScalingSyncRuns.patchWindow, patchWindow))
    .orderBy(desc(draftScalingSyncRuns.id))
    .get();
  const canResume = latest !== undefined
    && latest.totalRequests === tasks.length
    && latest.nextRequestIndex < tasks.length;
  const startRequestIndex = canResume ? latest.nextRequestIndex : 0;
  const startedAt = now();

  if (latest && latest.finishedAt === null) {
    db.update(draftScalingSyncRuns).set({
      finishedAt: startedAt,
      failed: true,
      error: 'La ejecución anterior se interrumpió antes de registrar el resultado',
    }).where(eq(draftScalingSyncRuns.id, latest.id)).run();
  }

  const runId = db.insert(draftScalingSyncRuns).values({
    startedAt,
    patchWindow,
    totalRequests: tasks.length,
    startRequestIndex,
    nextRequestIndex: startRequestIndex,
  }).returning({ id: draftScalingSyncRuns.id }).get().id;
  let requestsMade = 0;
  const skipped: string[] = [];

  try {
    for (let index = startRequestIndex; index < tasks.length; index += 1) {
      if (now().getTime() - startedAt.getTime() >= totalTimeoutMs) {
        throw new ScalingSyncDeadlineError(totalTimeoutMs);
      }
      if (requestsMade > 0 && requestDelayMs > 0) await sleep(requestDelayMs);
      if (now().getTime() - startedAt.getTime() >= totalTimeoutMs) {
        throw new ScalingSyncDeadlineError(totalTimeoutMs);
      }

      const task = tasks[index];
      if (!task) throw new Error(`Falta el request ${index} en el plan de Scaling`);
      requestsMade += 1;
      try {
        const series = await source.getScaling({ ...task, patchWindow });
        validateSeries(series);
        db.transaction((tx) => {
          replaceScaling(tx, task, series);
          tx.update(draftScalingSyncRuns).set({
            requestsMade,
            nextRequestIndex: index + 1,
          }).where(eq(draftScalingSyncRuns.id, runId)).run();
        });
      } catch (error) {
        if (!isDraftDataSourceError(error) || error.kind === 'unavailable') throw error;
        const detail = `${task.championId}/${task.role}: ${error.message}`;
        skipped.push(detail);
        console.warn(`[draft-scaling] Salteado ${detail}`);
        db.update(draftScalingSyncRuns).set({
          requestsMade,
          nextRequestIndex: index + 1,
        }).where(eq(draftScalingSyncRuns.id, runId)).run();
      }

      options.onProgress?.({
        runId,
        completedRequests: index + 1,
        totalRequests: tasks.length,
        requestsMadeThisRun: requestsMade,
        task,
      });
    }

    pruneIneligibleRows(db, tasks);
    db.update(draftScalingSyncRuns).set({
      finishedAt: now(),
      failed: false,
      error: skipped.length > 0
        ? `${skipped.length} requests salteados: ${skipped.slice(0, 5).join(' | ')}`
        : null,
      requestsMade,
    }).where(eq(draftScalingSyncRuns.id, runId)).run();
    return {
      runId,
      patchWindow,
      resumedFromRequest: startRequestIndex,
      requestsMade,
      totalRequests: tasks.length,
    };
  } catch (error) {
    db.update(draftScalingSyncRuns).set({
      finishedAt: now(),
      failed: true,
      error: errorMessage(error),
      requestsMade,
    }).where(eq(draftScalingSyncRuns.id, runId)).run();
    throw error;
  }
}

export async function syncDraftScalingIfStale(
  db: Db,
  options: ScalingSyncOptions & { maxAgeMs?: number } = {},
): Promise<{ status: 'fresh' } | { status: 'synced'; result: DraftScalingSyncResult }> {
  const patchWindow = options.patchWindow ?? LOLALYTICS_PATCH_WINDOW;
  const now = options.now ?? (() => new Date());
  const latestRun = db.select().from(draftScalingSyncRuns)
    .where(eq(draftScalingSyncRuns.patchWindow, patchWindow))
    .orderBy(desc(draftScalingSyncRuns.id))
    .get();
  if (latestRun && latestRun.nextRequestIndex < latestRun.totalRequests) {
    return { status: 'synced', result: await syncDraftScaling(db, options) };
  }
  const latestSuccess = db.select().from(draftScalingSyncRuns).where(and(
    eq(draftScalingSyncRuns.patchWindow, patchWindow),
    eq(draftScalingSyncRuns.failed, false),
    isNotNull(draftScalingSyncRuns.finishedAt),
  )).orderBy(desc(draftScalingSyncRuns.id)).get();
  const maxAgeMs = options.maxAgeMs ?? LOLALYTICS_SYNC_INTERVAL_MS;
  if (
    latestSuccess?.finishedAt
    && latestSuccess.nextRequestIndex === latestSuccess.totalRequests
    && now().getTime() - latestSuccess.finishedAt.getTime() < maxAgeMs
  ) {
    return { status: 'fresh' };
  }
  return { status: 'synced', result: await syncDraftScaling(db, options) };
}
