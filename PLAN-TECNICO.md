# LolVault — Plan técnico

> **Fuente de verdad del proyecto.** Si algo de acá cambia, se cambia acá primero.
> Todas las decisiones de reglas están confirmadas por Juan (2026-09-14).

## 0. Qué es

App privada para un grupo de **~5-6 amigos** que juegan League of Legends juntos.
Cuando alguien juega mal con un campeón, cualquiera del grupo propone un **vault**: ese
jugador no puede usar ese campeón **desde / hasta** las fechas propuestas. El vault se
aplica si llega a **3 votos a favor**, y se puede **levantar** antes con otra votación de 3.

- **PWA mobile-first estilo iOS clásico**, instalable en el iPhone, y **responsive a desktop**.
- Corre en el homelab, publicada por el Cloudflare Tunnel existente, detrás de **Cloudflare
  Access** con los emails de los amigos (ver `../CLAUDE.md` → Cloudflare).
- Sin login propio: la identidad es el email que valida Access. La primera vez que alguien
  entra, completa su **perfil** (nombre + Riot ID).

## 1. Stack

**Next.js (App Router) · TypeScript · Tailwind · SQLite + Drizzle (`better-sqlite3`) · PWA ·
Docker.** Un solo proyecto, un solo contenedor. Es el mismo stack que PipiGym.

Por qué es lo mejor para "PWA + desktop" en este caso:
- **Una sola base de código y URL** para iPhone y desktop. El layout se adapta por breakpoint
  (tab bar en el teléfono, sidebar en desktop), sin apps separadas.
- **La API key de Riot tiene que quedar en el servidor.** Next resuelve front y backend en el
  mismo contenedor, sin armar una API aparte.
- **Reutilizamos lo que ya funciona en PipiGym**: validación del JWT de Access, identidad,
  Dockerfile multi-stage, migrations, backup y runbook de deploy. Copiar esos módulos, **no
  importarlos** (son proyectos separados).
- El volumen de datos es mínimo (6 usuarios, algunas decenas de vaults), así que SQLite sobra.

**Offline:** no hace falta offline-first. Votar y proponer requieren red. El service worker
cachea solo el shell y los assets estáticos, y **nunca** la respuesta de login de Access.

## 2. Datos de League of Legends

### 2.1 Campeones: Data Dragon (sin API key)

- Versiones: `https://ddragon.leagueoflegends.com/api/versions.json` (la primera es la
  última; hoy `16.18.1`).
- Lista: `https://ddragon.leagueoflegends.com/cdn/{version}/data/es_AR/champion.json`.
  Viene `data` con un objeto por campeón, con `id` ("Ahri"), `key` ("103"), `name`,
  `title` e `image.full` ("Ahri.png"). Hoy son **171 campeones**.
- Foto (cuadrada, 120px): `https://ddragon.leagueoflegends.com/cdn/{version}/img/champion/{image.full}`.
- **Decisión:** sincronizar a una tabla `champions` al arrancar el contenedor y como máximo una
  vez por día (si cambió la versión). La app nunca depende de Data Dragon en cada request.
  Imágenes con `next/image` y `remotePatterns` limitado a `ddragon.leagueoflegends.com`.

> Investigación completa de fuentes (URLs verificadas, keys, alternativas):
> [`docs/APIS-LOL.md`](./docs/APIS-LOL.md).
>
> **Decisión (2026-09-15): historial de partidas vía OP.GG MCP, sin key**, detrás de la interfaz
> `MatchProvider` (`src/features/matches/types.ts`) y con **caché en la base**
> (`player_matches`, `match_details`, `player_stats_sync`): refresco cada 10 min por jugador,
> 5 min de espera tras un error, y si OP.GG falla o nos bloquea se muestra lo guardado. La foto
> de una partida adjunta se guarda con la propuesta. Cuando llegue la Personal API Key de Riot
> se cambia la implementación en `features/matches/provider.ts` sin tocar la UI.

### 2.2 Última partida de cada uno: Riot API (fase SHOULD)

- Flujo: Riot ID (`gameName#tagLine`) → **account-v1** → `puuid` → **match-v5**
  (`/matches/by-puuid/{puuid}/ids`, después `/matches/{id}`).
- Routing: cuentas de Argentina → plataforma **LAS (`la2`)**, región regional **`americas`**.
  ✅ Confirmado: todos juegan en LAS.
- **Los nombres cambian, el `puuid` no.** El Riot ID se guarda separado (`riot_game_name` +
  `riot_tag_line`) y **se edita desde Perfil**, porque los amigos se cambian el nombre seguido.
  La cuenta de Riot se identifica por `riot_puuid`: si alguien cambia su Riot ID, se descarta
  el `puuid` y se vuelve a resolver con account-v1 (si es la misma cuenta renombrada, Riot
  devuelve el mismo). Las diferencias de mayúsculas no cuentan como cambio. Vaults y votos
  apuntan a `users.id`, así que un cambio de nombre no pierde nada.
- **SHOULD:** con el `puuid` resuelto, refrescar solo el nombre con
  `account-v1 /accounts/by-puuid/{puuid}`, así se actualiza aunque nadie lo edite.
- **Key:** registrar un producto **Personal API Key** en developer.riotgames.com. Riot la
  contempla para comunidades privadas chicas, no vence y tiene el mismo límite que la key de
  desarrollo (20 req/s y 100 req/2 min). La de desarrollo no sirve porque vence cada 24 h.
  Está prohibido usar una personal key en una app pública, y esta no lo es porque la cierra
  Access.
- La key vive en `.env` del homelab (`RIOT_API_KEY`) y **solo se usa del lado servidor**.
- Cachear las partidas en la DB (`riot_matches`). Con 6 jugadores, pedir a demanda con TTL de
  unos minutos queda muy lejos del rate limit.
- **Idea LATER:** marcar como "violación" una partida donde alguien jugó un campeón que tenía
  vaulteado. Los datos de match-v5 ya lo permiten.
- Poner el aviso legal que exige Riot para proyectos con sus datos (en Ajustes/Acerca de).

## 3. Reglas del vault

| Regla | Decisión |
|---|---|
| Qué bloquea | **Un campeón para un jugador** (el que jugó mal). El resto del grupo lo puede seguir usando. ✅ confirmado |
| Fechas | Se proponen **desde** y **hasta** (fechas calendario en hora argentina, "hasta" inclusivo). Desde hoy hasta +30 días, duración máxima 30 días. No se editan. ✅ confirmado |
| Aprobación | `yes >= VAULT_APPROVALS_REQUIRED` (**3**). Constante en `src/config.ts`, no repartida por el código. |
| Quién vota | Cualquier miembro, **menos el acusado**. ✅ confirmado |
| El que propone | Su propuesta **cuenta como voto a favor** automático (se inserta en `vault_votes` al crear), **salvo que se esté autovaulteando**. ✅ confirmado |
| Autovault | **Permitido.** Sin voto automático: hacen falta 3 votos de los demás. ✅ confirmado |
| Voto en contra | Existe. Si ya no es matemáticamente posible llegar a 3 votos a favor, la propuesta queda **rechazada**. |
| Cambiar voto | Se puede mientras la propuesta esté abierta. |
| Ventana de votación | **48 h** desde la creación, o antes si el vault ya habría terminado (`closes_at = min(created + 48 h, ends_at)`). Si pasa sin llegar a 3, queda **vencida**. ✅ confirmado |
| Inicio del vault | Arranca en "desde", o **al aprobarse** si eso pasa después. Termina siempre en "hasta". ✅ confirmado |
| Duplicados | Una sola propuesta abierta y un solo vault activo por (jugador, campeón). |
| Cancelar | Solo el que propone, y solo mientras está abierta. Sin votación. |
| **Levantar un vault** | Un vault vigente (programado o activo) se puede **levantar antes de tiempo** con otra votación (`kind = 'lift'`) con las mismas reglas: 3 a favor, 48 h, el vaulteado no vota, quien lo pide suma su voto salvo que sea el vaulteado. Una sola abierta por vault. Al aprobarse se setea `lifted_at` en el vault. ✅ confirmado |

**Los estados se derivan de timestamps, nunca de un cron** (`features/vaults/vault-rules.ts`).
"Vencida" es `now >= closes_at` sin aprobación. "Vault activo" es aprobado, no levantado y
`max(starts_at, approved_at) <= now < ends_at`. Así no
queda nada colgado si el contenedor se reinicia (misma idea que la regla 5 de PipiGym).

**Votar es transaccional:** insertar/actualizar el voto y recalcular el estado en la misma
transacción, para que dos votos simultáneos no aprueben dos veces ni pisen `approved_at`.

## 4. Schema (MVP)

```
users
  id                 INTEGER PK
  external_identity  TEXT UNIQUE NOT NULL   -- claim `sub` de Access (o "dev:<email>")
  email              TEXT NOT NULL          -- mutable, display
  display_name       TEXT                   -- null hasta completar el perfil
  riot_game_name     TEXT
  riot_tag_line      TEXT
  riot_puuid         TEXT                   -- se resuelve con account-v1 (SHOULD)
  avatar_champion_id TEXT REFERENCES champions(id)
  avatar_updated_at  INTEGER                -- foto en <dir de la DB>/avatars/<id>.jpg; versiona la URL
  created_at         INTEGER NOT NULL

champions                                     -- espejo de Data Dragon
  id          TEXT PK        -- "Ahri"
  key         INTEGER UNIQUE -- 103
  name        TEXT NOT NULL
  title       TEXT NOT NULL
  image_file  TEXT NOT NULL  -- "Ahri.png"
  version     TEXT NOT NULL

vault_proposals                               -- votaciones: vaultear ('vault') o levantar ('lift')
  id               INTEGER PK
  kind             TEXT NOT NULL DEFAULT 'vault' CHECK (kind IN ('vault','lift'))
  vault_id         INTEGER REFERENCES vault_proposals(id)  -- solo 'lift'
  target_user_id   INTEGER NOT NULL REFERENCES users(id)
  proposer_user_id INTEGER NOT NULL REFERENCES users(id)   -- puede ser = target (autovault)
  champion_id      TEXT    NOT NULL REFERENCES champions(id)
  starts_at        INTEGER          -- solo 'vault': 00:00 AR de "desde"
  ends_at          INTEGER          -- solo 'vault': 00:00 AR del día siguiente a "hasta" (exclusivo)
  reason           TEXT
  created_at       INTEGER NOT NULL
  closes_at        INTEGER NOT NULL -- min(created_at + 48 h, ends_at del vault)
  approved_at      INTEGER
  rejected_at      INTEGER          -- se setea en el voto que hace imposible llegar a 3
  cancelled_at     INTEGER
  lifted_at        INTEGER          -- solo 'vault': lo levantó un 'lift' aprobado
  CHECK de forma: 'vault' ⇒ vault_id NULL, starts_at/ends_at NOT NULL y ends_at > starts_at
                  'lift'  ⇒ vault_id NOT NULL, sin fechas, lifted_at NULL
  INDEX (target_user_id, champion_id) · INDEX (vault_id)

vault_votes
  proposal_id   INTEGER NOT NULL REFERENCES vault_proposals(id) ON DELETE CASCADE
  voter_user_id INTEGER NOT NULL REFERENCES users(id)
  value         TEXT NOT NULL CHECK (value IN ('yes','no'))
  voted_at      INTEGER NOT NULL
  PRIMARY KEY (proposal_id, voter_user_id)
```

Timestamps en unix-ms UTC. Se muestran en `America/Argentina/Buenos_Aires`.
Pragmas: `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`.

## 5. Autenticación y perfiles

- **Cloudflare Access**: app `lolvault` para `lolvault.casapipis.net`, con policy de **emails
  explícitos** de los amigos (One-time PIN por mail, así que sirve cualquier email).
  **Duración de sesión larga** (por ejemplo 1 mes), porque en un PWA instalado un login a cada
  rato es insoportable.
- Validar `Cf-Access-Jwt-Assertion` con `jose` contra el JWKS de
  `pipiscats.cloudflareaccess.com`, chequeando `iss` y el **`aud` de la app `lolvault`**.
  Copiar el módulo de PipiGym (`src/auth/access-jwt.ts`, `current-user.ts`, `dev-identity.ts`).
- **Primer ingreso:** si no hay `users` con ese `sub`, se crea. Si no tiene `display_name`, se
  redirige a **onboarding**: nombre, Riot ID (opcional al principio) y campeón de avatar.
- **Los emails de los amigos no van en el código.** Viven en la policy de Access.
- Detectar "Access vencido": si una llamada no devuelve JSON o redirige a
  `*.cloudflareaccess.com`, mostrar un banner "Tu sesión venció, recargá" en vez de romper.

## 6. Pantallas y navegación (iOS clásico)

Navegación adaptativa: **tab bar abajo en teléfono** y **sidebar estilo iPadOS en ≥1024px**.
Son 4 destinos de primer nivel (la regla pide ≤5):

| Tab | Contenido |
|---|---|
| **Votaciones** | **"Te falta votar" primero** (con badge en la tab), después "En votación" y "Resueltas". Contador `2/3`, tiempo restante, A favor / En contra, cancelar. Botón **+ Proponer** junto al título. |
| **Vaults** | Filtros en la URL: fila de jugadores con foto, **Vigentes · Por expirar · Terminados · Todos** y búsqueda por campeón. "Por expirar" = vigentes que terminan hoy o mañana (`VAULT_EXPIRING_DAYS`). Con "Todos" agrupa por jugador. Vigentes con **"Pedir que se levante"**. |
| **Amigos** | Lista de perfiles. En el detalle: vaults activos, historial y (SHOULD) última partida. |
| **Perfil** | Mi perfil con **foto**, **editar foto, nombre y Riot ID** (`/perfil/editar`), aviso legal de Riot. |

**Foto de perfil:** se elige en el teléfono, se recorta al centro y se achica a JPEG 256×256 en
el cliente (canvas, sin librerías en el server). Server Action valida sesión, firma JPEG y 512 KB;
escribe atómico en `/data/avatars/<id>.jpg`. `/avatars/<id>?v=<avatar_updated_at>` la sirve solo a
miembros, con caché `immutable` (una foto nueva es otra URL).

**Proponer vault** abre un sheet (`<dialog>`): jugador → campeón (grilla con búsqueda sin tildes) →
desde / hasta → motivo (obligatorio, 280) → confirmar. En desktop, modal centrado.
**Aviso de votación pendiente:** hoy dentro de la app (sección primero + badge). **Push** queda
para cuando esté en el homelab con HTTPS (SHOULD).

Design system: [`design-system/lolvault/MASTER.md`](./design-system/lolvault/MASTER.md).

## 7. Estructura

```
lolvault/
  Dockerfile  docker-compose.yml  drizzle.config.ts  next.config.ts
  design-system/lolvault/MASTER.md
  src/
    app/
      (app)/
        page.tsx                 # Votaciones
        vaults/  amigos/[id]/  perfil/
        proponer/                # sheet/modal
      onboarding/
      manifest.ts
    auth/        access-jwt.ts  current-user.ts  dev-identity.ts
    config.ts    # VAULT_APPROVALS_REQUIRED, VOTING_WINDOW_MS, límites de days
    db/          schema.ts  client.ts  migrations/
    features/
      champions/ ddragon-sync.ts  champions.queries.ts
      vaults/    vaults.queries.ts  vaults.actions.ts  vault-status.ts  # status derivado, puro y testeado
      riot/      riot-client.ts                                          # SHOULD
    components/ui/                                                       # primitivas iOS
  tests/
    vault-status.test.ts         # aprobación, rechazo matemático, expiración, acusado no vota
```

## 8. Reglas duras

1. **La identidad solo sale del JWT de Access.** Ningún `userId` viene del cliente.
   `dev-identity.ts` es el único bypass y devuelve `null` en producción.
2. **El voto se emite como el usuario actual, siempre.** Nadie vota "por otro". El acusado no
   puede votar su propia propuesta, y eso se valida en el servidor, no solo ocultando el botón.
3. **Estados derivados de timestamps** (§3). Nada de crons ni flags `is_active`.
4. **Nada hardcodea el grupo**: ni cantidad de amigos, ni nombres, ni emails. El umbral de 3
   vive en `config.ts`.
5. **La API key de Riot nunca llega al cliente.** No se usa `NEXT_PUBLIC_RIOT_*`.
6. **El servicio bindea a `127.0.0.1`** (nunca `"3000:3000"` a secas, eso saltea Access).
7. **Migrations versionadas**; nunca `drizzle-kit push` contra el homelab ni borrar la base.
8. **Sin sobreingeniería.** Seis amigos, un homelab.

## 9. Fases

### MUST: primera versión usable
1. **Fundación:** Next + Tailwind + Drizzle + SQLite + Docker + auth de Access + onboarding.
2. **Campeones:** sync de Data Dragon + grilla con búsqueda.
3. **Vaults:** proponer, votar, estado derivado, listas de Votaciones y Vaults activos.
4. **PWA:** manifest, íconos, `apple-touch-icon`, safe areas, instalable en iPhone.
5. **Deploy:** hostname `lolvault.casapipis.net`, app de Access con los emails, backup.

### SHOULD
Riot ID → `puuid` · última partida por amigo · **notificaciones Web Push** cuando hay una
propuesta nueva para votar (en iOS funciona con la PWA instalada, 16.4+) · modo oscuro
revisado a mano.

### LATER
Detección de violaciones vía match-v5 · estadísticas ("el más vaulteado") · vincular una
propuesta a una partida concreta.

## 10. Deploy (resumen: lo detalla `homelab-infra`)

- Puerto: libre en el host, bind `127.0.0.1:<puerto>:3000`. Verificar con `ss -ltnp` antes de elegir.
- Ingress: sumar `lolvault.casapipis.net` en `/etc/cloudflared/config.yml` **antes** del
  `http_status:404`, más `route dns` y reinicio (runbook en `../CLAUDE.md`).
- Access: app self-hosted `lolvault` con policy "Amigos LolVault" y los emails. Copiar el
  **AUD tag** al `.env`.
- Backup: `VACUUM INTO` diario desde cron del host, igual que PipiGym.

## 11. Preguntas abiertas

Resueltas (2026-09-14): el vault es solo para el que jugó mal · proponer cuenta como voto a
favor y el acusado no vota · todos en LAS.

Resueltas también (2026-09-14): fechas desde/hasta (arranca al aprobarse si es después de "desde"),
ventana de 48 h, autovault permitido, y se puede levantar un vault con otra votación de 3 votos.

No quedan preguntas abiertas.
