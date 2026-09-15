import Database from 'better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyPragmas, createDb, type Db } from '@/db/client';
import { champions } from '@/db/schema';
import { listChampionOptions } from '@/features/champions/champions.queries';
import { syncChampions } from '@/features/champions/ddragon-sync';

const BASE_URL = 'https://ddragon.leagueoflegends.com';

let sqlite: Database.Database;
let db: Db;

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function championPayload(version: string) {
  return {
    data: {
      Ahri: {
        id: 'Ahri',
        key: '103',
        name: version === '16.19.1' ? 'Ahri actualizada' : 'Ahri',
        title: 'la Vastaya de Nueve Colas',
        image: { full: 'Ahri.png' },
      },
      Braum: {
        id: 'Braum',
        key: '201',
        name: 'Braum',
        title: 'el Corazón del Fréljord',
        image: { full: 'Braum.png' },
      },
    },
  };
}

describe('sync de campeones de Data Dragon', () => {
  beforeEach(() => {
    sqlite = new Database(':memory:');
    applyPragmas(sqlite);
    db = createDb(sqlite);
    migrate(db, { migrationsFolder: 'src/db/migrations' });
  });

  afterEach(() => {
    sqlite.close();
  });

  it('consulta versiones y champion.json e inserta los campeones', async () => {
    const fetchFn = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.endsWith('/api/versions.json')) return jsonResponse(['16.18.1']);
      return jsonResponse(championPayload('16.18.1'));
    });

    await expect(syncChampions(db, fetchFn)).resolves.toEqual({
      version: '16.18.1',
      count: 2,
      updated: true,
    });
    expect(fetchFn).toHaveBeenCalledWith(`${BASE_URL}/api/versions.json`, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(fetchFn).toHaveBeenCalledWith(
      `${BASE_URL}/cdn/16.18.1/data/es_AR/champion.json`, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(db.select().from(champions).all()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'Ahri', key: 103, name: 'Ahri', version: '16.18.1' }),
        expect.objectContaining({ id: 'Braum', key: 201, name: 'Braum', version: '16.18.1' }),
      ]),
    );
  });

  it('si la versión no cambió no vuelve a pedir champion.json', async () => {
    const fetchFn = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.endsWith('/api/versions.json')) return jsonResponse(['16.18.1']);
      return jsonResponse(championPayload('16.18.1'));
    });
    await syncChampions(db, fetchFn);
    fetchFn.mockClear();

    await expect(syncChampions(db, fetchFn)).resolves.toEqual({
      version: '16.18.1',
      count: 2,
      updated: false,
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(`${BASE_URL}/api/versions.json`, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('con una versión nueva actualiza por upsert sin duplicar filas', async () => {
    let version = '16.18.1';
    const fetchFn = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.endsWith('/api/versions.json')) return jsonResponse([version]);
      return jsonResponse(championPayload(version));
    });
    await syncChampions(db, fetchFn);

    version = '16.19.1';
    await expect(syncChampions(db, fetchFn)).resolves.toEqual({
      version: '16.19.1',
      count: 2,
      updated: true,
    });

    const rows = db.select().from(champions).all();
    expect(rows).toHaveLength(2);
    expect(rows.find(({ id }) => id === 'Ahri')).toMatchObject({
      name: 'Ahri actualizada',
      version: '16.19.1',
    });
    expect(rows.every(({ version: rowVersion }) => rowVersion === '16.19.1')).toBe(true);
  });

  it('lanza si falla la consulta de versiones', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ error: 'caído' }, 503));

    await expect(syncChampions(db, fetchFn)).rejects.toThrow(
      `Data Dragon respondió 503 para ${BASE_URL}/api/versions.json`,
    );
  });

  it('lanza si falla champion.json', async () => {
    const fetchFn = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.endsWith('/api/versions.json')) return jsonResponse(['16.18.1']);
      return jsonResponse({ error: 'caído' }, 500);
    });

    await expect(syncChampions(db, fetchFn)).rejects.toThrow(
      `Data Dragon respondió 500 para ${BASE_URL}/cdn/16.18.1/data/es_AR/champion.json`,
    );
  });
});

describe('listChampionOptions', () => {
  beforeEach(() => {
    sqlite = new Database(':memory:');
    applyPragmas(sqlite);
    db = createDb(sqlite);
    migrate(db, { migrationsFolder: 'src/db/migrations' });
  });

  afterEach(() => {
    sqlite.close();
  });

  it('ordena por nombre en español y arma la URL de imagen con cada versión', () => {
    db.insert(champions)
      .values([
        { id: 'Orianna', key: 61, name: 'Orianna', title: 'la Doncella Mecánica', imageFile: 'Orianna.png', version: '16.18.1' },
        { id: 'Nunu', key: 20, name: 'Ñu', title: 'el Niño y su Yeti', imageFile: 'Nunu.png', version: '16.17.1' },
        { id: 'Nami', key: 267, name: 'Nami', title: 'la Invocadora de Mareas', imageFile: 'Nami.png', version: '16.19.1' },
      ])
      .run();

    expect(listChampionOptions(db)).toEqual([
      {
        id: 'Nami',
        name: 'Nami',
        imageUrl: `${BASE_URL}/cdn/16.19.1/img/champion/Nami.png`,
      },
      {
        id: 'Nunu',
        name: 'Ñu',
        imageUrl: `${BASE_URL}/cdn/16.17.1/img/champion/Nunu.png`,
      },
      {
        id: 'Orianna',
        name: 'Orianna',
        imageUrl: `${BASE_URL}/cdn/16.18.1/img/champion/Orianna.png`,
      },
    ]);
  });
});
