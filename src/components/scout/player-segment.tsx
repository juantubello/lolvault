import { Search, Telescope } from 'lucide-react';

import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { ScoutPlayerReport } from '@/components/scout/player-report';
import { OPGG_SCOUT_REGIONS } from '@/config';
import { getDb } from '@/db/client';
import type { User } from '@/db/schema';
import { findActiveBlacklistByRiotIds } from '@/features/blacklist/blacklist.queries';
import { riotIdKey } from '@/features/blacklist/blacklist-rules';
import { championImagesByKey } from '@/features/champions/champion-images';
import { getMatchProvider } from '@/features/matches/provider';
import {
  loadScoutPlayerStats,
  parseScoutRegion,
  parseScoutRiotId,
} from '@/features/scout/player';
import type { ScoutSearchParams } from '@/features/scout/routes';

import { ScoutSegments } from './scout-segments';

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

export async function ScoutPlayerSegment({
  searchParams,
  user,
}: {
  searchParams: ScoutSearchParams;
  user: User & { displayName: string };
}) {
  const query = first(searchParams.jugador);
  const region = parseScoutRegion(first(searchParams.region));
  const parsed = query ? parseScoutRiotId(query) : null;
  const now = new Date();
  let report = null;
  let notFoundError: string | null = null;
  let sourceError: string | null = null;

  if (parsed?.ok) {
    const db = getDb();
    const loaded = await loadScoutPlayerStats(
      db,
      getMatchProvider(region),
      parsed.riotId,
      region,
      now,
    );
    if (loaded.status === 'loaded' && !loaded.stats.notFound) {
      const canonicalRiotId = loaded.stats.profile
        ? { gameName: loaded.stats.profile.gameName, tagLine: loaded.stats.profile.tagLine }
        : loaded.stats.riotId;
      report = (
        <ScoutPlayerReport
          activeBlacklist={
            findActiveBlacklistByRiotIds(db, [canonicalRiotId]).get(riotIdKey(canonicalRiotId)) ?? null
          }
          championImages={championImagesByKey(db)}
          now={now}
          player={loaded.player}
          stats={loaded.stats}
          viewerId={user.id}
        />
      );
    } else if (loaded.status === 'not-found' || (loaded.status === 'loaded' && loaded.stats.notFound)) {
      notFoundError = `No encontramos a ${parsed.text} en ${region}. Revisá el nombre, el tag y la región.`;
    } else if (loaded.status === 'error') {
      sourceError = loaded.error;
    }
  }

  const invalidError = parsed && !parsed.ok ? parsed.error : null;
  const searchError = invalidError ?? notFoundError ?? sourceError;

  return (
    <Screen title="Scout">
      <ScoutSegments searchParams={searchParams} selected="jugador" />

      <form action="/scout" className="scout-search" role="search">
        <input name="tipo" type="hidden" value="jugador" />
        <label htmlFor="scout-riot-id">Buscá un rival por Riot ID</label>
        <p id="scout-riot-help">Escribí el nombre y el tag completos para ver su rendimiento reciente.</p>
        <div className="scout-search-control">
          <Search aria-hidden="true" size={20} strokeWidth={2} />
          <input
            aria-describedby={`scout-riot-help${searchError ? ' scout-riot-error' : ''}`}
            aria-invalid={Boolean(searchError)}
            autoCapitalize="off"
            autoComplete="off"
            defaultValue={query}
            enterKeyHint="search"
            id="scout-riot-id"
            name="jugador"
            placeholder="nombre#tag"
            required
            type="search"
          />
          <select aria-label="Región" defaultValue={region} name="region">
            {OPGG_SCOUT_REGIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <button type="submit">Buscar</button>
        </div>
        {searchError ? (
          <p className="field-error" id="scout-riot-error" role="alert">{searchError}</p>
        ) : null}
      </form>

      {report ?? (!query ? (
        <EmptyState
          description="Vas a ver rango, rendimiento por posición y campeón, y sus últimas partidas."
          icon={Telescope}
          title="Buscá a quien tenés enfrente"
        />
      ) : null)}
    </Screen>
  );
}
