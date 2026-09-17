import Database from 'better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getDb: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@/auth/current-user', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/db/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db/client')>()),
  getDb: mocks.getDb,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import { applyPragmas, createDb, type Db } from '@/db/client';
import { champions, draftRecords, draftSyncRuns, users } from '@/db/schema';
import { saveDraftRecordAction } from '@/features/draft/records.actions';

const NOW = new Date('2026-09-17T12:00:00Z');
const ALLIES = '1-top,2-jungle,3-middle,4-bottom,5-support';
const ENEMIES = '6-top,7-jungle,8-middle,9-bottom,10-support';

let sqlite: Database.Database;
let db: Db;
let memberId: number;

beforeEach(() => {
  vi.clearAllMocks();
  sqlite = new Database(':memory:');
  applyPragmas(sqlite);
  db = createDb(sqlite);
  migrate(db, { migrationsFolder: 'src/db/migrations' });
  for (let key = 1; key <= 10; key += 1) {
    db.insert(champions).values({
      id: `Champion${key}`,
      key,
      name: `Campeón ${key}`,
      title: 'Título',
      imageFile: `Champion${key}.png`,
      version: '1.0.0',
    }).run();
  }
  memberId = db.insert(users).values({
    externalIdentity: 'test:member',
    email: 'member@example.com',
    displayName: 'Miembro',
    createdAt: NOW,
  }).returning({ id: users.id }).get().id;
  db.insert(draftSyncRuns).values({
    startedAt: NOW,
    finishedAt: NOW,
    patchWindow: '30',
    totalRequests: 1,
  }).run();
  mocks.getDb.mockReturnValue(db);
  mocks.getCurrentUser.mockResolvedValue({ id: memberId, displayName: 'Miembro' });
});

afterEach(() => sqlite.close());

function form(allies = ALLIES, enemies = ENEMIES): FormData {
  const data = new FormData();
  data.set('aliados', allies);
  data.set('enemigos', enemies);
  data.set('riesgo', 'medium');
  return data;
}

describe('saveDraftRecordAction', () => {
  it('ignora cualquier userId y predicción del formulario y usa la identidad autenticada', async () => {
    const data = form();
    data.set('userId', '999');
    data.set('predictedAllyWinrate', '1');

    const result = await saveDraftRecordAction({}, data);
    const [record] = db.select().from(draftRecords).all();

    expect(result.savedId).toBe(record?.id);
    expect(record?.savedByUserId).toBe(memberId);
    expect(record?.predictedAllyWinrate).toBe(0.5);
    expect(record?.savedByUserId).not.toBe(999);
  });

  it('rechaza un draft incompleto aunque el cliente mande una predicción', async () => {
    const data = form('1-top,2-jungle,3-middle,4-bottom');
    data.set('predictedAllyWinrate', '0.99');

    const result = await saveDraftRecordAction({}, data);

    expect(result.error).toContain('Completá los cinco campeones de cada lado');
    expect(db.select().from(draftRecords).all()).toHaveLength(0);
  });
});
