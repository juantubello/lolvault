'use client';

import { Plus } from 'lucide-react';
import Image from 'next/image';
import { useActionState, useEffect, useMemo, useRef, useState } from 'react';

import { VAULT_REASON_MAX_LENGTH } from '@/config';
import type { ChampionOption } from '@/features/champions/champions.queries';
import type { ProposalFormState } from '@/features/vaults/proposal-form';
import { createProposalAction } from '@/features/vaults/vaults.actions';
import type { Member } from '@/features/vaults/vaults.queries';

import { UserAvatar } from '../user-avatar';

/** "Kai'Sa" → "kaisa", "Nunu y Willump" → "nunuywillump": buscar sin tildes ni símbolos. */
function searchKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
}

const initialState: ProposalFormState = {};

export function ProposeVaultSheet({
  members,
  champions,
  viewerId,
  today,
  maxStartDate,
}: {
  members: Member[];
  champions: ChampionOption[];
  viewerId: number;
  /** "YYYY-MM-DD" de hoy en hora argentina (lo calcula el servidor). */
  today: string;
  maxStartDate: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState(createProposalAction, initialState);
  const [formKey, setFormKey] = useState(0);
  const [query, setQuery] = useState('');
  const [championId, setChampionId] = useState('');
  const [startDate, setStartDate] = useState(today);

  // Si falla la validación, recuperar lo elegido (el reset de forms de React vacía los inputs).
  useEffect(() => {
    if (!state.values) return;
    setChampionId(state.values.championId);
    setStartDate(state.values.startDate || today);
  }, [state.values, today]);

  // Propuesta creada: cerrar y dejar el form limpio para la próxima.
  useEffect(() => {
    if (!state.createdId) return;
    dialogRef.current?.close();
    setFormKey((key) => key + 1);
    setQuery('');
    setChampionId('');
    setStartDate(today);
  }, [state.createdId, today]);

  const filtered = useMemo(() => {
    const key = searchKey(query);
    return key ? champions.filter((champion) => searchKey(champion.name).includes(key)) : champions;
  }, [champions, query]);

  const selectedChampion = champions.find((champion) => champion.id === championId);
  const values = state.createdId ? undefined : state.values;
  const errors = state.createdId ? undefined : state.fieldErrors;

  return (
    <>
      <button
        aria-haspopup="dialog"
        className="nav-action-button"
        onClick={() => dialogRef.current?.showModal()}
        type="button"
      >
        <Plus aria-hidden="true" size={20} strokeWidth={2} />
        <span>Proponer</span>
      </button>

      <dialog aria-labelledby="propose-title" className="sheet" ref={dialogRef}>
        <form action={formAction} className="sheet-form" key={formKey} noValidate>
          <header className="sheet-header">
            <button className="text-button" onClick={() => dialogRef.current?.close()} type="button">
              Cancelar
            </button>
            <h2 id="propose-title">Proponer vault</h2>
            <span aria-hidden="true" />
          </header>

          <div className="sheet-body">
            {state.formError && !state.createdId ? (
              <p className="form-alert" role="alert">
                {state.formError}
              </p>
            ) : null}

            <fieldset className="form-field">
              <legend>Jugador</legend>
              <div className="member-chips">
                {members.map((member) => (
                  <label className="chip" key={member.id}>
                    <input
                      defaultChecked={values?.targetUserId === String(member.id)}
                      name="targetUserId"
                      type="radio"
                      value={member.id}
                    />
                    <span>
                      <UserAvatar name={member.displayName} size="sm" src={member.avatarUrl} />
                      {member.displayName}
                      {member.id === viewerId ? ' (vos)' : ''}
                    </span>
                  </label>
                ))}
              </div>
              {errors?.targetUserId ? <p className="field-error">{errors.targetUserId}</p> : null}
            </fieldset>

            <fieldset className="form-field">
              <legend>
                Campeón{' '}
                {selectedChampion ? <span className="legend-value">{selectedChampion.name}</span> : null}
              </legend>
              <input name="championId" type="hidden" value={championId} />
              {champions.length === 0 ? (
                <p className="form-alert">
                  No se pudieron cargar los campeones de Data Dragon. Revisá la conexión y recargá.
                </p>
              ) : (
                <>
                  <input
                    aria-label="Buscar campeón"
                    autoComplete="off"
                    className="search-input"
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Buscar campeón"
                    type="search"
                    value={query}
                  />
                  <div aria-label="Campeones" className="champion-grid" role="group">
                    {filtered.map((champion) => (
                      <button
                        aria-pressed={champion.id === championId}
                        className="champion-tile"
                        key={champion.id}
                        onClick={() => setChampionId(champion.id)}
                        type="button"
                      >
                        <Image
                          alt=""
                          height={64}
                          loading="lazy"
                          src={champion.imageUrl}
                          unoptimized
                          width={64}
                        />
                        <span>{champion.name}</span>
                      </button>
                    ))}
                    {filtered.length === 0 ? (
                      <p className="field-help">No hay campeones que coincidan con “{query}”.</p>
                    ) : null}
                  </div>
                </>
              )}
              {errors?.championId ? <p className="field-error">{errors.championId}</p> : null}
            </fieldset>

            <div className="date-row">
              <div className="form-field">
                <label htmlFor="startDate">Desde</label>
                <input
                  aria-invalid={Boolean(errors?.startDate)}
                  id="startDate"
                  max={maxStartDate}
                  min={today}
                  name="startDate"
                  onChange={(event) => setStartDate(event.target.value)}
                  type="date"
                  value={startDate}
                />
                {errors?.startDate ? <p className="field-error">{errors.startDate}</p> : null}
              </div>
              <div className="form-field">
                <label htmlFor="endDate">Hasta</label>
                <input
                  aria-invalid={Boolean(errors?.endDate)}
                  defaultValue={values?.endDate}
                  id="endDate"
                  min={startDate}
                  name="endDate"
                  type="date"
                />
                {errors?.endDate ? <p className="field-error">{errors.endDate}</p> : null}
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="reason">Motivo</label>
              <textarea
                aria-invalid={Boolean(errors?.reason)}
                defaultValue={values?.reason}
                id="reason"
                maxLength={VAULT_REASON_MAX_LENGTH}
                name="reason"
                placeholder="0/11/2 con Yasuo y le echó la culpa al jungla"
                rows={3}
              />
              {errors?.reason ? <p className="field-error">{errors.reason}</p> : null}
            </div>
          </div>

          <footer className="sheet-footer">
            <button className="primary-button" disabled={pending} type="submit">
              {pending ? 'Enviando…' : 'Proponer vault'}
            </button>
          </footer>
        </form>
      </dialog>
    </>
  );
}
