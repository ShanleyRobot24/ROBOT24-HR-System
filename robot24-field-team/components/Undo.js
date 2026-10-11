'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// "Deleted X · Undo" for 10 seconds, instead of asking "Are you sure?" first.
// undo() puts things back; finalize() runs once the 10 seconds pass (e.g. removing a stored file).
const Ctx = createContext({ showUndo: () => {} });
export const useUndo = () => useContext(Ctx);

export function UndoProvider({ children }) {
  const [item, setItem] = useState(null);
  const timer = useRef(null);
  const current = useRef(null);

  const finish = useCallback(async (it) => {
    if (it?.finalize) { try { await it.finalize(); } catch { /* best effort */ } }
  }, []);

  const showUndo = useCallback((message, undo, finalize) => {
    // A new delete finishes the previous one straight away
    if (current.current) { clearTimeout(timer.current); finish(current.current); }
    const it = { message, undo, finalize, id: Date.now() };
    current.current = it;
    setItem(it);
    timer.current = setTimeout(() => { finish(it); if (current.current === it) { current.current = null; setItem(null); } }, 10000);
  }, [finish]);

  async function doUndo() {
    const it = current.current;
    if (!it) return;
    clearTimeout(timer.current);
    current.current = null;
    setItem(null);
    try { await it.undo(); } catch (e) { alert(`Could not undo: ${e.message}`); }
  }

  // Finish anything pending if the page is closed
  useEffect(() => {
    const onLeave = () => { if (current.current) finish(current.current); };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [finish]);

  return (
    <Ctx.Provider value={{ showUndo }}>
      {children}
      {item && (
        <div className="undo-toast" role="status" key={item.id}>
          <span>{item.message}</span>
          <button onClick={doUndo}>Undo</button>
          <span className="undo-bar" />
        </div>
      )}
    </Ctx.Provider>
  );
}
