'use client';

import { Radio, TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { ComponentProps } from 'react';
import { useActionState, useEffect } from 'react';

import { loadLiveDraftAction } from '@/features/scout/live-game.actions';
import type { LiveDraftActionState } from '@/features/scout/live-game-state';

const initialState: LiveDraftActionState = { status: 'idle' };

export type LiveDraftAvailability =
  | 'available'
  | 'unconfigured'
  | 'no-riot-id'
  | 'missing-puuid';

const AVAILABILITY_COPY: Record<Exclude<LiveDraftAvailability, 'available'>, string> = {
  unconfigured: 'La API de Riot no está configurada. Podés seguir cargando el draft a mano.',
  'no-riot-id': 'No cargaste tu Riot ID. Agregalo en Perfil para buscar tu partida.',
  'missing-puuid': 'Tu Riot ID está cargado, pero todavía no tenemos su PUUID. Actualizá tus partidas desde Perfil.',
};

export function LiveDraftShortcutView({
  action,
  availability,
  pending,
  players,
  risk,
  state,
}: {
  action?: ComponentProps<'form'>['action'];
  availability: LiveDraftAvailability;
  pending: boolean;
  players: string;
  risk: string;
  state: LiveDraftActionState;
}) {
  const enabled = availability === 'available';
  const message = enabled
    ? state.message ?? 'Riot sólo permite ver partidas que ya empezaron; la carga manual sigue disponible.'
    : AVAILABILITY_COPY[availability];
  const isError = enabled && state.status !== 'idle' && state.status !== 'loaded';

  return (
    <section aria-labelledby="live-draft-heading" className="live-draft-shortcut">
      <div>
        <h2 id="live-draft-heading">Partida en vivo</h2>
        <p className={isError ? 'field-error' : undefined} role={isError ? 'alert' : 'status'}>
          {isError ? <TriangleAlert aria-hidden="true" size={18} strokeWidth={2} /> : null}
          <span>{message}</span>
        </p>
      </div>
      <form action={action}>
        <input name="riesgo" type="hidden" value={risk} />
        <input name="jugadores" type="hidden" value={players} />
        <button className="primary-button" disabled={!enabled || pending} type="submit">
          <Radio aria-hidden="true" size={20} strokeWidth={2} />
          {pending ? 'Consultando a Riot…' : 'Traer mi partida en vivo'}
        </button>
      </form>
    </section>
  );
}

export function LiveDraftShortcut({
  availability,
  players,
  risk,
}: {
  availability: LiveDraftAvailability;
  players: string;
  risk: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(loadLiveDraftAction, initialState);

  useEffect(() => {
    if (state.status === 'loaded' && state.href) router.replace(state.href);
  }, [router, state]);

  return (
    <LiveDraftShortcutView
      action={action}
      availability={availability}
      pending={pending}
      players={players}
      risk={risk}
      state={state}
    />
  );
}
