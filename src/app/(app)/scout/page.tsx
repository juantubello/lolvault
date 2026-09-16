import { Search, Telescope } from 'lucide-react';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/auth/current-user';
import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { ScoutPlayerReport } from '@/components/scout/player-report';
import { getDb } from '@/db/client';
import { findActiveBlacklistByRiotIds } from '@/features/blacklist/blacklist.queries';
import { riotIdKey } from '@/features/blacklist/blacklist-rules';
import { championImagesByKey } from '@/features/champions/champion-images';
import { getMatchProvider } from '@/features/matches/provider';
import { loadScoutPlayerStats, parseScoutRiotId } from '@/features/scout/player';

export const dynamic = 'force-dynamic';

type PageSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

export default async function ScoutPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const user = await getCurrentUser();
  if (!user?.displayName) redirect('/onboarding');

  const query = first((await searchParams).jugador);
  const parsed = query ? parseScoutRiotId(query) : null;
  const now = new Date();
  let report = null;

  if (parsed?.ok) {
    const db = getDb();
    const loaded = await loadScoutPlayerStats(db, getMatchProvider(), parsed.riotId, now);
    if (loaded.stats.status === 'ok' && !loaded.stats.notFound) {
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
    }
  }

  const invalidError = parsed && !parsed.ok ? parsed.error : null;
  const notFoundError = parsed?.ok && !report
    ? `No encontramos a ${parsed.text}. Revisá el nombre y el tag.`
    : null;

  return (
    <Screen title="Scout">
      <form action="/scout" className="scout-search" role="search">
        <label htmlFor="scout-riot-id">Buscá un rival por Riot ID</label>
        <p id="scout-riot-help">Escribí el nombre y el tag completos para ver su rendimiento reciente.</p>
        <div className="scout-search-control">
          <Search aria-hidden="true" size={20} strokeWidth={2} />
          <input
            aria-describedby={`scout-riot-help${invalidError || notFoundError ? ' scout-riot-error' : ''}`}
            aria-invalid={Boolean(invalidError || notFoundError)}
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
          <button type="submit">Buscar</button>
        </div>
        {invalidError || notFoundError ? (
          <p className="field-error" id="scout-riot-error" role="alert">{invalidError ?? notFoundError}</p>
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
