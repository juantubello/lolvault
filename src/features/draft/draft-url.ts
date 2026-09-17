import {
  DRAFT_PRIOR_GAMES,
  type Draft,
  type DraftPick,
  type DraftRisk,
} from '@/features/draft/analysis';
import { DRAFT_ROLES, type DraftRole } from '@/features/draft/types';

export type DraftPanel = 'draft' | 'analisis';
export type DraftMatchupScope = 'head-to-head' | 'all';
export type DraftTeam = 'allies' | 'enemies';
export type DraftSlot = { team: DraftTeam; role: DraftRole };
export type DraftPlayerAssignment = { role: DraftRole; userId: number };
export type DraftSearchParams = Record<string, string | string[] | undefined>;

export type DraftUrlState = Draft & {
  players: readonly DraftPlayerAssignment[];
  risk: DraftRisk;
  panel: DraftPanel;
  matchupScope: DraftMatchupScope;
  slot: DraftSlot | null;
};

const ROLE_SET = new Set<string>(DRAFT_ROLES);
const RISK_SET = new Set<string>(Object.keys(DRAFT_PRIOR_GAMES));
const ROLE_INDEX = new Map<DraftRole, number>(DRAFT_ROLES.map((role, index) => [role, index]));

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

function parseTeam(
  value: string | string[] | undefined,
  validChampionKeys: ReadonlySet<number>,
  globallyUsed: Set<number>,
): DraftPick[] {
  const picks: DraftPick[] = [];
  const usedRoles = new Set<DraftRole>();

  for (const entry of first(value).split(',')) {
    const match = /^(\d+)-(top|jungle|middle|bottom|support)$/.exec(entry.trim());
    if (!match) continue;
    const championKey = Number(match[1]);
    const role = match[2] as DraftRole;
    if (!Number.isSafeInteger(championKey)
      || !validChampionKeys.has(championKey)
      || usedRoles.has(role)
      || globallyUsed.has(championKey)) continue;

    picks.push({ championKey, role });
    usedRoles.add(role);
    globallyUsed.add(championKey);
  }

  return picks;
}

function parseSlot(value: string | string[] | undefined): DraftSlot | null {
  const match = /^(aliado|enemigo)-(top|jungle|middle|bottom|support)$/.exec(first(value));
  if (!match || !ROLE_SET.has(match[2] ?? '')) return null;
  return {
    team: match[1] === 'aliado' ? 'allies' : 'enemies',
    role: match[2] as DraftRole,
  };
}

function parsePlayers(
  value: string | string[] | undefined,
  validUserIds: ReadonlySet<number>,
): DraftPlayerAssignment[] {
  const players: DraftPlayerAssignment[] = [];
  const usedRoles = new Set<DraftRole>();
  const usedUsers = new Set<number>();

  for (const entry of first(value).split(',')) {
    const match = /^(top|jungle|middle|bottom|support)-(\d+)$/.exec(entry.trim());
    if (!match) continue;
    const role = match[1] as DraftRole;
    const userId = Number(match[2]);
    if (!Number.isSafeInteger(userId)
      || !validUserIds.has(userId)
      || usedRoles.has(role)
      || usedUsers.has(userId)) continue;

    players.push({ role, userId });
    usedRoles.add(role);
    usedUsers.add(userId);
  }

  return players;
}

/**
 * Parsea toda entrada como no confiable. El resultado siempre cumple las precondiciones de
 * analyzeDraft: roles únicos por equipo y campeones únicos en todo el draft.
 */
export function parseDraftUrl(
  searchParams: DraftSearchParams,
  validChampionKeys: ReadonlySet<number> | readonly number[],
  validUserIds: ReadonlySet<number> | readonly number[] = [],
): DraftUrlState {
  const keys = validChampionKeys instanceof Set
    ? validChampionKeys
    : new Set(validChampionKeys);
  const globallyUsed = new Set<number>();
  const userIds = validUserIds instanceof Set ? validUserIds : new Set(validUserIds);
  const allies = parseTeam(searchParams.aliados, keys, globallyUsed);
  const enemies = parseTeam(searchParams.enemigos, keys, globallyUsed);
  const rawRisk = first(searchParams.riesgo);
  const rawPanel = first(searchParams.panel);
  const rawMatchupScope = first(searchParams.cruces);

  return {
    allies,
    enemies,
    players: parsePlayers(searchParams.jugadores, userIds),
    risk: (RISK_SET.has(rawRisk) ? rawRisk : 'medium') as DraftRisk,
    panel: rawPanel === 'analisis' ? 'analisis' : 'draft',
    matchupScope: rawMatchupScope === 'todos' ? 'all' : 'head-to-head',
    slot: parseSlot(searchParams.slot),
  };
}

function cloneSearchParams(searchParams: DraftSearchParams): URLSearchParams {
  const query = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(searchParams)) {
    if (rawValue === undefined) continue;
    for (const value of Array.isArray(rawValue) ? rawValue : [rawValue]) query.append(key, value);
  }
  return query;
}

function sorted(picks: readonly DraftPick[]): DraftPick[] {
  return [...picks].sort((a, b) => (ROLE_INDEX.get(a.role) ?? 0) - (ROLE_INDEX.get(b.role) ?? 0));
}

function serializeTeam(picks: readonly DraftPick[]): string {
  return sorted(picks).map(({ championKey, role }) => `${championKey}-${role}`).join(',');
}

function serializePlayers(players: readonly DraftPlayerAssignment[]): string {
  return [...players]
    .sort((a, b) => (ROLE_INDEX.get(a.role) ?? 0) - (ROLE_INDEX.get(b.role) ?? 0))
    .map(({ role, userId }) => `${role}-${userId}`)
    .join(',');
}

function slotValue(slot: DraftSlot): string {
  return `${slot.team === 'allies' ? 'aliado' : 'enemigo'}-${slot.role}`;
}

function stateHref(searchParams: DraftSearchParams, state: DraftUrlState): string {
  const query = cloneSearchParams(searchParams);
  query.set('tipo', 'draft');
  const allies = serializeTeam(state.allies);
  const enemies = serializeTeam(state.enemies);
  if (allies) query.set('aliados', allies); else query.delete('aliados');
  if (enemies) query.set('enemigos', enemies); else query.delete('enemigos');
  const players = serializePlayers(state.players);
  if (players) query.set('jugadores', players); else query.delete('jugadores');
  if (state.risk === 'medium') query.delete('riesgo'); else query.set('riesgo', state.risk);
  if (state.panel === 'draft') query.delete('panel'); else query.set('panel', state.panel);
  if (state.matchupScope === 'head-to-head') query.delete('cruces');
  else query.set('cruces', 'todos');
  if (state.slot) query.set('slot', slotValue(state.slot)); else query.delete('slot');
  return `/scout?${query.toString()}`;
}

export function draftPickHref(
  searchParams: DraftSearchParams,
  state: DraftUrlState,
  slot: DraftSlot,
  championKey: number,
): string {
  const withoutChampion = {
    allies: state.allies.filter((pick) => pick.championKey !== championKey),
    enemies: state.enemies.filter((pick) => pick.championKey !== championKey),
  };
  const picks = withoutChampion[slot.team].filter((pick) => pick.role !== slot.role);
  return stateHref(searchParams, {
    ...state,
    ...withoutChampion,
    [slot.team]: [...picks, { championKey, role: slot.role }],
    slot,
  });
}

export function removeDraftPickHref(
  searchParams: DraftSearchParams,
  state: DraftUrlState,
  slot: DraftSlot,
): string {
  return stateHref(searchParams, {
    ...state,
    [slot.team]: state[slot.team].filter((pick) => pick.role !== slot.role),
    slot,
  });
}

export function draftSlotHref(
  searchParams: DraftSearchParams,
  state: DraftUrlState,
  slot: DraftSlot | null,
): string {
  return stateHref(searchParams, { ...state, slot });
}

export function draftRiskHref(
  searchParams: DraftSearchParams,
  state: DraftUrlState,
  risk: DraftRisk,
): string {
  return stateHref(searchParams, { ...state, risk });
}

export function draftPlayerHref(
  searchParams: DraftSearchParams,
  state: DraftUrlState,
  role: DraftRole,
  userId: number | null,
): string {
  const players = state.players.filter((player) => (
    player.role !== role && (userId === null || player.userId !== userId)
  ));
  return stateHref(searchParams, {
    ...state,
    players: userId === null ? players : [...players, { role, userId }],
  });
}

export function draftPanelHref(
  searchParams: DraftSearchParams,
  state: DraftUrlState,
  panel: DraftPanel,
): string {
  return stateHref(searchParams, { ...state, panel });
}

export function draftMatchupScopeHref(
  searchParams: DraftSearchParams,
  state: DraftUrlState,
  matchupScope: DraftMatchupScope,
): string {
  return stateHref(searchParams, { ...state, matchupScope });
}

export function clearDraftHref(
  searchParams: DraftSearchParams,
  state: DraftUrlState,
): string {
  return stateHref(searchParams, { ...state, allies: [], enemies: [] });
}
