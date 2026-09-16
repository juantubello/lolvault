import { and, desc, eq, isNotNull, notInArray } from 'drizzle-orm';

import {
  LOLALYTICS_MIN_SYNERGY_GAMES,
  LOLALYTICS_PATCH_WINDOW,
  LOLALYTICS_REQUEST_DELAY_MS,
  LOLALYTICS_SYNC_INTERVAL_MS,
  LOLALYTICS_SYNC_TOTAL_TIMEOUT_MS,
} from '@/config';
import type { Db } from '@/db/client';
import {
  champions,
  draftChampionStats,
  draftMatchups,
  draftSynergies,
  draftSyncRuns,
} from '@/db/schema';
import { getDraftDataSource } from '@/features/draft/provider';
import {
  DRAFT_ROLES,
  isDraftDataSourceError,
  type DraftDataSource,
  type DraftMatchup,
  type DraftRole,
  type DraftSynergy,
} from '@/features/draft/types';

type SyncTask =
  | { kind: 'matchups'; championKey: number; championId: string; role: DraftRole; enemyRole: DraftRole }
  | { kind: 'synergies'; championKey: number; championId: string; role: DraftRole };

export type DraftSyncProgress = {
  runId: number;
  completedRequests: number;
  totalRequests: number;
  requestsMadeThisRun: number;
  task: SyncTask;
};

export type DraftSyncResult = {
  runId: number;
  patchWindow: string;
  resumedFromRequest: number;
  requestsMade: number;
  totalRequests: number;
};

type SyncOptions = {
  source?: DraftDataSource;
  patchWindow?: string;
  requestDelayMs?: number;
  totalTimeoutMs?: number;
  minimumSynergyGames?: number;
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
  onProgress?: (progress: DraftSyncProgress) => void;
};

class SyncDeadlineError extends Error {
  constructor(milliseconds: number) {
    super(`El sync alcanzó el tope total de ${Math.round(milliseconds / 60_000)} minutos`);
    this.name = 'SyncDeadlineError';
  }
}

function buildTasks(championRows: { key: number; id: string }[]): SyncTask[] {
  return championRows.flatMap(({ key: championKey, id: championId }) => [
    ...DRAFT_ROLES.flatMap((role) => DRAFT_ROLES.map((enemyRole): SyncTask => ({
      kind: 'matchups',
      championKey,
      championId,
      role,
      enemyRole,
    }))),
    ...DRAFT_ROLES.map((role): SyncTask => ({ kind: 'synergies', championKey, championId, role })),
  ]);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Error desconocido durante el sync';
}

function sleepFor(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function deleteStaleMatchups(
  tx: Parameters<Parameters<Db['transaction']>[0]>[0],
  task: Extract<SyncTask, { kind: 'matchups' }>,
  rows: DraftMatchup[],
): void {
  const slice = and(
    eq(draftMatchups.championKey, task.championKey),
    eq(draftMatchups.role, task.role),
    eq(draftMatchups.enemyRole, task.enemyRole),
  );
  const keys = rows.map((row) => row.enemyChampionKey);
  tx.delete(draftMatchups)
    .where(keys.length === 0 ? slice : and(slice, notInArray(draftMatchups.enemyChampionKey, keys)))
    .run();
}

function upsertMatchups(
  tx: Parameters<Parameters<Db['transaction']>[0]>[0],
  task: Extract<SyncTask, { kind: 'matchups' }>,
  rows: DraftMatchup[],
): void {
  for (const row of rows) {
    tx.insert(draftMatchups)
      .values({
        championKey: task.championKey,
        role: task.role,
        enemyChampionKey: row.enemyChampionKey,
        enemyRole: task.enemyRole,
        games: row.games,
        wins: row.wins,
      })
      .onConflictDoUpdate({
        target: [
          draftMatchups.championKey,
          draftMatchups.role,
          draftMatchups.enemyChampionKey,
          draftMatchups.enemyRole,
        ],
        set: { games: row.games, wins: row.wins },
      })
      .run();
  }
}

function replaceSynergies(
  tx: Parameters<Parameters<Db['transaction']>[0]>[0],
  task: Extract<SyncTask, { kind: 'synergies' }>,
  rows: DraftSynergy[],
): void {
  for (const allyRole of DRAFT_ROLES) {
    const roleRows = rows.filter((row) => row.allyRole === allyRole);
    const slice = and(
      eq(draftSynergies.championKey, task.championKey),
      eq(draftSynergies.role, task.role),
      eq(draftSynergies.allyRole, allyRole),
    );
    const keys = roleRows.map((row) => row.allyChampionKey);
    tx.delete(draftSynergies)
      .where(keys.length === 0 ? slice : and(slice, notInArray(draftSynergies.allyChampionKey, keys)))
      .run();

    for (const row of roleRows) {
      tx.insert(draftSynergies)
        .values({
          championKey: task.championKey,
          role: task.role,
          allyChampionKey: row.allyChampionKey,
          allyRole: row.allyRole,
          games: row.games,
          wins: row.wins,
        })
        .onConflictDoUpdate({
          target: [
            draftSynergies.championKey,
            draftSynergies.role,
            draftSynergies.allyChampionKey,
            draftSynergies.allyRole,
          ],
          set: { games: row.games, wins: row.wins },
        })
        .run();
    }
  }
}

/**
 * Ejecuta una pasada incremental. Cada respuesta válida y su cursor se confirman juntos; ante un
 * error queda todo lo anterior y la próxima llamada retoma el request que falló.
 */
export async function syncDraftData(db: Db, options: SyncOptions = {}): Promise<DraftSyncResult> {
  const source = options.source ?? getDraftDataSource();
  const patchWindow = options.patchWindow ?? LOLALYTICS_PATCH_WINDOW;
  const requestDelayMs = options.requestDelayMs ?? LOLALYTICS_REQUEST_DELAY_MS;
  const totalTimeoutMs = options.totalTimeoutMs ?? LOLALYTICS_SYNC_TOTAL_TIMEOUT_MS;
  const minimumSynergyGames = options.minimumSynergyGames ?? LOLALYTICS_MIN_SYNERGY_GAMES;
  const now = options.now ?? (() => new Date());
  const sleep = options.sleep ?? sleepFor;

  const championRows = db.select({ key: champions.key, id: champions.id })
    .from(champions)
    .where(isNotNull(champions.key))
    .orderBy(champions.key)
    .all()
    .flatMap(({ key, id }) => key === null ? [] : [{ key, id }]);
  if (championRows.length === 0) {
    throw new Error('No hay campeones en la base; primero sincronizá Data Dragon');
  }

  const tasks = buildTasks(championRows);
  const latest = db.select().from(draftSyncRuns)
    .where(eq(draftSyncRuns.patchWindow, patchWindow))
    .orderBy(desc(draftSyncRuns.id))
    .get();
  const canResume = latest !== undefined
    && latest.totalRequests === tasks.length
    && latest.nextRequestIndex < tasks.length;
  const startRequestIndex = canResume ? latest.nextRequestIndex : 0;
  const startedAt = now();

  if (latest && latest.finishedAt === null) {
    db.update(draftSyncRuns)
      .set({
        finishedAt: startedAt,
        failed: true,
        error: 'La ejecución anterior se interrumpió antes de registrar el resultado',
      })
      .where(eq(draftSyncRuns.id, latest.id))
      .run();
  }

  const insertedRun = db.insert(draftSyncRuns).values({
    startedAt,
    patchWindow,
    totalRequests: tasks.length,
    startRequestIndex,
    nextRequestIndex: startRequestIndex,
  }).returning({ id: draftSyncRuns.id }).get();
  const runId = insertedRun.id;
  let requestsMade = 0;
  const skipped: string[] = [];

  try {
    for (let index = startRequestIndex; index < tasks.length; index += 1) {
      if (now().getTime() - startedAt.getTime() >= totalTimeoutMs) {
        throw new SyncDeadlineError(totalTimeoutMs);
      }
      if (requestsMade > 0 && requestDelayMs > 0) {
        await sleep(requestDelayMs);
      }
      if (now().getTime() - startedAt.getTime() >= totalTimeoutMs) {
        throw new SyncDeadlineError(totalTimeoutMs);
      }

      const task = tasks[index];
      if (!task) throw new Error(`Falta el request ${index} en el plan de sync`);
      requestsMade += 1;

      try {
        if (task.kind === 'matchups') {
          const result = await source.getMatchups({ ...task, patchWindow });
          db.transaction((tx) => {
            deleteStaleMatchups(tx, task, result.matchups);
            upsertMatchups(tx, task, result.matchups);
            if (task.role === task.enemyRole) {
              tx.insert(draftChampionStats)
                .values({
                  championKey: task.championKey,
                  role: task.role,
                  games: result.stats.games,
                  wins: result.stats.wins,
                  patchWindow,
                  updatedAt: now(),
                })
                .onConflictDoUpdate({
                  target: [draftChampionStats.championKey, draftChampionStats.role],
                  set: {
                    games: result.stats.games,
                    wins: result.stats.wins,
                    patchWindow,
                    updatedAt: now(),
                  },
                })
                .run();
            }
            tx.update(draftSyncRuns)
              .set({ requestsMade, nextRequestIndex: index + 1 })
              .where(eq(draftSyncRuns.id, runId))
              .run();
          });
        } else {
          const rows = (await source.getSynergies({ ...task, patchWindow }))
            .filter((row) => row.games >= minimumSynergyGames);
          db.transaction((tx) => {
            replaceSynergies(tx, task, rows);
            tx.update(draftSyncRuns)
              .set({ requestsMade, nextRequestIndex: index + 1 })
              .where(eq(draftSyncRuns.id, runId))
              .run();
          });
        }
      } catch (error) {
        // Un campeón que la fuente no reconoce, o una respuesta ilegible, no puede tirar abajo las
        // más de 5.000 tareas: se saltea y se sigue. Una caída de la fuente sí corta, para no
        // martillarla miles de veces cuando ya sabemos que no responde.
        if (!isDraftDataSourceError(error) || error.kind === 'unavailable') throw error;
        const detalle = `${task.championId}/${task.role} (${task.kind}): ${error.message}`;
        skipped.push(detalle);
        console.warn(`[draft] Salteado ${detalle}`);
        db.update(draftSyncRuns)
          .set({ requestsMade, nextRequestIndex: index + 1 })
          .where(eq(draftSyncRuns.id, runId))
          .run();
      }

      options.onProgress?.({
        runId,
        completedRequests: index + 1,
        totalRequests: tasks.length,
        requestsMadeThisRun: requestsMade,
        task,
      });
    }

    db.update(draftSyncRuns)
      .set({
        finishedAt: now(),
        failed: false,
        error: skipped.length > 0
          ? `${skipped.length} requests salteados: ${skipped.slice(0, 5).join(' | ')}`
          : null,
        requestsMade,
      })
      .where(eq(draftSyncRuns.id, runId))
      .run();
    return {
      runId,
      patchWindow,
      resumedFromRequest: startRequestIndex,
      requestsMade,
      totalRequests: tasks.length,
    };
  } catch (error) {
    db.update(draftSyncRuns)
      .set({ finishedAt: now(), failed: true, error: errorMessage(error), requestsMade })
      .where(eq(draftSyncRuns.id, runId))
      .run();
    throw error;
  }
}

/** Disparador para instrumentación o un endpoint futuro: no hace red si el caché sigue fresco. */
export async function syncDraftDataIfStale(
  db: Db,
  options: SyncOptions & { maxAgeMs?: number } = {},
): Promise<{ status: 'fresh' } | { status: 'synced'; result: DraftSyncResult }> {
  const patchWindow = options.patchWindow ?? LOLALYTICS_PATCH_WINDOW;
  const now = options.now ?? (() => new Date());
  const latestRun = db.select().from(draftSyncRuns)
    .where(eq(draftSyncRuns.patchWindow, patchWindow))
    .orderBy(desc(draftSyncRuns.id))
    .get();
  if (latestRun && latestRun.nextRequestIndex < latestRun.totalRequests) {
    return { status: 'synced', result: await syncDraftData(db, options) };
  }
  const latestSuccess = db.select().from(draftSyncRuns)
    .where(and(
      eq(draftSyncRuns.patchWindow, patchWindow),
      eq(draftSyncRuns.failed, false),
      isNotNull(draftSyncRuns.finishedAt),
    ))
    .orderBy(desc(draftSyncRuns.id))
    .get();
  const maxAgeMs = options.maxAgeMs ?? LOLALYTICS_SYNC_INTERVAL_MS;
  if (
    latestSuccess?.finishedAt
    && latestSuccess.nextRequestIndex === latestSuccess.totalRequests
    && now().getTime() - latestSuccess.finishedAt.getTime() < maxAgeMs
  ) {
    return { status: 'fresh' };
  }
  return { status: 'synced', result: await syncDraftData(db, options) };
}
