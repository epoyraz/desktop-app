import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_KEYBINDINGS } from './keybindings';
import type { ActionId, KeyBinding } from './keybindings';

export interface VimKeysReturn {
  chordPrefix: string | null;
  keybindings: KeyBinding[];
  overrides: Record<string, string[]>;
  updateBinding: (id: ActionId, keys: string[]) => void;
  resetBinding: (id: ActionId) => void;
  resetAll: () => void;
}

function normalizeKey(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey) parts.push('Cmd');
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey && e.key.length > 1) parts.push('Shift');
  const key = e.key === ' ' ? 'Space' : e.key;
  if (!['Meta', 'Control', 'Alt', 'Shift'].includes(key)) parts.push(key);
  return parts.join('+');
}

export function useVimKeys(handlers: Partial<Record<ActionId, () => void>>): VimKeysReturn {
  const [overrides, setOverrides] = useState<Record<string, string[]>>({});
  const [chordPrefix, setChordPrefix] = useState<string | null>(null);
  const chordTimer = useRef<ReturnType<typeof setTimeout>>();
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const keybindings = DEFAULT_KEYBINDINGS.map((kb) => ({
    ...kb,
    keys: overrides[kb.id] ?? kb.keys,
  }));

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      const pressed = normalizeKey(e);
      const combo = chordPrefix ? `${chordPrefix} ${pressed}` : pressed;

      for (const kb of keybindings) {
        for (const keyStr of kb.keys) {
          if (keyStr === combo) {
            e.preventDefault();
            setChordPrefix(null);
            if (chordTimer.current) clearTimeout(chordTimer.current);
            handlersRef.current[kb.id]?.();
            return;
          }
          if (keyStr.startsWith(combo + ' ')) {
            e.preventDefault();
            setChordPrefix(combo);
            if (chordTimer.current) clearTimeout(chordTimer.current);
            chordTimer.current = setTimeout(() => setChordPrefix(null), 1500);
            return;
          }
        }
      }

      if (chordPrefix) {
        setChordPrefix(null);
        if (chordTimer.current) clearTimeout(chordTimer.current);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [keybindings, chordPrefix]);

  const updateBinding = useCallback((id: ActionId, keys: string[]) => {
    setOverrides((prev) => ({ ...prev, [id]: keys }));
  }, []);

  const resetBinding = useCallback((id: ActionId) => {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const resetAll = useCallback(() => setOverrides({}), []);

  return { chordPrefix, keybindings, overrides, updateBinding, resetBinding, resetAll };
}
