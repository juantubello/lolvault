import { LOLALYTICS_PATCH_WINDOW } from '@/config';
import { getDb } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { syncDraftData } from '@/features/draft/sync';

async function main(): Promise<void> {
  runMigrations();
  console.log(`Iniciando sync de Draft con ventana ${LOLALYTICS_PATCH_WINDOW}…`);
  const result = await syncDraftData(getDb(), {
    onProgress(progress) {
      if (progress.completedRequests % 25 === 0 || progress.completedRequests === progress.totalRequests) {
        const percent = (progress.completedRequests / progress.totalRequests * 100).toFixed(1);
        console.log(`${progress.completedRequests}/${progress.totalRequests} requests (${percent} %) guardados`);
      }
    },
  });
  console.log(
    `Sync completo: ${result.requestsMade} requests en esta ejecución; ventana ${result.patchWindow}.`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Falló el sync de Draft: ${message}`);
  process.exitCode = 1;
});
