# LolVault — Progreso

Handoff entre sesiones (Claude Code / Codex). Leer al empezar, actualizar al terminar.

## Estado: Fase 1 implementada y validada

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
- 2026-09-14 — Verificados `tsc`, 3 archivos / 4 tests de Vitest, build de producción,
  pragmas SQLite y render final de compose. El sandbox no permite abrir sockets (`listen
  EPERM`), por lo que la comprobación HTTP de `/` → `/onboarding` queda para ejecutar fuera
  del sandbox; la misma regla quedó cubierta por test unitario.
- 2026-09-14 — Commit pendiente: el workspace permite editar archivos pero monta `.git`
  como sólo lectura (`index.lock: Operation not permitted`).

### Siguiente
1. Fuera del sandbox, crear `.env.local` con `LOLVAULT_DEV_USER_EMAIL`, correr `npm run dev`
   y confirmar que `/` responde redirigiendo a `/onboarding`.
2. Versionar el árbol con commits chicos en español (el `.git` actual está sólo lectura).
3. Juan responde las preguntas abiertas restantes (§11 del plan).
4. Fase 2 — Campeones: sincronización de Data Dragon y grilla con búsqueda.
5. En paralelo, `homelab-infra`: puerto, compose, hostname, app de Access con los emails.

### Pendiente del lado de Juan
- Juntar los emails de los amigos (van en la policy de Access, **no** en el repo).
- Registrar la Personal API Key en developer.riotgames.com (solo para la fase SHOULD).
