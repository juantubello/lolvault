export type ScoutType = 'jugador' | 'draft' | 'registro';

export type ScoutSearchParams = Record<string, string | string[] | undefined>;

export function parseScoutType(value: string | string[] | undefined): ScoutType | null {
  const first = Array.isArray(value) ? value[0] : value;
  return first === 'jugador' || first === 'draft' || first === 'registro' ? first : null;
}

/** Conserva la query vigente y fuerza el segmento canónico al principio. */
export function scoutHref(
  type: ScoutType,
  searchParams: ScoutSearchParams = {},
): string {
  const query = new URLSearchParams({ tipo: type });
  for (const [key, rawValue] of Object.entries(searchParams)) {
    if (key === 'tipo' || rawValue === undefined) continue;
    for (const value of Array.isArray(rawValue) ? rawValue : [rawValue]) {
      query.append(key, value);
    }
  }
  return `/scout?${query.toString()}`;
}
