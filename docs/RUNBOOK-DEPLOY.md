# Runbook — deploy, rollback y backups de LolVault

Para seguir a mano, sin ayuda. Todo se ejecuta en el homelab (`ssh jpft@homelab`)
salvo donde diga otra cosa. Los comandos están listos para copiar y pegar.

- **Hostname:** `lolvault.casapipis.net`.
- **Túnel:** `casapipis-tunnel`.
- **Puerto en el host:** `127.0.0.1:3025` → 3000 adentro del contenedor.
- **Servicio y contenedor:** `lolvault`.
- **Ruta en el homelab:** `~/lolvault`.
- **Volumen de Compose:** `./data:/data`.
- **Usuario del contenedor:** `${LOLVAULT_UID:-1000}:${LOLVAULT_GID:-1000}`.
- **Estado persistente:** `~/lolvault/data/`: `lolvault.db` y sus archivos WAL/SHM,
  `backups/` y las fotos de perfil en `avatars/`. Adentro del contenedor, la base es
  `/data/lolvault.db` y las fotos están en `/data/avatars/`.

> **Regla que sostiene todo:** el contenedor bindea a `127.0.0.1`. Si alguna vez ves
> `0.0.0.0:3025` en `ss -ltn`, la app quedó alcanzable desde la LAN sin pasar por
> Cloudflare Access. Pará y arreglalo antes de seguir.

---

## 0. Antes de empezar (verificaciones en el server)

Este runbook se escribió sin ejecutar comandos en el homelab. Antes del primer deploy,
corré todo esto y confirmá los resultados esperados:

```bash
ss -ltn | grep 3025 || echo "3025 libre"       # esperado: "3025 libre"
id jpft                                          # anotar uid y gid; normalmente 1000:1000
df -h                                            # esperado: ningún filesystem necesario cerca del 100%
docker ps                                        # esperado: Docker responde y los stacks actuales están sanos
docker run --rm node:22-bookworm-slim node -e "fetch('https://ddragon.leagueoflegends.com/api/versions.json').then(r=>console.log(r.status))"
                                                  # esperado: 200
```

- **Si 3025 está ocupado:** no levantes LolVault encima. Identificá el proceso con
  `sudo ss -ltnp | grep 3025` y resolvé el conflicto; el compose y el ingress están
  acordados para usar 3025.
- **Si `id jpft` no da uid/gid 1000:** guardá los valores reales en el `.env` como
  `LOLVAULT_UID` y `LOLVAULT_GID` (paso 1.3).
- **Si la prueba de Data Dragon no imprime 200:** arreglá DNS/salida HTTPS de Docker
  antes de desplegar. LolVault necesita internet desde el contenedor para Data Dragon
  y OP.GG.
- El homelab es un i3 de **2 núcleos**. No hagas el build de LolVault al mismo tiempo
  que PipiGym ni que otro stack.

---

## 1. Primer deploy

### 1.1 Traer el repo

El repo ya está en GitHub y es **público** (no tiene secretos: el `.env` y `data/` están
gitignoreados). En el homelab alcanza con clonar por HTTPS, sin credenciales:

```bash
git clone https://github.com/juantubello/lolvault.git ~/lolvault
cd ~/lolvault
```

### 1.2 Carpetas de datos y permisos

```bash
mkdir -p ~/lolvault/data/backups ~/lolvault/data/avatars
chown -R "$(id -u):$(id -g)" ~/lolvault/data
ls -ld ~/lolvault/data ~/lolvault/data/backups ~/lolvault/data/avatars
```

El contenedor corre con `${LOLVAULT_UID:-1000}:${LOLVAULT_GID:-1000}`. Ese usuario
tiene que poder escribir todo `data/`: si no, SQLite falla con `SQLITE_CANTOPEN` y las
fotos de perfil tampoco se guardan.

### 1.3 El `.env` del homelab

`.env` está gitignoreado y vive solo en el server. El team domain
`pipiscats.cloudflareaccess.com` está fijo en el código: **no lleva variable**.

```bash
cd ~/lolvault
cat > .env <<'EOF'
# Se completa en el paso 1.7 con el AUD tag de la app de Access `lolvault`.
LOLVAULT_ACCESS_AUD=
LOLVAULT_PORT=3025

# Web Push (opcionales; ver §2.1). Sin las tres, las notificaciones quedan deshabilitadas.
LOLVAULT_VAPID_PUBLIC_KEY=
LOLVAULT_VAPID_PRIVATE_KEY=
LOLVAULT_VAPID_SUBJECT=

# Solo si `id jpft` NO dio uid/gid 1000:
#LOLVAULT_UID=1001
#LOLVAULT_GID=1001
EOF
chmod 600 .env
```

> **`LOLVAULT_DEV_USER_EMAIL` nunca va en el server.** Es el bypass de autenticación
> de desarrollo. Con `NODE_ENV=production`, LolVault se niega a arrancar si encuentra
> esa variable; el contenedor queda caído a propósito en vez de quedar inseguro.

### 1.4 Build

Antes de **cada** build se guarda la imagen actual como `lolvault:previous`. En el
primer deploy el `docker tag` falla porque todavía no hay imagen, y es normal.

```bash
cd ~/lolvault
docker tag lolvault:latest lolvault:previous 2>/dev/null || true
LOLVAULT_ACCESS_AUD=pendiente docker compose build
```

El AUD provisorio solo permite que Compose evalúe la configuración durante este primer
build; no queda guardado ni sirve para autenticar. El build de Next tarda varios minutos
en el i3 de 2 núcleos. **No buildear en paralelo con PipiGym ni con otro stack.**

### 1.5 Levantar y verificar el bind

Como el `.env` todavía no tiene el AUD real, se usa el mismo valor provisorio para
comprobar el arranque, las migrations y el bind antes de tocar Cloudflare:

```bash
cd ~/lolvault
LOLVAULT_ACCESS_AUD=pendiente docker compose up -d
LOLVAULT_ACCESS_AUD=pendiente docker compose logs -f lolvault   # Ctrl-C para salir
```

En el primer arranque, el log tiene que mostrar al menos este orden:

```text
[lolvault] arrancando · NODE_ENV=production · DATABASE_PATH=/data/lolvault.db
[lolvault] primer arranque: todavía no hay base para respaldar
[migrations aplicadas]
[lolvault] migrations al día, levantando el server en :3000
```

Verificaciones:

```bash
ss -ltnp | grep 3025                            # TIENE que decir 127.0.0.1:3025
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3025/acceso-requerido
                                                  # esperado: 200
LOLVAULT_ACCESS_AUD=pendiente docker compose ps # esperado: Up (healthy)
ls -la ~/lolvault/data                         # lolvault.db, WAL/SHM, backups/, avatars/
```

Desde la Mac u otra máquina de la LAN, esto **tiene que fallar**:

```bash
curl --max-time 5 http://192.168.1.87:3025/    # esperado: Connection refused / timeout
```

Si contesta, el binding está mal. No sigas con el túnel hasta que el puerto escuche
solamente en `127.0.0.1`.

### 1.6 Publicar el hostname en el túnel

```bash
sudo cp /etc/cloudflared/config.yml /etc/cloudflared/config.yml.bak-$(date +%F)
sudo nano /etc/cloudflared/config.yml
```

Agregar esta regla **antes** del catch-all `- service: http_status:404`:

```yaml
  - hostname: lolvault.casapipis.net
    service: http://localhost:3025
```

No agregues `httpHostHeader`: `cloudflared` conserva el `Host` original por default y
Next lo necesita para validar las Server Actions.

```bash
sudo cloudflared tunnel ingress validate
# El warning por originServerName en la regla de casapipis.net es preexistente e
# inofensivo: cloudflared lo ignora.

sudo cloudflared tunnel --origincert /etc/cloudflared/cert.pem \
     route dns casapipis-tunnel lolvault.casapipis.net

sudo systemctl restart cloudflared
sudo systemctl status cloudflared --no-pager | head -15

dig +short lolvault.casapipis.net @1.1.1.1   # IPs de Cloudflare = ya está vivo
```

El resolver local puede cachear el "no existe" durante unos minutos. Si `dig` sin
`@1.1.1.1` todavía no resuelve, esperá y repetí.

### 1.7 App de Cloudflare Access + AUD tag

En el dashboard de Zero Trust (`one.dash.cloudflare.com`, team `pipiscats`):

1. **Access → Applications → Add an application → Self-hosted.**
2. **Application name:** `lolvault`.
3. **Session Duration:** `1 month`.
4. **Public hostname:** subdominio `lolvault`, dominio `casapipis.net`, path vacío.
5. **Identity provider:** One-time PIN por email, **y solo ese**. La app re-vincula cuentas por
   email si cambia el `sub` de Access; eso es seguro únicamente con proveedores que verifican el
   email. No agregues un OIDC/SAML genérico a esta app.
6. **Policy:** nombre `Amigos LolVault`, Action `Allow`, Include → `Emails` → cargar
   los emails de todos los amigos autorizados. Los emails reales viven solamente en
   Access: no se copian al repo, al runbook ni al `.env`.
7. Guardar.

8. **Archivos públicos de la PWA (recomendado):** creá una segunda Self-hosted Application
   `lolvault-public`, mismo hostname, con estos paths y una policy con Action **Bypass**,
   Include → `Everyone`:
   `manifest.webmanifest`, `icons/*`, `brand/*`, `icon.png`, `apple-icon.png`.
   Son solo el manifest y los íconos (no hay datos). iOS y Android los piden al instalar la app
   y, si Access los redirige al login, el ícono puede quedar genérico o "Agregar a inicio" abre
   una pestaña de Safari en vez de la app. La app igual pide el manifest con credenciales, así
   que esto es un refuerzo.

Verificación desde cualquier máquina (sin login):

```bash
curl -sI https://lolvault.casapipis.net/manifest.webmanifest | head -3   # con Bypass: 200 y application/manifest+json
curl -sI https://lolvault.casapipis.net/ | head -3                       # sin login: 302 a pipiscats.cloudflareaccess.com
```

En el iPhone: Safari → Compartir → **Agregar a inicio** y abrir desde el ícono: **no** tiene que
verse la barra de Safari. Si se ve, la app no se instaló como PWA y no va a poder activar push.

Entrá a la app recién creada → **Overview** → *Application Audience (AUD) Tag* y copiá
la cadena. LolVault valida el JWT contra el team domain fijo y contra este AUD específico;
sin el valor correcto no autentica a nadie.

```bash
cd ~/lolvault
nano .env                  # LOLVAULT_ACCESS_AUD=<AUD tag de la app lolvault>
docker compose up -d --force-recreate
docker compose logs --tail 40 lolvault
```

Comprobá que no se filtró el bypass de desarrollo:

```bash
docker compose config | grep -i LOLVAULT_DEV_USER_EMAIL || echo "ok: bypass dev ausente"
```

### 1.8 Prueba final

1. En la Mac, abrir `https://lolvault.casapipis.net` → login de Cloudflare →
   onboarding o inicio de LolVault.
2. En el iPhone, abrir el hostname en Safari → Compartir → **Agregar a inicio**. Abrir
   desde el ícono y completar el login una vez.
3. Crear o editar un perfil con foto y comprobar que aparece un JPEG en
   `~/lolvault/data/avatars/`.
4. `docker compose ps` debe mostrar `Up (healthy)`.
5. Instalar y probar el backup diario del §5.

---

## 2. HTTPS, mismo origen y `/api`

Cloudflare termina HTTPS en el borde; el túnel habla HTTP solamente con
`http://localhost:3025`. Eso no produce mixed content: LolVault no tiene un backend
separado ni usa URLs absolutas. Las Server Actions, `/avatars/<id>`, el manifest y los
íconos son del mismo origen y usan rutas relativas, así que no hacen falta nginx ni
`NEXT_PUBLIC_API_BASE_URL`.

Es distinto de `finance`, que tiene frontend y backend .NET detrás de nginx y enruta
`/api` al backend. En LolVault no hay un `/api` separado para configurar. Las únicas
llamadas salientes relevantes, a OP.GG y Data Dragon, salen del servidor por HTTPS y
requieren internet desde el contenedor.

Si vence la sesión de Access, una Server Action puede recibir el HTML del login de
Cloudflare en vez de la respuesta esperada. Recargá la PWA o la página y volvé a entrar.

### 2.1 Notificaciones push

Las claves VAPID se generan **una sola vez**. Desde un checkout con dependencias instaladas:

```bash
npm run vapid:generate
```

También se pueden generar con la imagen ya construida en el homelab:

```bash
docker compose run --rm lolvault node -e "const w=require('web-push');const k=w.generateVAPIDKeys();console.log('LOLVAULT_VAPID_PUBLIC_KEY='+k.publicKey);console.log('LOLVAULT_VAPID_PRIVATE_KEY='+k.privateKey)"
```

Copiá el par al `.env`, elegí un mail de contacto para el subject y recreá el contenedor:

```dotenv
LOLVAULT_VAPID_PUBLIC_KEY=<public key>
LOLVAULT_VAPID_PRIVATE_KEY=<private key>
LOLVAULT_VAPID_SUBJECT=mailto:tu-email@example.com
```

```bash
docker compose up -d --force-recreate
```

No rotes esas claves en un deploy normal: cambiar el par invalida todas las suscripciones y
cada amigo tendría que activar el dispositivo de nuevo. Si falta cualquiera de las tres
variables, LolVault sigue funcionando y Perfil muestra que push está deshabilitado.

Requisitos operativos:

- El contenedor necesita salida HTTPS hacia los servicios Web Push de Apple y Google, además
  de la salida que ya usa para OP.GG y Data Dragon.
- En iPhone se necesita iOS 16.4 o posterior y LolVault instalada con Safari → Compartir →
  Agregar a inicio. El permiso se pide desde Perfil al tocar “Activar en este dispositivo”.
- En macOS/Chrome se puede probar en `localhost`; en producción el origen público debe seguir
  servido por HTTPS.
- Después de activar, usá “Enviar prueba” en Perfil. Un endpoint que responda 404/410 se elimina
  automáticamente; otros errores quedan registrados en `failure_count` para diagnóstico.

---

## 3. Deploy de una versión nueva

```bash
cd ~/lolvault
bash ./docs/backup-lolvault.sh                   # red para base y avatares
docker tag lolvault:latest lolvault:previous     # SIEMPRE antes del build
git pull
docker compose build                             # varios minutos; nada pesado en paralelo
docker compose up -d
docker compose logs --tail 50 lolvault
docker compose ps
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3025/acceso-requerido
docker image prune -f --filter label=app=lolvault   # ver 3.1
```

El contenedor, al arrancar, hace **backup pre-migrate de la base → migrations →
server**, en ese orden. Si las migrations fallan, el server no levanta. Las fotos no
se modifican durante las migrations y quedan en el mismo volumen persistente.

### 3.1 La limpieza del final

Cada `docker compose build` deja atrás la imagen anterior **sin tag**. Son ~130 MB
propios cada una (los otros 227 MB son la base `node:22-bookworm-slim`, compartida).
Medido el 2026-09-17: diez huérfanas acumuladas en 37 horas de trabajo, ~1,3 GB.

La última línea las borra. Es segura por dos motivos, y conviene entender los dos:

1. **`prune` sin `-a` sólo toca imágenes sin tag.** `lolvault:latest` y
   `lolvault:previous` tienen tag, así que el rollback de §4.1 sobrevive intacto.
2. **`--filter label=app=lolvault` la acota a esta app.** La etiqueta la pone el
   Dockerfile. Sin ese filtro, el comando limpiaría también las huérfanas de finance,
   camireads y series tracker — que probablemente convenga limpiar, pero es una
   decisión aparte y no la tiene que tomar un deploy de LolVault.

El orden importa: la limpieza va **después** de `up -d`, cuando la imagen nueva ya está
tagueada como `latest` y la vieja como `previous`. Corrido ahí, siempre queda
exactamente un rollback disponible.

> Las imágenes construidas **antes** del 2026-09-17 no tienen la etiqueta, así que el
> filtro no las alcanza. Para barrer esas, una única vez: `docker image prune -f` sin
> filtro (sigue sin tocar nada tagueado).

### 3.2 La caché de build (aparte, y más gorda)

La caché de BuildKit no la toca `image prune` y crece más rápido que las imágenes: el
2026-09-17 eran **6,1 GB**, con entradas de hasta 12 meses de antigüedad de proyectos
que no se rebuildean hace meses.

No conviene vaciarla entera: es lo que hace que un build incremental tarde minutos en
vez de arrancar de cero. Esto tira lo que no se usó en una semana, que en la práctica
es de los otros stacks:

```bash
docker builder prune -f --filter until=168h
```

Va cuando se acuerde, no en cada deploy. Para ver cuánto hay antes de decidir:
`docker system df` — la columna RECLAIMABLE.

> **Nunca `docker system prune -a`**: se lleva imágenes *con* tag que no tengan un
> contenedor corriendo, o sea `lolvault:previous` y las de cualquier stack apagado.
> **Y nunca `docker volume prune`**: en el homelab hay volúmenes con 0 LINKS que son
> bases de datos de otros proyectos (`app_db_data`, `finance_db_data`). El espacio que
> se recupera no compensa.

---

## 4. Rollback

### 4.1 Volver a la imagen anterior (lo más rápido)

```bash
cd ~/lolvault
docker tag lolvault:previous lolvault:latest
docker compose up -d --force-recreate --no-build
docker compose logs --tail 50 lolvault
docker compose ps
```

Volver la imagen **no deshace las migrations**. Si el deploy nuevo cambió el schema y
la versión vieja no lo entiende, restaurá también la base con el `pre-migrate-*.db`
creado durante ese arranque (§4.3).

### 4.2 Volver a un commit anterior

Usalo si no sirve la imagen `previous` o si necesitás una versión puntual:

```bash
cd ~/lolvault
git log --oneline -10
git switch --detach <sha>
docker tag lolvault:latest lolvault:previous     # respaldo de la imagen antes del build
docker compose build
docker compose up -d
docker compose logs --tail 50 lolvault
```

Para volver a la rama en la que estabas después: `git switch - && git pull`.

### 4.3 Restaurar la base

Se hace **con el contenedor frenado**. Los archivos `-wal` y `-shm` pertenecen a la base
anterior: hay que apartarlos para que SQLite no mezcle estados.

```bash
cd ~/lolvault
docker compose stop
ls -la data/backups/                                  # elegir el backup

mv data/lolvault.db data/lolvault.db.roto-$(date +%F-%H%M)
mv data/lolvault.db-wal data/lolvault.db-wal.roto-$(date +%F-%H%M) 2>/dev/null || true
mv data/lolvault.db-shm data/lolvault.db-shm.roto-$(date +%F-%H%M) 2>/dev/null || true
cp data/backups/lolvault-2026-09-15.db data/lolvault.db   # <-- elegir el archivo real
chown "$(id -u):$(id -g)" data/lolvault.db

docker compose start
docker compose logs --tail 50 lolvault                 # aplica migrations faltantes
docker compose exec -T lolvault node -e "const D=require('better-sqlite3');const d=new D('/data/lolvault.db',{readonly:true});console.log(d.pragma('integrity_check',{simple:true}))"   # esperado: ok
```

Un backup `pre-migrate-*.db` se restaura exactamente igual: cambia solo la ruta del
archivo en el `cp`.

### 4.4 Restaurar las fotos de perfil

Esto es independiente de la base. Elegí el tar de la fecha que corresponda y conservá
la carpeta actual por las dudas:

```bash
cd ~/lolvault
docker compose stop
mv data/avatars data/avatars.roto-$(date +%F-%H%M)
tar -xzf data/backups/avatars-2026-09-15.tar.gz -C data   # <-- elegir el archivo real
chown -R "$(id -u):$(id -g)" data/avatars
docker compose start
```

---

## 5. Backups

- **Script:** `~/lolvault/docs/backup-lolvault.sh`; corre en el host como `jpft`, no
  adentro del contenedor.
- **Base:** crea `data/backups/lolvault-YYYY-MM-DD.db` con `VACUUM INTO` y valida la
  copia con `PRAGMA integrity_check`.
- **Fotos:** si existe `data/avatars/`, crea
  `data/backups/avatars-YYYY-MM-DD.tar.gz` con `tar -czf`.
- **Retención:** 14 días para los backups diarios, los `pre-migrate-*.db` que crea el
  arranque del contenedor y los tar de avatares.
- **Por qué no copiar el `.db`:** la base corre en WAL; parte de los datos confirmados
  puede estar en `lolvault.db-wal`. `VACUUM INTO` escribe una copia consistente y
  compactada sin frenar el contenedor.

Instalación del cron, una sola vez:

```bash
chmod +x ~/lolvault/docs/backup-lolvault.sh
crontab -e                           # como jpft, NO como root
```

```cron
27 4 * * * /home/jpft/lolvault/docs/backup-lolvault.sh >> /home/jpft/lolvault/data/backups/backup.log 2>&1
```

Verificarlo sin esperar al cron:

```bash
bash ~/lolvault/docs/backup-lolvault.sh
ls -la ~/lolvault/data/backups/
tail -5 ~/lolvault/data/backups/backup.log
```

> Los backups viven en el mismo disco que la base: cubren errores humanos y migrations
> fallidas, no la muerte del NVMe. Para cubrir eso hace falta copiar periódicamente
> `data/backups/` a otro equipo o disco.

---

## 6. Troubleshooting

| Síntoma | Causa | Arreglo |
|---|---|---|
| El contenedor sale con código 1 y el log dice que `LOLVAULT_DEV_USER_EMAIL` está seteada con `NODE_ENV=production` | Se filtró el bypass de desarrollo al server. La app se niega a arrancar a propósito. | Sacar la variable. `docker compose config \| grep -i LOLVAULT_DEV` no debe devolver nada. Revisar `.env` y el `environment:` efectivo; después `docker compose up -d --force-recreate`. |
| `falta LOLVAULT_ACCESS_AUD en el .env` al ejecutar Compose, o nadie puede autenticarse | El AUD está vacío o no corresponde a la app de Access `lolvault`. | Copiar *Application Audience (AUD) Tag* desde Access → `lolvault` → Overview al `.env` y recrear el contenedor. |
| El contenedor reinicia en loop; aparece `SQLITE_CANTOPEN` o `attempt to write a readonly database` | El uid/gid del contenedor no puede escribir `data/`. | Comparar `id jpft`, `ls -ld data data/backups data/avatars` y el `.env`. Corregir ownership o `LOLVAULT_UID`/`LOLVAULT_GID`; recrear. |
| La foto de perfil no se guarda | `data/avatars/` no existe o no es escribible por el uid/gid del contenedor. | `mkdir -p data/avatars && chown -R "$(id -u):$(id -g)" data/avatars`; después reintentar. |
| OP.GG no responde, bloquea o rate-limita | Es una dependencia externa no oficial. | No es una caída de LolVault: la app muestra los datos cacheados con un aviso. Esperar el próximo refresco; revisar salida HTTPS si persiste. |
| Data Dragon no carga versiones o campeones | El contenedor no tiene DNS o salida HTTPS. | Repetir la prueba del paso 0 y revisar la red de Docker. |
| Los íconos PWA viejos siguen apareciendo en el iPhone | iOS conserva los assets de la PWA instalada. | Borrar el acceso de la pantalla de inicio y volver a instalarlo desde Safari. |
| Una Server Action falla con `Invalid Server Actions request` | El `Host` que recibe Next no coincide con el origen. | El túnel conserva `Host` por default. No configurar `httpHostHeader` en el ingress; quitarlo si alguien lo agregó y reiniciar `cloudflared`. |
| Una Server Action recibe HTML del login o falla después de un tiempo | Venció la sesión de Cloudflare Access. | Recargar la PWA/página y volver a autenticarse. |
| `502 Bad Gateway` en el hostname público | El contenedor está caído o el ingress apunta a otro puerto. | `docker compose ps`, `ss -ltn \| grep 3025` y `sudo systemctl status cloudflared`. El servicio debe ser `http://localhost:3025`. |
| El hostname no resuelve | Falta `route dns` o el resolver local cacheó NXDOMAIN. | `dig +short lolvault.casapipis.net @1.1.1.1`. Si ahí resuelve, esperar el TTL local. |
| El PWA pide login demasiado seguido | La app de Access tiene una sesión más corta. | Zero Trust → Access → `lolvault` → Session Duration = **1 month**. |
| El build tarda mucho o el homelab se pone lento | El i3 tiene 2 núcleos y el build de Next es pesado. | No buildear en paralelo con PipiGym ni con otro stack. |
| `port is already allocated` al levantar | Otro proceso tomó 3025. | `sudo ss -ltnp \| grep 3025`; resolver el conflicto antes de seguir. |
| Cambió `.env` pero la app sigue usando el valor anterior | `up -d` no siempre recrea por un cambio de entorno. | `docker compose up -d --force-recreate`. |
| Perfil dice que push está deshabilitado | Falta una variable VAPID o tiene un formato inválido. | Revisar las tres variables del §2.1 con `docker compose config` y recrear el contenedor. No generar un par nuevo si ya existe uno en uso. |
| La prueba push falla en todos los dispositivos | El contenedor no llega al servicio push, el permiso fue revocado o el endpoint venció. | Revisar salida HTTPS de Docker, permisos del navegador y logs `[push]`. Los endpoints 404/410 se limpian solos y deben activarse otra vez. |

### Comandos de diagnóstico

```bash
cd ~/lolvault
docker compose ps
docker compose logs --tail 100 lolvault
docker compose config
docker compose exec lolvault env | sort | grep -Ev '^(PATH|HOSTNAME=)'
ss -ltnp | grep 3025
sudo journalctl -u cloudflared -n 50 --no-pager
```

---

## 7. Pendiente de verificar en el server

El paso 0 queda como checklist operativo del primer deploy:

- [ ] **3025 libre** y reservado para LolVault.
- [ ] **uid/gid de `jpft`** reflejados en los defaults o en `.env`.
- [ ] **Espacio en disco** suficiente.
- [ ] **Docker** sano y sin builds pesados concurrentes.
- [ ] **Sin `sqlite3` en el host:** el backup usa el SQLite del contenedor (tiene que estar corriendo).
- [ ] **Salida HTTPS desde Docker** hacia Data Dragon; OP.GG usa la misma salida.

## 6. Sync de datos de Draft (Lolalytics)

- **Script:** `~/lolvault/docs/draft-sync.sh`; corre en el host como `jpft` y hace el trabajo
  con `docker exec` adentro del contenedor, igual que el backup.
- **Por qué adentro del contenedor:** la base vive ahí, y el runner **no incluye `tsx` ni
  `src/`**. Por eso la imagen trae `draft-sync/draft-sync.mjs`, empaquetado con esbuild en el
  stage `builder` igual que el migrador (ver `Dockerfile`).
- **Qué baja:** matchups y sinergias de los 173 campeones para la ventana móvil de 30 días.
  Son **5.190 requests y ~71 minutos medidos**, con 500 ms de espera entre uno y otro.
- **Frescura:** por defecto no sale a la fuente si la última pasada completa terminó hace menos
  de 24 h. Para forzarla: `docs/draft-sync.sh --force`.
- **Reanudable:** guarda el cursor en `draft_sync_runs`. Si se corta (deadline de 2 h, caída de
  red, reinicio del contenedor), la corrida siguiente retoma donde quedó y **nunca borra** lo ya
  bajado.
- **Si Lolalytics nos bloquea:** el draft sigue andando con lo último cacheado y la app muestra
  de cuándo son los datos. No hay que hacer nada urgente.

Instalación del cron, una sola vez:

```bash
chmod +x ~/lolvault/docs/draft-sync.sh
crontab -e                           # como jpft, NO como root
```

```cron
40 5 * * * /home/jpft/lolvault/docs/draft-sync.sh >> /home/jpft/lolvault/data/draft-sync.log 2>&1
```

A las 5:40 para no cruzarse con el backup de las 4:27: el server tiene 2 núcleos y conviene no
superponer tareas largas.

Verificarlo sin esperar al cron (ojo: son ~71 minutos):

```bash
~/lolvault/docs/draft-sync.sh --force
```

Ver cómo viene sin entrar al contenedor:

```bash
tail -f ~/lolvault/data/draft-sync.log
```
