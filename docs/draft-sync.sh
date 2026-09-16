#!/usr/bin/env bash
#
# Sync diario de los datos de Draft (Lolalytics). Lo dispara el cron del HOST (jpft),
# pero el trabajo lo hace node ADENTRO del contenedor `lolvault`: la base vive ahí y
# el runner no incluye tsx ni src/, por eso la imagen trae `draft-sync/draft-sync.mjs`
# empaquetado con esbuild (ver Dockerfile).
#
# Qué hace: baja matchups y sinergias de los 173 campeones (5.190 requests, ~71 min
# medidos) y los cachea en SQLite. Por defecto respeta la frescura: si la última pasada
# terminó hace menos de 24 h, no sale a la fuente y corta enseguida. Con --force arranca
# igual.
#
# Es reanudable: si se corta a la mitad guarda su cursor y la corrida siguiente retoma
# donde quedó, así que un cron que falle una noche no pierde lo ya bajado.
#
# Instalación (una vez):
#   chmod +x /home/jpft/lolvault/docs/draft-sync.sh
#   crontab -e            # como jpft, NO como root
#   40 5 * * * /home/jpft/lolvault/docs/draft-sync.sh >> /home/jpft/lolvault/data/draft-sync.log 2>&1
#
# Se eligió las 5:40 para que no se pise con el backup de las 4:27: el server tiene 2
# núcleos y conviene no cruzar tareas largas.

set -euo pipefail

# Raíz del proyecto = carpeta padre de este script. Sin rutas hardcodeadas.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER="${LOLVAULT_CONTAINER:-lolvault}"

log() { echo "$(date '+%F %T') [lolvault-draft-sync] $*"; }

if [[ -z "$(docker ps --filter "name=^${CONTAINER}$" --filter status=running -q)" ]]; then
  log "ERROR: el contenedor $CONTAINER no está corriendo; sin él no hay base donde escribir."
  exit 1
fi

log "arrancando (contenedor $CONTAINER, raíz $ROOT)"
if docker exec -w /app "$CONTAINER" node draft-sync/draft-sync.mjs "$@"; then
  log "terminó bien"
else
  code=$?
  log "ERROR: el sync salió con código $code. La próxima corrida retoma donde quedó."
  exit "$code"
fi
