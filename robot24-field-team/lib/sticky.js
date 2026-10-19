'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

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

// The open tab lives in the address (?tab=month), so tabs can be linked to, bookmarked and opened by Robbie
export function useTab(valid, fallback) {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const t = sp.get('tab');
  const tab = valid.includes(t) ? t : fallback;
  const setTab = (next) => router.replace(`${path}?tab=${next}`, { scroll: false });
  return [tab, setTab];
}

// Robbie hands a task to the screen that does it: the screen opens it filled in (and with any dropped file).
// Nothing is saved here; the person always checks and saves.
const KEY = 'r24-handoff';
const files = {};

export function handOff(target, payload = {}, file = null) {
  try { sessionStorage.setItem(`${KEY}:${target}`, JSON.stringify(payload)); } catch { /* storage off */ }
  if (file) files[target] = file;
  window.dispatchEvent(new CustomEvent(KEY, { detail: target }));
}

export function takeHandOff(target) {
  let raw = null;
  try { raw = sessionStorage.getItem(`${KEY}:${target}`); if (raw) sessionStorage.removeItem(`${KEY}:${target}`); } catch { /* storage off */ }
  if (!raw) return null;
  const file = files[target] || null;
  delete files[target];
  try { return { ...JSON.parse(raw), file }; } catch { return null; }
}

/** Run cb when a hand-off for target arrives (now or later). ready: wait until the screen has its data. */
export function useHandOff(target, cb, ready = true) {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    if (!ready) return undefined;
    const run = () => { const h = takeHandOff(target); if (h) ref.current(h); };
    run();
    const on = (e) => { if (e.detail === target) run(); };
    window.addEventListener(KEY, on);
    return () => window.removeEventListener(KEY, on);
  }, [target, ready]);
}

// A payment reference Robbie was given, used as the default when someone clicks Mark paid
export const paidRef = { value: '' };
