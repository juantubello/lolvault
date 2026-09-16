import Database from 'better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getDb: vi.fn(),
  getMatchProvider: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@/auth/current-user', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/db/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db/client')>()),
  getDb: mocks.getDb,
}));
vi.mock('@/features/matches/provider', () => ({ getMatchProvider: mocks.getMatchProvider }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import { applyPragmas, createDb, type Db } from '@/db/client';
import { users } from '@/db/schema';
import { refreshPlayerStatsAction } from '@/features/matches/matches.actions';

const NOW = new Date('2026-09-16T12:00:00Z');

let sqlite: Database.Database;
let db: Db;
let memberId: number;

beforeEach(() => {
  vi.clearAllMocks();
  sqlite = new Database(':memory:');
  applyPragmas(sqlite);
  db = createDb(sqlite);
  migrate(db, { migrationsFolder: 'src/db/migrations' });
  memberId = db
    .insert(users)
    .values({
      externalIdentity: 'test:member',
      email: 'member@example.com',
      displayName: 'Miembro',
      riotGameName: 'Invocador',
      riotTagLine: 'LAS1',
      createdAt: NOW,
    })
    .returning({ id: users.id })
    .get().id;
  mocks.getDb.mockReturnValue(db);
  mocks.getCurrentUser.mockResolvedValue({ id: memberId, displayName: 'Miembro' });
});

afterEach(() => sqlite.close());

describe('refreshPlayerStatsAction', () => {
  it('rechaza un userId que no pertenece a un miembro', async () => {
    const result = await refreshPlayerStatsAction(999_999);

    expect(result).toEqual({ ok: false, error: 'Ese jugador no es del grupo.' });
    expect(mocks.getMatchProvider).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
