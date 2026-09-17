import { ArrowLeft, ArrowRight, TriangleAlert } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { DRAFT_PRIOR_GAMES, type DraftAnalysis } from '@/features/draft/analysis';
import {
  buildDraftAnalysisView,
  type DraftAnalysisValue,
  type DraftChampionBreakdown,
  type DraftDuoViewRow,
  type DraftMatchupTotal,
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
import type { DraftScalingCurves, DraftScalingPoint } from '@/features/draft/scaling';

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

const integer = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

const compactPercent = new Intl.NumberFormat('es-AR', {
  style: 'percent',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

const SCALING_BUCKETS = [
  { short: '<15', full: 'Menos de 15 min' },
  { short: '15–20', full: '15–20 min' },
  { short: '20–25', full: '20–25 min' },
  { short: '25–30', full: '25–30 min' },
  { short: '30–35', full: '30–35 min' },
  { short: '35–40', full: '35–40 min' },
  { short: '40+', full: 'Más de 40 min' },
] as const;

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

function ChampionIdentity({
  imageUrl,
  name,
}: {
  imageUrl: string | null;
  name: string;
}) {
  return (
    <span className="draft-analysis-champion">
      {imageUrl ? (
        <Image
          alt=""
          className="draft-analysis-champion-image"
          height={32}
          sizes="32px"
          src={imageUrl}
          unoptimized
          width={32}
        />
      ) : (
        <span aria-hidden="true" className="draft-analysis-champion-image" />
      )}
      <span className="draft-analysis-champion-name">{name}</span>
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
                  <strong>
                    <ChampionIdentity imageUrl={row.championImageUrl} name={row.championName} />
                  </strong>
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
                    <th scope="row">
                      <ChampionIdentity imageUrl={row.championImageUrl} name={row.championName} />
                    </th>
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

function MatchupWinner({ row }: { row: DraftMatchupViewRow }) {
  if (row.winner === 'no-data' || row.winner === 'even') {
    return <span className="draft-matchup-winner">{matchupWinner(row)}</span>;
  }

  const winner = matchupWinner(row);
  return (
    <span className="draft-matchup-winner" data-winner={row.winner}>
      {row.winner === 'allies' ? (
        <ArrowLeft aria-hidden="true" size={18} strokeWidth={2} />
      ) : (
        <ArrowRight aria-hidden="true" size={18} strokeWidth={2} />
      )}
      <span className="sr-only">Gana {winner}</span>
    </span>
  );
}

function SmallSampleIndicator({
  games,
  priorGames,
}: {
  games: number;
  priorGames: number;
}) {
  return (
    <span className="draft-matchup-small-sample">
      <TriangleAlert aria-hidden="true" size={16} strokeWidth={2} />
      <span className="sr-only">
        Muestra chica: {integer.format(games)} partidas, por debajo de las{' '}
        {integer.format(priorGames)} del riesgo elegido.
      </span>
    </span>
  );
}

function MatchupRate({
  leading,
  smallSample,
  value,
}: {
  leading: boolean;
  smallSample?: { games: number; priorGames: number };
  value: number | null;
}) {
  return (
    <span className="draft-matchup-rate" data-leading={leading || undefined}>
      {value === null ? 'Sin datos' : percent.format(value)}
      {smallSample ? (
        <SmallSampleIndicator games={smallSample.games} priorGames={smallSample.priorGames} />
      ) : null}
    </span>
  );
}

function MatchupTotalCard({ total }: { total: DraftMatchupTotal }) {
  return (
    <li className="draft-matchup-total-card">
      <header><strong>Total de los cruces mostrados</strong></header>
      <dl className="draft-matchup-result">
        <div><dt>Tu equipo</dt><dd>{percent.format(total.allyWinrate)}</dd></div>
        <div><dt>Oponente</dt><dd>{percent.format(total.opponentWinrate)}</dd></div>
      </dl>
    </li>
  );
}

function MatchupTable({
  priorGames,
  rows,
  total,
}: {
  priorGames: number;
  rows: readonly DraftMatchupViewRow[];
  total: DraftMatchupTotal;
}) {
  if (!rows.length) {
    return <p className="draft-analysis-empty">Elegí campeones en ambos lados para comparar cruces.</p>;
  }

  return (
    <>
      <ul aria-label="Cruces entre campeones" className="draft-analysis-card-list draft-matchup-cards">
        {rows.map((row) => (
          <li key={`${row.allyChampionKey}-${row.allyRole}-${row.enemyChampionKey}-${row.enemyRole}`}>
            <div className="draft-matchup-versus">
              <span>
                <small>{ROLE_LABELS[row.allyRole]}</small>
                <strong>
                  <ChampionIdentity
                    imageUrl={row.allyChampionImageUrl}
                    name={row.allyChampionName}
                  />
                </strong>
              </span>
              <b>contra</b>
              <span>
                <small>{ROLE_LABELS[row.enemyRole]}</small>
                <strong>
                  <ChampionIdentity
                    imageUrl={row.enemyChampionImageUrl}
                    name={row.enemyChampionName}
                  />
                </strong>
              </span>
            </div>
            <dl className="draft-matchup-result">
              <div>
                <dt>Win rate aliado</dt>
                <dd>
                  <MatchupRate
                    leading={row.winner === 'allies'}
                    smallSample={row.smallSample ? { games: row.games, priorGames } : undefined}
                    value={row.winrate}
                  />
                </dd>
              </div>
              <div><dt>Ganador</dt><dd><MatchupWinner row={row} /></dd></div>
              <div>
                <dt>Win rate oponente</dt>
                <dd>
                  <MatchupRate
                    leading={row.winner === 'enemies'}
                    value={row.opponentWinrate}
                  />
                </dd>
              </div>
            </dl>
          </li>
        ))}
        <MatchupTotalCard total={total} />
      </ul>

      <div className="draft-analysis-table-wrap draft-matchup-table">
        <table>
          <caption className="sr-only">Cruces entre campeones aliados y enemigos</caption>
          <thead>
            <tr>
              <th scope="col">Rol</th>
              <th scope="col">Aliado</th>
              <th scope="col">Win rate aliado</th>
              <th scope="col">Ganador</th>
              <th scope="col">Rol</th>
              <th scope="col">Oponente</th>
              <th scope="col">Win rate del oponente</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.allyChampionKey}-${row.allyRole}-${row.enemyChampionKey}-${row.enemyRole}`}>
                <td>{ROLE_LABELS[row.allyRole]}</td>
                <th scope="row">
                  <ChampionIdentity
                    imageUrl={row.allyChampionImageUrl}
                    name={row.allyChampionName}
                  />
                </th>
                <td>
                  <MatchupRate
                    leading={row.winner === 'allies'}
                    smallSample={row.smallSample ? { games: row.games, priorGames } : undefined}
                    value={row.winrate}
                  />
                </td>
                <td><MatchupWinner row={row} /></td>
                <td>{ROLE_LABELS[row.enemyRole]}</td>
                <td>
                  <ChampionIdentity
                    imageUrl={row.enemyChampionImageUrl}
                    name={row.enemyChampionName}
                  />
                </td>
                <td>
                  <MatchupRate
                    leading={row.winner === 'enemies'}
                    value={row.opponentWinrate}
                  />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td aria-hidden="true" />
              <th scope="row">Total de los cruces mostrados</th>
              <td>{percent.format(total.allyWinrate)}</td>
              <td aria-hidden="true">—</td>
              <td aria-hidden="true" />
              <td>Oponente</td>
              <td>{percent.format(total.opponentWinrate)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="draft-analysis-footnote draft-matchup-total-note">
        Este total usa sólo las filas visibles. La tarjeta “Cruces” del resumen siempre usa los
        25 cruces, incluso cuando elegís Cabeza a cabeza.
      </p>
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
              <span className="draft-duo-member">
                <ChampionIdentity
                  imageUrl={row.firstChampionImageUrl}
                  name={row.firstChampionName}
                />
                <small>{ROLE_LABELS[row.firstRole]}</small>
              </span>
              <b aria-hidden="true">+</b>
              <span className="draft-duo-member">
                <ChampionIdentity
                  imageUrl={row.secondChampionImageUrl}
                  name={row.secondChampionName}
                />
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

function AnalysisDisclosure({
  children,
  defaultOpen = false,
  headingId,
  headline,
  title,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
  headingId: string;
  headline: string;
  title: string;
}) {
  return (
    <details className="draft-analysis-disclosure" open={defaultOpen}>
      <summary>
        <h2 id={headingId}>
          <span>{title}</span>{' '}
          <strong>· tu equipo {headline}</strong>
        </h2>
      </summary>
      {children}
    </details>
  );
}

function scalingPath(
  points: readonly DraftScalingPoint[],
  x: (index: number) => number,
  y: (winrate: number) => number,
): string {
  return points.map((point, index) => (
    `${index === 0 ? 'M' : 'L'} ${x(index).toFixed(2)} ${y(point.winrate).toFixed(2)}`
  )).join(' ');
}

function ScalingChart({ curves }: { curves: DraftScalingCurves }) {
  const values = [...curves.allies, ...curves.enemies].map(({ winrate }) => winrate);
  const lowest = Math.min(0.5, ...values);
  const highest = Math.max(0.5, ...values);
  const padding = Math.max(0.015, (highest - lowest) * 0.18);
  let minimum = Math.max(0, Math.floor((lowest - padding) * 20) / 20);
  let maximum = Math.min(1, Math.ceil((highest + padding) * 20) / 20);
  if (maximum - minimum < 0.1) {
    minimum = Math.max(0, minimum - 0.05);
    maximum = Math.min(1, maximum + 0.05);
  }

  const left = 48;
  const right = 364;
  const top = 14;
  const bottom = 184;
  const x = (index: number) => left + (right - left) * index / 6;
  const y = (winrate: number) => top + (maximum - winrate) / (maximum - minimum) * (bottom - top);
  const ticks = Array.from({ length: 5 }, (_, index) => maximum - (maximum - minimum) * index / 4);

  return (
    <section aria-labelledby="draft-scaling-heading" className="draft-analysis-section draft-scaling">
      <header className="draft-analysis-section-header">
        <h2 id="draft-scaling-heading">Scaling</h2>
        <p>
          Win rate normalizado de cada equipo según la duración. Cada campeón se compara contra su
          propio promedio; las dos líneas son independientes y no tienen por qué sumar 100 %.
        </p>
      </header>

      <div className="draft-scaling-legend" aria-hidden="true">
        <span data-side="allies">Tu equipo</span>
        <span data-side="enemies">Enemigo</span>
      </div>
      <svg
        aria-labelledby="draft-scaling-chart-title draft-scaling-chart-description"
        className="draft-scaling-chart"
        role="img"
        viewBox="0 0 375 238"
      >
        <title id="draft-scaling-chart-title">Curvas de Scaling de ambos equipos</title>
        <desc id="draft-scaling-chart-description">
          Las cifras exactas y las duraciones aproximadas están en la tabla que sigue al gráfico.
        </desc>
        {ticks.map((tick) => (
          <g key={tick}>
            <line className="draft-scaling-grid-line" x1={left} x2={right} y1={y(tick)} y2={y(tick)} />
            <text className="draft-scaling-axis-tick" textAnchor="end" x={left - 7} y={y(tick) + 3}>
              {compactPercent.format(tick)}
            </text>
          </g>
        ))}
        <line className="draft-scaling-axis-line" x1={left} x2={left} y1={top} y2={bottom} />
        <line className="draft-scaling-axis-line" x1={left} x2={right} y1={bottom} y2={bottom} />
        {SCALING_BUCKETS.map((bucket, index) => (
          <g key={bucket.short}>
            <line className="draft-scaling-axis-line" x1={x(index)} x2={x(index)} y1={bottom} y2={bottom + 4} />
            <text className="draft-scaling-axis-tick" textAnchor="middle" x={x(index)} y={bottom + 17}>
              {bucket.short}
            </text>
          </g>
        ))}
        <text className="draft-scaling-axis-title" textAnchor="middle" x={(left + right) / 2} y={229}>
          Duración aproximada (minutos)
        </text>
        <text
          className="draft-scaling-axis-title"
          textAnchor="middle"
          transform="rotate(-90 11 99)"
          x={11}
          y={99}
        >
          Win rate normalizado
        </text>
        <path className="draft-scaling-line" d={scalingPath(curves.allies, x, y)} data-side="allies" />
        <path className="draft-scaling-line" d={scalingPath(curves.enemies, x, y)} data-side="enemies" />
        {curves.allies.map((point, index) => (
          <circle
            className="draft-scaling-point"
            cx={x(index)}
            cy={y(point.winrate)}
            data-side="allies"
            key={point.bucket}
            r={3.5}
          />
        ))}
        {curves.enemies.map((point, index) => (
          <rect
            className="draft-scaling-point"
            data-side="enemies"
            height={7}
            key={point.bucket}
            width={7}
            x={x(index) - 3.5}
            y={y(point.winrate) - 3.5}
          />
        ))}
      </svg>

      <div className="draft-scaling-table-wrap">
        <table className="draft-scaling-table">
          <caption className="sr-only">Valores exactos de Scaling por duración aproximada</caption>
          <thead>
            <tr>
              <th scope="col">Duración aprox.</th>
              <th scope="col">Tu equipo</th>
              <th scope="col">Enemigo</th>
            </tr>
          </thead>
          <tbody>
            {SCALING_BUCKETS.map((bucket, index) => (
              <tr key={bucket.full}>
                <th scope="row">{bucket.full}</th>
                <td>{percent.format(curves.allies[index]!.winrate)}</td>
                <td>{percent.format(curves.enemies[index]!.winrate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="draft-analysis-footnote">
        Las duraciones son aproximadas: Lolalytics numera siete tramos pero no publica sus rótulos.
      </p>
    </section>
  );
}

export function DraftAnalysisPanel({
  analysis,
  championImages,
  championNames,
  scaling,
  searchParams,
  state,
}: {
  analysis: DraftAnalysis;
  championImages: ReadonlyMap<number, string>;
  championNames: ReadonlyMap<number, string>;
  scaling: DraftScalingCurves | null;
  searchParams: DraftSearchParams;
  state: DraftUrlState;
}) {
  const view = buildDraftAnalysisView(analysis, state.matchupScope, championNames, {
    imageUrls: championImages,
    risk: state.risk,
  });
  const empty = state.allies.length === 0 && state.enemies.length === 0;
  const priorGames = DRAFT_PRIOR_GAMES[state.risk];

  return (
    <div className="draft-analysis">
      {scaling ? <ScalingChart curves={scaling} /> : null}

      {empty ? (
        <p className="draft-analysis-empty-note">
          Draft vacío: todos los indicadores parten de 50,00 %. Es el valor neutral correcto;
          cada campeón elegido va a ajustar la estimación.
        </p>
      ) : null}

      <AnalysisDisclosure
        defaultOpen={!scaling}
        headingId="draft-analysis-summary-heading"
        headline={percent.format(view.summaries.allies.total.winrate)}
        title="Resumen por lado"
      >
        <section aria-labelledby="draft-analysis-summary-heading" className="draft-analysis-section draft-analysis-disclosure-content">
          <header className="draft-analysis-section-header">
            <p>Qué aporta cada parte del cálculo, siempre desde la perspectiva del lado indicado.</p>
          </header>
          <div className="draft-analysis-sides">
            <SideSummary side="allies" summary={view.summaries.allies} />
            <SideSummary side="enemies" summary={view.summaries.enemies} />
          </div>
        </section>
      </AnalysisDisclosure>

      <AnalysisDisclosure
        headingId="draft-analysis-champions-heading"
        headline={percent.format(view.champions.allies.totals.total.winrate)}
        title="Resumen por campeón"
      >
        <section aria-labelledby="draft-analysis-champions-heading" className="draft-analysis-section draft-analysis-disclosure-content">
          <header className="draft-analysis-section-header">
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
      </AnalysisDisclosure>

      <AnalysisDisclosure
        headingId="draft-analysis-matchups-heading"
        headline={percent.format(view.summaries.allies.matchups.winrate)}
        title="Cruces"
      >
        <section aria-labelledby="draft-analysis-matchups-heading" className="draft-analysis-section draft-analysis-disclosure-content">
          <header className="draft-analysis-section-header draft-analysis-matchup-header">
            <div>
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
          <p className="draft-matchup-sample-note">
            <TriangleAlert aria-hidden="true" size={16} strokeWidth={2} />
            <span>
              <strong>Muestra chica:</strong> menos de {integer.format(priorGames)} partidas para el
              riesgo elegido. Con esa cantidad, el número se apoya más en el promedio general que en
              el cruce en sí.
            </span>
          </p>
          <MatchupTable priorGames={priorGames} rows={view.matchups} total={view.matchupTotal} />
        </section>
      </AnalysisDisclosure>

      <AnalysisDisclosure
        headingId="draft-analysis-duos-heading"
        headline={percent.format(view.summaries.allies.duos.winrate)}
        title="Duplas"
      >
        <section aria-labelledby="draft-analysis-duos-heading" className="draft-analysis-section draft-analysis-disclosure-content">
          <header className="draft-analysis-section-header">
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
      </AnalysisDisclosure>
    </div>
  );
}
