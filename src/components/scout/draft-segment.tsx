import { Database } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { getDb } from '@/db/client';
import { champions } from '@/db/schema';
import {
  analyzeDraft,
  DRAFT_PRIOR_GAMES,
  type DraftPick,
  type DraftRisk,
} from '@/features/draft/analysis';
import {
  clearDraftHref,
  draftPanelHref,
  draftPickHref,
  draftRiskHref,
  draftSlotHref,
  parseDraftUrl,
  removeDraftPickHref,
  type DraftSearchParams,
  type DraftSlot,
  type DraftTeam,
  type DraftUrlState,
} from '@/features/draft/draft-url';
import {
  getDraftMatrix,
  getDraftScalingMatrix,
  getLatestCompletedDraftRun,
} from '@/features/draft/matrix-cache';
import { calculateDraftScalingCurves } from '@/features/draft/scaling';
import {
  buildDraftChampionGrid,
  type DraftChampionCatalogItem,
} from '@/features/draft/suggestion-grid';
import { DRAFT_ROLES, type DraftRole } from '@/features/draft/types';
import { championImageUrl, ensureChampions } from '@/features/champions/ddragon-sync';
import { searchKey } from '@/features/champions/search-key';
import { timeAgo } from '@/features/matches/format';

import { DraftChampionGrid, type DraftChampionGridViewItem } from './draft-champion-grid';
import { DraftAnalysisPanel } from './draft-analysis-panel';
import { ScoutSegments } from './scout-segments';

const ROLE_LABELS: Record<DraftRole, { short: string; full: string }> = {
  top: { short: 'TOP', full: 'carril superior' },
  jungle: { short: 'JG', full: 'jungla' },
  middle: { short: 'MID', full: 'carril central' },
  bottom: { short: 'ADC', full: 'carril inferior (ADC)' },
  support: { short: 'SUP', full: 'soporte' },
};

const RISK_LABELS: Record<DraftRisk, string> = {
  'very-low': 'Muy bajo',
  low: 'Bajo',
  medium: 'Medio',
  high: 'Alto',
  'very-high': 'Muy alto',
};

const percent = new Intl.NumberFormat('es-AR', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const points = new Intl.NumberFormat('es-AR', {
  signDisplay: 'always',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatWindow(patchWindow: string): string {
  return /^\d+$/.test(patchWindow)
    ? `Últimos ${patchWindow} días`
    : `Parche ${patchWindow}`;
}

function slotLabel(slot: DraftSlot): string {
  return `${ROLE_LABELS[slot.role].full} ${slot.team === 'allies' ? 'aliado' : 'enemigo'}`;
}

function TeamSlots({
  team,
  title,
  picks,
  state,
  searchParams,
  championsByKey,
}: {
  team: DraftTeam;
  title: string;
  picks: readonly DraftPick[];
  state: DraftUrlState;
  searchParams: DraftSearchParams;
  championsByKey: ReadonlyMap<number, DraftChampionCatalogItem>;
}) {
  const byRole = new Map(picks.map((pick) => [pick.role, pick]));
  return (
    <section aria-labelledby={`draft-${team}-heading`} className="draft-team">
      <h2 id={`draft-${team}-heading`}>{title}</h2>
      <ul className="draft-slot-list">
        {DRAFT_ROLES.map((role) => {
          const slot: DraftSlot = { team, role };
          const pick = byRole.get(role);
          const champion = pick ? championsByKey.get(pick.championKey) : null;
          const selected = state.slot?.team === team && state.slot.role === role;
          return (
            <li className="draft-slot" data-filled={Boolean(champion)} key={role}>
              <Link
                aria-current={selected ? 'true' : undefined}
                aria-label={champion
                  ? `${champion.name} en ${ROLE_LABELS[role].full} de ${title.toLocaleLowerCase('es-AR')}: cambiar`
                  : `Elegir campeón para ${ROLE_LABELS[role].full} de ${title.toLocaleLowerCase('es-AR')}`}
                className="draft-slot-select"
                href={`${draftSlotHref(searchParams, state, slot)}#draft-picker`}
              >
                <span className="draft-role-label">{ROLE_LABELS[role].short}</span>
                {champion ? (
                  <Image
                    alt=""
                    className="draft-slot-image"
                    height={48}
                    src={champion.imageUrl}
                    unoptimized
                    width={48}
                  />
                ) : (
                  <span aria-hidden="true" className="draft-slot-empty">+</span>
                )}
                <span className="draft-slot-name">{champion ? champion.name : 'Elegir'}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function DraftPanelSegments({
  state,
  searchParams,
}: {
  state: DraftUrlState;
  searchParams: DraftSearchParams;
}) {
  return (
    <nav aria-label="Panel de Draft" className="segmented draft-panel-segmented">
      <Link
        aria-current={state.panel === 'draft' ? 'true' : undefined}
        className="segmented-item"
        href={draftPanelHref(searchParams, state, 'draft')}
      >
        Draft
      </Link>
      <Link
        aria-current={state.panel === 'analisis' ? 'true' : undefined}
        className="segmented-item"
        href={draftPanelHref(searchParams, state, 'analisis')}
      >
        Análisis
      </Link>
    </nav>
  );
}

export async function DraftSegment({ searchParams }: { searchParams: DraftSearchParams }) {
  const db = getDb();

  try {
    await ensureChampions(db);
  } catch (error) {
    console.error('[champions] No se pudieron cargar desde Data Dragon:', error);
  }

  const run = getLatestCompletedDraftRun(db);
  const matrix = getDraftMatrix(db);

  if (!run || !matrix) {
    return (
      <Screen title="Scout">
        <ScoutSegments searchParams={searchParams} selected="draft" />
        <EmptyState
          description="Cuando termine la primera corrida vas a poder armar composiciones y comparar picks."
          icon={Database}
          title="Todavía no se sincronizaron los datos del draft"
        />
      </Screen>
    );
  }

  const catalog = db.select({
    key: champions.key,
    name: champions.name,
    imageFile: champions.imageFile,
    version: champions.version,
  }).from(champions).all().flatMap((champion) => champion.key === null ? [] : [{
    key: champion.key,
    name: champion.name,
    imageUrl: championImageUrl(champion.version, champion.imageFile),
    searchKey: searchKey(champion.name),
  }]);
  const championsByKey = new Map(catalog.map((champion) => [champion.key, champion]));
  const state = parseDraftUrl(searchParams, new Set(catalog.map((champion) => champion.key)));
  const analysis = analyzeDraft(matrix, state, state.risk);
  const scalingMatrix = getDraftScalingMatrix(db);
  const scaling = scalingMatrix && scalingMatrix.size > 0
    ? calculateDraftScalingCurves(scalingMatrix, state, state.risk)
    : null;
  const enemyWinrate = 1 - analysis.winrate;

  let grid: DraftChampionGridViewItem[] = [];
  if (state.slot) {
    grid = buildDraftChampionGrid({
      matrix,
      draft: state,
      slot: state.slot,
      risk: state.risk,
      champions: catalog,
    }).map((champion) => ({
      ...champion,
      href: draftPickHref(searchParams, state, state.slot as DraftSlot, champion.key),
      winrateLabel: champion.winrate === null ? null : percent.format(champion.winrate),
      matchupLabel: champion.matchupPoints === null ? null : `${points.format(champion.matchupPoints)} pp`,
      synergyLabel: champion.synergyPoints === null ? null : `${points.format(champion.synergyPoints)} pp`,
    }));
  }

  const selectedPick = state.slot
    ? state[state.slot.team].find((pick) => pick.role === state.slot?.role)
    : undefined;
  const occupant = state.slot && selectedPick
    ? {
      name: championsByKey.get(selectedPick.championKey)?.name ?? '',
      href: removeDraftPickHref(searchParams, state, state.slot),
    }
    : null;

  return (
    <Screen title="Scout">
      <ScoutSegments searchParams={searchParams} selected="draft" />
      <DraftPanelSegments searchParams={searchParams} state={state} />

      {state.panel === 'analisis' ? (
        <div className="draft-screen">
          <header className="draft-data-header">
            <strong>{formatWindow(run.patchWindow)}</strong>
            <span>Actualizado {timeAgo(run.finishedAt, new Date())}</span>
          </header>
          <DraftAnalysisPanel
            analysis={analysis}
            championImages={new Map(catalog.map((champion) => [champion.key, champion.imageUrl]))}
            championNames={new Map(catalog.map((champion) => [champion.key, champion.name]))}
            searchParams={searchParams}
            scaling={scaling}
            state={state}
          />
        </div>
      ) : (
        <div className="draft-screen">
          <header className="draft-data-header">
            <strong>{formatWindow(run.patchWindow)}</strong>
            <span>Actualizado {timeAgo(run.finishedAt, new Date())}</span>
          </header>

          <section aria-labelledby="draft-score-heading" className="draft-score">
            <h2 id="draft-score-heading">Win rate estimado</h2>
            <div className="draft-score-labels">
              <strong>Tu equipo {percent.format(analysis.winrate)}</strong>
              <strong>Enemigo {percent.format(enemyWinrate)}</strong>
            </div>
            <progress
              aria-label={`Tu equipo ${percent.format(analysis.winrate)}; enemigo ${percent.format(enemyWinrate)}`}
              max={1}
              value={analysis.winrate}
            />
            <p>Con el draft vacío, ambos lados parten de 50,00 %; cada pick ajusta esa estimación.</p>
          </section>

          <div className="draft-teams">
            <TeamSlots
              championsByKey={championsByKey}
              picks={state.allies}
              searchParams={searchParams}
              state={state}
              team="allies"
              title="Tu equipo"
            />
            <TeamSlots
              championsByKey={championsByKey}
              picks={state.enemies}
              searchParams={searchParams}
              state={state}
              team="enemies"
              title="Enemigo"
            />
          </div>

          <section aria-labelledby="draft-risk-heading" className="draft-risk">
            <h2 id="draft-risk-heading">Riesgo de la muestra</h2>
            <nav aria-describedby="draft-risk-help" aria-label="Riesgo de la muestra" className="segmented draft-risk-segmented">
              {(Object.keys(DRAFT_PRIOR_GAMES) as DraftRisk[]).map((risk) => (
                <Link
                  aria-current={state.risk === risk ? 'true' : undefined}
                  className="segmented-item"
                  href={draftRiskHref(searchParams, state, risk)}
                  key={risk}
                >
                  {RISK_LABELS[risk]}
                </Link>
              ))}
            </nav>
            <p id="draft-risk-help">Riesgo bajo confía más en el promedio general; riesgo alto le da más peso a la muestra del cruce.</p>
          </section>

          {state.slot ? (
            <DraftChampionGrid
              champions={grid}
              occupant={occupant}
              side={state.slot.team}
              slotLabel={slotLabel(state.slot)}
            />
          ) : (
            <p className="draft-slot-prompt">Tocá un casillero para elegir un campeón.</p>
          )}

          {(state.allies.length || state.enemies.length) ? (
            <Link className="draft-clear" href={clearDraftHref(searchParams, state)}>
              Vaciar draft
            </Link>
          ) : null}
        </div>
      )}
    </Screen>
  );
}
