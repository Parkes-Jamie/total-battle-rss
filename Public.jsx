export const Btn = ({ children, onClick, variant = 'default', style = {} }) => {
  const base = {
    borderRadius: 3, padding: '5px 12px', fontSize: 10, fontFamily: 'inherit',
    letterSpacing: '.08em', cursor: 'pointer', textTransform: 'uppercase',
    border: '1px solid', transition: 'all .15s',
  };
  const variants = {
    default: { background: '#1a1a1e', color: '#6a5a3a', borderColor: '#2a2a30' },
    active:  { background: '#e8a020', color: '#0d0e10', borderColor: '#e8a020' },
    primary: { background: '#e8a020', color: '#0d0e10', borderColor: '#e8a020', fontWeight: 700 },
    danger:  { background: '#2a0a0a', color: '#f87171', borderColor: '#7f1d1d' },
  };
  return <button onClick={onClick} style={{ ...base, ...variants[variant], ...style }}>{children}</button>;
};

export const Modal = ({ children, danger, onClose }) => (
  <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: '#000d', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
    <div onClick={e => e.stopPropagation()} style={{ background: '#16171a', border: `1px solid ${danger ? '#991b1b' : '#e8a02040'}`, borderRadius: 6, padding: 26, width: 'min(380px,92vw)', maxHeight: '90vh', overflowY: 'auto' }}>
      {children}
    </div>
  </div>
);

export const ModalTitle = ({ children, danger }) => (
  <div style={{ fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', color: danger ? '#ef4444' : '#e8a020', marginBottom: 16, fontWeight: 700 }}>{children}</div>
);

export const Field = ({ label, children }) => (
  <div style={{ marginBottom: 10 }}>
    <div style={{ fontSize: 9, color: '#4a3a1a', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
    {children}
  </div>
);

export const inputStyle = (col) => ({
  width: '100%', background: '#0d0e10', border: '1px solid #2a2a30', borderRadius: 3,
  padding: '7px 9px', color: col || '#d4c9b8', fontFamily: 'inherit', fontSize: 12, boxSizing: 'border-box',
});

export const Header = ({ week, todayDone, totalRes, extra }) => (
  <div style={{ background: 'linear-gradient(180deg,#1a1200,#0d0e10)', borderBottom: '1px solid #e8a02028', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
    <div>
      <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: '#e8a020' }}>⚔ RSS Tracker</div>
      <div style={{ fontSize: 9, color: '#5a4020', letterSpacing: '.1em', marginTop: 2 }}>TOTAL BATTLE · CLAN COMMAND</div>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {extra}
      {todayDone !== undefined && todayDone < totalRes && (
        <div style={{ fontSize: 9, color: '#ef4444', letterSpacing: '.06em', background: '#ef444418', border: '1px solid #ef444430', borderRadius: 3, padding: '3px 8px' }}>
          {totalRes - todayDone} PENDING TODAY
        </div>
      )}
      <div style={{ background: '#1a1200', border: '1px solid #e8a02050', borderRadius: 4, padding: '3px 10px', fontSize: 10, color: '#e8a020', letterSpacing: '.06em' }}>{week}</div>
    </div>
  </div>
);

export const SummaryBar = ({ summary, playerCount }) => {
  const STAT_COL = { Done: '#22c55e', 'On Track': '#f59e0b', Slow: '#ef4444', Behind: '#6b7280' };
  return (
    <div style={{ display: 'flex', gap: 8, padding: '8px 18px', background: '#111214', borderBottom: '1px solid #1a1a1e', flexWrap: 'wrap', alignItems: 'center' }}>
      {Object.entries(summary).map(([s, n]) => (
        <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 5, background: STAT_COL[s] + '18', border: `1px solid ${STAT_COL[s]}40`, borderRadius: 3, padding: '3px 9px', fontSize: 10, color: STAT_COL[s], letterSpacing: '.06em' }}>
          <strong>{n}</strong> {s.toUpperCase()}
        </div>
      ))}
      <span style={{ marginLeft: 'auto', fontSize: 9, color: '#3a2a0a', letterSpacing: '.06em' }}>{playerCount} PLAYERS</span>
    </div>
  );
};

export const PlayerTable = ({ players, onEdit, onRemove, admin }) => {
  const { RES, RANK_COL, STAT_COL, RES_ICON, fmt, resCol, TARGET } = require('../lib/constants');
  return (
    <div style={{ overflowX: 'auto', padding: '0 18px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #1e1e22' }}>
            <th style={{ width: 6 }} />
            <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: '#3a2a0a', fontWeight: 400 }}>Player</th>
            <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: '#3a2a0a', fontWeight: 400, width: 82 }}>Status</th>
            {RES.map(r => (
              <th key={r} style={{ textAlign: 'right', padding: '6px 8px', fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', color: '#3a2a0a', fontWeight: 400, width: 76 }}>
                {RES_ICON[r]} {r}
              </th>
            ))}
            {admin && <th style={{ width: 58 }} />}
          </tr>
        </thead>
        <tbody>
          {players.map((p, i) => (
            <tr key={p.id} style={{ background: i % 2 === 0 ? '#0d0e10' : '#111214', borderBottom: '1px solid #14151a' }}>
              <td style={{ padding: '5px 0 5px 8px' }}>
                <div style={{ width: 3, height: 30, borderRadius: 2, background: RANK_COL[p.rank], opacity: .75 }} />
              </td>
              <td style={{ padding: '5px 8px' }}>
                <div style={{ fontSize: 12, color: '#d4c9b8' }}>{p.name}</div>
                <div style={{ fontSize: 9, color: RANK_COL[p.rank], letterSpacing: '.08em', textTransform: 'uppercase', marginTop: 1, opacity: .85 }}>{p.rank}</div>
              </td>
              <td style={{ padding: '5px 8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: STAT_COL[p.status], flexShrink: 0 }} />
                  <span style={{ fontSize: 9, color: STAT_COL[p.status], letterSpacing: '.06em', textTransform: 'uppercase' }}>{p.status}</span>
                </div>
              </td>
              {RES.map(r => (
                <td key={r} style={{ textAlign: 'right', padding: '5px 8px', fontVariantNumeric: 'tabular-nums', color: resCol(p.totals[r] || 0), fontWeight: (p.totals[r] || 0) >= TARGET ? 600 : 400, fontSize: 12 }}>
                  {fmt(p.totals[r] || 0)}
                </td>
              ))}
              {admin && (
                <td style={{ padding: '5px 8px' }}>
                  <span onClick={() => onEdit(p)} style={{ fontSize: 9, color: '#4a3a1a', cursor: 'pointer', letterSpacing: '.06em', textTransform: 'uppercase', marginRight: 8 }}
                    onMouseOver={e => e.target.style.color = '#e8a020'} onMouseOut={e => e.target.style.color = '#4a3a1a'}>Edit</span>
                  <span onClick={() => onRemove(p.id)} style={{ fontSize: 9, color: '#3a1a1a', cursor: 'pointer' }}
                    onMouseOver={e => e.target.style.color = '#ef4444'} onMouseOut={e => e.target.style.color = '#3a1a1a'}>✕</span>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
