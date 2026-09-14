'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import {
  DISPLAY_NAME_MAX_LENGTH,
  type ProfileFormState,
  type ProfileValues,
} from '@/features/profile/profile-form';

type ProfileAction = (
  previousState: ProfileFormState,
  formData: FormData,
) => Promise<ProfileFormState>;

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button className="primary-button" disabled={pending} type="submit">
      {pending ? 'Guardando…' : label}
    </button>
  );
}

/** Nombre + Riot ID. Lo usan el onboarding y "Editar perfil". */
export function ProfileForm({
  action,
  initialValues,
  riotHelp,
  submitLabel,
}: {
  action: ProfileAction;
  initialValues?: ProfileValues;
  riotHelp: string;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, { values: initialValues });

  return (
    <form action={formAction} className="profile-form" noValidate>
      {state.formError ? (
        <p className="form-alert" role="alert">
          {state.formError}
        </p>
      ) : null}

      <div className="form-field">
        <label htmlFor="displayName">Nombre</label>
        <input
          aria-describedby={state.fieldErrors?.displayName ? 'displayName-error' : undefined}
          aria-invalid={Boolean(state.fieldErrors?.displayName)}
          autoComplete="name"
          defaultValue={state.values?.displayName}
          id="displayName"
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          name="displayName"
          placeholder="Cómo te dicen tus amigos"
          required
          type="text"
        />
        {state.fieldErrors?.displayName ? (
          <p className="field-error" id="displayName-error">
            {state.fieldErrors.displayName}
          </p>
        ) : null}
      </div>

      <div className="form-field">
        <label htmlFor="riotId">
          Riot ID <span>Opcional</span>
        </label>
        <input
          aria-describedby={state.fieldErrors?.riotId ? 'riotId-help riotId-error' : 'riotId-help'}
          aria-invalid={Boolean(state.fieldErrors?.riotId)}
          autoCapitalize="none"
          autoCorrect="off"
          defaultValue={state.values?.riotId}
          id="riotId"
          name="riotId"
          placeholder="gameName#tagLine"
          spellCheck={false}
          type="text"
        />
        <p className="field-help" id="riotId-help">
          {riotHelp}
        </p>
        {state.fieldErrors?.riotId ? (
          <p className="field-error" id="riotId-error">
            {state.fieldErrors.riotId}
          </p>
        ) : null}
      </div>

      <SubmitButton label={submitLabel} />
    </form>
  );
}
