# APIs de League of Legends — investigación (2026-09-14)

Qué usar para **campeones + imágenes** y para **historial de partidas**, todo gratis.
Las URLs de este documento están **verificadas con requests reales** ese día.

## Resumen

| Necesidad | Usar | Key | Estado |
|---|---|---|---|
| Lista de campeones, nombres, títulos | **Data Dragon** (oficial Riot) | No | ✅ Decidido |
| Fotos (cuadrada, splash, loading) | **Data Dragon** | No | ✅ Decidido |
| Assets extra (íconos por id numérico, ficha completa) | CommunityDragon (comunitario) | No | Complemento opcional |
| Historial de partidas | **OP.GG MCP** con caché en la base | No | ✅ **En uso** (2026-09-15) |
| Historial con key oficial | **Riot API** (account-v1 + match-v5) | Sí, gratis | Futuro: cuando aprueben la Personal API Key |
| Partida en curso | **Riot API** (Spectator-v5) | Sí, gratis | ✅ Cliente listo; falta verificar con una key real |
| OP.GG / U.GG como API REST | No existe API pública oficial; los "OP.GG API" de terceros son scrapers | — | ❌ Descartado (viola términos) |

## 1. Campeones e imágenes: Data Dragon

CDN oficial de Riot, sin key, sin rate limit documentado. Riot lo actualiza a mano después de
cada parche, así que puede tardar un poco en reflejar un parche nuevo.

- Versiones (la primera es la última): `https://ddragon.leagueoflegends.com/api/versions.json` → hoy `16.18.1`
- Lista en español: `https://ddragon.leagueoflegends.com/cdn/{version}/data/es_AR/champion.json` (171 campeones)
- Ficha de un campeón (skins, habilidades): `https://ddragon.leagueoflegends.com/cdn/{version}/data/es_AR/champion/{id}.json`

| Imagen | URL | Verificado |
|---|---|---|
| Cuadrada 120px (tiles, avatar) | `https://ddragon.leagueoflegends.com/cdn/{version}/img/champion/{id}.png` | 200 · 28 KB |
| Splash (fondo del detalle de un vault) | `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/{id}_{skinNum}.jpg` | 200 · 158 KB |
| Loading (vertical, cards) | `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/{id}_{skinNum}.jpg` | 200 · 58 KB |

`{id}` es el `id` de `champion.json` (ej. `Ahri`, `MonkeyKing` para Wukong), **no** el nombre
visible. `skinNum` 0 = skin base. Splash y loading no llevan versión en la URL.

## 2. CommunityDragon (complemento)

Mirror comunitario de **todos** los archivos del cliente. No es de Riot, no tiene SLA y su sitio
de documentación estaba caído ese día (HTTP 522), aunque los archivos respondían bien.

- Lista: `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-summary.json`
  (incluye `roles` y variantes que no están en Data Dragon)
- Ícono por id numérico: `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/{key}.png` → 200
- Ficha en español: `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/es_ar/v1/champions/{key}.json` → 200

Útil si más adelante hacen falta cosas que Data Dragon no trae. Para el MVP no hace falta.

## 3. Historial de partidas: Riot API (oficial)

Flujo para cada amigo:

1. `GET https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}` → `puuid`
2. `GET https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/{puuid}/ids?count=5` → ids de partidas
3. `GET https://americas.api.riotgames.com/lol/match/v5/matches/{matchId}` → detalle (campeón, KDA, win, cola)

- LAS usa el routing regional **`americas`** (match-v5 y account-v1 van por región, no por `la2`).
- La partida en curso usa routing de plataforma: Spectator-v5 va por **`la2`**, no por
  `americas`: `GET /lol/spectator/v5/active-games/by-puuid/{puuid}`. Sólo devuelve partidas ya
  empezadas y no informa carriles; LolVault los infiere con la matriz local de Draft.
- Sin key responde **401** (verificado). La key va en el header `X-Riot-Token`, **solo del lado servidor**.
- Con `by-puuid` (paso 3 del flujo del perfil) se obtiene el Riot ID actual: sirve para refrescar
  nombres cuando alguien se lo cambia.

### Keys

| Key | Cómo | Vence | Límite | Para qué |
|---|---|---|---|---|
| **Development** | Automática al entrar a developer.riotgames.com | **Cada 24 h** | 20 req/s · 100 req/2 min | Prototipar ya |
| **Personal** | "Register Project" → Personal API Key, con descripción del producto | No vence | Igual que dev | LolVault en el homelab (comunidad privada chica) |
| Production | Aprobación formal | No vence | 500 req/10 s · 30 000 req/10 min | No hace falta |

- La aprobación de la Personal Key **puede tardar semanas**: hay pedidos de marzo de 2026 que
  seguían pendientes a las 3 semanas. **Conviene registrarla ya.**
- Riot pide registrar cualquier producto que sirva a jugadores, aunque use otras fuentes.
- Una Personal Key no se puede usar en una app pública. LolVault queda cerrada por Cloudflare
  Access, así que no lo es.
- Con 6 amigos, cachear partidas en la DB queda muy lejos del rate limit.
- Hay que poner el aviso legal que pide Riot (en Perfil → Acerca de).
- (Un blog de terceros dice que las Personal Keys vencen cada 24 h. La doc oficial de Riot dice
  que **no**. Gana la doc oficial.)

## 4. OP.GG MCP — **adoptado (2026-09-15)** con caché propio

**Decisión de Juan:** usar OP.GG para historial y estadísticas mientras no haya Personal API Key,
con caché en la base para no depender de que OP.GG siga respondiendo. Verificado en vivo:

- **LAS funciona** (`region: "LAS"`; `LA2` devuelve lo mismo). Respuesta en ~3–4 s.
- **El texto no es JSON**: líneas `class Nombre: campo1,campo2,…` (orden de los valores, que no es
  el orden en que se piden) y después `Nombre(v1, …)` con strings, números, `true/false`, `null`
  y listas. Parser propio en `src/features/matches/opgg/compact-format.ts`.
- **IDs de partida propios de OP.GG** (`P9o6vts4…=`), no `LA2_…`. Para el detalle hay que mandar
  también `created_at`.
- **Fechas en hora de Corea** (`+09:00`); se normalizan a UTC.
- **Riot ID inexistente** → error JSON-RPC `{"code":-32600,"message":"Summoner not found"}`.
- Trae `puuid`, daño hecho/recibido, CS, OP Score, kills del equipo, rango por cola y campeones de
  temporada. Muestras reales anonimizadas en `tests/fixtures/opgg/`.
- Python de python.org falló con `CERTIFICATE_VERIFY_FAILED`; Node `fetch` (lo que usa la app)
  conecta bien. No desactivar la verificación TLS.

Los riesgos de abajo siguen vigentes: por eso el caché y la interfaz para cambiar de fuente.

### Riesgos (análisis original)

Servidor MCP **oficial de OP.GG** (repo `opgginc/opgg-mcp`, licencia MIT).

- Endpoint: `https://mcp-api.op.gg/mcp` (Streamable HTTP, JSON-RPC).
- **Verificado:** `initialize` responde 200 **sin auth**, 29 herramientas. La relevante es
  `lol_list_summoner_matches(game_name, tag_line, region, lang, limit, desired_output_fields)`.
  También están `lol_get_summoner_game_detail` y `lol_get_summoner_profile`.
- `region` se describe como "Server region code" (ejemplos `KR`, `BR`, `EUNE`). `LAS` se probó después y funciona (ver arriba).

Por qué no como base:
- Está pensado para **agentes de IA**, no para apps. El README no documenta términos, rate
  limits ni garantías, y puede cambiar o cortarse sin aviso.
- No reemplaza el registro en Riot, y los datos de fondo igual salen de la API de Riot.

Mitigación aplicada: la app usa la interfaz `MatchProvider` (`src/features/matches/`) y cachea todo
en la base, así se puede cambiar a la API de Riot sin tocar la UI y un bloqueo no borra lo ya visto.

## Fuentes

- Riot Developer Portal, LoL (Data Dragon, account-v1, match-v5, políticas): https://developer.riotgames.com/docs/lol
- Riot Developer Portal, keys y rate limits: https://developer.riotgames.com/docs/portal
- Personal Key pendiente por semanas: https://github.com/riotgames/developer-relations/issues/1150
- OP.GG MCP: https://github.com/opgginc/opgg-mcp
- Qué está permitido en apps de terceros en 2026 (blog, no oficial): https://buildzcrank.com/en/blog/riot-api-and-third-party-apps-what-is-allowed/
