export const RANKS = ['Leader', 'Superior', 'Officer', 'Veteran', 'Soldier'];
export const RES = ['Wood', 'Stone', 'Iron', 'Food', 'Silver'];
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const TARGET = 350000;
export const HALF = TARGET / 2;

export const RANK_COL = {
  Leader: '#e8a020', Superior: '#a78bfa', Officer: '#60a5fa',
  Veteran: '#34d399', Soldier: '#9ca3af',
};
export const STAT_COL = {
  Done: '#22c55e', 'On Track': '#f59e0b', Slow: '#ef4444', Behind: '#6b7280',
};
export const RES_ICON = { Wood: '🪵', Stone: '🪨', Iron: '⚙️', Food: '🌾', Silver: '💠' };
export const RES_COL = {
  Wood: '#a16207', Stone: '#6b7280', Iron: '#60a5fa', Food: '#4ade80', Silver: '#c084fc',
};

export const fmt = v => v === 0 ? '—' : (v / 1000).toFixed(1) + 'k';
export const rankIdx = r => RANKS.indexOf(r);
export const resCol = v => v === 0 ? '#444' : v >= TARGET ? '#22c55e' : v >= HALF ? '#f59e0b' : '#ef4444';
export const emptyT = () => Object.fromEntries(RES.map(r => [r, 0]));
export const emptySubmitted = () =>
  Object.fromEntries(DAYS.map(d => [d, Object.fromEntries(RES.map(r => [r, false]))]));

export const getStatus = t => {
  const vals = RES.map(r => t[r] || 0);
  if (vals.every(v => v >= TARGET)) return 'Done';
  const w = Math.min(...vals);
  if (w >= HALF) return 'On Track';
  if (w > 0) return 'Slow';
  return 'Behind';
};

export const getWeekLabel = () => {
  const now = new Date();
  const d = now.getDay();
  const mon = new Date(now);
  mon.setDate(now.getDate() - d + (d === 0 ? -6 : 1));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const f = x => x.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${f(mon)} – ${f(sun)}`;
};

export const getWeekId = () => {
  const now = new Date();
  const d = now.getDay();
  const mon = new Date(now);
  mon.setDate(now.getDate() - d + (d === 0 ? -6 : 1));
  return mon.toISOString().split('T')[0];
};

export const todayIdx = () => {
  const d = new Date().getDay();
  return d === 0 ? 6 : d - 1;
};
