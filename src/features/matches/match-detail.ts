import { POSITIONS } from './format';
import type { MatchParticipant, RiotId } from './types';

export type MatchMemberIdentity = {
  id: number;
  riotGameName: string | null;
  riotTagLine: string | null;
};

const POSITION_ORDER = new Map<string, number>(POSITIONS.map((position, index) => [position, index]));

/** Orden de línea de League; los roles desconocidos quedan al final y conservan su orden. */
export function sortParticipantsByPosition<T extends Pick<MatchParticipant, 'position'>>(participants: readonly T[]): T[] {
  return participants
    .map((participant, index) => ({ participant, index }))
    .sort((a, b) => (
      (POSITION_ORDER.get(a.participant.position ?? '') ?? POSITIONS.length)
      - (POSITION_ORDER.get(b.participant.position ?? '') ?? POSITIONS.length)
      || a.index - b.index
    ))
    .map(({ participant }) => participant);
}

export function csPerMinute(cs: number, durationSeconds: number): number {
  return durationSeconds > 0 ? cs / (durationSeconds / 60) : 0;
}

function share(part: number, total: number): number {
  return total > 0 ? part / total : 0;
}

export function damageShare(damage: number, teamDamage: number): number {
  return share(damage, teamDamage);
}

export function killParticipation(kills: number, assists: number, teamKills: number): number {
  return share(kills + assists, teamKills);
}

export function multiKillLabel(count: number | undefined): 'Doble' | 'Triple' | 'Cuádruple' | 'Pentakill' | null {
  if (count === undefined || count < 2) return null;
  if (count === 2) return 'Doble';
  if (count === 3) return 'Triple';
  if (count === 4) return 'Cuádruple';
  return 'Pentakill';
}

/** OP.GG reserva el distintivo para el puesto general #1. */
export function performanceBadge(
  participant: Pick<MatchParticipant, 'opScoreRank'>,
  teamWon: boolean,
): 'MVP' | 'ACE' | null {
  if (participant.opScoreRank !== 1) return null;
  return teamWon ? 'MVP' : 'ACE';
}

/** Destinos cerrados: ningún valor arbitrario del query string se convierte en URL. */
export function matchBackHref(
  currentUserId: number,
  focusUserId: number,
  source: string | null,
  focusRiotId?: RiotId,
): string {
  if (source === 'votaciones') return '/';
  if (source === 'black-list') return '/castigos?tipo=black-list';
  if (source === 'scout' && focusRiotId) {
    return `/scout?jugador=${encodeURIComponent(`${focusRiotId.gameName}#${focusRiotId.tagLine}`)}`;
  }
  return currentUserId === focusUserId ? '/perfil' : `/amigos/${focusUserId}`;
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}

export function sameRiotId(
  left: Pick<RiotId, 'gameName' | 'tagLine'>,
  right: Pick<RiotId, 'gameName' | 'tagLine'>,
): boolean {
  return normalized(left.gameName) === normalized(right.gameName)
    && normalized(left.tagLine) === normalized(right.tagLine);
}

/** Vincula por Riot ID visible, nunca por puuid. */
export function findMemberForParticipant<T extends MatchMemberIdentity>(
  participant: Pick<MatchParticipant, 'gameName' | 'tagLine'>,
  members: readonly T[],
): T | undefined {
  return members.find((member) => (
    member.riotGameName !== null
    && member.riotTagLine !== null
    && sameRiotId(
      participant,
      { gameName: member.riotGameName, tagLine: member.riotTagLine },
    )
  ));
}
