import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AgentSession } from './types';

interface CommandBarProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (prompt: string) => void;
  onSelectSession?: (id: string) => void;
  sessions?: AgentSession[];
  mode?: 'create' | 'followup';
}

function ArrowUpIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 12V3M3 6.5L7 2.5L11 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function fuzzyMatch(query: string, text: string): boolean {
  const lower = text.toLowerCase();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return terms.every((t) => lower.includes(t));
}

function formatElapsed(createdAt: number): string {
  const seconds = Math.floor((Date.now() - createdAt) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function statusDot(status: string): string {
  switch (status) {
    case 'running': return 'cmdbar__dot--running';
    case 'stuck': return 'cmdbar__dot--stuck';
    case 'idle': return 'cmdbar__dot--idle';
    case 'draft': return 'cmdbar__dot--draft';
    default: return 'cmdbar__dot--stopped';
  }
}

export function CommandBar({ open, onClose, onSubmit, onSelectSession, sessions = [], mode = 'create' }: CommandBarProps): React.ReactElement | null {
  const [value, setValue] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);

  const results = useMemo(() => {
    if (mode === 'followup' || !value.trim()) return [];
    return sessions
      .filter((s) => fuzzyMatch(value, s.prompt))
      .slice(0, 8);
  }, [value, sessions, mode]);

  const hasResults = results.length > 0;

  useEffect(() => {
    if (open) {
      setValue('');
      setSelectedIdx(0);
      setTimeout(() => ref.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [value]);

  const submit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (hasResults && selectedIdx < results.length) {
      onSelectSession?.(results[selectedIdx].id);
      onClose();
      return;
    }
    console.log('[CommandBar] submit', { prompt: trimmed });
    onSubmit(trimmed);
    setValue('');
    onClose();
  }, [value, hasResults, selectedIdx, results, onSubmit, onSelectSession, onClose]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, results.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const trimmed = value.trim();
        if (trimmed) { onSubmit(trimmed); setValue(''); onClose(); }
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    },
    [submit, onClose, onSubmit, value, results.length],
  );

  if (!open) return null;

  const isFollowUp = mode === 'followup';
  const placeholder = isFollowUp ? 'Follow up...' : 'Search sessions or create new agent...';

  return (
    <div className="cmdbar__scrim" onClick={onClose}>
      <div className="cmdbar" onClick={(e) => e.stopPropagation()}>
        <div className="cmdbar__input-row">
          <textarea
            ref={ref}
            className="cmdbar__input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            rows={1}
            aria-label={isFollowUp ? 'Follow up on session' : 'Search or create'}
          />
          <button
            className="cmdbar__send"
            onClick={submit}
            disabled={!value.trim()}
            aria-label="Submit"
          >
            <ArrowUpIcon />
          </button>
        </div>

        {hasResults && (
          <div className="cmdbar__results">
            {results.map((s, i) => (
              <button
                key={s.id}
                className={`cmdbar__result${i === selectedIdx ? ' cmdbar__result--active' : ''}`}
                onClick={() => { onSelectSession?.(s.id); onClose(); }}
                onMouseEnter={() => setSelectedIdx(i)}
              >
                <span className={`cmdbar__dot ${statusDot(s.status)}`} />
                <span className="cmdbar__result-prompt">{s.prompt}</span>
                <span className="cmdbar__result-time">{formatElapsed(s.createdAt)}</span>
                <span className="cmdbar__result-status">{s.status}</span>
              </button>
            ))}
            <button
              className={`cmdbar__result cmdbar__result--create${selectedIdx === results.length ? ' cmdbar__result--active' : ''}`}
              onClick={submit}
              onMouseEnter={() => setSelectedIdx(results.length)}
            >
              <span className="cmdbar__result-create-icon">+</span>
              <span className="cmdbar__result-prompt">Create new agent: "{value}"</span>
            </button>
          </div>
        )}

        <div className="cmdbar__footer">
          <span className="cmdbar__hint">
            <kbd className="cmdbar__kbd">Enter</kbd> {hasResults ? 'select' : 'create'}
          </span>
          {hasResults && (
            <span className="cmdbar__hint">
              <kbd className="cmdbar__kbd">⌘↵</kbd> new agent
            </span>
          )}
          <span className="cmdbar__hint">
            <kbd className="cmdbar__kbd">Esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}

export default CommandBar;
