import { LOLALYTICS_PATCH_WINDOW } from '@/config';
import { getDb } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import {
  syncDraftScaling,
  syncDraftScalingIfStale,
} from '@/features/draft/scaling-sync';

const force = process.argv.includes('--force');

function onProgress(progress: { completedRequests: number; totalRequests: number }): void {
  if (progress.completedRequests % 25 !== 0 && progress.completedRequests !== progress.totalRequests) return;
  const percent = (progress.completedRequests / progress.totalRequests * 100).toFixed(1);
  console.log(`${progress.completedRequests}/${progress.totalRequests} curvas (${percent} %) guardadas`);
}

async function main(): Promise<void> {
  runMigrations();
  const db = getDb();
  console.log(`Sync de Scaling · ventana ${LOLALYTICS_PATCH_WINDOW}${force ? ' · forzado' : ''}`);
  if (force) {
    const result = await syncDraftScaling(db, { onProgress });
    console.log(`Scaling completo: ${result.requestsMade} requests en esta ejecución.`);
    return;
  }
  const outcome = await syncDraftScalingIfStale(db, { onProgress });
  if (outcome.status === 'fresh') {
    console.log('El caché de Scaling sigue fresco. Usá --force para forzar.');
    return;
  }
  console.log(`Scaling completo: ${outcome.result.requestsMade} requests en esta ejecución.`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Falló el sync de Scaling: ${message}`);
  process.exitCode = 1;
});
