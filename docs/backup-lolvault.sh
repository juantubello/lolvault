#!/usr/bin/env bash
#
# Backup diario de LolVault. Lo dispara el cron del HOST (jpft), pero la copia de
# la base la hace SQLite ADENTRO del contenedor `lolvault` (node + better-sqlite3
# ya vienen en la imagen): en el host no hace falta instalar sqlite3 ni frenar nada.
#
# Por qué VACUUM INTO y no `cp lolvault.db backup.db`:
# la base corre en WAL, así que en cualquier momento parte de los datos
# confirmados está en lolvault.db-wal y no en lolvault.db. Copiar el archivo
# suelto con el contenedor escribiendo puede dejar un backup viejo o corrupto.
# VACUUM INTO le pide a SQLite que escriba una copia consistente y compactada,
# tomando el lock que corresponda, sin frenar al contenedor.
#
# Las fotos de perfil no viven en SQLite: si existe data/avatars/, también se
# guarda un tar.gz de esa carpeta (tar del host, sobre el bind mount).
#
# Instalación (una vez):
#   chmod +x /home/jpft/lolvault/docs/backup-lolvault.sh
#   crontab -e            # como jpft, NO como root
#   27 4 * * * /home/jpft/lolvault/docs/backup-lolvault.sh >> /home/jpft/lolvault/data/backups/backup.log 2>&1
#
# Restaurar: ver docs/RUNBOOK-DEPLOY.md, sección "Rollback".

set -euo pipefail

# Raíz del proyecto = carpeta padre de este script. Sin rutas hardcodeadas.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="$ROOT/data"
DB="$DATA_DIR/lolvault.db"
AVATARS_DIR="$DATA_DIR/avatars"
DEST="$DATA_DIR/backups"
RETENTION_DAYS=14
CONTAINER="${LOLVAULT_CONTAINER:-lolvault}"

STAMP="$(date +%F)"
DB_NAME="lolvault-$STAMP.db"
DB_OUT="$DEST/$DB_NAME"
DB_TMP="$DB_OUT.part"
AVATARS_OUT="$DEST/avatars-$STAMP.tar.gz"
AVATARS_TMP="$AVATARS_OUT.part"

log() { echo "$(date '+%F %T') [lolvault-backup] $*"; }

cleanup() {
  rm -f "$DB_TMP" "$AVATARS_TMP"
}
trap cleanup EXIT

if [[ ! -f "$DB" ]]; then
  log "ERROR: no existe la base $DB (¿el contenedor arrancó alguna vez?)"
  exit 1
fi

if [[ -z "$(docker ps --filter "name=^${CONTAINER}$" --filter status=running -q)" ]]; then
  log "ERROR: el contenedor $CONTAINER no está corriendo; sin él no se puede hacer el VACUUM INTO."
  exit 1
fi

mkdir -p "$DEST"

# Adentro del contenedor ./data es /data. VACUUM INTO falla si el destino existe:
# se escribe a .part y se renombra, así nunca queda un archivo incompleto con nombre
# de backup válido. Después se abre la copia y se corre integrity_check.
# shellcheck disable=SC2016 # el JS va literal; las rutas entran como argumentos.
INTEGRITY="$(docker exec -w /app "$CONTAINER" node -e '
  const fs = require("node:fs");
  const Database = require("better-sqlite3");
  const [source, tmp, out] = process.argv.slice(1);
  fs.rmSync(tmp, { force: true });
  const db = new Database(source);
  try {
    db.pragma("busy_timeout = 10000");
    db.prepare("VACUUM INTO ?").run(tmp);
  } finally {
    db.close();
  }
  fs.renameSync(tmp, out);
  const copy = new Database(out, { readonly: true });
  try {
    console.log(copy.pragma("integrity_check", { simple: true }));
  } finally {
    copy.close();
  }
' /data/lolvault.db "/data/backups/$DB_NAME.part" "/data/backups/$DB_NAME")"

# Un backup que no se puede abrir no es un backup.
if [[ "$INTEGRITY" != "ok" ]]; then
  log "ERROR: el backup $DB_OUT no pasa integrity_check ($INTEGRITY). Se deja para inspeccionar."
  exit 1
fi

log "base ok: $DB_OUT ($(du -h "$DB_OUT" | cut -f1))"

# Las fotos se empaquetan desde data/ para que el tar contenga la carpeta
# avatars/ y se pueda restaurar directamente con `tar -xzf ... -C data`.
if [[ -d "$AVATARS_DIR" ]]; then
  rm -f "$AVATARS_TMP"
  tar -czf "$AVATARS_TMP" -C "$DATA_DIR" avatars
  mv -f "$AVATARS_TMP" "$AVATARS_OUT"
  log "avatares ok: $AVATARS_OUT ($(du -h "$AVATARS_OUT" | cut -f1))"
else
  log "avatares: $AVATARS_DIR no existe; se saltea el tar"
fi

# Rotación: diarios, pre-migrate y tar de avatares de más de 14 días.
DELETED="$(find "$DEST" -maxdepth 1 -type f \
  \( -name 'lolvault-*.db' -o -name 'pre-migrate-*.db' -o -name 'avatars-*.tar.gz' \) \
  -mtime "+$RETENTION_DAYS" -print -delete | wc -l | tr -d ' ')"

REMAINING="$(find "$DEST" -maxdepth 1 -type f \
  \( -name 'lolvault-*.db' -o -name 'pre-migrate-*.db' -o -name 'avatars-*.tar.gz' \) \
  | wc -l | tr -d ' ')"

log "rotación: $DELETED backup(s) de más de $RETENTION_DAYS días borrados · quedan $REMAINING"
