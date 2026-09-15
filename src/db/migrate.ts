import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { backfillMatchParticipants } from '../features/matches/match-participants';
import { createDb, databasePath, openDatabase } from './client';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

export function runMigrations(path = databasePath()): void {
  const sqlite = openDatabase(path);
  try {
    const db = createDb(sqlite);
    migrate(db, { migrationsFolder });
    backfillMatchParticipants(db);
  } finally {
    sqlite.close();
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

if (invokedDirectly) {
  const path = databasePath();
  runMigrations(path);
  console.log(`Migrations aplicadas sobre ${path}`);
}
