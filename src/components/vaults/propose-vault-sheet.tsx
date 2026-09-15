'use client';

import { Plus } from 'lucide-react';
import Image from 'next/image';
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from 'react';

import { ChampionIcon } from '@/components/matches/champion-icon';
import { VAULT_REASON_MAX_LENGTH } from '@/config';
import type { ChampionOption } from '@/features/champions/champions.queries';
import { searchKey } from '@/features/champions/search-key';
import { loadProposalMatchesAction, type ProposalMatchesResult } from '@/features/matches/matches.actions';
import type { ProposalFormState } from '@/features/vaults/proposal-form';
import { createProposalAction } from '@/features/vaults/vaults.actions';
import type { Member } from '@/features/vaults/vaults.queries';

import { UserAvatar } from '../user-avatar';

const initialState: ProposalFormState = {};
const formatDamage = new Intl.NumberFormat('es-AR');

type MatchesState = ProposalMatchesResult & { forUserId: string };

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
  const [targetUserId, setTargetUserId] = useState('');
  const [championId, setChampionId] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [matchId, setMatchId] = useState('');
  const [matches, setMatches] = useState<MatchesState | null>(null);
  const [loadingMatches, startLoadingMatches] = useTransition();
  const latestTarget = useRef('');

  function selectTarget(userId: string) {
    setTargetUserId(userId);
    setMatchId('');
    latestTarget.current = userId;
    if (!userId) return;

    startLoadingMatches(async () => {
      const result = await loadProposalMatchesAction(Number(userId));
      // Si mientras tanto eligió a otro jugador, esta respuesta ya no sirve.
      if (latestTarget.current === userId) setMatches({ ...result, forUserId: userId });
    });
  }

  // Si falla la validación, recuperar lo elegido (el reset de forms de React vacía los inputs).
  useEffect(() => {
    if (!state.values) return;
    setChampionId(state.values.championId);
    setStartDate(state.values.startDate || today);
    if (state.values.targetUserId !== latestTarget.current) selectTarget(state.values.targetUserId);
    setMatchId(state.values.matchId);
    // selectTarget es estable a efectos de este efecto: solo depende de refs y setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.values, today]);

  // Propuesta creada: cerrar y dejar el form limpio para la próxima.
  useEffect(() => {
    if (!state.createdId) return;
    dialogRef.current?.close();
    setFormKey((key) => key + 1);
    setQuery('');
    setTargetUserId('');
    setChampionId('');
    setStartDate(today);
    setMatchId('');
    setMatches(null);
    latestTarget.current = '';
  }, [state.createdId, today]);

  const filtered = useMemo(() => {
    const key = searchKey(query);
    return key ? champions.filter((champion) => searchKey(champion.name).includes(key)) : champions;
  }, [champions, query]);

  const selectedChampion = champions.find((champion) => champion.id === championId);
  const values = state.createdId ? undefined : state.values;
  const errors = state.createdId ? undefined : state.fieldErrors;
  const currentMatches = matches && matches.forUserId === targetUserId ? matches : null;

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
                      checked={targetUserId === String(member.id)}
                      name="targetUserId"
                      onChange={(event) => selectTarget(event.target.value)}
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

            <fieldset className="form-field">
              <legend>
                Partida decisiva <span className="legend-optional">Opcional</span>
              </legend>
              <input name="matchId" type="hidden" value={matchId} />

              {!targetUserId ? (
                <p className="field-help">Elegí un jugador para ver sus últimas partidas.</p>
              ) : loadingMatches && !currentMatches ? (
                <p className="field-help" role="status">
                  Buscando sus partidas en OP.GG…
                </p>
              ) : currentMatches ? (
                <>
                  {currentMatches.message ? (
                    <p className="field-help" role="status">
                      {currentMatches.message}
                    </p>
                  ) : null}
                  {currentMatches.matches.length > 0 ? (
                    <div className="match-options" role="radiogroup" aria-label="Partida decisiva">
                      <label className="match-option match-option-none">
                        <input
                          checked={matchId === ''}
                          name="matchChoice"
                          onChange={() => setMatchId('')}
                          type="radio"
                        />
                        <span className="match-option-text">Sin adjuntar partida</span>
                      </label>
                      {currentMatches.matches.map((option) => (
                        <label className="match-option" data-result={option.resultTone} key={option.matchId}>
                          <input
                            checked={matchId === option.matchId}
                            name="matchChoice"
                            onChange={() => setMatchId(option.matchId)}
                            type="radio"
                          />
                          <ChampionIcon imageUrl={option.imageUrl ?? undefined} name={option.championName} />
                          <span className="match-option-text">
                            <span className="match-title">
                              <span className="match-result">{option.resultLabel}</span> · {option.championName}
                            </span>
                            <span className="match-meta">{option.meta}</span>
                          </span>
                          <span className="match-numbers">
                            <span className="match-kda">
                              {option.kills}/{option.deaths}/{option.assists}
                            </span>
                            <span className="match-meta">{formatDamage.format(option.damageDealt)} daño</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  ) : currentMatches.status === 'ok' && !currentMatches.message ? (
                    <p className="field-help">No encontramos partidas recientes.</p>
                  ) : null}
                </>
              ) : null}
              {errors?.matchId ? <p className="field-error">{errors.matchId}</p> : null}
            </fieldset>
          </div>

          <footer className="sheet-footer">
            <button className="primary-button" disabled={pending} type="submit">
              {pending ? (matchId ? 'Guardando partida…' : 'Enviando…') : 'Proponer vault'}
            </button>
          </footer>
        </form>
      </dialog>
    </>
  );
}
