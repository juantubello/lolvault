import { LOLALYTICS_PATCH_WINDOW } from '@/config';
import { getDb } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { syncDraftData, syncDraftDataIfStale } from '@/features/draft/sync';

/**
 * Por defecto NO fuerza: el cron nocturno puede llamarlo todos los días sin reiniciar una pasada
 * completa si la última terminó hace poco. Con --force arranca igual, para una corrida a mano.
 */
const force = process.argv.includes('--force');

function onProgress(progress: { completedRequests: number; totalRequests: number }): void {
  if (progress.completedRequests % 25 !== 0 && progress.completedRequests !== progress.totalRequests) return;
  const percent = (progress.completedRequests / progress.totalRequests * 100).toFixed(1);
  console.log(`${progress.completedRequests}/${progress.totalRequests} requests (${percent} %) guardados`);
}

async function main(): Promise<void> {
  runMigrations();
  const db = getDb();
  console.log(`Sync de Draft · ventana ${LOLALYTICS_PATCH_WINDOW}${force ? ' · forzado' : ''}`);

  if (force) {
    const result = await syncDraftData(db, { onProgress });
    console.log(`Sync completo: ${result.requestsMade} requests en esta ejecución.`);
    return;
  }

  const outcome = await syncDraftDataIfStale(db, { onProgress });
  if (outcome.status === 'fresh') {
    console.log('El caché sigue fresco: no hace falta salir a la fuente. Usá --force para forzar.');
    return;
  }
  console.log(`Sync completo: ${outcome.result.requestsMade} requests en esta ejecución.`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Falló el sync de Draft: ${message}`);
  process.exitCode = 1;
});
