'use client';

import { Check, Save, Trash2 } from 'lucide-react';
import Link from 'next/link';
import type { ComponentProps } from 'react';
import { useActionState, useState } from 'react';

import { ChampionIcon } from '@/components/matches/champion-icon';
import {
  attachDraftRecordMatchAction,
  deleteDraftRecordAction,
  saveDraftRecordAction,
  type DraftRecordActionState,
} from '@/features/draft/records.actions';
import type { DraftRecordMatchOption } from '@/features/draft/records';

const initialState: DraftRecordActionState = {};

export function draftSaveLabel(missingPicks: number): string {
  if (missingPicks === 1) return 'Falta 1 campeón';
  if (missingPicks > 1) return `Faltan ${missingPicks} campeones`;
  return 'Guardar draft';
}

export function DraftSaveActionView({
  action,
  allies,
  clearHref,
  enemies,
  missingPicks,
  pending,
  recordHref,
  risk,
  state,
}: {
  action?: ComponentProps<'form'>['action'];
  allies: string;
  clearHref: string | null;
  enemies: string;
  missingPicks: number;
  pending: boolean;
  recordHref: string;
  risk: string;
  state: DraftRecordActionState;
}) {
  if (state.savedId) {
    return (
      <div className="draft-save-success" role="status">
        <Check aria-hidden="true" size={20} strokeWidth={2} />
        <span>Guardado</span>
        <Link href={recordHref}>Ver Registro</Link>
      </div>
    );
  }

  const disabled = pending || missingPicks > 0;
  return (
    <div className="draft-screen-actions">
      {clearHref ? <Link className="draft-header-clear" href={clearHref}>Vaciar</Link> : null}
      <form action={action} className="draft-save-form">
        <input name="aliados" type="hidden" value={allies} />
        <input name="enemigos" type="hidden" value={enemies} />
        <input name="riesgo" type="hidden" value={risk} />
        <button
          aria-describedby={state.error ? 'draft-save-error' : undefined}
          className="nav-action-button draft-save-button"
          disabled={disabled}
          type="submit"
        >
          <Save aria-hidden="true" size={20} strokeWidth={2} />
          <span>{pending ? 'Guardando…' : draftSaveLabel(missingPicks)}</span>
        </button>
        {state.error ? (
          <p className="field-error" id="draft-save-error" role="alert">{state.error}</p>
        ) : null}
      </form>
    </div>
  );
}

export function SaveDraftRecordButton({
  allies,
  clearHref,
  enemies,
  missingPicks,
  risk,
  recordHref,
}: {
  allies: string;
  enemies: string;
  clearHref: string | null;
  missingPicks: number;
  risk: string;
  recordHref: string;
}) {
  const [state, action, pending] = useActionState(saveDraftRecordAction, initialState);
  return (
    <DraftSaveActionView
      action={action}
      allies={allies}
      clearHref={clearHref}
      enemies={enemies}
      missingPicks={missingPicks}
      pending={pending}
      recordHref={recordHref}
      risk={risk}
      state={state}
    />
  );
}

export function AttachDraftMatchForm({
  options,
  recordId,
}: {
  options: DraftRecordMatchOption[];
  recordId: number;
}) {
  const [state, action, pending] = useActionState(attachDraftRecordMatchAction, initialState);
  const [selected, setSelected] = useState<number | null>(null);
  const option = selected === null ? null : options[selected] ?? null;

  return (
    <details className="draft-record-attach">
      <summary>Adjuntar partida</summary>
      <form action={action}>
        <input name="recordId" type="hidden" value={recordId} />
        <input name="matchProvider" type="hidden" value={option?.provider ?? ''} />
        <input name="matchId" type="hidden" value={option?.matchId ?? ''} />
        {options.length ? (
          <fieldset className="form-field">
            <legend>Partidas cacheadas de este jugador</legend>
            <div aria-label="Partida del draft" className="match-options" role="radiogroup">
              {options.map((match, index) => (
                <label className="match-option" data-result={match.resultTone} key={`${match.provider}:${match.matchId}`}>
                  <input
                    checked={selected === index}
                    name={`matchChoice-${recordId}`}
                    onChange={() => setSelected(index)}
                    type="radio"
                  />
                  <ChampionIcon imageUrl={match.imageUrl ?? undefined} name={match.championName} />
                  <span className="match-option-text">
                    <span className="match-title">
                      <span className="match-result">{match.resultLabel}</span> · {match.championName}
                    </span>
                    <span className="match-meta">{match.meta}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <p className="draft-record-note">
            No hay partidas con detalle completo en el caché de este jugador.
          </p>
        )}
        {state.error ? <p className="field-error" role="alert">{state.error}</p> : null}
        <button className="primary-button" disabled={pending || !option} type="submit">
          {pending ? 'Validando partida…' : 'Adjuntar la elegida'}
        </button>
      </form>
    </details>
  );
}

export function DeleteDraftRecordForm({ recordId }: { recordId: number }) {
  const [state, action, pending] = useActionState(deleteDraftRecordAction, initialState);
  return (
    <form
      action={action}
      className="draft-record-delete"
      onSubmit={(event) => {
        if (!window.confirm('¿Borrar este registro? No se puede deshacer.')) event.preventDefault();
      }}
    >
      <input name="recordId" type="hidden" value={recordId} />
      <button className="text-button" data-tone="danger" disabled={pending} type="submit">
        <Trash2 aria-hidden="true" size={18} strokeWidth={2} />
        {pending ? 'Borrando…' : 'Borrar registro'}
      </button>
      {state.error ? <p className="field-error" role="alert">{state.error}</p> : null}
    </form>
  );
}
