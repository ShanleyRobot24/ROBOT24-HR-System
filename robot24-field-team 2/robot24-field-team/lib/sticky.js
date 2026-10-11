'use client';
import { useCallback, useState } from 'react';

// State that survives moving between pages in the same session, so a page you come back to
// shows its last data straight away and refreshes quietly instead of blanking to "Loading".
const memory = new Map();

export function useSticky(key, initial) {
  const [value, setValue] = useState(() => (memory.has(key) ? memory.get(key) : initial));
  const set = useCallback((v) => {
    setValue((old) => {
      const next = typeof v === 'function' ? v(old) : v;
      memory.set(key, next);
      return next;
    });
  }, [key]);
  return [value, set, memory.has(key)];
}

export const hasSticky = (key) => memory.has(key);
export const clearSticky = () => memory.clear();
