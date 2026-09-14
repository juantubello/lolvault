import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import * as schema from './schema';

export function applyPragmas(sqlite: Database.Database): void {
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
}

export function openDatabase(path: string): Database.Database {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  const sqlite = new Database(path);
  applyPragmas(sqlite);
  return sqlite;
}

export function databasePath(): string {
  return process.env.DATABASE_PATH ?? './data/lolvault.db';
}

export type Db = ReturnType<typeof drizzle<typeof schema>>;

export function createDb(sqlite: Database.Database): Db {
  return drizzle(sqlite, { schema });
}

const globalForDb = globalThis as unknown as { __lolvaultDb?: Db };

export function getDb(): Db {
  return (globalForDb.__lolvaultDb ??= createDb(openDatabase(databasePath())));
}
