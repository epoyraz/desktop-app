/**
 * URLBar: address bar with URL/search parsing, security indicator, Cmd+L focus.
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SECURE_RE = /^https:\/\//i;
const INSECURE_RE = /^http:\/\//i;

interface URLBarProps {
  url: string;
  isLoading: boolean;
  onNavigate: (input: string) => void;
  focused: boolean;
  onFocusClear: () => void;
}

function getSecurityStatus(url: string): 'secure' | 'insecure' | 'none' {
  if (SECURE_RE.test(url)) return 'secure';
  if (INSECURE_RE.test(url)) return 'insecure';
  return 'none';
}

function displayUrl(url: string): string {
  // Show clean URL without protocol for https
  if (SECURE_RE.test(url)) {
    try {
      const parsed = new URL(url);
      return parsed.hostname + parsed.pathname + parsed.search + parsed.hash;
    } catch {
      return url;
    }
  }
  return url;
}

export function URLBar({
  url,
  isLoading,
  onNavigate,
  focused,
  onFocusClear,
}: URLBarProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState(() => displayUrl(url));
  const [isEditing, setIsEditing] = useState(false);

  // Sync display when URL changes externally (not while editing)
  useEffect(() => {
    if (!isEditing) {
      setInputValue(displayUrl(url));
    }
  }, [url, isEditing]);

  // Handle focus-url-bar IPC event
  useEffect(() => {
    if (focused && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
      onFocusClear();
    }
  }, [focused, onFocusClear]);

  const handleFocus = useCallback(() => {
    setIsEditing(true);
    // Show full URL when editing
    setInputValue(url);
    inputRef.current?.select();
  }, [url]);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    setInputValue(displayUrl(url));
  }, [url]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const trimmed = inputValue.trim();
        if (trimmed) {
          onNavigate(trimmed);
          inputRef.current?.blur();
        }
      }
      if (e.key === 'Escape') {
        setIsEditing(false);
        setInputValue(displayUrl(url));
        inputRef.current?.blur();
      }
    },
    [inputValue, onNavigate, url],
  );

  const security = getSecurityStatus(url);

  return (
    <div className={`url-bar url-bar--${security}`}>
      {/* Security icon */}
      <span className="url-bar__security" aria-label={security}>
        {security === 'secure' && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <rect x="2" y="5" width="8" height="6" rx="1.5" fill="currentColor" opacity="0.6" />
            <path
              d="M4 5V3.5a2 2 0 0 1 4 0V5"
              stroke="currentColor"
              strokeWidth="1.2"
              fill="none"
            />
          </svg>
        )}
        {security === 'insecure' && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path
              d="M6 2L10.5 10H1.5L6 2Z"
              stroke="#e5534b"
              strokeWidth="1.2"
              fill="none"
            />
            <line x1="6" y1="5.5" x2="6" y2="7.5" stroke="#e5534b" strokeWidth="1.2" />
            <circle cx="6" cy="9" r="0.5" fill="#e5534b" />
          </svg>
        )}
      </span>

      {/* URL input */}
      <input
        ref={inputRef}
        className="url-bar__input"
        type="text"
        value={inputValue}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        placeholder="Search or enter address"
        onChange={(e) => setInputValue(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        aria-label="Address bar"
      />

      {/* Loading indicator */}
      {isLoading && <span className="url-bar__loading" aria-hidden="true" />}
    </div>
  );
}
