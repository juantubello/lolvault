import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import Database from 'better-sqlite3';

const dbPath = resolve(process.env.DATABASE_PATH ?? '/data/lolvault.db');

if (!existsSync(dbPath)) {
  console.log(`[lolvault] primer arranque: todavía no hay base para respaldar`);
  process.exit(0);
}

const backupsDir = join(dirname(dbPath), 'backups');
mkdirSync(backupsDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const target = join(backupsDir, `pre-migrate-${stamp}.db`);
const db = new Database(dbPath);

try {
  db.pragma('busy_timeout = 10000');
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
} finally {
  db.close();
}

console.log(`[lolvault] backup previo a migrations: ${target}`);
