import { CircleAlert, TrendingUp } from 'lucide-react';

import { positionLabel, queueLabel } from '@/features/matches/format';
import type { PlayerStats } from '@/features/matches/player-stats';
import {
  buildOpponentAnalystReport,
  buildSelfAnalystReport,
  type AnalystSignal,
} from '@/features/scout/analyst';

type LoadedStats = Extract<PlayerStats, { status: 'ok' }>;

function SignalList({
  signals,
  tone,
}: {
  signals: AnalystSignal[];
  tone: 'strength' | 'weakness';
}) {
  if (signals.length === 0) return null;
  const Icon = tone === 'strength' ? TrendingUp : CircleAlert;
  return (
    <section className="analyst-group" data-tone={tone}>
      <h3>{tone === 'strength' ? 'Fortalezas' : 'Debilidades'}</h3>
      <ul>
        {signals.map((signal) => (
          <li key={signal.id}>
            <Icon aria-hidden="true" size={19} strokeWidth={2} />
            <span>{signal.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Misma superficie para Scout/Amigos y Perfil; solo cambia contra qué se compara. */
export function PlayerAnalystPanel({
  mode,
  stats,
  userId,
}: {
  mode: 'opponent' | 'self';
  stats: LoadedStats;
  userId: number;
}) {
  const report = mode === 'self'
    ? buildSelfAnalystReport({ matches: stats.matches, season: stats.profile?.rankedSeason })
    : buildOpponentAnalystReport({ details: stats.details, matches: stats.matches });
  const headingId = `analyst-heading-${mode}-${userId}`;
  const context = report.context
    ? `${positionLabel(report.context.position)} · ${queueLabel(report.context.queue)}`
    : mode === 'self'
      ? 'Contra tu propio historial'
      : 'Últimas partidas cacheadas';
  const hasSignals = report.strengths.length > 0 || report.weaknesses.length > 0;

  return (
    <section aria-labelledby={headingId} className="analyst-panel">
      <header>
        <div>
          <p className="analyst-eyebrow">{mode === 'self' ? 'Tu rendimiento' : 'Antes de jugar'}</p>
          <h2 id={headingId}>{mode === 'self' ? 'Dónde estás mejor y peor' : 'Cómo juega'}</h2>
        </div>
        <span>{context}</span>
      </header>

      {hasSignals ? (
        <div className="analyst-groups">
          <SignalList signals={report.strengths} tone="strength" />
          <SignalList signals={report.weaknesses} tone="weakness" />
        </div>
      ) : (
        <p className="analyst-empty">Pocas partidas para afirmar algo.</p>
      )}
      <p className="analyst-note">{report.note}</p>
    </section>
  );
}
