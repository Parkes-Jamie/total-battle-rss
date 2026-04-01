import { RES, DAYS, RES_ICON, RES_COL } from '../lib/constants';

export default function DayStrip({ submitted, onToggle, today, readOnly }) {
  return (
    <div style={{ background: '#0f1012', borderBottom: '1px solid #1e1e22', padding: '10px 18px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '80px repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
        <div style={{ fontSize: 9, color: '#3a2a0a', letterSpacing: '.08em', textTransform: 'uppercase', alignSelf: 'center' }}>Resource</div>
        {DAYS.map((d, i) => (
          <div key={d} style={{ textAlign: 'center', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: i === today ? '#e8a020' : i < today ? '#4a3a1a' : '#2a2a30', fontWeight: i === today ? 700 : 400 }}>
            {d}
            {i === today && <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#e8a020', margin: '2px auto 0' }} />}
          </div>
        ))}
      </div>
      {RES.map(r => (
        <div key={r} style={{ display: 'grid', gridTemplateColumns: '80px repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
          <div style={{ fontSize: 10, color: RES_COL[r], letterSpacing: '.04em', alignSelf: 'center', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>{RES_ICON[r]}</span> {r}
          </div>
          {DAYS.map((d, i) => {
            const done = submitted?.[d]?.[r] || false;
            const isPast = i < today;
            const isToday = i === today;
            const isFuture = i > today;
            return (
              <div key={d}
                onClick={() => !readOnly && !isFuture && onToggle(d, r)}
                style={{
                  height: 22, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, cursor: readOnly || isFuture ? 'default' : 'pointer', transition: 'all .15s',
                  background: done ? RES_COL[r] + '30' : isFuture ? '#0d0e10' : '#1a1a1e',
                  border: `1px solid ${done ? RES_COL[r] + '80' : isToday ? '#3a3020' : '#1e1e22'}`,
                  opacity: isFuture ? 0.2 : 1,
                }}
              >
                {done ? '✓' : isPast && !done ? '✗' : '·'}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
