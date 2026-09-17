type JsonObject = Record<string, unknown>;

export type QwikScalingBucket = {
  bucket: number;
  games: number;
  wins: number;
};

export type QwikScalingFailureReason =
  | 'invalid-json'
  | 'invalid-root'
  | 'missing-objs'
  | 'invalid-objs'
  | 'missing-series-container'
  | 'ambiguous-series-container'
  | 'invalid-pointer'
  | 'pointer-out-of-range'
  | 'invalid-series'
  | 'mismatched-buckets'
  | 'invalid-buckets'
  | 'invalid-number'
  | 'zero-games'
  | 'invalid-wins';

export type QwikScalingResult =
  | { ok: true; series: QwikScalingBucket[] }
  | { ok: false; reason: QwikScalingFailureReason; message: string };

function failure(
  reason: QwikScalingFailureReason,
  message: string,
): QwikScalingResult {
  return { ok: false, reason, message };
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRoot(input: string | unknown):
  | { ok: true; root: JsonObject }
  | { ok: false; result: QwikScalingResult } {
  let parsed: unknown = input;
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input) as unknown;
    } catch (error) {
      const detail = error instanceof Error ? `: ${error.message}` : '';
      return { ok: false, result: failure('invalid-json', `La respuesta no es JSON válido${detail}`) };
    }
  }
  return isObject(parsed)
    ? { ok: true, root: parsed }
    : { ok: false, result: failure('invalid-root', 'La raíz de la respuesta debe ser un objeto') };
}

function resolvePointer(
  value: unknown,
  objects: unknown[],
  path: string,
): { ok: true; value: unknown } | { ok: false; result: QwikScalingResult } {
  if (typeof value !== 'string' || !/^[0-9a-z]+$/i.test(value)) {
    return {
      ok: false,
      result: failure('invalid-pointer', `${path} debe ser un puntero Qwik en base 36`),
    };
  }
  const index = Number.parseInt(value, 36);
  if (!Number.isSafeInteger(index) || index < 0 || index >= objects.length) {
    return {
      ok: false,
      result: failure('pointer-out-of-range', `${path} apunta fuera de _objs`),
    };
  }
  return { ok: true, value: objects[index] };
}

function resolveSeriesObject(
  pointer: unknown,
  objects: unknown[],
  path: string,
): { ok: true; value: JsonObject } | { ok: false; result: QwikScalingResult } {
  const resolved = resolvePointer(pointer, objects, path);
  if (!resolved.ok) return resolved;
  if (!isObject(resolved.value)) {
    return {
      ok: false,
      result: failure('invalid-series', `${path} no apunta a un objeto de tramos`),
    };
  }
  return { ok: true, value: resolved.value };
}

/**
 * Extrae la serie de duración de una respuesta serializada por Qwik.
 *
 * Este módulo sólo conoce el formato: cada string dentro de un contenedor de `_objs` es un
 * puntero base 36 y un único salto llega al literal. Nunca supone la posición del contenedor.
 */
export function parseQwikScalingData(input: string | unknown): QwikScalingResult {
  const parsedRoot = parseRoot(input);
  if (!parsedRoot.ok) return parsedRoot.result;
  const root = parsedRoot.root;
  if (!Object.hasOwn(root, '_objs')) {
    return failure('missing-objs', 'La respuesta no contiene _objs');
  }
  if (!Array.isArray(root._objs)) {
    return failure('invalid-objs', '_objs debe ser una lista');
  }
  const objects = root._objs;
  const containers = objects.filter((value) => (
    isObject(value) && Object.hasOwn(value, 'time') && Object.hasOwn(value, 'timeWin')
  ));
  if (containers.length === 0) {
    return failure('missing-series-container', 'No hay un contenedor con time y timeWin');
  }
  if (containers.length > 1) {
    return failure('ambiguous-series-container', 'Hay más de un contenedor con time y timeWin');
  }

  const container = containers[0] as JsonObject;
  const gamesResult = resolveSeriesObject(container.time, objects, 'time');
  if (!gamesResult.ok) return gamesResult.result;
  const winsResult = resolveSeriesObject(container.timeWin, objects, 'timeWin');
  if (!winsResult.ok) return winsResult.result;

  const gamesKeys = Object.keys(gamesResult.value);
  const winsKeys = Object.keys(winsResult.value);
  if (gamesKeys.length !== winsKeys.length) {
    return failure('mismatched-buckets', 'time y timeWin tienen distinta cantidad de tramos');
  }
  const expectedKeys = ['1', '2', '3', '4', '5', '6', '7'];
  if (
    gamesKeys.length !== expectedKeys.length
    || expectedKeys.some((key) => !Object.hasOwn(gamesResult.value, key))
    || expectedKeys.some((key) => !Object.hasOwn(winsResult.value, key))
  ) {
    return failure('invalid-buckets', 'time y timeWin deben tener los tramos 1 a 7');
  }

  const series: QwikScalingBucket[] = [];
  for (const key of expectedKeys) {
    const rawGames = resolvePointer(gamesResult.value[key], objects, `time.${key}`);
    if (!rawGames.ok) return rawGames.result;
    const rawWins = resolvePointer(winsResult.value[key], objects, `timeWin.${key}`);
    if (!rawWins.ok) return rawWins.result;
    if (
      typeof rawGames.value !== 'number'
      || !Number.isFinite(rawGames.value)
      || !Number.isInteger(rawGames.value)
      || typeof rawWins.value !== 'number'
      || !Number.isFinite(rawWins.value)
      || !Number.isInteger(rawWins.value)
    ) {
      return failure('invalid-number', `El tramo ${key} debe resolver a conteos numéricos enteros`);
    }
    if (rawGames.value === 0) {
      return failure('zero-games', `El tramo ${key} no tiene partidas`);
    }
    if (rawGames.value < 0 || rawWins.value < 0 || rawWins.value > rawGames.value) {
      return failure('invalid-wins', `El tramo ${key} tiene victorias o partidas inválidas`);
    }
    series.push({ bucket: Number(key), games: rawGames.value, wins: rawWins.value });
  }

  return { ok: true, series };
}
