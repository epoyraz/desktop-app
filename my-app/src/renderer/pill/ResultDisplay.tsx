/**
 * Track B — ResultDisplay component.
 *
 * Shown after task_done, task_failed, target_lost, or task_cancelled.
 *
 * Acceptance criteria (plan §5 Track B):
 * - task_done:      show result text; auto-dismiss after 5s
 * - task_failed:    "Agent couldn't finish — see logs"
 * - target_lost:    "Tab was closed — task cancelled"
 * - task_cancelled: "Task cancelled"
 */

import React, { useEffect } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ResultState =
  | { kind: 'done'; result: unknown; stepsUsed: number; tokensUsed: number }
  | { kind: 'failed'; reason: string }
  | { kind: 'target_lost' }
  | { kind: 'cancelled' };

interface ResultDisplayProps {
  state: ResultState;
  /** Called after auto-dismiss timeout (5s for done, no auto-dismiss for errors) */
  onDismiss: () => void;
  /** Auto-dismiss delay in ms (default 5000) */
  autoDismissMs?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_AUTO_DISMISS_MS = 5000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getResultText(state: ResultState): string {
  switch (state.kind) {
    case 'done':
      return String(state.result ?? 'Done');
    case 'failed':
      return "Agent couldn't finish — see logs";
    case 'target_lost':
      return 'Tab was closed — task cancelled';
    case 'cancelled':
      return 'Task cancelled';
  }
}

function getResultIcon(state: ResultState): React.ReactElement {
  if (state.kind === 'done') {
    return (
      <svg
        className="pill-result-done-icon"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M5 8.5L7 10.5L11 6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg
      className="pill-error-icon"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 5V8.5M8 10.5V11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ResultDisplay({
  state,
  onDismiss,
  autoDismissMs = DEFAULT_AUTO_DISMISS_MS,
}: ResultDisplayProps): React.ReactElement {
  // Auto-dismiss after 5s for task_done only (errors persist until Esc/Cmd+K)
  useEffect(() => {
    if (state.kind !== 'done') return;

    const timer = setTimeout(() => {
      onDismiss();
    }, autoDismissMs);

    return () => clearTimeout(timer);
  }, [state.kind, onDismiss, autoDismissMs]);

  const text = getResultText(state);
  const icon = getResultIcon(state);
  const isDone = state.kind === 'done';

  if (isDone) {
    return (
      <div className="pill-result" data-testid="result-display" data-result-kind="done">
        <div className="pill-result-done">
          {icon}
          <div>
            <div className="pill-result-text">{text}</div>
            <div className="pill-result-dismiss">
              Dismissing in {Math.round(autoDismissMs / 1000)}s · Esc to dismiss now
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pill-error" data-testid="result-display" data-result-kind={state.kind}>
      {icon}
      <div className="pill-error-text">{text}</div>
    </div>
  );
}
