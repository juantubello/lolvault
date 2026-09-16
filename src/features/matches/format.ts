/** Textos en español para colas, roles, rangos y números de partidas. */
import { APP_TIME_ZONE } from '@/config';

import type { RankEntry } from '@/features/matches/types';

const QUEUE_LABELS: Record<string, string> = {
  SOLORANKED: 'Solo/Duo',
  FLEXRANKED: 'Flex',
  NORMAL: 'Normal',
  ARAM: 'ARAM',
  ARENA: 'Arena',
  URF: 'URF',
  CLASH: 'Clash',
};

export function queueLabel(queue: string): string {
  return QUEUE_LABELS[queue] ?? queue.charAt(0) + queue.slice(1).toLowerCase();
}

export const POSITIONS = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'] as const;

const POSITION_LABELS: Record<string, string> = {
  TOP: 'Top',
  JUNGLE: 'Jungla',
  MID: 'Mid',
  ADC: 'ADC',
  SUPPORT: 'Support',
};

export function positionLabel(position: string): string {
  return POSITION_LABELS[position] ?? position;
}

const TIER_LABELS: Record<string, string> = {
  IRON: 'Hierro',
  BRONZE: 'Bronce',
  SILVER: 'Plata',
  GOLD: 'Oro',
  PLATINUM: 'Platino',
  EMERALD: 'Esmeralda',
  DIAMOND: 'Diamante',
  MASTER: 'Maestro',
  GRANDMASTER: 'Gran Maestro',
  CHALLENGER: 'Retador',
};

const TIERS_WITHOUT_DIVISION = new Set(['MASTER', 'GRANDMASTER', 'CHALLENGER']);

/** "Platino 4", "Maestro"; null si no tiene rango en esa cola. */
export function rankLabel(entry: RankEntry): string | null {
  if (!entry.tier) return null;
  const tier = TIER_LABELS[entry.tier] ?? entry.tier;
  return TIERS_WITHOUT_DIVISION.has(entry.tier) || entry.division === null ? tier : `${tier} ${entry.division}`;
}

const numberFormat = new Intl.NumberFormat('es-AR');

export function formatNumber(value: number): string {
  return numberFormat.format(Math.round(value));
}

/** "2,41"; "Perfecto" sin muertes. */
export function formatKda(kda: number | null): string {
  return kda === null
    ? 'Perfecto'
    : kda.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatAverage(value: number): string {
  return value.toLocaleString('es-AR', { maximumFractionDigits: 1 });
}

export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

/** 2220 → "37:00". */
export function formatDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
}

/** "hace 12 min", "hace 5 h", "hace 2 d". */
export function timeAgo(date: Date, now: Date): string {
  const minutes = Math.max(Math.round((now.getTime() - date.getTime()) / 60_000), 0);
  if (minutes < 1) return 'recién';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} d`;
}

/** "14 sept, 18:51" en hora argentina (24 h: es-AR usa "p. m." por defecto). */
export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: APP_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(date)
    .replace('.', '');
}
