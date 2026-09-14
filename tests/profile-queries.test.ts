import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeEach, describe, expect, it } from 'vitest';

import { applyPragmas, createDb, type Db } from '@/db/client';
import { users } from '@/db/schema';
import { saveProfile } from '@/features/profile/profile.queries';

let db: Db;

function insertUser(email: string, puuid: string) {
  return db
    .insert(users)
    .values({
      externalIdentity: `test:${email}`,
      email,
      displayName: 'Invocador',
      riotGameName: 'Tester',
      riotTagLine: 'LAS',
      riotPuuid: puuid,
      createdAt: new Date(),
    })
    .returning()
    .get();
}

function reload(id: number) {
  return db.select().from(users).where(eq(users.id, id)).get();
}

describe('saveProfile', () => {
  beforeEach(() => {
    const sqlite = new Database(':memory:');
    applyPragmas(sqlite);
    db = createDb(sqlite);
    migrate(db, { migrationsFolder: 'src/db/migrations' });
  });

  it('actualiza el Riot ID renombrado y descarta el puuid para re-resolverlo', () => {
    const user = insertUser('a@example.com', 'puuid-a');

    saveProfile(db, user.id, {
      displayName: 'Invocador',
      riotGameName: 'NombreNuevo',
      riotTagLine: 'LAS2',
    });

    expect(reload(user.id)).toMatchObject({
      riotGameName: 'NombreNuevo',
      riotTagLine: 'LAS2',
      riotPuuid: null,
    });
  });

  it('conserva el puuid si solo cambian nombre visible o mayúsculas del Riot ID', () => {
    const user = insertUser('a@example.com', 'puuid-a');

    saveProfile(db, user.id, {
      displayName: 'Otro apodo',
      riotGameName: 'tester',
      riotTagLine: 'las',
    });

    expect(reload(user.id)).toMatchObject({ displayName: 'Otro apodo', riotPuuid: 'puuid-a' });
  });

  it('no toca el perfil de otro usuario', () => {
    const user = insertUser('a@example.com', 'puuid-a');
    const other = insertUser('b@example.com', 'puuid-b');

    saveProfile(db, user.id, { displayName: 'Cambiado', riotGameName: null, riotTagLine: null });

    expect(reload(other.id)).toMatchObject({
      displayName: 'Invocador',
      riotGameName: 'Tester',
      riotPuuid: 'puuid-b',
    });
  });
});
