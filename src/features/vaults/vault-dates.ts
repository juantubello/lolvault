import { APP_TIME_ZONE } from '@/config';

export const DAY_MS = 24 * 60 * 60 * 1000;

// Argentina usa UTC-3 todo el año (sin horario de verano desde 2009).
const APP_UTC_OFFSET = '-03:00';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Fecha calendario "YYYY-MM-DD" en hora argentina. */
export function toLocalDateString(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** "2026-09-20" → 00:00 de ese día en hora argentina. Null si la fecha no existe. */
export function startOfLocalDay(value: string): Date | null {
  if (!DATE_PATTERN.test(value)) return null;

  const date = new Date(`${value}T00:00:00${APP_UTC_OFFSET}`);
  if (Number.isNaN(date.getTime())) return null;

  // Descarta fechas que JS "corre" al mes siguiente (ej. 2026-02-30).
  return toLocalDateString(date) === value ? date : null;
}

export function daysBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

/** "5 h", "40 min", "3 d" hasta `until`. */
export function formatTimeLeft(until: Date, now: Date): string {
  const minutes = Math.max(Math.round((until.getTime() - now.getTime()) / 60_000), 0);
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} d`;
}

/** "20 sep – 27 sep" a partir de desde y hasta exclusivo. */
export function formatDateRange(startsAt: Date, endsAtExclusive: Date): string {
  return `${formatShortDate(startsAt)} – ${formatShortDate(addDays(endsAtExclusive, -1))}`;
}

/** "20 sep" en español, hora argentina. */
export function formatShortDate(date: Date): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: APP_TIME_ZONE,
    day: 'numeric',
    month: 'short',
  })
    .format(date)
    .replace('.', '');
}
