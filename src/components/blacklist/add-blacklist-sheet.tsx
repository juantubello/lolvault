'use client';

import { Plus } from 'lucide-react';
import { useActionState, useEffect, useRef, useState, useTransition } from 'react';

import { ChampionIcon } from '@/components/matches/champion-icon';
import { BLACKLIST_REASON_MAX_LENGTH } from '@/config';
import {
  createBlacklistProposalAction,
  loadBlacklistMatchesAction,
  searchKnownPlayersAction,
  type BlacklistMatchesActionResult,
  type BlacklistProposalFormState,
} from '@/features/blacklist/blacklist.actions';
import { formatKnownPlayerSuggestion } from '@/features/blacklist/blacklist-ui';
import type { KnownPlayerSuggestion } from '@/features/blacklist/known-players';

const initialState: BlacklistProposalFormState = {};
const emptyMatches: BlacklistMatchesActionResult = { status: 'ok', matches: [], message: null };

function manualRiotId(value: string): { name: string; riotId: string } | null {
  const hash = value.indexOf('#');
  const name = value.slice(0, hash).trim();
  const tag = value.slice(hash + 1).trim();
  return hash > 0 && name && tag ? { name, riotId: `${name}#${tag}` } : null;
}

export function AddBlacklistSheet({ viewerId }: { viewerId: number }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchSequence = useRef(0);
  const matchSequence = useRef(0);
  const [state, formAction, pending] = useActionState(createBlacklistProposalAction, initialState);
  const [formKey, setFormKey] = useState(0);
  const [opened, setOpened] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [riotId, setRiotId] = useState('');
  const [reason, setReason] = useState('');
  const [matchId, setMatchId] = useState('');
  const [suggestions, setSuggestions] = useState<KnownPlayerSuggestion[]>([]);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [resolvedSuggestionQuery, setResolvedSuggestionQuery] = useState('');
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searching, startSearching] = useTransition();
  const [loadingMatches, startLoadingMatches] = useTransition();
  const [matches, setMatches] = useState(emptyMatches);
  const [matchesForRiotId, setMatchesForRiotId] = useState<string | null>(null);

  const errors = state.createdId ? undefined : state.fieldErrors;
  const values = state.createdId ? undefined : state.values;
  const query = playerName.trim();
  const listboxId = 'blacklist-player-suggestions';

  useEffect(() => {
    if (!values) return;
    setPlayerName(values.playerName);
    setRiotId(values.riotId);
    setReason(values.reason);
    setMatchId(values.matchId);
  }, [values]);

  useEffect(() => {
    if (!state.fieldErrors) return;
    window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    });
  }, [state.fieldErrors]);

  useEffect(() => {
    if (!state.createdId) return;
    dialogRef.current?.close();
    setFormKey((key) => key + 1);
    setOpened(false);
    setPlayerName('');
    setRiotId('');
    setReason('');
    setMatchId('');
    setSuggestions([]);
    setSuggestionsOpen(false);
    setMatches(emptyMatches);
    setMatchesForRiotId(null);
  }, [state.createdId]);

  useEffect(() => {
    if (!opened || query.length < 2 || riotId) {
      setSuggestions([]);
      setSuggestionError(null);
      setActiveIndex(-1);
      if (query.length < 2 || riotId) setSuggestionsOpen(false);
      return;
    }

    const sequence = ++searchSequence.current;
    setResolvedSuggestionQuery('');
    setSuggestionsOpen(true);
    const timer = window.setTimeout(() => {
      startSearching(async () => {
        const result = await searchKnownPlayersAction(query);
        if (sequence !== searchSequence.current) return;
        setSuggestions(result.suggestions);
        setSuggestionError(result.error ?? null);
        setResolvedSuggestionQuery(query);
        setActiveIndex(result.suggestions.length > 0 ? 0 : -1);
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [opened, query, riotId]);

  useEffect(() => {
    if (!opened) return;
    const sequence = ++matchSequence.current;
    setMatchId('');
    setMatchesForRiotId(null);
    const timer = window.setTimeout(() => {
      startLoadingMatches(async () => {
        const result = await loadBlacklistMatchesAction(riotId);
        if (sequence === matchSequence.current) {
          setMatches(result);
          setMatchesForRiotId(riotId);
        }
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [opened, riotId]);

  function openDialog() {
    setOpened(true);
    const dialog = dialogRef.current;
    if (!dialog) return;
    try {
      dialog.showModal();
    } catch {
      // Navegador sin <dialog> modal: se abre igual, sin bloquear el fondo.
      dialog.setAttribute('open', '');
    }
  }

  function closeDialog() {
    setOpened(false);
    dialogRef.current?.close();
  }

  function selectSuggestion(suggestion: KnownPlayerSuggestion) {
    setPlayerName(suggestion.riotId.gameName);
    setRiotId(suggestion.riotIdText);
    setSuggestionsOpen(false);
    setActiveIndex(-1);
  }

  function changePlayerName(value: string) {
    const manual = manualRiotId(value);
    if (manual) {
      setPlayerName(manual.name);
      setRiotId(manual.riotId);
      setSuggestionsOpen(false);
      return;
    }
    setPlayerName(value);
  }

  function handleComboboxKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setSuggestionsOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (!suggestionsOpen || suggestions.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      const suggestion = suggestions[activeIndex];
      if (suggestion) selectSuggestion(suggestion);
    }
  }

  return (
    <>
      <button aria-haspopup="dialog" className="nav-action-button" onClick={openDialog} type="button">
        <Plus aria-hidden="true" size={20} strokeWidth={2} />
        <span>Agregar</span>
      </button>

      {/* Tocar el backdrop cierra: si el sheet quedara invisible, la app no queda trabada. */}
      <dialog
        aria-labelledby="add-blacklist-title"
        className="sheet blacklist-sheet"
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDialog();
        }}
        onClose={() => setOpened(false)}
        ref={dialogRef}
      >
        <form action={formAction} className="sheet-form" key={formKey} noValidate>
          <span aria-hidden="true" className="sheet-grabber" />
          <header className="sheet-header">
            <button className="text-button" onClick={closeDialog} type="button">Cancelar</button>
            <h2 id="add-blacklist-title">Agregar a la black list</h2>
            <span aria-hidden="true" />
          </header>

          <div className="sheet-body">
            {state.formError && !state.createdId ? (
              <p className="form-alert" role="alert">{state.formError}</p>
            ) : null}

            <div className="form-field blacklist-combobox">
              <label htmlFor="blacklist-player-name">Nombre o Riot ID</label>
              <input
                aria-activedescendant={activeIndex >= 0 ? `blacklist-suggestion-${activeIndex}` : undefined}
                aria-autocomplete="list"
                aria-controls={listboxId}
                aria-describedby={errors?.playerName ? 'blacklist-player-error' : 'blacklist-player-help'}
                aria-expanded={suggestionsOpen}
                aria-invalid={Boolean(errors?.playerName)}
                autoComplete="off"
                id="blacklist-player-name"
                name="playerName"
                onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 100)}
                onChange={(event) => changePlayerName(event.target.value)}
                onFocus={() => query.length >= 2 && !riotId && setSuggestionsOpen(true)}
                onKeyDown={handleComboboxKey}
                placeholder="Nombre que recuerdan o jugador#LAS"
                role="combobox"
                required
                type="text"
                value={playerName}
              />
              <p className="field-help" id="blacklist-player-help">
                Buscamos entre las partidas guardadas del grupo.
              </p>
              {errors?.playerName ? <p className="field-error" id="blacklist-player-error" role="alert">{errors.playerName}</p> : null}

              {suggestionsOpen ? (
                <div className="blacklist-suggestion-panel">
                  {searching || resolvedSuggestionQuery !== query ? (
                    <p className="field-help" role="status">Buscando coincidencias…</p>
                  ) : null}
                  {!searching && resolvedSuggestionQuery === query && suggestionError ? (
                    <p className="field-error" role="alert">{suggestionError}</p>
                  ) : null}
                  <ul aria-label="Jugadores encontrados" id={listboxId} role="listbox">
                    {!searching && resolvedSuggestionQuery === query && !suggestionError
                      ? suggestions.map((suggestion, index) => (
                          <li
                            aria-selected={activeIndex === index}
                            id={`blacklist-suggestion-${index}`}
                            key={suggestion.riotIdText}
                            onClick={() => selectSuggestion(suggestion)}
                            onMouseDown={(event) => event.preventDefault()}
                            role="option"
                          >
                            <strong>{suggestion.riotIdText}</strong>
                            <span>{formatKnownPlayerSuggestion(suggestion, viewerId, new Date())}</span>
                          </li>
                        ))
                      : null}
                  </ul>
                  {!searching && resolvedSuggestionQuery === query && !suggestionError && suggestions.length === 0 ? (
                    <p className="field-help" role="status">
                      Sin coincidencias en sus partidas; se agrega solo con el nombre.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="form-field">
              <label htmlFor="blacklist-riot-id">Riot ID <span>Opcional</span></label>
              <input
                aria-describedby={errors?.riotId ? 'blacklist-riot-error' : undefined}
                aria-invalid={Boolean(errors?.riotId)}
                autoCapitalize="off"
                autoComplete="off"
                id="blacklist-riot-id"
                name="riotId"
                onChange={(event) => setRiotId(event.target.value)}
                placeholder="gameName#tagLine"
                type="search"
                value={riotId}
              />
              {errors?.riotId ? <p className="field-error" id="blacklist-riot-error" role="alert">{errors.riotId}</p> : null}
            </div>

            <div className="form-field">
              <label htmlFor="blacklist-reason">
                Motivo <span>{reason.length}/{BLACKLIST_REASON_MAX_LENGTH}</span>
              </label>
              <textarea
                aria-describedby={errors?.reason ? 'blacklist-reason-error' : 'blacklist-reason-count'}
                aria-invalid={Boolean(errors?.reason)}
                id="blacklist-reason"
                maxLength={BLACKLIST_REASON_MAX_LENGTH}
                name="reason"
                onChange={(event) => setReason(event.target.value)}
                placeholder="Contá qué pasó"
                required
                rows={3}
                value={reason}
              />
              <span className="sr-only" id="blacklist-reason-count">Máximo {BLACKLIST_REASON_MAX_LENGTH} caracteres.</span>
              {errors?.reason ? <p className="field-error" id="blacklist-reason-error" role="alert">{errors.reason}</p> : null}
            </div>

            <fieldset className="form-field">
              <legend>Partida adjunta <span className="legend-optional">Opcional</span></legend>
              <input name="matchId" type="hidden" value={matchId} />
              {loadingMatches || matchesForRiotId !== riotId ? <p className="field-help" role="status">Buscando partidas…</p> : null}
              {!loadingMatches && matchesForRiotId === riotId && matches.message ? <p className="field-help" role="status">{matches.message}</p> : null}
              {!loadingMatches && matchesForRiotId === riotId && matches.matches.length > 0 ? (
                <div aria-label="Partida adjunta" className="match-options" role="radiogroup">
                  <label className="match-option match-option-none">
                    <input checked={matchId === ''} name="matchChoice" onChange={() => setMatchId('')} type="radio" />
                    <span className="match-option-text">Sin adjuntar partida</span>
                  </label>
                  {matches.matches.map((option) => (
                    <label className="match-option" data-result={option.resultTone} key={option.matchId}>
                      <input
                        checked={matchId === option.matchId}
                        name="matchChoice"
                        onChange={() => setMatchId(option.matchId)}
                        type="radio"
                      />
                      <ChampionIcon imageUrl={option.imageUrl ?? undefined} name={option.championName} />
                      <span className="match-option-text">
                        <span className="match-title"><span className="match-result">{option.resultLabel}</span> · {option.championName}</span>
                        <span className="match-meta">{option.meta}</span>
                      </span>
                      <span className="match-numbers"><span className="match-kda">{option.kills}/{option.deaths}/{option.assists}</span></span>
                    </label>
                  ))}
                </div>
              ) : null}
              {errors?.matchId ? <p className="field-error" role="alert">{errors.matchId}</p> : null}
            </fieldset>
          </div>

          <footer className="sheet-footer">
            <button className="primary-button" disabled={pending} type="submit">
              {pending ? 'Proponiendo…' : 'Proponer'}
            </button>
          </footer>
        </form>
      </dialog>
    </>
  );
}
