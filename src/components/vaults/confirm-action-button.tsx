'use client';

import { useActionState } from 'react';

import type { ActionResult } from '@/features/vaults/vaults.actions';

type Action = (previousState: ActionResult, formData: FormData) => Promise<ActionResult>;

/** Botón de texto que pide confirmación antes de disparar una Server Action (cancelar, pedir levantar). */
export function ConfirmActionButton({
  action,
  fields,
  label,
  pendingLabel,
  confirmMessage,
  tone = 'tint',
}: {
  action: Action;
  fields: Record<string, string | number>;
  label: string;
  pendingLabel: string;
  confirmMessage: string;
  tone?: 'tint' | 'danger';
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form
      action={formAction}
      className="confirm-action"
      onSubmit={(event) => {
        if (!window.confirm(confirmMessage)) event.preventDefault();
      }}
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} name={name} type="hidden" value={value} />
      ))}
      <button className="text-button" data-tone={tone} disabled={pending} type="submit">
        {pending ? pendingLabel : label}
      </button>
      {state.error ? (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
