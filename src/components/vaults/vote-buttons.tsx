'use client';

import { Check } from 'lucide-react';
import { useActionState } from 'react';

import { voteAction, type ActionResult } from '@/features/vaults/vaults.actions';

const initialState: ActionResult = {};

type VoteAction = (previousState: ActionResult, formData: FormData) => Promise<ActionResult>;

export function VoteButtons({
  proposalId,
  myVote,
  action = voteAction,
}: {
  proposalId: number;
  myVote: 'yes' | 'no' | null;
  action?: VoteAction;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="vote-form">
      <input name="proposalId" type="hidden" value={proposalId} />
      <div className="vote-actions">
        <button
          aria-pressed={myVote === 'yes'}
          className="vote-button vote-button-yes"
          disabled={pending || myVote === 'yes'}
          name="value"
          type="submit"
          value="yes"
        >
          {myVote === 'yes' ? <Check aria-hidden="true" size={18} strokeWidth={2.5} /> : null}A favor
        </button>
        <button
          aria-pressed={myVote === 'no'}
          className="vote-button vote-button-no"
          disabled={pending || myVote === 'no'}
          name="value"
          type="submit"
          value="no"
        >
          {myVote === 'no' ? <Check aria-hidden="true" size={18} strokeWidth={2.5} /> : null}En contra
        </button>
      </div>
      {myVote ? (
        <p className="vote-note">
          Votaste {myVote === 'yes' ? 'a favor' : 'en contra'}. Podés cambiarlo mientras esté abierta.
        </p>
      ) : null}
      {state.error ? (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
