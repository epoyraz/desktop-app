/**
 * NamingFlow — Screen 2 of onboarding.
 * User gives the agent a name. Persisted immediately via setAgentName IPC.
 *
 * Validation: name must be 1–32 characters, trimmed.
 */

import React, { useState, useRef, useEffect } from 'react';
import { StepIndicator } from './StepIndicator';
import { CharacterMascot } from './CharacterMascot';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOTAL_STEPS = 5;
const CURRENT_STEP = 2;
const MAX_NAME_LENGTH = 32;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface NamingFlowProps {
  onNext: (name: string) => void;
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NamingFlow({ onNext, onBack }: NamingFlowProps): React.ReactElement {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError('Please give your companion a name.');
      return;
    }
    if (trimmed.length > MAX_NAME_LENGTH) {
      setError(`Name must be ${MAX_NAME_LENGTH} characters or fewer.`);
      return;
    }
    setError(null);
    onNext(trimmed);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>): void {
    setValue(e.target.value);
    if (error) setError(null);
  }

  return (
    <div className="onboarding-root">
      {/* Step indicator */}
      <div
        style={{
          position: 'absolute',
          top: 24,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          zIndex: 10,
        }}
      >
        <StepIndicator step={CURRENT_STEP} total={TOTAL_STEPS} />
      </div>

      {/* Left panel */}
      <div className="onboarding-panel-left">
        <div>
          <h1 className="onboarding-headline">What's my name?</h1>
          <p className="onboarding-subhead" style={{ marginTop: 8 }}>
            Give your companion a name. You can always change it later.
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="auth-input-group">
            <label className="auth-label" htmlFor="agent-name-input">
              Companion name
            </label>
            <input
              ref={inputRef}
              id="agent-name-input"
              className="auth-input"
              type="text"
              value={value}
              onChange={handleChange}
              placeholder="e.g. Atlas, Nova, Scout…"
              maxLength={MAX_NAME_LENGTH}
              autoComplete="off"
              spellCheck={false}
              aria-describedby={error ? 'name-error' : undefined}
              aria-invalid={error ? 'true' : 'false'}
            />
            {error && (
              <p
                id="name-error"
                className="onboarding-subhead"
                style={{ color: 'var(--color-status-error)', marginTop: 4 }}
                role="alert"
              >
                {error}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              type="button"
              onClick={onBack}
              className="google-btn"
              style={{ flex: 1 }}
              aria-label="Back"
            >
              Back
            </button>
            <button
              type="submit"
              className="auth-submit"
              style={{ flex: 2 }}
              disabled={!value.trim()}
              aria-label="Continue"
            >
              Continue →
            </button>
          </div>
        </form>
      </div>

      {/* Right panel */}
      <div className="onboarding-panel-right">
        <CharacterMascot state="idle" />
      </div>
    </div>
  );
}
