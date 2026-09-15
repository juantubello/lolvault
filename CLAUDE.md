# CLAUDE.md — LolVault

App web personal. **PWA pensada primero para iPhone** (instalable en la pantalla de inicio)
y **responsive hasta desktop**. Proyecto aparte dentro del workspace `homeassistant/`;
no comparte nada con Home Assistant salvo el homelab donde va a correr.

Un grupo de ~5-6 amigos que juegan League of Legends propone **vaults**: bloquear un campeón
a quien jugó mal durante N días, si llega a 3 votos a favor.

## Documentos

| Archivo | Qué es |
|---|---|
| **`PLAN-TECNICO.md`** | **Fuente de verdad**: reglas del vault, schema, auth, pantallas, fases, reglas duras. Leer antes de escribir código. |
| `PROGRESS.md` | Handoff entre sesiones: qué está hecho y qué sigue. Leer al empezar, actualizar al terminar. |
| `design-system/lolvault/MASTER.md` | Tokens y reglas visuales iOS clásico. Leer antes de tocar UI. |

## Stack

Next.js (App Router) · TypeScript · Tailwind · SQLite + Drizzle · PWA · Docker, igual que
PipiGym. Auth con Cloudflare Access (módulos copiados de `../pipigym/src/auth/`).
Campeones desde Data Dragon; partidas desde la Riot API (solo servidor).

## Modo dev

1. `.env.local` con `LOLVAULT_DEV_USER_EMAIL=<tu email>`: es el login sin Cloudflare.
2. `npm run dev -- -p 3001`, o el server `lolvault` del `.claude/launch.json` de la raíz. Las
   migrations se aplican solas.
3. **Cambiar de usuario:** pastilla **"Dev · <nombre>"** abajo a la derecha → elegir un usuario
   existente o escribir un **email nuevo** (ej. `amigo2@dev.local`, pasa por onboarding).
   "Volver a …" regresa al email de `.env.local`. Así se prueban votaciones de 3+ personas.

Todo pasa por `src/auth/dev-identity.ts` (cookie `lolvault_dev_email`), el único bypass
autorizado. **En producción no existe:** con `NODE_ENV=production` o sin
`LOLVAULT_DEV_USER_EMAIL`, la cookie se ignora, la acción no hace nada y el selector no se
renderiza. Si la variable llega a producción, la app no arranca.

## Historial de partidas (OP.GG)

- Fuente: **OP.GG MCP sin key** (`features/matches/opgg/`), siempre detrás de `MatchProvider`
  (`features/matches/types.ts`) y creada solo en `features/matches/provider.ts`. Del lado servidor.
- **Caché en la base** (`player_matches`, `match_details`, `player_stats_sync`) vía
  `features/matches/player-stats.ts`: refresco cada 10 min por jugador, 5 min de espera tras un
  error; si OP.GG falla o nos bloquea se muestra lo guardado con aviso. Nunca llamar a la fuente
  directo desde una página.
- La partida adjunta a una propuesta se valida contra el historial guardado **de ese jugador** y
  su foto (`MatchDetail`) se guarda en `vault_proposals.match_snapshot`.
- Fixtures reales en `tests/fixtures/opgg/`, **anonimizados**: no commitear nombres, tags ni
  `puuid` reales de nadie.

## Reglas duras (resumen, detalle en el plan §8)

1. La identidad solo sale del JWT de Access. Ningún `userId` viene del cliente.
2. El acusado no vota su propia propuesta, y eso se valida en el servidor.
3. Los estados (abierta/aprobada/expirada/vault activo) se derivan de timestamps, sin crons.
4. Nada hardcodea el grupo (nombres, emails, cantidad). El umbral de 3 vive en `src/config.ts`.
5. `RIOT_API_KEY` nunca llega al cliente.
6. El servicio bindea a `127.0.0.1`. Migrations versionadas, nunca `push` ni borrar la base.

## Skills de diseño (UI UX Pro Max)

Instaladas en `.claude/skills/` desde
[nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
(v2.13.0, commit `7f69fed`, 2026-09-10):

- **`ui-ux-pro-max`** — núcleo: estilos, paletas, tipografías, reglas UX/accesibilidad,
  generador de design system. Script local (sin red):
  `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --design-system -p "LolVault"`
- **`ui-styling`** — shadcn/ui + Tailwind.
- **`design-system`** — tokens de diseño.

Nota: en `ui-ux-pro-max/SKILL.md` se reemplazó `${CLAUDE_PLUGIN_ROOT}` por la ruta absoluta
del proyecto (`python3`, porque en esta Mac no existe `python`). Si se actualiza la skill,
repetir ese ajuste.

Usar las skills para cualquier decisión visual. Checklist mínimo de la PWA iOS:
safe areas (`env(safe-area-inset-*)`), `viewport-fit=cover`, targets táctiles ≥ 44px,
`apple-touch-icon` + manifest, sin zoom en inputs (font-size ≥ 16px), breakpoints
375 / 768 / 1024 / 1440.
