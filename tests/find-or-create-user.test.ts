import Database from 'better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeEach, describe, expect, it } from 'vitest';

import { findOrCreateUser } from '@/auth/current-user';
import { applyPragmas, createDb, type Db } from '@/db/client';
import { users } from '@/db/schema';

let db: Db;

beforeEach(() => {
  const sqlite = new Database(':memory:');
  applyPragmas(sqlite);
  db = createDb(sqlite);
  migrate(db, { migrationsFolder: 'src/db/migrations' });
});

describe('findOrCreateUser', () => {
  it('re-vincula por email sin distinguir mayúsculas y no crea un duplicado', () => {
    const existing = db
      .insert(users)
      .values({ externalIdentity: 'access-sub-viejo', email: 'Amigo@Example.test', displayName: 'Amigo', createdAt: new Date() })
      .returning()
      .get();

    const user = findOrCreateUser(db, { externalIdentity: 'access-sub-nuevo', email: 'amigo@example.test', source: 'access-jwt' });

    expect(user.id).toBe(existing.id);
    expect(user.externalIdentity).toBe('access-sub-nuevo');
    expect(db.select().from(users).all()).toHaveLength(1);
  });

  it('un email nuevo crea un usuario sin perfil (va al onboarding)', () => {
    const user = findOrCreateUser(db, { externalIdentity: 'sub-1', email: 'nuevo@example.test', source: 'access-jwt' });
    expect(user.displayName).toBeNull();
  });
});
