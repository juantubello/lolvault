#!/usr/bin/env bash
#
# Backup diario de LolVault. Corre en el HOST (cron de jpft), no adentro del
# contenedor, y no hace falta frenar nada.
#
# Por qué VACUUM INTO y no `cp lolvault.db backup.db`:
# la base corre en WAL, así que en cualquier momento parte de los datos
# confirmados está en lolvault.db-wal y no en lolvault.db. Copiar el archivo
# suelto con el contenedor escribiendo puede dejar un backup viejo o corrupto.
# VACUUM INTO le pide a SQLite que escriba una copia consistente y compactada,
# tomando el lock que corresponda, sin frenar al contenedor.
#
# Las fotos de perfil no viven en SQLite: si existe data/avatars/, también se
# guarda un tar.gz de esa carpeta.
#
# Instalación (una vez):
#   sudo apt install -y sqlite3
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

STAMP="$(date +%F)"
DB_OUT="$DEST/lolvault-$STAMP.db"
DB_TMP="$DB_OUT.part"
AVATARS_OUT="$DEST/avatars-$STAMP.tar.gz"
AVATARS_TMP="$AVATARS_OUT.part"

log() { echo "$(date '+%F %T') [lolvault-backup] $*"; }

cleanup() {
  rm -f "$DB_TMP" "$AVATARS_TMP"
}
trap cleanup EXIT

if ! command -v sqlite3 >/dev/null 2>&1; then
  log "ERROR: falta el cliente sqlite3 en el host. Instalarlo: sudo apt install -y sqlite3"
  exit 1
fi

if [[ ! -f "$DB" ]]; then
  log "ERROR: no existe la base $DB (¿el contenedor arrancó alguna vez?)"
  exit 1
fi

mkdir -p "$DEST"

# VACUUM INTO falla si el destino existe. Se escribe a .part y se renombra, así
# el backup del día se puede rehacer y nunca queda un archivo incompleto con
# nombre de backup válido.
rm -f "$DB_TMP"
# .timeout evita fallar enseguida si el contenedor tiene la base tomada.
sqlite3 "$DB" ".timeout 10000" "VACUUM INTO '$DB_TMP';"
mv -f "$DB_TMP" "$DB_OUT"

# Un backup que no se puede abrir no es un backup.
INTEGRITY="$(sqlite3 "$DB_OUT" 'PRAGMA integrity_check;' | head -1)"
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
