import type { Db } from '@/db/client';
import { champions } from '@/db/schema';

import { championImageUrl } from './ddragon-sync';

export type ChampionOption = {
  id: string;
  name: string;
  imageUrl: string;
};

/** Catálogo público (no es dato personal): ordenado como lo lee una persona en español. */
export function listChampionOptions(db: Db): ChampionOption[] {
  return db
    .select({
      id: champions.id,
      name: champions.name,
      imageFile: champions.imageFile,
      version: champions.version,
    })
    .from(champions)
    .all()
    .map(({ id, name, imageFile, version }) => ({
      id,
      name,
      imageUrl: championImageUrl(version, imageFile),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
