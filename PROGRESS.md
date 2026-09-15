# LolVault — Progreso

Handoff entre sesiones (Claude Code / Codex). Leer al empezar, actualizar al terminar.

## Estado: votaciones, vaults, black list, perfiles, historial y Web Push implementados

### Hecho
- 2026-09-14 — Carpeta creada. Skills de diseño instaladas en `.claude/skills/`
  (`ui-ux-pro-max`, `ui-styling`, `design-system`).
- 2026-09-14 — `PLAN-TECNICO.md` v1: stack, reglas del vault, schema, auth, pantallas, fases.
- 2026-09-14 — Verificado: Data Dragon sirve nombres + fotos sin key (v16.18.1, 171 campeones).
  Riot API: la key de desarrollo vence cada 24 h, así que para la última partida hace falta
  registrar una **Personal API Key**.
- 2026-09-14 — Design system iOS clásico en `design-system/lolvault/MASTER.md`.
- 2026-09-14 — Fase 1: Next.js 16 + React 19 + TypeScript + Tailwind 4 en la raíz,
  configuración standalone y shell iOS responsive (tab bar móvil / sidebar desktop).
- 2026-09-14 — SQLite + Drizzle con las cuatro tablas del MVP, constraints y migration
  `0000_peaceful_the_hood.sql`; migración automática antes de dev/start y en Docker.
- 2026-09-14 — Auth de Cloudflare Access adaptada de PipiGym, con dominio de team fijo,
  AUD de LolVault, bypass sólo en desarrollo y fusible de producción.
- 2026-09-14 — Onboarding con nombre obligatorio, Riot ID opcional validado y escritura
  ligada exclusivamente al usuario autenticado; Perfil muestra nombre y email actuales.
- 2026-09-14 — PWA mínima (manifest, metadata iOS, ícono Apple generado), Docker multi-stage,
  compose limitado a `127.0.0.1:${LOLVAULT_PORT}:3000` y volumen `/data`.
- 2026-09-14 — Verificados `tsc`, tests de Vitest, build de producción, pragmas SQLite y
  render final de compose (Codex, dentro del sandbox).
- 2026-09-14 — Verificado fuera del sandbox (Claude Code): `npm run dev -p 3001` aplica
  migrations, `/` → 307 → `/onboarding` (200) sin errores de consola. Dev server en
  `.claude/launch.json` de la raíz (`lolvault`, puerto 3001; PipiGym usa el 3000).
- 2026-09-14 — Fase 1 versionada en commits chicos (`b2cd21c`…`af8c446`).
- 2026-09-14 — Fix `.gitignore`: `data/` ignoraba también los `data/` de las skills (nunca
  se habían commiteado). Ahora solo se ignora `/data/*` de la raíz.
- 2026-09-14 — Fix onboarding (`9a977ef`): el reset de forms de React 19 vaciaba los inputs
  cuando fallaba la validación. La acción devuelve `values` y el form los usa como
  `defaultValue`; test de regresión agregado (5 tests).
- 2026-09-14 — UI verificada en navegador: onboarding completo → Votaciones con tab bar
  (375px light), Perfil con nombre/email/Riot ID (375px dark), sidebar en 1440px. Sin errores
  de consola. La DB local `data/lolvault.db` tiene un usuario de prueba "Tester" (ignorada
  por git; se puede borrar sin problema).
- 2026-09-14 — Editar perfil (`/perfil/editar`): nombre y Riot ID editables, porque los amigos
  se cambian el nombre seguido. Formulario compartido con el onboarding
  (`components/profile-form.tsx` + `features/profile/profile-form.ts`). Si cambia el Riot ID
  (sin contar mayúsculas) se descarta `riot_puuid` para re-resolverlo. Tests contra SQLite en
  memoria (15 tests). Verificado en navegador: renombrar → vuelve a Perfil con el ID nuevo.
- 2026-09-14 — Modo dev con selector de usuario: pastilla "Dev · <nombre>" abajo a la derecha
  para entrar como un usuario existente o con un email nuevo (pasa por onboarding) y volver al de
  `.env.local`. Sirve para probar votaciones de 3+ personas. Cookie `lolvault_dev_email` leída
  solo en `dev-identity.ts`; en producción se ignora, la acción no hace nada y el selector no se
  renderiza (tests). Fixes encontrados al probarlo: el panel se salía de la pantalla en 375px, y
  el layout quedaba con el nombre viejo tras guardar el perfil (ahora `revalidatePath('/', 'layout')`).
  22 tests. Uso en `CLAUDE.md` → Modo dev.
- 2026-09-14 — Investigación de APIs en `docs/APIS-LOL.md`: Data Dragon para campeones e imágenes
  (sin key, URLs verificadas), Riot API para historial (key de dev ya, Personal Key a registrar),
  OP.GG MCP probado sin auth pero solo como experimento.
- 2026-09-14 — **Fases 2 y 3: campeones + votaciones + vaults.** Sync de Data Dragon a `champions`
  (a demanda, recheck diario). Sheet "Proponer vault" (jugador, campeón con búsqueda, desde/hasta,
  motivo). Votar A favor / En contra con aprobación o rechazo transaccional, cancelar, "Te falta
  votar" primero + badge en la tab. Pestaña Vaults con "Pedir que se levante" (votación `lift`).
  Reglas puras en `features/vaults/vault-rules.ts`. Migrations 0001/0002. **0002 editada a mano**:
  drizzle-kit generaba el copy de la tabla con columnas nuevas y fallaba siempre.
  Tests de integración de queries y Data Dragon escritos por **Codex** (26), 64 tests en total.
  Verificado en navegador con 4 usuarios de dev: proponer → 1/3 → votos → aprobado → vigente.
- 2026-09-14 — **Foto de perfil.** "Agregar / Cambiar foto" y "Quitar" en Editar perfil; se ve en
  Perfil y en los chips de jugador de "Proponer vault". Recorte y achicado a JPEG 256×256 en el
  cliente (1,2 MB → ~4 KB en la prueba), `/data/avatars/<id>.jpg` con escritura atómica, ruta
  `/avatars/<id>?v=…` solo para miembros. Migration 0003 (`users.avatar_updated_at`). Tests de
  storage y acciones (73 en total). Verificado en navegador: subir, ver, quitar y 404 posteriores.
  Nota: al quitar, el navegador que ya la vio puede seguir teniendo la URL vieja en caché, pero la
  app deja de referenciarla y el servidor responde 404.
- 2026-09-14 — **Filtros en Vaults.** Fila de jugadores con foto y conteo de vigentes, control
  segmentado Vigentes / Terminados / Todos, búsqueda por campeón sin tildes, "Limpiar filtros".
  Filtros en la URL (`/vaults?jugador=2&estado=todos&q=yas`). Con "Todos" se agrupa por jugador;
  las tarjetas muestran la foto del jugador sobre la del campeón. Terminados ahora es historial
  completo. Lógica pura en `features/vaults/vault-filters.ts` (82 tests).
- 2026-09-14 — **"Por expirar" en Vaults.** Nueva opción del control segmentado: vigentes cuyo
  último día es hoy o mañana (fecha argentina, `VAULT_EXPIRING_DAYS = 2`), ordenados por el que
  termina primero. Las tarjetas dicen "termina hoy / mañana" en naranja. 86 tests.
- 2026-09-15 — **Historial de partidas vía OP.GG (sin key) con caché.** `MatchProvider` en
  `features/matches/types.ts`; cliente MCP, parser del formato compacto y mapeo en
  `features/matches/opgg/` (**Codex**, 18 tests con fixtures reales anonimizados). Caché en
  `player_matches` / `match_details` / `player_stats_sync` (migration 0004): refresco cada 10 min,
  5 min de espera tras error, y si OP.GG falla se muestra lo guardado con aviso.
  - **Perfil y Amigos → detalle:** % de victorias (sin remakes), KDA, participación en kills, rango
    por cola, top campeones recientes, roles, campeones de temporada y últimas 20 partidas.
  - **Proponer vault:** al elegir jugador se listan sus últimas 10 partidas y se puede adjuntar la
    decisiva (validada en el servidor contra SU historial). La foto (10 jugadores con KDA y daño
    hecho/recibido) se guarda en `vault_proposals.match_snapshot` y se ve en la tarjeta.
  - Verificado en vivo con la cuenta de Juan (LAS): stats y 20 partidas, Riot ID inexistente con
    aviso, propuesta con partida adjunta y foto coincidente con OP.GG. 122 tests.
  - Nota de pruebas: en el navegador automatizado los clics dentro del sheet (scroll anidado) caían
    desfasados; con `click()` sobre el elemento funciona. No es un bug de la app.
- 2026-09-15 — **Label de campeón vaulteado en las estadísticas.** En Perfil y Amigos → detalle,
  "Campeones de las últimas partidas" y "Temporada · ranked" marcan con un candado los campeones
  con vault vigente de ese jugador ("Vaulteado · hasta X", "termina hoy/mañana" en naranja, o
  "Vault desde X" si está programado). `listInForceVaultsByChampionKey` cruza el `key` numérico de
  Data Dragon con el `championId` de OP.GG; textos y tonos compartidos con las tarjetas de Vaults
  en `features/vaults/vault-labels.ts`. Verificado en el navegador (375px). 126 tests.
- 2026-09-15 — **Detalle completo de partida.** Las filas recientes y las partidas adjuntas
  navegan a `/partidas/[matchId]?jugador=…`, con back seguro a Perfil/Amigos/Votaciones. La ruta
  resuelve historial + `match_details` + snapshot de propuesta y tolera una caída de OP.GG. Vista
  iOS agrupada con resumen por equipos, tarjeta del jugador foco, stats ampliadas de visión y
  multikill, filas de los dos equipos sin tabla horizontal y miembros LolVault vinculados por
  Riot ID (nunca por `puuid`). Sin migración: los campos viven en el JSON. 139 tests.
- 2026-09-15 — **UI completa de Black list.** Quinto destino responsive, lista vigente con
  búsqueda e historial colapsable, alta con autocompletado accesible sobre jugadores conocidos y
  partida opcional, votaciones mezcladas con las de vaults, acciones de sacar/cancelar/votar y
  badge en el detalle de partida. El badge de navegación suma ambos tipos de voto pendiente. El
  pie de las tarjetas de votación ahora envuelve nombres largos en vez de truncarlos. Helpers de
  presentación cubiertos en `blacklist-ui.test.ts`; typecheck, 165 tests y build verificados.
- 2026-09-15 — **Notificaciones Web Push con VAPID.** Suscripciones por usuario y dispositivo,
  configuración opcional solo del servidor, service worker sin caché offline, estado y gestión
  accesible desde Perfil. Avisos de propuestas y aprobaciones de vault/lift/black list se envían
  con `after()`; endpoints 404/410 se limpian y otros fallos se contabilizan. Migration 0006,
  script de claves y runbook de deploy incluidos. Typecheck, 182 tests y build verificados.

- 2026-09-15 — **Preferencias de notificaciones y aviso diario al grupo.** En Perfil → "Qué recibís"
  hay tres switches por usuario (valen para todos sus dispositivos): Vaults, Black list y Avisos de
  amigos; cada evento push declara su categoría y el envío filtra a quienes la apagaron (la prueba no
  se filtra). "Aviso al grupo": hasta 140 caracteres, **uno por día calendario argentino** por usuario,
  con UNIQUE (emisor, día) en `custom_notifications` para que el límite lo haga cumplir la base.
  Migration 0007. Notificaciones movidas arriba de Estadísticas en Perfil. Hecho por Claude (Codex sin
  cuota). Verificado en el navegador: switch persiste, aviso enviado y bloqueado hasta las 00:00. 190 tests.

- 2026-09-15 — **Pendientes pre-deploy + revisión de código.** Tests del JWT de Access con tokens
  firmados (AUD/issuer/vencido/otra clave/alg none), `(app)/error.tsx` con aviso de sesión vencida
  ("Se cortó la conexión" → Recargar), `global-error.tsx` y `not-found.tsx`. La revisión (agente
  code-reviewer) no encontró bloqueantes; se arreglaron: manifest servido por route handler y linkeado
  con `crossOrigin="use-credentials"` + `apple-mobile-web-app-capable` (detrás de Access el navegador
  no lo leía), grupo incompleto ya no rechaza votaciones para siempre, tope total de 20 s a OP.GG y 10 s
  a Data Dragon, al cambiar el Riot ID se borra el caché de la cuenta anterior, re-vinculación por
  email sin distinguir mayúsculas, validación de tipos en dos Server Actions y runbook (clone público,
  solo One-time PIN, app de Access Bypass para manifest/íconos). 213 tests.
  - Pendiente menor: los fixtures de OP.GG conservan ids de partida y datos de perfil que permiten
    reconocer la cuenta real (ya están en el historial público).

### Siguiente
1. Revisión de código (`code-reviewer`): `src/auth/`, `features/vaults/`, `features/matches/` y avatares.
2. `homelab-infra`: puerto, compose, hostname, app de Access con los emails de los amigos.
3. Verificar Web Push en el hostname HTTPS y en un iPhone 16.4+ con la PWA instalada.
4. Cambiar `MatchProvider` a la API de Riot cuando aprueben la Personal API Key.
5. Aviso legal de Riot/OP.GG en Perfil → Acerca de.

### Pendiente del lado de Juan
- Juntar los emails de los amigos (van en la policy de Access, **no** en el repo).
- **Registrar ya** la Personal API Key en developer.riotgames.com: la aprobación puede tardar
  semanas. Mientras tanto se prototipa con la key de desarrollo, que vence cada 24 h.
