/** Espejo local de los campeones de Data Dragon (oficial Riot, sin key). Ver docs/APIS-LOL.md. */
import { sql } from 'drizzle-orm';

import type { Db } from '@/db/client';
import { champions } from '@/db/schema';

const DDRAGON_URL = 'https://ddragon.leagueoflegends.com';
const CHAMPIONS_LOCALE = 'es_AR';
const RECHECK_MS = 24 * 60 * 60 * 1000;

type FetchFn = (url: string) => Promise<Response>;

type DdragonChampion = {
  id: string;
  key: string;
  name: string;
  title: string;
  image: { full: string };
};

export function championImageUrl(version: string, imageFile: string): string {
  return `${DDRAGON_URL}/cdn/${version}/img/champion/${imageFile}`;
}

async function getJson<T>(fetchFn: FetchFn, url: string): Promise<T> {
  const response = await fetchFn(url);
  if (!response.ok) throw new Error(`Data Dragon respondió ${response.status} para ${url}`);
  return (await response.json()) as T;
}

export async function syncChampions(
  db: Db,
  fetchFn: FetchFn = fetch,
): Promise<{ version: string; count: number; updated: boolean }> {
  const [version] = await getJson<string[]>(fetchFn, `${DDRAGON_URL}/api/versions.json`);
  if (!version) throw new Error('Data Dragon no devolvió versiones');

  const current = db
    .select({ version: champions.version, count: sql<number>`count(*)` })
    .from(champions)
    .get();

  if (current?.count && current.version === version) {
    return { version, count: current.count, updated: false };
  }

  const { data } = await getJson<{ data: Record<string, DdragonChampion> }>(
    fetchFn,
    `${DDRAGON_URL}/cdn/${version}/data/${CHAMPIONS_LOCALE}/champion.json`,
  );
  const rows = Object.values(data).map((champion) => ({
    id: champion.id,
    key: Number(champion.key),
    name: champion.name,
    title: champion.title,
    imageFile: champion.image.full,
    version,
  }));

  db.transaction((tx) => {
    for (const row of rows) {
      tx.insert(champions)
        .values(row)
        .onConflictDoUpdate({
          target: champions.id,
          set: { key: row.key, name: row.name, title: row.title, imageFile: row.imageFile, version },
        })
        .run();
    }
  });

  return { version, count: rows.length, updated: true };
}

const globalForSync = globalThis as unknown as { __lolvaultChampionsCheckedAt?: number };

/**
 * Garantiza que haya campeones. Si la tabla está vacía espera el sync; si no, revisa
 * como mucho una vez por día en segundo plano (un parche nuevo no bloquea la request).
 */
export async function ensureChampions(db: Db): Promise<void> {
  const count = db.select({ count: sql<number>`count(*)` }).from(champions).get()?.count ?? 0;

  if (count === 0) {
    await syncChampions(db);
    globalForSync.__lolvaultChampionsCheckedAt = Date.now();
    return;
  }

  const checkedAt = globalForSync.__lolvaultChampionsCheckedAt ?? 0;
  if (Date.now() - checkedAt < RECHECK_MS) return;

  globalForSync.__lolvaultChampionsCheckedAt = Date.now();
  syncChampions(db).catch((error: unknown) => {
    console.error('[champions] No se pudo actualizar desde Data Dragon:', error);
  });
}
