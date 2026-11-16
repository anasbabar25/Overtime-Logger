export const pad = (n) => String(n).padStart(2, '0');
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => iso(new Date());
export const addDays = (s, n) => {
  const d = new Date(s + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return iso(d);
};
export const fmtD = (s) => (s ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : '');
export const fmtH = (n) => (n == null || n === '' ? '–' : (Math.round(+n * 10) / 10).toString());
export const sg = (v) => (v > 0 ? '+' : '') + fmtH(v);
export const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
export const norm = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
export const totals = (r) => {
  let est = 0;
  let act = 0;
  let hasAct = false;
  r.employees.forEach((e) => {
    est += num(e.est);
    if (e.actual != null) {
      act += num(e.actual);
      hasAct = true;
    }
  });
  return { est, act, hasAct };
};

export const store = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      if (v == null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
};
