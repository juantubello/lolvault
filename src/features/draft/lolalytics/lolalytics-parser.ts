import { DRAFT_ROLES, type DraftRole } from '@/features/draft/types';

type JsonObject = Record<string, unknown>;

export class ResponseShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResponseShapeError';
  }
}

export class ChampionNotFoundError extends ResponseShapeError {
  constructor() {
    super('Lolalytics indicó que el campeón no existe');
    this.name = 'ChampionNotFoundError';
  }
}

export type ParsedCounterResponse = {
  championKey: number;
  role: DraftRole;
  enemyRole: DraftRole;
  analysed: number;
  championWinRate: number;
  counters: {
    championKey: number;
    winRate: number;
    games: number;
    defaultRole: DraftRole;
  }[];
};

export type ParsedTeamResponse = {
  synergies: {
    championKey: number;
    role: DraftRole;
    winRate: number;
    games: number;
  }[];
};

function objectAt(value: unknown, path: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ResponseShapeError(`${path} debe ser un objeto`);
  }
  return value as JsonObject;
}

function required(object: JsonObject, key: string, path: string): unknown {
  if (!Object.hasOwn(object, key)) throw new ResponseShapeError(`Falta ${path}.${key}`);
  return object[key];
}

function finiteNumber(value: unknown, path: string): number {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isFinite(number)) {
    throw new ResponseShapeError(`${path} debe ser un número`);
  }
  return number;
}

function integer(value: unknown, path: string): number {
  const number = finiteNumber(value, path);
  if (!Number.isInteger(number)) throw new ResponseShapeError(`${path} debe ser un entero`);
  return number;
}

function nonNegativeInteger(value: unknown, path: string): number {
  const number = integer(value, path);
  if (number < 0) throw new ResponseShapeError(`${path} no puede ser negativo`);
  return number;
}

function winRate(value: unknown, path: string): number {
  const number = finiteNumber(value, path);
  if (number < 0 || number > 100) {
    throw new ResponseShapeError(`${path} debe estar entre 0 y 100`);
  }
  return number;
}

function role(value: unknown, path: string): DraftRole {
  if (typeof value !== 'string' || !DRAFT_ROLES.includes(value as DraftRole)) {
    throw new ResponseShapeError(`${path} no es un rol válido`);
  }
  return value as DraftRole;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : '';
    throw new ResponseShapeError(`La respuesta de Lolalytics no es JSON válido${detail}`);
  }
}

function rootObject(text: string): JsonObject {
  const root = objectAt(parseJson(text), 'raíz');
  if (root.status === 404) throw new ChampionNotFoundError();
  return root;
}

/** Parsea `ep=counter`; `counters: []` es una respuesta válida. */
export function parseCounterResponse(text: string): ParsedCounterResponse {
  const root = rootObject(text);
  const stats = objectAt(required(root, 'stats', 'raíz'), 'raíz.stats');
  const rawCounters = required(root, 'counters', 'raíz');
  if (!Array.isArray(rawCounters)) {
    throw new ResponseShapeError('raíz.counters debe ser una lista');
  }

  return {
    championKey: integer(required(stats, 'cid', 'raíz.stats'), 'raíz.stats.cid'),
    role: role(required(stats, 'lane', 'raíz.stats'), 'raíz.stats.lane'),
    enemyRole: role(required(stats, 'vsLane', 'raíz.stats'), 'raíz.stats.vsLane'),
    analysed: nonNegativeInteger(required(stats, 'analysed', 'raíz.stats'), 'raíz.stats.analysed'),
    championWinRate: winRate(required(stats, 'wr', 'raíz.stats'), 'raíz.stats.wr'),
    counters: rawCounters.map((value, index) => {
      const path = `raíz.counters[${index}]`;
      const counter = objectAt(value, path);
      return {
        championKey: integer(required(counter, 'cid', path), `${path}.cid`),
        winRate: winRate(required(counter, 'vsWr', path), `${path}.vsWr`),
        games: nonNegativeInteger(required(counter, 'n', path), `${path}.n`),
        defaultRole: role(required(counter, 'defaultLane', path), `${path}.defaultLane`),
      };
    }),
  };
}

/** Parsea `ep=build-team` usando los índices declarados en `team_h`, nunca un orden fijo. */
export function parseTeamResponse(text: string): ParsedTeamResponse {
  const root = rootObject(text);
  const rawHeaders = required(root, 'team_h', 'raíz');
  if (!Array.isArray(rawHeaders) || rawHeaders.some((header) => typeof header !== 'string')) {
    throw new ResponseShapeError('raíz.team_h debe ser una lista de textos');
  }
  const headers = rawHeaders as string[];
  const idIndex = headers.indexOf('id');
  const winRateIndex = headers.indexOf('wr');
  const gamesIndex = headers.indexOf('n');
  if (idIndex < 0 || winRateIndex < 0 || gamesIndex < 0) {
    throw new ResponseShapeError('raíz.team_h debe incluir id, wr y n');
  }

  const team = objectAt(required(root, 'team', 'raíz'), 'raíz.team');
  const synergies: ParsedTeamResponse['synergies'] = [];
  for (const [rawRole, rawRows] of Object.entries(team)) {
    const allyRole = role(rawRole, `raíz.team.${rawRole}`);
    if (!Array.isArray(rawRows)) {
      throw new ResponseShapeError(`raíz.team.${rawRole} debe ser una lista`);
    }
    rawRows.forEach((rawRow, rowIndex) => {
      const path = `raíz.team.${rawRole}[${rowIndex}]`;
      if (!Array.isArray(rawRow) || rawRow.length < headers.length) {
        throw new ResponseShapeError(`${path} no respeta los encabezados de team_h`);
      }
      synergies.push({
        championKey: integer(rawRow[idIndex], `${path}.id`),
        role: allyRole,
        winRate: winRate(rawRow[winRateIndex], `${path}.wr`),
        games: nonNegativeInteger(rawRow[gamesIndex], `${path}.n`),
      });
    });
  }

  return { synergies };
}
