# Fixtures de OP.GG MCP

Respuestas reales de `https://mcp-api.op.gg/mcp` capturadas el 2026-09-15 (región LAS).

- `list-20.txt`: texto de `lol_list_summoner_matches` (20 partidas, solo el jugador consultado).
- `detail.txt`: texto de `lol_get_summoner_game_detail` (10 jugadores, `focus_riot_id` = Invocador).
- `profile.txt`: texto de `lol_get_summoner_profile` (rangos con `null` en colas sin rango, campeones de temporada).
- `rpc-*.json`: sobres JSON-RPC (éxito, error "Summoner not found", initialize). La respuesta HTTP
  del initialize trae el header `mcp-session-id`, que hay que reenviar en cada llamada.

**Anonimizado:** todo `Summoner("puuid","game_name","tagline"…)` fue reemplazado. El jugador
consultado es `Invocador#LAS1` (`puuid-invocador`); el resto, `Jugador N#LAS` (`puuid-jugador-N`).
El resto del contenido (ids de partida, campeones, stats) es el original.

Formato del texto: primero líneas `class Nombre: campo1,campo2,…` (orden de los valores), después
un único valor `Nombre(valor, …)` con strings `"…"`, números, `true`/`false`, `null` y listas `[…]`.
