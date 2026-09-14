#!/bin/sh
set -eu

echo "[lolvault] arrancando · NODE_ENV=${NODE_ENV:-unset} · DATABASE_PATH=${DATABASE_PATH:-/data/lolvault.db}"

node docker/pre-migrate-backup.mjs
node migrate/migrate.mjs

echo "[lolvault] migrations al día, levantando el server en :${PORT:-3000}"
exec "$@"
