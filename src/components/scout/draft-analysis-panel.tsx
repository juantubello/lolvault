import Link from 'next/link';

import type { DraftAnalysis } from '@/features/draft/analysis';
import {
  buildDraftAnalysisView,
  type DraftAnalysisValue,
  type DraftChampionBreakdown,
  type DraftDuoViewRow,
  type DraftMatchupViewRow,
  type DraftSideSummary,
} from '@/features/draft/analysis-view';
import {
  draftMatchupScopeHref,
  type DraftSearchParams,
  type DraftTeam,
  type DraftUrlState,
} from '@/features/draft/draft-url';
import type { DraftRole } from '@/features/draft/types';

const ROLE_LABELS: Record<DraftRole, string> = {
  top: 'TOP',
  jungle: 'JG',
  middle: 'MID',
  bottom: 'ADC',
  support: 'SUP',
};

const percent = new Intl.NumberFormat('es-AR', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const SUMMARY_METRICS: ReadonlyArray<{
  key: keyof DraftSideSummary;
  label: string;
  description: string;
}> = [
  {
    key: 'champions',
    label: 'Campeones',
    description: 'La fuerza base combinada de los campeones elegidos.',
  },
  {
    key: 'matchups',
    label: 'Cruces',
    description: 'El win rate estimado si sólo se tuvieran en cuenta los cruces entre ambos equipos.',
  },
  {
    key: 'duos',
    label: 'Duplas',
    description: 'El aporte conjunto de las parejas internas de este equipo.',
  },
  {
    key: 'total',
    label: 'Win rate',
    description: 'La estimación completa al combinar campeones, cruces y duplas de los dos lados.',
  },
];

function teamTitle(side: DraftTeam): string {
  return side === 'allies' ? 'Tu equipo' : 'Enemigo';
}

function formatAnalysisValue(item: DraftAnalysisValue): string {
  if (item.dataState === 'none') return 'Sin datos';
  return percent.format(item.winrate);
}

function AnalysisValue({ value }: { value: DraftAnalysisValue }) {
  return (
    <span className="draft-analysis-value" data-state={value.dataState}>
      {formatAnalysisValue(value)}
      {value.dataState === 'partial' ? <small>Datos parciales</small> : null}
    </span>
  );
}

function SideSummary({ side, summary }: { side: DraftTeam; summary: DraftSideSummary }) {
  return (
    <section aria-labelledby={`draft-analysis-summary-${side}`} className="draft-analysis-side">
      <h3 id={`draft-analysis-summary-${side}`}>{teamTitle(side)}</h3>
      <dl className="draft-analysis-summary-grid">
        {SUMMARY_METRICS.map((metric) => (
          <div key={metric.key}>
            <dt>{metric.label}</dt>
            <dd className="draft-analysis-summary-value">
              {percent.format(summary[metric.key].winrate)}
            </dd>
            <dd className="draft-analysis-summary-description">{metric.description}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function BreakdownMetrics({
  breakdown,
}: {
  breakdown: DraftChampionBreakdown['rows'][number] | DraftChampionBreakdown['totals'];
}) {
  return (
    <dl className="draft-analysis-metrics">
      <div><dt>Base</dt><dd><AnalysisValue value={breakdown.base} /></dd></div>
      <div><dt>Cruces</dt><dd><AnalysisValue value={breakdown.matchups} /></dd></div>
      <div><dt>Duplas</dt><dd><AnalysisValue value={breakdown.duos} /></dd></div>
      <div><dt>Total</dt><dd><AnalysisValue value={breakdown.total} /></dd></div>
    </dl>
  );
}

function ChampionBreakdownTable({ table }: { table: DraftChampionBreakdown }) {
  const title = teamTitle(table.side);
  return (
    <section aria-labelledby={`draft-overview-${table.side}`} className="draft-analysis-table-section">
      <h3 id={`draft-overview-${table.side}`}>{title}</h3>
      {table.rows.length ? (
        <>
          <ul aria-label={`Resumen por campeón de ${title}`} className="draft-analysis-card-list">
            {table.rows.map((row) => (
              <li key={`${row.championKey}-${row.role}`}>
                <header>
                  <span>{ROLE_LABELS[row.role]}</span>
                  <strong>{row.championName}</strong>
                </header>
                <BreakdownMetrics breakdown={row} />
              </li>
            ))}
            <li className="draft-analysis-mobile-total">
              <header><strong>Totales reales</strong></header>
              <BreakdownMetrics breakdown={table.totals} />
            </li>
          </ul>

          <div className="draft-analysis-table-wrap">
            <table>
              <caption className="sr-only">Resumen por campeón de {title}</caption>
              <thead>
                <tr>
                  <th scope="col">Rol</th>
                  <th scope="col">Campeón</th>
                  <th scope="col">Base</th>
                  <th scope="col">Cruces</th>
                  <th scope="col">Duplas</th>
                  <th scope="col">Total</th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row) => (
                  <tr key={`${row.championKey}-${row.role}`}>
                    <td>{ROLE_LABELS[row.role]}</td>
                    <th scope="row">{row.championName}</th>
                    <td><AnalysisValue value={row.base} /></td>
                    <td><AnalysisValue value={row.matchups} /></td>
                    <td><AnalysisValue value={row.duos} /></td>
                    <td><AnalysisValue value={row.total} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={2} scope="row">Totales reales</th>
                  <td><AnalysisValue value={table.totals.base} /></td>
                  <td><AnalysisValue value={table.totals.matchups} /></td>
                  <td><AnalysisValue value={table.totals.duos} /></td>
                  <td><AnalysisValue value={table.totals.total} /></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      ) : (
        <p className="draft-analysis-empty">Todavía no elegiste campeones para este lado.</p>
      )}
    </section>
  );
}

function matchupWinner(row: DraftMatchupViewRow): string {
  if (row.winner === 'no-data') return 'Sin datos';
  if (row.winner === 'even') return 'Parejo';
  return row.winner === 'allies' ? row.allyChampionName : row.enemyChampionName;
}

function MatchupTable({ rows }: { rows: readonly DraftMatchupViewRow[] }) {
  if (!rows.length) {
    return <p className="draft-analysis-empty">Elegí campeones en ambos lados para comparar cruces.</p>;
  }

  return (
    <>
      <ul aria-label="Cruces entre campeones" className="draft-analysis-card-list draft-matchup-cards">
        {rows.map((row) => (
          <li key={`${row.allyChampionKey}-${row.allyRole}-${row.enemyChampionKey}-${row.enemyRole}`}>
            <div className="draft-matchup-versus">
              <span><small>{ROLE_LABELS[row.allyRole]}</small><strong>{row.allyChampionName}</strong></span>
              <b>contra</b>
              <span><small>{ROLE_LABELS[row.enemyRole]}</small><strong>{row.enemyChampionName}</strong></span>
            </div>
            <dl className="draft-matchup-result">
              <div><dt>Win rate aliado</dt><dd>{row.winrate === null ? 'Sin datos' : percent.format(row.winrate)}</dd></div>
              <div><dt>Gana el cruce</dt><dd>{matchupWinner(row)}</dd></div>
            </dl>
          </li>
        ))}
      </ul>

      <div className="draft-analysis-table-wrap draft-matchup-table">
        <table>
          <caption className="sr-only">Cruces entre campeones aliados y enemigos</caption>
          <thead>
            <tr>
              <th scope="col">Rol</th>
              <th scope="col">Aliado</th>
              <th scope="col">Win rate</th>
              <th scope="col">Gana el cruce</th>
              <th scope="col">Rol</th>
              <th scope="col">Oponente</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.allyChampionKey}-${row.allyRole}-${row.enemyChampionKey}-${row.enemyRole}`}>
                <td>{ROLE_LABELS[row.allyRole]}</td>
                <th scope="row">{row.allyChampionName}</th>
                <td>{row.winrate === null ? 'Sin datos' : percent.format(row.winrate)}</td>
                <td>{matchupWinner(row)}</td>
                <td>{ROLE_LABELS[row.enemyRole]}</td>
                <td>{row.enemyChampionName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function DuoList({ side, rows }: { side: DraftTeam; rows: readonly DraftDuoViewRow[] }) {
  const title = teamTitle(side);
  return (
    <section aria-labelledby={`draft-duos-${side}`} className="draft-duo-side">
      <h3 id={`draft-duos-${side}`}>{title}</h3>
      {rows.length ? (
        <ol className="draft-duo-list">
          {rows.map((row) => (
            <li key={`${row.firstChampionKey}-${row.firstRole}-${row.secondChampionKey}-${row.secondRole}`}>
              <span>
                <strong>{row.firstChampionName}</strong>
                <small>{ROLE_LABELS[row.firstRole]}</small>
              </span>
              <b aria-hidden="true">+</b>
              <span>
                <strong>{row.secondChampionName}</strong>
                <small>{ROLE_LABELS[row.secondRole]}</small>
              </span>
              <data value={row.winrate ?? undefined}>
                {row.winrate === null ? 'Sin datos' : percent.format(row.winrate)}
              </data>
            </li>
          ))}
        </ol>
      ) : (
        <p className="draft-analysis-empty">Elegí al menos dos campeones para formar duplas.</p>
      )}
    </section>
  );
}

export function DraftAnalysisPanel({
  analysis,
  championNames,
  searchParams,
  state,
}: {
  analysis: DraftAnalysis;
  championNames: ReadonlyMap<number, string>;
  searchParams: DraftSearchParams;
  state: DraftUrlState;
}) {
  const view = buildDraftAnalysisView(analysis, state.matchupScope, championNames);
  const empty = state.allies.length === 0 && state.enemies.length === 0;

  return (
    <div className="draft-analysis">
      {empty ? (
        <p className="draft-analysis-empty-note">
          Draft vacío: todos los indicadores parten de 50,00 %. Es el valor neutral correcto;
          cada campeón elegido va a ajustar la estimación.
        </p>
      ) : null}

      <section aria-labelledby="draft-analysis-summary-heading" className="draft-analysis-section">
        <header className="draft-analysis-section-header">
          <h2 id="draft-analysis-summary-heading">Resumen por lado</h2>
          <p>Qué aporta cada parte del cálculo, siempre desde la perspectiva del lado indicado.</p>
        </header>
        <div className="draft-analysis-sides">
          <SideSummary side="allies" summary={view.summaries.allies} />
          <SideSummary side="enemies" summary={view.summaries.enemies} />
        </div>
      </section>

      <section aria-labelledby="draft-analysis-champions-heading" className="draft-analysis-section">
        <header className="draft-analysis-section-header">
          <h2 id="draft-analysis-champions-heading">Resumen por campeón</h2>
          <p>El Total de cada fila suma ratings de Base, Cruces y Duplas; nunca porcentajes.</p>
        </header>
        <div className="draft-analysis-overviews">
          <ChampionBreakdownTable table={view.champions.allies} />
          <ChampionBreakdownTable table={view.champions.enemies} />
        </div>
        <p className="draft-analysis-footnote">
          En las filas, una dupla aparece una vez por cada integrante. Por eso esa columna no suma
          el total del pie: el pie usa cada dupla una sola vez. El Total del pie es el resultado
          completo del draft y también incorpora el otro equipo.
        </p>
      </section>

      <section aria-labelledby="draft-analysis-matchups-heading" className="draft-analysis-section">
        <header className="draft-analysis-section-header draft-analysis-matchup-header">
          <div>
            <h2 id="draft-analysis-matchups-heading">Cruces</h2>
            <p>
              Win rates normalizados: 50,00 % significa que el cruce rindió exactamente como se
              esperaba después de descontar la fuerza base de ambos campeones.
            </p>
          </div>
          <nav aria-label="Cruces visibles" className="segmented draft-matchup-segmented">
            <Link
              aria-current={state.matchupScope === 'head-to-head' ? 'true' : undefined}
              className="segmented-item"
              href={draftMatchupScopeHref(searchParams, state, 'head-to-head')}
            >
              Cabeza a cabeza
            </Link>
            <Link
              aria-current={state.matchupScope === 'all' ? 'true' : undefined}
              className="segmented-item"
              href={draftMatchupScopeHref(searchParams, state, 'all')}
            >
              Todos
            </Link>
          </nav>
        </header>
        <MatchupTable rows={view.matchups} />
      </section>

      <section aria-labelledby="draft-analysis-duos-heading" className="draft-analysis-section">
        <header className="draft-analysis-section-header">
          <h2 id="draft-analysis-duos-heading">Duplas</h2>
          <p>
            Win rates normalizados, ordenados de mejor a peor: 50,00 % es rendir tal como se
            esperaba después de descontar la fuerza base de los dos campeones.
          </p>
        </header>
        <div className="draft-duo-sides">
          <DuoList rows={view.duos.allies} side="allies" />
          <DuoList rows={view.duos.enemies} side="enemies" />
        </div>
      </section>
    </div>
  );
}
