export type PunishmentType = 'vaults' | 'black-list';

export type RouteSearchParams = Record<string, string | string[] | undefined>;

export function parsePunishmentType(value: string | string[] | undefined): PunishmentType | null {
  const first = Array.isArray(value) ? value[0] : value;
  return first === 'vaults' || first === 'black-list' ? first : null;
}

/** Conserva filtros de links viejos y fuerza el segmento canónico al principio de la URL. */
export function punishmentHref(
  type: PunishmentType,
  searchParams: RouteSearchParams = {},
): string {
  const query = new URLSearchParams({ tipo: type });
  for (const [key, rawValue] of Object.entries(searchParams)) {
    if (key === 'tipo' || rawValue === undefined) continue;
    for (const value of Array.isArray(rawValue) ? rawValue : [rawValue]) {
      query.append(key, value);
    }
  }
  return `/ripeados?${query.toString()}`;
}
