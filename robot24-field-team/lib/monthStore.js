'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { currentMonth } from './format';

// One month for the whole app, remembered across pages and visits
const Ctx = createContext({ month: currentMonth(), setMonth: () => {} });

export function MonthProvider({ children }) {
  const [month, setMonthState] = useState(currentMonth());
  useEffect(() => {
    try { const m = localStorage.getItem('r24-month'); if (/^\d{4}-\d{2}-01$/.test(m || '')) setMonthState(m); } catch { /* storage off */ }
  }, []);
  const setMonth = (m) => {
    setMonthState(m);
    try { localStorage.setItem('r24-month', m); } catch { /* storage off */ }
  };
  return <Ctx.Provider value={{ month, setMonth }}>{children}</Ctx.Provider>;
}

export const useMonth = () => useContext(Ctx);
