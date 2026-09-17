import {
  CheckCircle2,
  Clock3,
  Paperclip,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { getDb } from '@/db/client';
import { ratingToWinrate } from '@/features/draft/analysis';
import type { DraftSearchParams } from '@/features/draft/draft-url';
import {
  buildDraftCalibration,
  listCachedDraftRecordMatches,
  listDraftRecords,
  MIN_CALIBRATION_SAMPLE,
  predictedSide,
  recordWasCorrect,
  type DraftRecordPickView,
  type DraftRecordView,
} from '@/features/draft/records';
import type { DraftRole } from '@/features/draft/types';
import { formatDateTime } from '@/features/matches/format';
import { scoutHref } from '@/features/scout/routes';

import {
  AttachDraftMatchForm,
  DeleteDraftRecordForm,
} from './draft-record-actions';
import { ScoutSegments } from './scout-segments';

const ROLE_LABELS: Record<DraftRole, string> = {
  top: 'TOP',
  jungle: 'JG',
  middle: 'MID',
  bottom: 'ADC',
  support: 'SUP',
};

const RISK_LABELS: Record<DraftRecordView['risk'], string> = {
  'very-low': 'Muy bajo',
  low: 'Bajo',
  medium: 'Medio',
  high: 'Alto',
  'very-high': 'Muy alto',
};

const percent = new Intl.NumberFormat('es-AR', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const integer = new Intl.NumberFormat('es-AR');

function formatWindow(patchWindow: string): string {
  return /^\d+$/.test(patchWindow) ? `últimos ${patchWindow} días` : `parche ${patchWindow}`;
}

function PickRow({ label, picks }: { label: string; picks: DraftRecordPickView[] }) {
  return (
    <div className="draft-record-team">
      <strong>{label}</strong>
      <ul aria-label={`${label}: campeones del draft`}>
        {picks.map((pick) => (
          <li aria-label={`${ROLE_LABELS[pick.role]}: ${pick.championName}`} key={pick.role}>
            <Image
              alt=""
              height={44}
              loading="lazy"
              sizes="44px"
              src={pick.imageUrl}
              unoptimized
              width={44}
            />
            <span>{ROLE_LABELS[pick.role]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecordOutcome({ record }: { record: DraftRecordView }) {
  if (!record.match) {
    return (
      <p className="draft-record-outcome" data-tone="pending">
        <Clock3 aria-hidden="true" size={18} strokeWidth={2} />
        Todavía sin partida
      </p>
    );
  }
  if (record.match.savedAfterMatch && !record.capturedLive) {
    return (
      <p className="draft-record-outcome" data-tone="warning">
        <TriangleAlert aria-hidden="true" size={18} strokeWidth={2} />
        No cuenta: se guardó después de la fecha de la partida.
      </p>
    );
  }
  if (record.match.result === 'other') {
    return (
      <p className="draft-record-outcome" data-tone="warning">
        <TriangleAlert aria-hidden="true" size={18} strokeWidth={2} />
        Partida aparte: remake o resultado distinto de WIN/LOSE.
      </p>
    );
  }

  const correct = recordWasCorrect(record);
  const alliesWon = record.match.result === 'win';
  if (correct === null) {
    return (
      <p className="draft-record-outcome" data-tone="pending">
        <Clock3 aria-hidden="true" size={18} strokeWidth={2} />
        Sin acierto ni error: la predicción quedó exactamente sin favorito.
      </p>
    );
  }
  return (
    <p className="draft-record-outcome" data-tone={correct ? 'success' : 'danger'}>
      {correct
        ? <CheckCircle2 aria-hidden="true" size={18} strokeWidth={2} />
        : <XCircle aria-hidden="true" size={18} strokeWidth={2} />}
      {correct ? 'Acierto' : 'Error'}: {alliesWon ? 'tu equipo ganó' : 'ganó el enemigo'}.
    </p>
  );
}

function ComponentsSnapshot({ record }: { record: DraftRecordView }) {
  const allyChampionWinrate = ratingToWinrate(record.components.allyChampions);
  const enemyChampionWinrate = ratingToWinrate(record.components.enemyChampions);
  const allyDuoWinrate = ratingToWinrate(record.components.allyDuos);
  const enemyDuoWinrate = ratingToWinrate(record.components.enemyDuos);
  const matchupWinrate = ratingToWinrate(record.components.matchups);
  return (
    <details className="draft-record-components">
      <summary>Ver predicción congelada</summary>
      <dl>
        <div><dt>Campeones aliados</dt><dd>{percent.format(allyChampionWinrate)}</dd></div>
        <div><dt>Campeones enemigos</dt><dd>{percent.format(enemyChampionWinrate)}</dd></div>
        <div><dt>Duplas aliadas</dt><dd>{percent.format(allyDuoWinrate)}</dd></div>
        <div><dt>Duplas enemigas</dt><dd>{percent.format(enemyDuoWinrate)}</dd></div>
        <div><dt>Cruces</dt><dd>{percent.format(matchupWinrate)}</dd></div>
      </dl>
      <p>
        Riesgo {RISK_LABELS[record.risk].toLocaleLowerCase('es-AR')} · {formatWindow(record.patchWindow)} · corrida #{integer.format(record.syncRunId)}
      </p>
    </details>
  );
}

function RecordCard({
  matchOptions,
  record,
}: {
  matchOptions: ReturnType<typeof listCachedDraftRecordMatches>;
  record: DraftRecordView;
}) {
  const favorite = predictedSide(record.predictedAllyWinrate);
  const confidence = Math.max(record.predictedAllyWinrate, 1 - record.predictedAllyWinrate);
  return (
    <article className="draft-record-card">
      <header>
        <div>
          <strong>{record.savedBy.name}</strong>
          <span>{formatDateTime(record.savedAt)}</span>
          <small className="draft-record-source" data-live={record.capturedLive}>
            {record.capturedLive ? 'Capturado en vivo' : 'Carga manual'}
          </small>
        </div>
        <div className="draft-record-prediction">
          <span>Predicción</span>
          <strong>{percent.format(record.predictedAllyWinrate)} aliado</strong>
          <small>
            {favorite
              ? `Favorito ${favorite === 'allies' ? 'tu equipo' : 'enemigo'} al ${percent.format(confidence)}`
              : 'Sin favorito'}
          </small>
        </div>
      </header>

      <div className="draft-record-picks">
        <PickRow label="Tu equipo" picks={record.picks.filter((pick) => pick.side === 'allies')} />
        <PickRow label="Enemigo" picks={record.picks.filter((pick) => pick.side === 'enemies')} />
      </div>

      <RecordOutcome record={record} />
      <ComponentsSnapshot record={record} />

      {!record.match ? (
        <AttachDraftMatchForm options={matchOptions} recordId={record.id} />
      ) : (
        <p className="draft-record-attached">
          <Paperclip aria-hidden="true" size={18} strokeWidth={2} />
          Partida adjunta · {formatDateTime(record.match.playedAt)}
        </p>
      )}
      {record.canDelete ? <DeleteDraftRecordForm recordId={record.id} /> : null}
    </article>
  );
}

export function DraftRecordSegment({
  searchParams,
  viewerUserId,
}: {
  searchParams: DraftSearchParams;
  viewerUserId: number;
}) {
  const db = getDb();
  const records = listDraftRecords(db, viewerUserId);
  const calibration = buildDraftCalibration(records);
  const validas = calibration.eligibleN === 1
    ? 'Hay 1 partida válida'
    : `Hay ${integer.format(calibration.eligibleN)} partidas válidas`;
  const matchesByUser = new Map(records.filter((record) => !record.match).map((record) => [
    record.savedBy.id,
    listCachedDraftRecordMatches(db, record.savedBy.id, new Date()),
  ]));
  const analysisHref = scoutHref('draft', { ...searchParams, panel: 'analisis' });

  return (
    <Screen title="Scout">
      <ScoutSegments searchParams={searchParams} selected="registro" />
      <div className="draft-record-screen">
        <header className="draft-record-intro">
          <div>
            <h2>Registro de drafts</h2>
            <p>Lo que predijimos queda congelado; la partida sólo cuenta si coincide y terminó normalmente.</p>
          </div>
          <Link className="text-button" href={analysisHref}>Volver al análisis</Link>
        </header>

        {records.length ? (
          <div className="draft-record-list">
            {records.map((record) => (
              <RecordCard
                key={record.id}
                matchOptions={matchesByUser.get(record.savedBy.id) ?? []}
                record={record}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            description="Armá un draft completo y guardalo para comparar después la predicción con la partida."
            icon={Clock3}
            title="Todavía no hay drafts guardados"
          />
        )}

        <section aria-labelledby="draft-calibration-heading" className="draft-calibration">
          <header>
            <h2 id="draft-calibration-heading">Calibración por banda</h2>
            <p>
              Agrupa la confianza del lado favorito y cuenta si ese lado ganó. Remakes y registros
              manuales guardados tarde quedan afuera; las capturas en vivo sí cuentan.
            </p>
          </header>
          <p className="draft-calibration-honesty" data-enough={calibration.enoughEvidence}>
            <TriangleAlert aria-hidden="true" size={20} strokeWidth={2} />
            <span>
              {calibration.enoughEvidence
                ? `${validas} en total. Mirá igualmente el n de cada banda: una banda con menos de ${MIN_CALIBRATION_SAMPLE} sigue siendo descriptiva.`
                : `${validas}. No alcanza para concluir nada: usamos ${MIN_CALIBRATION_SAMPLE} como mínimo y cada porcentaje se muestra con su n.`}
            </span>
          </p>
          <ul className="draft-calibration-bands">
            {calibration.bands.map((band) => (
              <li key={band.lower}>
                <span>Predicción {band.label}</span>
                {band.rate ? (
                  <strong>
                    {percent.format(band.rate.percentage)} de acierto · n={integer.format(band.rate.n)}
                    <small>{integer.format(band.rate.wins)} de {integer.format(band.rate.n)}</small>
                  </strong>
                ) : (
                  <strong>Sin partidas · n=0</strong>
                )}
              </li>
            ))}
          </ul>
          {calibration.excludedN ? (
            <p className="draft-record-note">
              Excluidas de la calibración: n={integer.format(calibration.excludedN)} (sin partida,
              remake, sin favorito o cargas manuales guardadas después).
            </p>
          ) : null}
        </section>
      </div>
    </Screen>
  );
}
