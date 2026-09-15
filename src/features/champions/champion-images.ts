import type { Db } from '@/db/client';
import { champions } from '@/db/schema';

import { championImageUrl } from './ddragon-sync';

/** Foto de Data Dragon por `key` numérico de Riot (el `champion_id` que devuelve OP.GG). */
export function championImagesByKey(db: Db): Map<number, string> {
  const rows = db
    .select({ key: champions.key, imageFile: champions.imageFile, version: champions.version })
    .from(champions)
    .all();

  return new Map(
    rows.flatMap((row) => (row.key === null ? [] : [[row.key, championImageUrl(row.version, row.imageFile)] as const])),
  );
}
