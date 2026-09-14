'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { completeOnboardingAction, type OnboardingState } from './actions';

const initialState: OnboardingState = {};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className="primary-button" disabled={pending} type="submit">
      {pending ? 'Guardando…' : 'Continuar'}
    </button>
  );
}

export function OnboardingForm() {
  const [state, formAction] = useActionState(completeOnboardingAction, initialState);

  return (
    <form action={formAction} className="onboarding-form" noValidate>
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
          id="displayName"
          maxLength={40}
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
          aria-describedby="riotId-help riotId-error"
          aria-invalid={Boolean(state.fieldErrors?.riotId)}
          autoCapitalize="none"
          autoCorrect="off"
          id="riotId"
          name="riotId"
          placeholder="gameName#tagLine"
          spellCheck={false}
          type="text"
        />
        <p className="field-help" id="riotId-help">
          Podés agregarlo más adelante desde Perfil.
        </p>
        {state.fieldErrors?.riotId ? (
          <p className="field-error" id="riotId-error">
            {state.fieldErrors.riotId}
          </p>
        ) : null}
      </div>

      <SubmitButton />
    </form>
  );
}
