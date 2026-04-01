import React, { useState, useMemo, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://tlnzpbaxcgcgahuwuylx.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsbnpwYmF4Y2djZ2FodXd1eWx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNTgxMzcsImV4cCI6MjA5MDYzNDEzN30.NkuCgJMPUoAK4nbxpHotOxT3Mu1wDAazh4KZDo9-IL0'
);

const ANTHROPIC_KEY = process.env.REACT_APP_ANTHROPIC_KEY;
const RANKS = ['Leader', 'Superior', 'Officer', 'Veteran', 'Soldier'];
const RES = ['Wood', 'Stone', 'Iron', 'Food', 'Silver'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TARGET = 350000;
const HALF = TARGET / 2;
const RANK_COL = { Leader: '#e8a020', Superior: '#a78bfa', Officer: '#60a5fa', Veteran: '#34d399', Soldier: '#9ca3af' };
const STAT_COL = { Done: '#22c55e', 'On Track': '#f59e0b', Slow: '#ef4444', Behind: '#6b7280' };
const RES_ICON = { Wood: '🪵', Stone: '🪨', Iron: '⚙️', Food: '🌾', Silver: '💠' };
const RES_COL = { Wood: '#d97706', Stone: '#9ca3af', Iron: '#60a5fa', Food: '#4ade80', Silver: '#c084fc' };

const fmt = v => v === 0 ? '—' : (v / 1000).toFixed(1) + 'k';
const rankIdx = r => RANKS.indexOf(r);
const resCol = v => v === 0 ? '#555' : v >= TARGET ? '#22c55e' : v >= HALF ? '#f59e0b' : '#ef4444';
const emptyT = () => Object.fromEntries(RES.map(r => [r, 0]));
const emptyS = () => Object.fromEntries(DAYS.map(d => [d, Object.fromEntries(RES.map(r => [r, false]))]));

const getStatus = t => {
  const vals = RES.map(r => t[r] || 0);
  if (vals.every(v => v >= TARGET)) return 'Done';
  const w = Math.min(...vals);
  if (w >= HALF) return 'On Track';
  if (w > 0) return 'Slow';
  return 'Behind';
};

const getWeekLabel = () => {
  const now = new Date();
  const d = now.getDay();
  const mon = new Date(now);
  mon.setDate(now.getDate() - d + (d === 0 ? -6 : 1));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const f = x => x.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${f(mon)} – ${f(sun)}`;
};

const getWeekId = () => {
  const now = new Date();
  const d = now.getDay();
  const mon = new Date(now);
  mon.setDate(now.getDate() - d + (d === 0 ? -6 : 1));
  return mon.toISOString().split('T')[0];
};

const todayIdx = () => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; };
const isAdmin = () => window.location.pathname === '/admin';

function Scanner({ players, weekId, onComplete }) {
  const [resource, setResource] = useState('Wood');
  const [image, setImage] = useState(null);
  const [imageData, setImageData] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(null);
  const [applying, setApplying] = useState(false);
  const [newPlayers, setNewPlayers] = useState([]);
  const [error, setError] = useState(null);
  const fileRef = useRef();

  const handleFile = file => {
    if (!file) return;
    setImage(URL.createObjectURL(file));
    setScanned(null); setError(null); setNewPlayers([]);
    const reader = new FileReader();
    reader.onload = e => setImageData({ base64: e.target.result.split(',')[1], mediaType: file.type || 'image/jpeg' });
    reader.readAsDataURL(file);
  };

  const scan = async () => {
    if (!imageData) return;
    setScanning(true); setError(null); setScanned(null); setNewPlayers([]);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          system: 'You are extracting data from a Total Battle game screenshot showing resource contributions. Extract ALL player names and their amounts. Players may appear multiple times — sum their amounts. Return ONLY a JSON array, no markdown. Format: [{"name":"PlayerName","amount":123456}]. Strip + signs. Convert K/M notation.',
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: imageData.mediaType, data: imageData.base64 } },
              { type: 'text', text: `Extract all player names and total ${resource} amounts. Sum duplicates. JSON array only.` }
            ]
          }]
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      const text = data.content?.[0]?.text || '';
      const extracted = JSON.parse(text.replace(/```json|```/g, '').trim());

      const matched = [];
      const unmatched = [];
      extracted.forEach(({ name, amount }) => {
        const player = players.find(p => p.name.toLowerCase() === name.toLowerCase());
        if (player) {
          const ex = matched.find(m => m.playerId === player.id);
          if (ex) ex.total += Number(amount);
          else matched.push({ name: player.name, total: Number(amount), playerId: player.id });
        } else {
          const ex = unmatched.find(u => u.name.toLowerCase() === name.toLowerCase());
          if (ex) ex.total += Number(amount);
          else unmatched.push({ name, total: Number(amount) });
        }
      });
      setScanned(matched);
      setNewPlayers(unmatched);
    } catch (err) {
      setError(err.message || 'Scan failed.');
    }
    setScanning(false);
  };

  const applyToSupabase = async () => {
    if (!scanned?.length && !newPlayers.length) return;
    setApplying(true);
    const allScanned = [...scanned];

    for (const np of newPlayers) {
      const { data } = await supabase.from('players').insert({ name: np.name, rank: 'Soldier', rank_order: 4 }).select().single();
      if (data) allScanned.push({ name: np.name, total: np.total, playerId: data.id });
    }

    for (const s of allScanned) {
      const { data: ex } = await supabase.from('weekly_totals').select('*').eq('player_id', s.playerId).eq('week_id', weekId).maybeSingle();
      const cur = ex ? ex[resource.toLowerCase()] || 0 : 0;
      await supabase.from('weekly_totals').upsert({
        player_id: s.playerId, week_id: weekId,
        wood:   resource === 'Wood'   ? cur + s.total : (ex?.wood   || 0),
        stone:  resource === 'Stone'  ? cur + s.total : (ex?.stone  || 0),
        iron:   resource === 'Iron'   ? cur + s.total : (ex?.iron   || 0),
        food:   resource === 'Food'   ? cur + s.total : (ex?.food   || 0),
        silver: resource === 'Silver' ? cur + s.total : (ex?.silver || 0),
      }, { onConflict: 'player_id,week_id' });
    }
    setApplying(false);
    onComplete();
  };

  const b = (v = 'default', dis) => ({ borderRadius: 3, padding: '6px 14px', fontSize: 10, fontFamily: 'inherit', letterSpacing: '.08em', cursor: dis ? 'not-allowed' : 'pointer', textTransform: 'uppercase', border: '1px solid', opacity: dis ? 0.5 : 1, ...(v === 'primary' ? { background: '#e8a020', color: '#0d0e10', borderColor: '#e8a020', fontWeight: 700 } : v === 'danger' ? { background: '#2a0a0a', color: '#f87171', borderColor: '#7f1d1d' } : { background: '#24252f', color: '#d4b870', borderColor: '#484858' }) });

  return (
    <div style={{ background: '#1e1f28', border: '1px solid #e8a02040', borderRadius: 6, padding: 20, marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: '#e8a020', marginBottom: 16 }}>📷 Scan Screenshot</div>

      <div style={{ fontSize: 9, color: '#c8a855', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>Resource</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {RES.map(r => (
          <button key={r} onClick={() => { setResource(r); setScanned(null); }} style={{ ...b(), background: resource === r ? RES_COL[r] + '30' : '#24252f', color: resource === r ? RES_COL[r] : '#d4b870', borderColor: resource === r ? RES_COL[r] + '80' : '#484858', fontWeight: resource === r ? 700 : 400 }}>
            {RES_ICON[r]} {r}
          </button>
        ))}
      </div>

      <div style={{ fontSize: 9, color: '#c8a855', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>Screenshot</div>
      <div onClick={() => fileRef.current.click()} onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }} onDragOver={e => e.preventDefault()}
        style={{ border: '2px dashed #484858', borderRadius: 4, padding: image ? 0 : 24, textAlign: 'center', cursor: 'pointer', marginBottom: 12, overflow: 'hidden' }}>
        {image ? <img src={image} alt="preview" style={{ width: '100%', maxHeight: 200, objectFit: 'contain', display: 'block' }} /> : <div style={{ color: '#d4b870', fontSize: 11, letterSpacing: '.06em' }}>Drop screenshot here or click to upload</div>}
      </div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />

      <button onClick={scan} disabled={!imageData || scanning} style={{ ...b('primary', !imageData || scanning), width: '100%', marginBottom: 12, padding: '8px' }}>
        {scanning ? 'Scanning...' : `Scan for ${resource} Data`}
      </button>

      {error && <div style={{ color: '#ef4444', fontSize: 11, padding: 10, background: '#2a0a0a', borderRadius: 3, border: '1px solid #7f1d1d', marginBottom: 12 }}>{error}</div>}

      {newPlayers.length > 0 && (
        <div style={{ background: '#1a1200', border: '1px solid #e8a02040', borderRadius: 4, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: '#e8a020', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>⚠ New players — will be added as Soldier</div>
          {newPlayers.map(p => (
            <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #2a2a1a' }}>
              <span style={{ fontSize: 12, color: '#f5f0e8' }}>{p.name} <span style={{ color: '#d4b870' }}>({fmt(p.total)})</span></span>
              <button onClick={() => setNewPlayers(prev => prev.filter(x => x.name !== p.name))} style={{ ...b('danger'), padding: '2px 8px', fontSize: 9 }}>Remove</button>
            </div>
          ))}
        </div>
      )}

      {scanned && (
        <div>
          <div style={{ fontSize: 10, color: '#c8a855', letterSpacing: '.06em', marginBottom: 8 }}>{scanned.length} players matched · {RES_ICON[resource]} {resource}</div>
          <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 12, border: '1px solid #484858', borderRadius: 3 }}>
            {scanned.map((p, i) => (
              <div key={p.playerId} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 10px', background: i % 2 === 0 ? '#1e1f28' : '#24252f', fontSize: 12 }}>
                <span style={{ color: '#f5f0e8' }}>{p.name}</span>
                <span style={{ color: RES_COL[resource], fontWeight: 600 }}>{fmt(p.total)}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setScanned(null); setImage(null); setImageData(null); setNewPlayers([]); }} style={b()}>Clear</button>
            <button onClick={applyToSupabase} disabled={applying} style={{ ...b('primary', applying), flex: 1 }}>
              {applying ? 'Applying...' : `Apply to Week`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function App() {
  const [players, setPlayers] = useState([]);
  const [submitted, setSubmitted] = useState(emptyS());
  const [filter, setFilter] = useState('All');
  const [sort, setSort] = useState('rank');
  const [modal, setModal] = useState(null);
  const [editId, setEditId] = useState(null);
  const [editVals, setEditVals] = useState({});
  const [newP, setNewP] = useState({ name: '', rank: 'Soldier' });
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showScanner, setShowScanner] = useState(false);
  const admin = isAdmin();
  const week = useMemo(getWeekLabel, []);
  const weekId = useMemo(getWeekId, []);
  const today = useMemo(todayIdx, []);

  useEffect(() => { loadData(); const iv = setInterval(loadData, 60000); return () => clearInterval(iv); }, []);

  const loadData = async () => {
    const { data: pd } = await supabase.from('players').select('*').order('rank_order').order('name');
    const { data: td } = await supabase.from('weekly_totals').select('*').eq('week_id', weekId);
    const { data: sd } = await supabase.from('submissions').select('*').eq('week_id', weekId).maybeSingle();
    const tm = {};
    (td || []).forEach(t => { tm[t.player_id] = { Wood: t.wood, Stone: t.stone, Iron: t.iron, Food: t.food, Silver: t.silver }; });
    setPlayers((pd || []).map(p => ({ id: p.id, name: p.name, rank: p.rank, totals: tm[p.id] || emptyT() })));
    if (sd?.data) setSubmitted(sd.data);
    setLoading(false);
  };

  const toggleSubmit = async (day, res) => {
    if (!admin) return;
    const next = { ...submitted, [day]: { ...submitted[day], [res]: !submitted[day]?.[res] } };
    setSubmitted(next);
    await supabase.from('submissions').upsert({ week_id: weekId, data: next }, { onConflict: 'week_id' });
  };

  const processed = useMemo(() => players.map(p => ({ ...p, status: getStatus(p.totals), worst: Math.min(...RES.map(r => p.totals[r] || 0)) })), [players]);

  const filtered = useMemo(() => {
    let list = filter === 'All' ? [...processed] : processed.filter(p => p.status === filter);
    return sort === 'rank' ? list.sort((a, b) => rankIdx(a.rank) - rankIdx(b.rank) || a.name.localeCompare(b.name)) : list.sort((a, b) => a.worst - b.worst);
  }, [processed, filter, sort]);

  const summary = useMemo(() => { const c = { Done: 0, 'On Track': 0, Slow: 0, Behind: 0 }; processed.forEach(p => c[p.status]++); return c; }, [processed]);

  const closeModal = () => { setModal(null); setEditId(null); };
  const openEdit = p => { setEditVals({ ...p.totals }); setEditId(p.id); setModal('edit'); };

  const saveEdit = async () => {
    setSaving(true);
    const t = Object.fromEntries(RES.map(r => [r, Number(editVals[r]) || 0]));
    await supabase.from('weekly_totals').upsert({ player_id: editId, week_id: weekId, wood: t.Wood, stone: t.Stone, iron: t.Iron, food: t.Food, silver: t.Silver }, { onConflict: 'player_id,week_id' });
    await loadData(); setSaving(false); closeModal();
  };

  const addPlayer = async () => {
    if (!newP.name.trim()) return;
    setSaving(true);
    await supabase.from('players').insert({ name: newP.name.trim(), rank: newP.rank, rank_order: rankIdx(newP.rank) });
    setNewP({ name: '', rank: 'Soldier' });
    await loadData(); setSaving(false); closeModal();
  };

  const removePlayer = async id => {
    if (!window.confirm('Remove this player?')) return;
    await supabase.from('players').delete().eq('id', id);
    await supabase.from('weekly_totals').delete().eq('player_id', id);
    await loadData();
  };

  const resetWeek = async () => {
    setSaving(true);
    await supabase.from('weekly_totals').delete().eq('week_id', weekId);
    await supabase.from('submissions').delete().eq('week_id', weekId);
    setSubmitted(emptyS()); await loadData(); setSaving(false); closeModal();
  };

  const report = useMemo(() => {
    const done = processed.filter(p => p.status === 'Done').map(p => p.name);
    const out = processed.filter(p => p.status !== 'Done').sort((a, b) => rankIdx(a.rank) - rankIdx(b.rank)).map(p => {
      const s = RES.filter(r => (p.totals[r] || 0) < TARGET).map(r => `${r}: ${((TARGET - (p.totals[r] || 0)) / 1000).toFixed(1)}k short`);
      return `${p.name} (${p.rank}): ${s.join(', ')}`;
    });
    return [`WEEKLY RSS REPORT — ${week}`, '', `COMPLETED (${done.length}):`, done.length ? done.join(', ') : 'None', '', `OUTSTANDING (${out.length}):`, ...out].join('\n');
  }, [processed, week]);

  const copyReport = () => { navigator.clipboard.writeText(report); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const todayDone = RES.filter(r => submitted[DAYS[today]]?.[r]).length;
  const editPlayer = players.find(p => p.id === editId);

  const btn = (v = 'default', dis) => ({ borderRadius: 3, padding: '5px 12px', fontSize: 10, fontFamily: 'inherit', letterSpacing: '.08em', cursor: dis ? 'not-allowed' : 'pointer', textTransform: 'uppercase', border: '1px solid', opacity: dis ? 0.5 : 1, ...(v === 'active' ? { background: '#e8a020', color: '#0d0e10', borderColor: '#e8a020' } : v === 'primary' ? { background: '#e8a020', color: '#0d0e10', borderColor: '#e8a020', fontWeight: 700 } : v === 'danger' ? { background: '#2a0a0a', color: '#f87171', borderColor: '#7f1d1d' } : { background: '#24252f', color: '#d4b870', borderColor: '#484858' }) });
  const inp = col => ({ width: '100%', background: '#1a1b22', border: '1px solid #484858', borderRadius: 3, padding: '7px 9px', color: col || '#f5f0e8', fontFamily: 'inherit', fontSize: 12, boxSizing: 'border-box' });

  if (loading) return <div style={{ minHeight: '100vh', background: '#1a1b22', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e8a020', fontFamily: 'Courier New', letterSpacing: '.1em', fontSize: 13 }}>LOADING...</div>;

  return (
    <div style={{ minHeight: '100vh', background: '#1a1b22', color: '#f5f0e8', fontFamily: "'Courier New',monospace", fontSize: 13, paddingBottom: 40 }}>

      <div style={{ background: 'linear-gradient(180deg,#1a1200,#1a1b22)', borderBottom: '1px solid #e8a02028', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: '#e8a020' }}>⚔ RSS Tracker {admin && <span style={{ fontSize: 10, color: '#ef4444' }}>ADMIN</span>}</div>
          <div style={{ fontSize: 9, color: '#c8a850', letterSpacing: '.1em', marginTop: 2 }}>TOTAL BATTLE · CLAN COMMAND</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {admin && todayDone < RES.length && <div style={{ fontSize: 9, color: '#ef4444', background: '#ef444418', border: '1px solid #ef444430', borderRadius: 3, padding: '3px 8px' }}>{RES.length - todayDone} PENDING TODAY</div>}
          {!admin && <div style={{ fontSize: 9, color: '#c8a850' }}>READ ONLY</div>}
          <div style={{ background: '#1a1200', border: '1px solid #e8a02050', borderRadius: 4, padding: '3px 10px', fontSize: 10, color: '#e8a020' }}>{week}</div>
        </div>
      </div>

      <div style={{ background: '#1e1f28', borderBottom: '1px solid #2a2b36', padding: '10px 18px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '80px repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
          <div style={{ fontSize: 9, color: '#c8a850', letterSpacing: '.08em', textTransform: 'uppercase', alignSelf: 'center' }}>Resource</div>
          {DAYS.map((d, i) => (
            <div key={d} style={{ textAlign: 'center', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: i === today ? '#e8a020' : i < today ? '#8a7040' : '#484858', fontWeight: i === today ? 700 : 400 }}>
              {d}{i === today && <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#e8a020', margin: '2px auto 0' }} />}
            </div>
          ))}
        </div>
        {RES.map(r => (
          <div key={r} style={{ display: 'grid', gridTemplateColumns: '80px repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
            <div style={{ fontSize: 10, color: RES_COL[r], alignSelf: 'center', display: 'flex', alignItems: 'center', gap: 4 }}>{RES_ICON[r]} {r}</div>
            {DAYS.map((d, i) => {
              const done = submitted?.[d]?.[r] || false;
              const isFuture = i > today;
              return (
                <div key={d} onClick={() => admin && !isFuture && toggleSubmit(d, r)}
                  style={{ height: 22, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, cursor: admin && !isFuture ? 'pointer' : 'default', background: done ? RES_COL[r] + '30' : isFuture ? '#1a1b22' : '#24252f', border: `1px solid ${done ? RES_COL[r] + '80' : i === today ? '#6a5a30' : '#2a2b36'}`, opacity: isFuture ? 0.2 : 1 }}>
                  {done ? '✓' : i < today && !done ? '✗' : '·'}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '8px 18px', background: '#22232c', borderBottom: '1px solid #2a2b36', flexWrap: 'wrap', alignItems: 'center' }}>
        {Object.entries(summary).map(([s, n]) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 5, background: STAT_COL[s] + '18', border: `1px solid ${STAT_COL[s]}40`, borderRadius: 3, padding: '3px 9px', fontSize: 10, color: STAT_COL[s] }}>
            <strong>{n}</strong> {s.toUpperCase()}
          </div>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 9, color: '#c8a850' }}>{players.length} PLAYERS</span>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 18px', flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid #24252f' }}>
        {['All', 'Done', 'On Track', 'Slow', 'Behind'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={btn(filter === f ? 'active' : 'default')}>{f}</button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button onClick={() => setSort(s => s === 'rank' ? 'worst' : 'rank')} style={btn()}>Sort: {sort === 'rank' ? 'Rank' : 'Worst'}</button>
          {admin && <button onClick={() => setShowScanner(s => !s)} style={btn(showScanner ? 'active' : 'default')}>📷 Scan</button>}
          {admin && <button onClick={() => setModal('add')} style={btn()}>+ Player</button>}
          {admin && <button onClick={() => setModal('report')} style={btn()}>Report</button>}
          {admin && <button onClick={() => setModal('reset')} style={btn('danger')}>Reset Week</button>}
        </div>
      </div>

      {admin && showScanner && (
        <div style={{ padding: '12px 18px 0' }}>
          <Scanner players={players} weekId={weekId} onComplete={() => { setShowScanner(false); loadData(); }} />
        </div>
      )}

      <div style={{ overflowX: 'auto', padding: '0 18px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #2a2b36' }}>
              <th style={{ width: 6 }} />
              <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: '#c8a850', fontWeight: 400 }}>Player</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: '#c8a850', fontWeight: 400, width: 82 }}>Status</th>
              {RES.map(r => <th key={r} style={{ textAlign: 'right', padding: '6px 8px', fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', color: '#c8a850', fontWeight: 400, width: 76 }}>{RES_ICON[r]} {r}</th>)}
              {admin && <th style={{ width: 58 }} />}
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => (
              <tr key={p.id} style={{ background: i % 2 === 0 ? '#1a1b22' : '#22232c', borderBottom: '1px solid #20212a' }}>
                <td style={{ padding: '5px 0 5px 8px' }}><div style={{ width: 3, height: 30, borderRadius: 2, background: RANK_COL[p.rank], opacity: .85 }} /></td>
                <td style={{ padding: '5px 8px' }}>
                  <div style={{ fontSize: 12, color: '#f5f0e8' }}>{p.name}</div>
                  <div style={{ fontSize: 9, color: RANK_COL[p.rank], letterSpacing: '.08em', textTransform: 'uppercase', marginTop: 1 }}>{p.rank}</div>
                </td>
                <td style={{ padding: '5px 8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: STAT_COL[getStatus(p.totals)], flexShrink: 0 }} />
                    <span style={{ fontSize: 9, color: STAT_COL[getStatus(p.totals)], letterSpacing: '.06em', textTransform: 'uppercase' }}>{getStatus(p.totals)}</span>
                  </div>
                </td>
                {RES.map(r => <td key={r} style={{ textAlign: 'right', padding: '5px 8px', fontVariantNumeric: 'tabular-nums', color: resCol(p.totals[r] || 0), fontWeight: (p.totals[r] || 0) >= TARGET ? 600 : 400, fontSize: 12 }}>{fmt(p.totals[r] || 0)}</td>)}
                {admin && (
                  <td style={{ padding: '5px 8px' }}>
                    <span onClick={() => openEdit(p)} style={{ fontSize: 9, color: '#c8a855', cursor: 'pointer', letterSpacing: '.06em', textTransform: 'uppercase', marginRight: 8 }} onMouseOver={e => e.target.style.color = '#e8a020'} onMouseOut={e => e.target.style.color = '#c8a855'}>Edit</span>
                    <span onClick={() => removePlayer(p.id)} style={{ fontSize: 9, color: '#884444', cursor: 'pointer' }} onMouseOver={e => e.target.style.color = '#ef4444'} onMouseOut={e => e.target.style.color = '#884444'}>✕</span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div onClick={closeModal} style={{ position: 'fixed', inset: 0, background: '#000d', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#1e1f28', border: `1px solid ${modal === 'reset' ? '#991b1b' : '#e8a02040'}`, borderRadius: 6, padding: 26, width: 'min(380px,92vw)', maxHeight: '90vh', overflowY: 'auto' }}>

            {modal === 'add' && <>
              <div style={{ fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', color: '#e8a020', marginBottom: 16, fontWeight: 700 }}>Add Player</div>
              <div style={{ fontSize: 9, color: '#c8a855', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>Name</div>
              <input autoFocus style={inp()} value={newP.name} onChange={e => setNewP(p => ({ ...p, name: e.target.value }))} onKeyDown={e => e.key === 'Enter' && addPlayer()} placeholder="Player name..." />
              <div style={{ fontSize: 9, color: '#c8a855', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4, marginTop: 8 }}>Rank</div>
              <select style={inp()} value={newP.rank} onChange={e => setNewP(p => ({ ...p, rank: e.target.value }))}>
                {RANKS.map(r => <option key={r}>{r}</option>)}
              </select>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
                <button onClick={closeModal} style={btn()}>Cancel</button>
                <button onClick={addPlayer} disabled={saving} style={btn('primary')}>{saving ? 'Adding...' : 'Add'}</button>
              </div>
            </>}

            {modal === 'edit' && editPlayer && <>
              <div style={{ fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', color: '#e8a020', marginBottom: 6, fontWeight: 700 }}>Edit — {editPlayer.name}</div>
              <div style={{ fontSize: 9, color: '#c8a850', letterSpacing: '.06em', marginBottom: 14 }}>RUNNING WEEKLY TOTALS</div>
              {RES.map(r => (
                <div key={r} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 9, color: '#c8a855', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>{RES_ICON[r]} {r}</div>
                  <input type="number" style={inp(resCol(Number(editVals[r]) || 0))} value={editVals[r] ?? 0} onChange={e => setEditVals(v => ({ ...v, [r]: e.target.value }))} />
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
                <button onClick={closeModal} style={btn()}>Cancel</button>
                <button onClick={saveEdit} disabled={saving} style={btn('primary')}>{saving ? 'Saving...' : 'Save'}</button>
              </div>
            </>}

            {modal === 'report' && <>
              <div style={{ fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', color: '#e8a020', marginBottom: 16, fontWeight: 700 }}>Weekly Report</div>
              <pre style={{ background: '#1a1b22', border: '1px solid #484858', borderRadius: 3, padding: 12, fontSize: 10, lineHeight: 1.8, color: '#d4b878', whiteSpace: 'pre-wrap', overflowY: 'auto', maxHeight: 340, fontFamily: 'inherit', marginBottom: 14 }}>{report}</pre>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={closeModal} style={btn()}>Close</button>
                <button onClick={copyReport} style={btn('primary')}>{copied ? 'Copied!' : 'Copy'}</button>
              </div>
            </>}

            {modal === 'reset' && <>
              <div style={{ fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', color: '#ef4444', marginBottom: 14, fontWeight: 700 }}>Reset Week?</div>
              <p style={{ fontSize: 12, color: '#d4b878', lineHeight: 1.6, marginBottom: 18 }}>Clears all RSS totals and submission tracking. Cannot be undone.</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={closeModal} style={btn()}>Cancel</button>
                <button onClick={resetWeek} disabled={saving} style={btn('danger')}>{saving ? 'Resetting...' : 'Confirm Reset'}</button>
              </div>
            </>}
          </div>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
