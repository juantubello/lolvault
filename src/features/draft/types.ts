/** Contrato de ingesta de Draft, independiente de Lolalytics. El job sólo conoce conteos crudos. */

export const DRAFT_ROLES = ['top', 'jungle', 'middle', 'bottom', 'support'] as const;
export type DraftRole = (typeof DRAFT_ROLES)[number];

export type DraftChampionStats = {
  championKey: number;
  role: DraftRole;
  games: number;
  wins: number;
};

export type DraftMatchup = {
  enemyChampionKey: number;
  enemyRole: DraftRole;
  games: number;
  wins: number;
};

export type DraftSynergy = {
  allyChampionKey: number;
  allyRole: DraftRole;
  games: number;
  wins: number;
};

export type DraftDataSourceErrorKind = 'not-found' | 'unavailable' | 'invalid-response';

export class DraftDataSourceError extends Error {
  readonly isDraftDataSourceError = true;

  constructor(
    message: string,
    readonly kind: DraftDataSourceErrorKind,
  ) {
    super(message);
    this.name = 'DraftDataSourceError';
  }
}

export function isDraftDataSourceError(error: unknown): error is DraftDataSourceError {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as Partial<DraftDataSourceError>;
  return candidate.isDraftDataSourceError === true
    && candidate.name === 'DraftDataSourceError'
    && typeof candidate.message === 'string'
    && ['not-found', 'unavailable', 'invalid-response'].includes(candidate.kind ?? '');
}

export type DraftDataSource = {
  readonly name: string;
  getMatchups(input: {
    championKey: number;
    championId: string;
    role: DraftRole;
    enemyRole: DraftRole;
    patchWindow: string;
  }): Promise<{ stats: DraftChampionStats; matchups: DraftMatchup[] }>;
  getSynergies(input: {
    championKey: number;
    championId: string;
    role: DraftRole;
    patchWindow: string;
  }): Promise<DraftSynergy[]>;
};
