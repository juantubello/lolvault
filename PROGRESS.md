# LolVault — Progreso

Handoff entre sesiones (Claude Code / Codex). Leer al empezar, actualizar al terminar.

## Estado: planificación (sin código)

### Hecho
- 2026-09-14 — Carpeta creada. Skills de diseño instaladas en `.claude/skills/`
  (`ui-ux-pro-max`, `ui-styling`, `design-system`).
- 2026-09-14 — `PLAN-TECNICO.md` v1: stack, reglas del vault, schema, auth, pantallas, fases.
- 2026-09-14 — Verificado: Data Dragon sirve nombres + fotos sin key (v16.18.1, 171 campeones).
  Riot API: la key de desarrollo vence cada 24 h, así que para la última partida hace falta
  registrar una **Personal API Key**.
- 2026-09-14 — Design system iOS clásico en `design-system/lolvault/MASTER.md`.

### Siguiente
1. Juan responde las **preguntas abiertas** (§11 del plan).
2. Fase 1 — Fundación (Next + Drizzle + auth de Access copiada de PipiGym + onboarding).
3. En paralelo, `homelab-infra`: puerto, compose, hostname, app de Access con los emails.

### Pendiente del lado de Juan
- Juntar los emails de los amigos (van en la policy de Access, **no** en el repo).
- Registrar la Personal API Key en developer.riotgames.com (solo para la fase SHOULD).
