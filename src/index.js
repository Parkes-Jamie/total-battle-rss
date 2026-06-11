import React, { useState, useMemo, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://tlnzpbaxcgcgahuwuylx.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsbnpwYmF4Y2djZ2FodXd1eWx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNTgxMzcsImV4cCI6MjA5MDYzNDEzN30.NkuCgJMPUoAK4nbxpHotOxT3Mu1wDAazh4KZDo9-IL0'
);

const ANTHROPIC_KEY = process.env.REACT_APP_ANTHROPIC_KEY;
const RES = ['Wood', 'Stone', 'Iron', 'Food', 'Silver'];
const ALL_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DEFAULT_TARGETS = { Wood: 350000, Stone: 350000, Iron: 350000, Food: 350000, Silver: 350000 };
const STAT_COL = { Done: '#22c55e', 'On Track': '#f59e0b', Slow: '#ef4444', Behind: '#6b7280' };
const RES_ICON = { Wood: '🪵', Stone: '🪨', Iron: '⚙️', Food: '🌾', Silver: '💠' };
const RES_COL = { Wood: '#d97706', Stone: '#9ca3af', Iron: '#60a5fa', Food: '#4ade80', Silver: '#c084fc' };
const SANITY_LIMIT = 15000000;
const REPORT_CHAR_LIMIT = 850;

const fmt = v => v === 0 ? '—' : v >= 1000000 ? (v / 1000000).toFixed(2) + 'M' : (v / 1000).toFixed(1) + 'k';
const norm = s => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');
const emptyT = () => Object.fromEntries(RES.map(r => [r, 0]));

const getStatus = (t, targets) => {
  const ratios = RES.map(r => (t[r] || 0) / (targets[r] || 1));
  if (ratios.every(x => x >= 1)) return 'Done';
  const w = Math.min(...ratios);
  if (w >= 0.5) return 'On Track';
  if (w > 0) return 'Slow';
  return 'Behind';
};
const resCol = (v, target) => v === 0 ? '#555' : v >= target ? '#22c55e' : v >= target / 2 ? '#f59e0b' : '#ef4444';

const dateToId = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const idToDate = id => { const p = (id || '').split('-'); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])); };
const weekStartFor = (date, startDay) => {
  const d = new Date(date);
  const diff = (d.getDay() - startDay + 7) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
};
const currentWeekId = startDay => dateToId(weekStartFor(new Date(), startDay));
const shiftWeekId = (id, n) => { const d = idToDate(id); d.setDate(d.getDate() + n * 7); return dateToId(d); };
const weekLabel = id => {
  const s = idToDate(id);
  const e = new Date(s);
  e.setDate(s.getDate() + 6);
  const f = x => x.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${f(s)} – ${f(e)}`;
};
const dayLabelsFor = startDay => Array.from({ length: 7 }, (_, i) => ALL_DAYS[(startDay + i) % 7]);
const emptySubs = labels => Object.fromEntries(labels.map(d => [d, Object.fromEntries(RES.map(r => [r, false]))]));
const isAdmin = () => window.location.pathname === '/admin';

const compress = file => new Promise(res => {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    const maxDim = 1600;
    let w = img.width, h = img.height;
    if (w > maxDim || h > maxDim) {
      if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
      else { w = Math.round(w * maxDim / h); h = maxDim; }
    }
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    res({ base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' });
  };
  img.src = URL.createObjectURL(file);
});

const hashStr = s => {
  let h = 5381;
  for (let i = 0; i < s.length; i += 97) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return String(h) + '-' + s.length;
};
const getSeenHashes = () => { try { return JSON.parse(localStorage.getItem('tb_scan_hashes') || '[]'); } catch (e) { return []; } };
const addSeenHash = h => { try { const a = getSeenHashes(); a.push(h); localStorage.setItem('tb_scan_hashes', JSON.stringify(a.slice(-150))); } catch (e) {} };

const askClaude = async (imageData, system, text) => {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514', max_tokens: 3000, system,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: imageData.mediaType, data: imageData.base64 } },
        { type: 'text', text }
      ]}]
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return JSON.parse((data.content?.[0]?.text || '').replace(/```json|```/g, '').trim());
};

const splitReport = text => {
  const lines = text.split('\n');
  const parts = [];
  let cur = '';
  for (const line of lines) {
    if ((cur + '\n' + line).length > REPORT_CHAR_LIMIT - 12 && cur) {
      parts.push(cur);
      cur = line;
    } else {
      cur = cur ? cur + '\n' + line : line;
    }
  }
  if (cur) parts.push(cur);
  if (parts.length > 1) return parts.map((p, i) => `(${i + 1}/${parts.length})\n${p}`);
  return parts;
};

const downloadCSV = (filename, rows) => {
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
};

// ── SCANNER with review screen, duplicate detection, sanity flags ──
function Scanner({ players, weekId, onApplied, onComplete }) {
  const [scanning, setScanning] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const [rows, setRows] = useState([]);
  const [applying, setApplying] = useState(false);
  const [errors, setErrors] = useState([]);
  const [undoData, setUndoData] = useState(null);
  const [undoing, setUndoing] = useState(false);
  const [lastMsg, setLastMsg] = useState(null);
  const fileRef = useRef();

  const nameMap = useMemo(() => {
    const m = new Map();
    players.forEach(p => m.set(norm(p.name), p));
    return m;
  }, [players]);

  const scanFiles = async files => {
    const arr = Array.from(files);
    if (!arr.length) return;
    setTotalFiles(arr.length); setDoneCount(0); setErrors([]); setScanning(true); setLastMsg(null);
    const rosterNames = players.map(p => p.name).join(', ');
    const sys = 'You extract data from Total Battle game screenshots showing resource contributions. Identify the resource type from the icon/label (Wood/Stone/Iron/Food/Silver — the game labels Wood as Lumber). Extract EVERY player name and amount exactly as shown, summing duplicate entries for the same player. Be precise with names. Return ONLY JSON, no markdown.';
    const txt = `Known clan players: ${rosterNames}\nIdentify the resource type and extract every player name and total amount. Use exact spellings from the known players list where they match. Return: {"resource":"Wood","players":[{"name":"PlayerName","amount":123456}]}`;
    const seen = getSeenHashes();

    const outcomes = await Promise.all(arr.map(async file => {
      try {
        const imageData = await compress(file);
        const hash = hashStr(imageData.base64);
        const dup = seen.includes(hash);
        const parsed = await askClaude(imageData, sys, txt);
        const resource = parsed.resource === 'Lumber' ? 'Wood' : parsed.resource;
        if (!RES.includes(resource)) throw new Error('Could not identify resource type');
        setDoneCount(c => c + 1);
        return { ok: true, resource, hash, dup, extracted: parsed.players || [] };
      } catch (e) {
        setDoneCount(c => c + 1);
        return { ok: false, file: file.name, error: e.message };
      }
    }));

    const newRows = [];
    let k = 0;
    outcomes.forEach(o => {
      if (!o.ok) return;
      o.extracted.forEach(({ name, amount }) => {
        const amt = Number(amount) || 0;
        if (amt <= 0) return;
        const match = nameMap.get(norm(name));
        const existing = newRows.find(r => r.resource === o.resource && match && r.playerId === match.id);
        if (existing) { existing.amount += amt; return; }
        newRows.push({
          key: 'r' + (k++),
          resource: o.resource,
          name: match ? match.name : name,
          playerId: match ? match.id : null,
          amount: amt,
          include: !o.dup,
          dup: o.dup,
          hash: o.hash,
          sanity: amt >= SANITY_LIMIT,
        });
      });
    });
    setRows(newRows);
    setErrors(outcomes.filter(o => !o.ok).map(o => `${o.file}: ${o.error}`));
    setScanning(false);
  };

  const setRow = (key, patch) => setRows(rs => rs.map(r => r.key === key ? { ...r, ...patch } : r));

  const applyAll = async () => {
    const active = rows.filter(r => r.include && r.playerId && r.amount > 0);
    if (!active.length) return;
    setApplying(true);
    try {
      const { data: existing } = await supabase.from('weekly_totals').select('*').eq('week_id', weekId);
      const exMap = new Map();
      (existing || []).forEach(row => exMap.set(row.player_id, row));

      const updates = new Map();
      const affectedIds = new Set();
      for (const r of active) {
        affectedIds.add(r.playerId);
        if (!updates.has(r.playerId)) {
          const ex = exMap.get(r.playerId);
          updates.set(r.playerId, {
            player_id: r.playerId, week_id: weekId,
            wood: ex?.wood || 0, stone: ex?.stone || 0, iron: ex?.iron || 0, food: ex?.food || 0, silver: ex?.silver || 0,
          });
        }
        updates.get(r.playerId)[r.resource.toLowerCase()] += r.amount;
      }

      const snapshot = {};
      affectedIds.forEach(id => { snapshot[id] = exMap.get(id) ? { ...exMap.get(id) } : null; });
      setUndoData(snapshot);

      await supabase.from('weekly_totals').upsert([...updates.values()], { onConflict: 'player_id,week_id' });
      await supabase.from('settings').upsert({ key: 'last_updated', value: new Date().toISOString() }, { onConflict: 'key' });

      [...new Set(rows.map(r => r.hash))].forEach(h => { if (h) addSeenHash(h); });
      const resources = [...new Set(active.map(r => r.resource))];
      setLastMsg(`Applied — ${resources.join(', ')} — ${updates.size} players updated`);
      setRows([]);
      onApplied(resources);
    } catch (e) {
      setErrors(prev => [...prev, 'Apply failed: ' + e.message]);
    }
    setApplying(false);
  };

  const undo = async () => {
    if (!undoData) return;
    setUndoing(true);
    try {
      const restore = [];
      const remove = [];
      for (const [playerId, prev] of Object.entries(undoData)) {
        if (prev) restore.push({ player_id: playerId, week_id: weekId, wood: prev.wood || 0, stone: prev.stone || 0, iron: prev.iron || 0, food: prev.food || 0, silver: prev.silver || 0 });
        else remove.push(playerId);
      }
      if (restore.length) await supabase.from('weekly_totals').upsert(restore, { onConflict: 'player_id,week_id' });
      if (remove.length) await supabase.from('weekly_totals').delete().eq('week_id', weekId).in('player_id', remove);
      setUndoData(null);
      setLastMsg('Undone — data restored');
      onComplete();
    } catch (e) {
      setErrors(prev => [...prev, 'Undo failed: ' + e.message]);
    }
    setUndoing(false);
  };

  const b = (v = 'default', dis) => ({ borderRadius: 3, padding: '6px 14px', fontSize: 10, fontFamily: 'inherit', letterSpacing: '.08em', cursor: dis ? 'not-allowed' : 'pointer', textTransform: 'uppercase', border: '1px solid', opacity: dis ? 0.5 : 1, ...(v === 'primary' ? { background: '#e8a020', color: '#0d0e10', borderColor: '#e8a020', fontWeight: 700 } : v === 'undo' ? { background: '#1a1a2a', color: '#a78bfa', borderColor: '#4c4880' } : { background: '#24252f', color: '#d4b870', borderColor: '#484858' }) });

  const grouped = useMemo(() => {
    const g = {};
    rows.forEach(r => { (g[r.resource] = g[r.resource] || []).push(r); });
    return g;
  }, [rows]);

  const readyCount = rows.filter(r => r.include && r.playerId && r.amount > 0).length;
  const unmatchedCount = rows.filter(r => !r.playerId).length;

  return (
    <div style={{ background: '#1e1f28', border: '1px solid #e8a02040', borderRadius: 6, padding: 20, marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: '#e8a020', marginBottom: 8 }}>📷 Scan RSS Screenshots</div>
      <div style={{ fontSize: 11, color: '#c8a855', marginBottom: 14, lineHeight: 1.5 }}>Drop all screenshots at once. Everything is shown for review before anything is saved.</div>

      {lastMsg && (
        <div style={{ fontSize: 11, color: '#22c55e', background: '#1a1b22', border: '1px solid #484858', borderRadius: 3, padding: '8px 12px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span>{lastMsg}</span>
          {undoData && <button onClick={undo} disabled={undoing} style={{ ...b('undo', undoing), padding: '3px 10px', fontSize: 9 }}>{undoing ? 'Undoing...' : 'Undo'}</button>}
        </div>
      )}

      <div onClick={() => fileRef.current.click()}
        onDrop={e => { e.preventDefault(); scanFiles(e.dataTransfer.files); }}
        onDragOver={e => e.preventDefault()}
        style={{ border: '2px dashed #484858', borderRadius: 4, padding: 24, textAlign: 'center', cursor: 'pointer', marginBottom: 12 }}>
        <div style={{ color: '#d4b870', fontSize: 11, letterSpacing: '.06em' }}>
          {scanning ? `Scanning ${doneCount} of ${totalFiles}...` : 'Tap to select screenshots'}
        </div>
        {scanning && (
          <div style={{ marginTop: 10, height: 4, background: '#24252f', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${totalFiles ? (doneCount / totalFiles) * 100 : 0}%`, background: '#e8a020', transition: 'width .3s' }} />
          </div>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => { scanFiles(e.target.files); e.target.value = ''; }} />

      {errors.map((er, i) => <div key={i} style={{ color: '#ef4444', fontSize: 11, padding: '6px 10px', background: '#2a0a0a', borderRadius: 3, border: '1px solid #7f1d1d', marginBottom: 6 }}>{er}</div>)}

      {rows.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: '#c8a855', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>Review before applying</div>
          {unmatchedCount > 0 && <div style={{ fontSize: 10, color: '#e8a020', marginBottom: 8 }}>{unmatchedCount} name{unmatchedCount > 1 ? 's' : ''} not matched — assign a player or untick to skip</div>}
          {Object.entries(grouped).map(([resource, list]) => (
            <div key={resource} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: RES_COL[resource], fontWeight: 700, marginBottom: 4 }}>{RES_ICON[resource]} {resource} — {list.filter(r => r.include).length} rows</div>
              <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #2a2b36', borderRadius: 3 }}>
                {list.map((r, i) => (
                  <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: !r.playerId ? '#2a1a00' : r.dup ? '#1a1a2a' : i % 2 === 0 ? '#1a1b22' : '#22232c', opacity: r.include ? 1 : 0.4 }}>
                    <input type="checkbox" checked={r.include} onChange={e => setRow(r.key, { include: e.target.checked })} style={{ accentColor: '#e8a020' }} />
                    {r.playerId
                      ? <span style={{ fontSize: 11, color: '#f5f0e8', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                      : <select value="" onChange={e => { const p = players.find(x => x.id === e.target.value); if (p) setRow(r.key, { playerId: p.id, name: p.name }); }} style={{ flex: 1, minWidth: 0, background: '#1a1b22', border: '1px solid #e8a02060', borderRadius: 3, color: '#e8a020', fontFamily: 'inherit', fontSize: 10, padding: '3px 4px' }}>
                          <option value="">"{r.name}" — assign player...</option>
                          {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>}
                    <input type="number" value={r.amount} onChange={e => setRow(r.key, { amount: Number(e.target.value) || 0, sanity: (Number(e.target.value) || 0) >= SANITY_LIMIT })}
                      style={{ width: 90, background: '#1a1b22', border: '1px solid #484858', borderRadius: 3, color: '#f5f0e8', fontFamily: 'inherit', fontSize: 11, padding: '3px 6px', textAlign: 'right' }} />
                    {r.dup && <span style={{ fontSize: 8, color: '#a78bfa', border: '1px solid #4c4880', borderRadius: 2, padding: '1px 4px', flexShrink: 0 }}>DUP?</span>}
                    {r.sanity && <span style={{ fontSize: 8, color: '#e8a020', border: '1px solid #e8a02060', borderRadius: 2, padding: '1px 4px', flexShrink: 0 }}>CHECK</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button onClick={() => setRows([])} style={b()}>Clear</button>
            <button onClick={applyAll} disabled={applying || readyCount === 0} style={{ ...b('primary', applying || readyCount === 0), flex: 1 }}>
              {applying ? 'Applying...' : `Apply ${readyCount} Rows`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ROSTER SYNC — new players added as Pending ──
function RosterSync({ players, onComplete }) {
  const [phase, setPhase] = useState('upload');
  const [scannedNames, setScannedNames] = useState(new Map());
  const [scanning, setScanning] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const [error, setError] = useState(null);
  const [applying, setApplying] = useState(false);
  const [toRemove, setToRemove] = useState(new Set());
  const [toAdd, setToAdd] = useState(new Set());
  const fileRef = useRef();

  const newPlayers = [...scannedNames.keys()].filter(n => !players.find(p => norm(p.name) === norm(n)));
  const missingPlayers = players.filter(p => p.status !== 'pending' && ![...scannedNames.keys()].find(n => norm(n) === norm(p.name)));

  const handleFiles = async files => {
    const arr = Array.from(files);
    if (!arr.length) return;
    setTotalFiles(arr.length); setDoneCount(0); setError(null); setScanning(true);
    const sys = 'You are reading a Total Battle clan member list. Extract player names exactly as shown. Return a JSON array of strings: ["Name1","Name2"]. No markdown.';
    const txt = 'Extract all player names from this clan member list. Ignore rank labels, power numbers and status text. JSON array of name strings only.';

    const outcomes = await Promise.all(arr.map(async file => {
      try {
        const imageData = await compress(file);
        const extracted = await askClaude(imageData, sys, txt);
        setDoneCount(c => c + 1);
        return { ok: true, extracted };
      } catch (e) {
        setDoneCount(c => c + 1);
        return { ok: false, error: e.message };
      }
    }));

    const allNames = new Map(scannedNames);
    outcomes.forEach(o => {
      if (o.ok && Array.isArray(o.extracted)) {
        o.extracted.forEach(e => {
          const name = typeof e === 'string' ? e : (e && e.name);
          if (name && name.trim()) allNames.set(name.trim(), true);
        });
      }
    });
    const failed = outcomes.filter(o => !o.ok);
    if (failed.length) setError(`${failed.length} screenshot${failed.length > 1 ? 's' : ''} failed to scan`);
    setScannedNames(allNames);
    setScanning(false);
  };

  const goToReview = () => { setToAdd(new Set(newPlayers)); setToRemove(new Set()); setPhase('review'); };

  const applyChanges = async () => {
    setApplying(true);
    if (toAdd.size) {
      const rowsIns = [...toAdd].map(name => ({ name, rank: 'Soldier', rank_order: 4, status: 'pending' }));
      await supabase.from('players').insert(rowsIns);
    }
    if (toRemove.size) {
      await supabase.from('players').delete().in('id', [...toRemove]);
      await supabase.from('weekly_totals').delete().in('player_id', [...toRemove]);
    }
    const flaggedIds = missingPlayers.filter(p => !toRemove.has(p.id)).map(p => p.id);
    if (flaggedIds.length) {
      await supabase.from('players').update({ status: 'flagged' }).in('id', flaggedIds);
    }
    setApplying(false);
    onComplete();
  };

  const b = (v = 'default', dis) => ({ borderRadius: 3, padding: '6px 14px', fontSize: 10, fontFamily: 'inherit', letterSpacing: '.08em', cursor: dis ? 'not-allowed' : 'pointer', textTransform: 'uppercase', border: '1px solid', opacity: dis ? 0.5 : 1, ...(v === 'primary' ? { background: '#e8a020', color: '#0d0e10', borderColor: '#e8a020', fontWeight: 700 } : v === 'danger' ? { background: '#2a0a0a', color: '#f87171', borderColor: '#7f1d1d' } : { background: '#24252f', color: '#d4b870', borderColor: '#484858' }) });

  return (
    <div style={{ background: '#1e1f28', border: '1px solid #e8a02040', borderRadius: 6, padding: 20, marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: '#e8a020', marginBottom: 16 }}>👥 Sync Roster</div>

      {phase === 'upload' && <>
        <p style={{ fontSize: 11, color: '#c8a855', lineHeight: 1.6, marginBottom: 14 }}>Upload all clan member screenshots at once. New players are added as Pending and join the tracker when the next week starts.</p>
        <div onClick={() => fileRef.current.click()}
          style={{ border: '2px dashed #484858', borderRadius: 4, padding: 24, textAlign: 'center', cursor: 'pointer', marginBottom: 12 }}>
          <div style={{ color: '#d4b870', fontSize: 11, letterSpacing: '.06em' }}>
            {scanning ? `Scanning ${doneCount} of ${totalFiles}...` : scannedNames.size > 0 ? `${scannedNames.size} names found — drop more or hit Review` : 'Tap to select clan member screenshots'}
          </div>
          {scanning && (
            <div style={{ marginTop: 10, height: 4, background: '#24252f', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${totalFiles ? (doneCount / totalFiles) * 100 : 0}%`, background: '#e8a020', transition: 'width .3s' }} />
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} />
        {error && <div style={{ color: '#ef4444', fontSize: 11, marginBottom: 10 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onComplete} style={b()}>Cancel</button>
          <button onClick={goToReview} disabled={scannedNames.size === 0 || scanning} style={{ ...b('primary', scannedNames.size === 0 || scanning), flex: 1 }}>
            Review Changes ({scannedNames.size} names found)
          </button>
        </div>
      </>}

      {phase === 'review' && <>
        {newPlayers.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: '#22c55e', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>New players ({newPlayers.length}) — added as Pending</div>
            {newPlayers.map(name => (
              <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px', background: '#1a2a1a', borderRadius: 3, marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: '#f5f0e8' }}>{name}</span>
                <button onClick={() => setToAdd(s => { const n = new Set(s); if (n.has(name)) { n.delete(name); } else { n.add(name); } return n; })}
                  style={{ ...b(toAdd.has(name) ? 'primary' : 'default'), padding: '2px 10px', fontSize: 9 }}>
                  {toAdd.has(name) ? 'Add' : 'Skip'}
                </button>
              </div>
            ))}
          </div>
        )}
        {missingPlayers.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: '#ef4444', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>Not seen — may have left ({missingPlayers.length})</div>
            {missingPlayers.map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px', background: '#2a1a1a', borderRadius: 3, marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: '#f5f0e8' }}>{p.name}</span>
                <button onClick={() => setToRemove(s => { const n = new Set(s); if (n.has(p.id)) { n.delete(p.id); } else { n.add(p.id); } return n; })}
                  style={{ ...b(toRemove.has(p.id) ? 'danger' : 'default'), padding: '2px 10px', fontSize: 9 }}>
                  {toRemove.has(p.id) ? 'Remove' : 'Keep'}
                </button>
              </div>
            ))}
          </div>
        )}
        {newPlayers.length === 0 && missingPlayers.length === 0 && (
          <p style={{ fontSize: 12, color: '#22c55e', marginBottom: 16 }}>Roster is up to date — no changes needed.</p>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setPhase('upload')} style={b()}>Back</button>
          <button onClick={applyChanges} disabled={applying} style={{ ...b('primary', applying), flex: 1 }}>
            {applying ? 'Applying...' : `Apply (${toAdd.size} add · ${toRemove.size} remove)`}
          </button>
        </div>
      </>}
    </div>
  );
}

// ── MAIN APP ──
function App() {
  const [players, setPlayers] = useState([]);
  const [submitted, setSubmitted] = useState({});
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('name');
  const [modal, setModal] = useState(null);
  const [editId, setEditId] = useState(null);
  const [editVals, setEditVals] = useState({});
  const [editName, setEditName] = useState('');
  const [newP, setNewP] = useState({ name: '' });
  const [copied, setCopied] = useState(-1);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showScanner, setShowScanner] = useState(false);
  const [showRoster, setShowRoster] = useState(false);
  const [weekStart, setWeekStart] = useState(1);
  const [viewWeekId, setViewWeekId] = useState(null);
  const [activeWeekId, setActiveWeekId] = useState(null);
  const [targets, setTargets] = useState(DEFAULT_TARGETS);
  const [targetsDraft, setTargetsDraft] = useState(DEFAULT_TARGETS);
  const [weekStartDraft, setWeekStartDraft] = useState(1);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [history, setHistory] = useState(null);
  const [reportType, setReportType] = useState('behind');
  const [sixWeekData, setSixWeekData] = useState(null);
  const admin = isAdmin();

  const dayLabels = useMemo(() => dayLabelsFor(weekStart), [weekStart]);
  const week = viewWeekId ? weekLabel(viewWeekId) : '';
  const isBrowsing = viewWeekId && activeWeekId && viewWeekId !== activeWeekId;
  const isOldWeek = !isBrowsing && viewWeekId && viewWeekId !== currentWeekId(weekStart);

  const loadDataRef = useRef(null);
  useEffect(() => {
    init();
    const iv = setInterval(() => { if (loadDataRef.current) loadDataRef.current(); }, 60000);
    return () => clearInterval(iv);
  }, []);

  const readSetting = (data, key, fallback) => {
    const row = (data || []).find(r => r.key === key);
    return row ? row.value : fallback;
  };

  const init = async () => {
    let ws = 1, awid = null, tg = DEFAULT_TARGETS, lu = null;
    try {
      const { data } = await supabase.from('settings').select('*');
      ws = Number(readSetting(data, 'week_start', '1'));
      if (isNaN(ws) || ws < 0 || ws > 6) ws = 1;
      awid = readSetting(data, 'active_week_id', null);
      const tgRaw = readSetting(data, 'targets', null);
      if (tgRaw) { try { tg = { ...DEFAULT_TARGETS, ...JSON.parse(tgRaw) }; } catch (e) {} }
      lu = readSetting(data, 'last_updated', null);
    } catch (e) { /* settings unavailable */ }
    if (!awid) {
      awid = currentWeekId(ws);
      try { await supabase.from('settings').upsert({ key: 'active_week_id', value: awid }, { onConflict: 'key' }); } catch (e) {}
    }
    setWeekStart(ws); setWeekStartDraft(ws);
    setTargets(tg); setTargetsDraft(tg);
    setLastUpdated(lu);
    setActiveWeekId(awid);
    setViewWeekId(awid);
    await loadData(awid, ws);
  };

  const loadData = async (wId, ws) => {
    const id = wId || viewWeekId;
    if (!id) return;
    const labels = dayLabelsFor(ws !== undefined ? ws : weekStart);
    const [pRes, tRes, sRes, setRes] = await Promise.all([
      supabase.from('players').select('*').order('name'),
      supabase.from('weekly_totals').select('*').eq('week_id', id),
      supabase.from('submissions').select('*').eq('week_id', id).maybeSingle(),
      supabase.from('settings').select('*'),
    ]);
    const tm = {};
    (tRes.data || []).forEach(t => { tm[t.player_id] = { Wood: t.wood, Stone: t.stone, Iron: t.iron, Food: t.food, Silver: t.silver }; });
    setPlayers((pRes.data || []).map(p => ({ id: p.id, name: p.name, status: p.status || 'active', totals: tm[p.id] || emptyT() })));
    setSubmitted(sRes.data && sRes.data.data ? sRes.data.data : emptySubs(labels));
    setLastUpdated(readSetting(setRes.data, 'last_updated', null));
    setLoading(false);
  };
  loadDataRef.current = () => loadData();

  const changeWeek = async dir => {
    const next = shiftWeekId(viewWeekId, dir);
    setViewWeekId(next);
    setSixWeekData(null);
    await loadData(next);
  };

  const toggleSubmit = async (day, res) => {
    if (!admin || !viewWeekId) return;
    const next = { ...submitted, [day]: { ...(submitted[day] || {}), [res]: !(submitted[day] && submitted[day][res]) } };
    setSubmitted(next);
    await supabase.from('submissions').upsert({ week_id: viewWeekId, data: next }, { onConflict: 'week_id' });
  };

  const onScanApplied = async resources => {
    const yest = new Date(); yest.setDate(yest.getDate() - 1);
    const label = ALL_DAYS[yest.getDay()];
    if (dayLabels.includes(label)) {
      const next = { ...submitted, [label]: { ...(submitted[label] || {}) } };
      resources.forEach(r => { next[label][r] = true; });
      setSubmitted(next);
      await supabase.from('submissions').upsert({ week_id: viewWeekId, data: next }, { onConflict: 'week_id' });
    }
    await loadData();
  };

  const visible = useMemo(() => players.filter(p => p.status !== 'pending'), [players]);
  const pending = useMemo(() => players.filter(p => p.status === 'pending'), [players]);

  const processed = useMemo(() => visible.map(p => ({
    ...p, statusLabel: getStatus(p.totals, targets),
    total: RES.reduce((sum, r) => sum + (p.totals[r] || 0), 0),
  })), [visible, targets]);

  const filtered = useMemo(() => {
    let list = filter === 'All' ? [...processed] : processed.filter(p => p.statusLabel === filter);
    if (search.trim()) {
      const q = norm(search);
      list = list.filter(p => norm(p.name).includes(q));
    }
    if (sort === 'most') return list.sort((a, b) => b.total - a.total);
    if (sort === 'least') return list.sort((a, b) => a.total - b.total);
    return list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [processed, filter, sort, search]);

  const summary = useMemo(() => { const c = { Done: 0, 'On Track': 0, Slow: 0, Behind: 0 }; processed.forEach(p => c[p.statusLabel]++); return c; }, [processed]);

  const closeModal = () => { setModal(null); setEditId(null); setHistory(null); };
  const openEdit = p => { setEditVals({ ...p.totals }); setEditId(p.id); setEditName(p.name); setModal('edit'); };

  const openHistory = async p => {
    setModal('history');
    setHistory({ player: p, weeks: null });
    const ids = Array.from({ length: 6 }, (_, i) => shiftWeekId(viewWeekId, -i));
    const { data } = await supabase.from('weekly_totals').select('*').eq('player_id', p.id).in('week_id', ids);
    const map = new Map((data || []).map(r => [r.week_id, r]));
    const weeks = ids.map(id => {
      const r = map.get(id);
      return { weekId: id, totals: r ? { Wood: r.wood, Stone: r.stone, Iron: r.iron, Food: r.food, Silver: r.silver } : emptyT() };
    });
    setHistory({ player: p, weeks });
  };

  const saveEdit = async () => {
    setSaving(true);
    const t = Object.fromEntries(RES.map(r => [r, Number(editVals[r]) || 0]));
    await Promise.all([
      supabase.from('players').update({ name: editName.trim() }).eq('id', editId),
      supabase.from('weekly_totals').upsert({ player_id: editId, week_id: viewWeekId, wood: t.Wood, stone: t.Stone, iron: t.Iron, food: t.Food, silver: t.Silver }, { onConflict: 'player_id,week_id' }),
    ]);
    await loadData(); setSaving(false); closeModal();
  };

  const addPlayer = async () => {
    if (!newP.name.trim()) return;
    setSaving(true);
    await supabase.from('players').insert({ name: newP.name.trim(), rank: 'Soldier', rank_order: 4, status: 'pending' });
    setNewP({ name: '' });
    await loadData(); setSaving(false); closeModal();
  };

  const removePlayer = async id => {
    if (!window.confirm('Remove this player?')) return;
    await Promise.all([
      supabase.from('players').delete().eq('id', id),
      supabase.from('weekly_totals').delete().eq('player_id', id),
    ]);
    await loadData();
  };

  const keepPlayer = async id => {
    await supabase.from('players').update({ status: 'active' }).eq('id', id);
    await loadData();
  };

  const startNewWeek = async () => {
    setSaving(true);
    const newId = currentWeekId(weekStart);
    try {
      await supabase.from('settings').upsert({ key: 'active_week_id', value: newId }, { onConflict: 'key' });
      if (pending.length) await supabase.from('players').update({ status: 'active' }).in('id', pending.map(p => p.id));
    } catch (e) {}
    setActiveWeekId(newId);
    setViewWeekId(newId);
    setSixWeekData(null);
    await loadData(newId);
    setSaving(false); closeModal();
  };

  const resetThisWeek = async () => {
    setSaving(true);
    await Promise.all([
      supabase.from('weekly_totals').delete().eq('week_id', viewWeekId),
      supabase.from('submissions').delete().eq('week_id', viewWeekId),
    ]);
    await loadData();
    setSaving(false); closeModal();
  };

  const saveSettings = async () => {
    setSaving(true);
    const tg = Object.fromEntries(RES.map(r => [r, Number(targetsDraft[r]) || DEFAULT_TARGETS[r]]));
    try {
      await Promise.all([
        supabase.from('settings').upsert({ key: 'targets', value: JSON.stringify(tg) }, { onConflict: 'key' }),
        supabase.from('settings').upsert({ key: 'week_start', value: String(weekStartDraft) }, { onConflict: 'key' }),
      ]);
    } catch (e) {}
    setTargets(tg);
    setWeekStart(weekStartDraft);
    setSaving(false); closeModal();
    await loadData(viewWeekId, weekStartDraft);
  };

  const loadSixWeek = async () => {
    const ids = Array.from({ length: 6 }, (_, i) => shiftWeekId(viewWeekId, -i));
    const { data } = await supabase.from('weekly_totals').select('*').in('week_id', ids);
    const byPlayer = new Map();
    (data || []).forEach(r => {
      const cur = byPlayer.get(r.player_id) || emptyT();
      cur.Wood += r.wood || 0; cur.Stone += r.stone || 0; cur.Iron += r.iron || 0; cur.Food += r.food || 0; cur.Silver += r.silver || 0;
      byPlayer.set(r.player_id, cur);
    });
    setSixWeekData({ ids, byPlayer });
  };

  useEffect(() => { if (modal === 'report' && reportType === 'sixweek' && !sixWeekData) loadSixWeek(); }, [modal, reportType]);

  const reportText = useMemo(() => {
    if (reportType === 'behind') {
      const lines = [`BEHIND BY RSS - ${week}`];
      RES.forEach(r => {
        const short = processed.filter(p => (p.totals[r] || 0) < (targets[r] || 0)).map(p => p.name).sort((a, b) => a.localeCompare(b));
        lines.push(`${r} (${short.length}): ${short.length ? short.join(', ') : 'none'}`);
      });
      return lines.join('\n');
    }
    if (reportType === 'top10') {
      const top = [...processed].sort((a, b) => b.total - a.total).slice(0, 10);
      return [`TOP 10 CONTRIBUTORS - ${week}`, ...top.map((p, i) => `${i + 1}. ${p.name} ${fmt(p.total)}`)].join('\n');
    }
    if (reportType === 'zero') {
      const zero = processed.filter(p => p.total === 0).map(p => p.name).sort((a, b) => a.localeCompare(b));
      return [`NO RSS SENT - ${week}`, `${zero.length} players:`, zero.join(', ') || 'none'].join('\n');
    }
    if (reportType === 'sixweek') {
      if (!sixWeekData) return 'Loading 6-week data...';
      const rows = visible.map(p => ({ name: p.name, tot: RES.reduce((s, r) => s + ((sixWeekData.byPlayer.get(p.id) || {})[r] || 0), 0) }))
        .sort((a, b) => b.tot - a.tot);
      return [`6-WEEK TOTALS (to ${week})`, ...rows.map(r => `${r.name} ${fmt(r.tot)}`)].join('\n');
    }
    return '';
  }, [reportType, processed, week, targets, sixWeekData, visible]);

  const reportParts = useMemo(() => splitReport(reportText), [reportText]);

  const copyPart = (text, i) => {
    navigator.clipboard.writeText(text);
    setCopied(i);
    setTimeout(() => setCopied(-1), 2000);
  };

  const exportWeekCSV = () => {
    const rowsCsv = [['Player', ...RES, 'Total']];
    [...processed].sort((a, b) => a.name.localeCompare(b.name)).forEach(p => rowsCsv.push([p.name, ...RES.map(r => p.totals[r] || 0), p.total]));
    downloadCSV(`rss-week-${viewWeekId}.csv`, rowsCsv);
  };

  const exportSixWeekCSV = async () => {
    const ids = Array.from({ length: 6 }, (_, i) => shiftWeekId(viewWeekId, -i)).reverse();
    const { data } = await supabase.from('weekly_totals').select('*').in('week_id', ids);
    const byKey = new Map();
    (data || []).forEach(r => byKey.set(r.player_id + '|' + r.week_id, r));
    const rowsCsv = [['Player', 'Resource', ...ids.map(weekLabel)]];
    [...visible].sort((a, b) => a.name.localeCompare(b.name)).forEach(p => {
      RES.forEach(r => {
        rowsCsv.push([p.name, r, ...ids.map(id => { const row = byKey.get(p.id + '|' + id); return row ? row[r.toLowerCase()] || 0 : 0; })]);
      });
    });
    downloadCSV(`rss-6week-${viewWeekId}.csv`, rowsCsv);
  };

  const todayLabel = ALL_DAYS[new Date().getDay()];
  const todayPos = dayLabels.indexOf(todayLabel);
  const editPlayer = players.find(p => p.id === editId);

  const btn = (v = 'default', dis) => ({ borderRadius: 3, padding: '5px 12px', fontSize: 10, fontFamily: 'inherit', letterSpacing: '.08em', cursor: dis ? 'not-allowed' : 'pointer', textTransform: 'uppercase', border: '1px solid', opacity: dis ? 0.5 : 1, ...(v === 'active' ? { background: '#e8a020', color: '#0d0e10', borderColor: '#e8a020' } : v === 'primary' ? { background: '#e8a020', color: '#0d0e10', borderColor: '#e8a020', fontWeight: 700 } : v === 'danger' ? { background: '#2a0a0a', color: '#f87171', borderColor: '#7f1d1d' } : { background: '#24252f', color: '#d4b870', borderColor: '#484858' }) });
  const inp = col => ({ width: '100%', background: '#1a1b22', border: '1px solid #484858', borderRadius: 3, padding: '7px 9px', color: col || '#f5f0e8', fontFamily: 'inherit', fontSize: 12, boxSizing: 'border-box' });

  if (loading) return <div style={{ minHeight: '100vh', background: '#1a1b22', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e8a020', fontFamily: 'Courier New', letterSpacing: '.1em', fontSize: 13 }}>LOADING...</div>;

  return (
    <div style={{ minHeight: '100vh', background: '#1a1b22', color: '#f5f0e8', fontFamily: "'Courier New',monospace", fontSize: 13, paddingBottom: 40 }}>

      <div style={{ background: 'linear-gradient(180deg,#1a1200,#1a1b22)', borderBottom: '1px solid #e8a02028', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: '#e8a020' }}>⚔ RSS Tracker {admin && <span style={{ fontSize: 10, color: '#ef4444' }}>ADMIN</span>}</div>
          <div style={{ fontSize: 9, color: '#c8a850', letterSpacing: '.1em', marginTop: 2 }}>{admin ? 'TOTAL BATTLE · CLAN COMMAND' : 'TSS · THE SILVER SWORDS'}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {lastUpdated && <div style={{ fontSize: 9, color: '#c8a850' }}>UPDATED {new Date(lastUpdated).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase()}</div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={() => changeWeek(-1)} style={{ ...btn(), padding: '3px 8px' }}>‹</button>
            <div style={{ background: '#1a1200', border: '1px solid #e8a02050', borderRadius: 4, padding: '3px 10px', fontSize: 10, color: '#e8a020' }}>{week}</div>
            <button onClick={() => changeWeek(1)} style={{ ...btn(), padding: '3px 8px' }}>›</button>
          </div>
        </div>
      </div>

      {isBrowsing && (
        <div style={{ background: '#101a24', borderBottom: '1px solid #2a4a6a', padding: '8px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: '#60a5fa' }}>Browsing {week}. Active week is {weekLabel(activeWeekId)}.</span>
          <button onClick={async () => { setViewWeekId(activeWeekId); await loadData(activeWeekId); }} style={btn()}>Back to Active Week</button>
        </div>
      )}

      {isOldWeek && (
        <div style={{ background: '#1a1200', borderBottom: '1px solid #e8a02040', padding: '8px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: '#e8a020' }}>Viewing last week ({week}). Data is kept until you start a new week.</span>
          {admin && <button onClick={() => setModal('newweek')} style={btn('primary')}>Start New Week</button>}
        </div>
      )}

      <div style={{ background: '#1e1f28', borderBottom: '1px solid #2a2b36', padding: '10px 18px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '80px repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
          <div style={{ fontSize: 9, color: '#c8a850', letterSpacing: '.08em', textTransform: 'uppercase', alignSelf: 'center' }}>Resource</div>
          {dayLabels.map((d, i) => (
            <div key={d} style={{ textAlign: 'center', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: i === todayPos && !isBrowsing ? '#e8a020' : '#484858', fontWeight: i === todayPos && !isBrowsing ? 700 : 400 }}>
              {d}{i === todayPos && !isBrowsing && <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#e8a020', margin: '2px auto 0' }} />}
            </div>
          ))}
        </div>
        {RES.map(r => (
          <div key={r} style={{ display: 'grid', gridTemplateColumns: '80px repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
            <div style={{ fontSize: 10, color: RES_COL[r], alignSelf: 'center', display: 'flex', alignItems: 'center', gap: 4 }}>{RES_ICON[r]} {r}</div>
            {dayLabels.map(d => {
              const done = (submitted[d] && submitted[d][r]) || false;
              return (
                <div key={d} onClick={() => toggleSubmit(d, r)}
                  style={{ height: 22, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, cursor: admin ? 'pointer' : 'default', background: done ? RES_COL[r] + '30' : '#24252f', border: `1px solid ${done ? RES_COL[r] + '80' : '#2a2b36'}` }}>
                  {done ? '✓' : '·'}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '8px 18px', background: '#22232c', borderBottom: '1px solid #2a2b36', flexWrap: 'wrap', alignItems: 'center' }}>
        {Object.entries(summary).map(([s, n]) => (
          <div key={s} onClick={() => setFilter(filter === s ? 'All' : s)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: STAT_COL[s] + '18', border: `1px solid ${STAT_COL[s]}${filter === s ? 'ff' : '40'}`, borderRadius: 3, padding: '3px 9px', fontSize: 10, color: STAT_COL[s], cursor: 'pointer' }}>
            <strong>{n}</strong> {s.toUpperCase()}
          </div>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 9, color: '#c8a850' }}>{visible.length} PLAYERS{pending.length ? ` · ${pending.length} PENDING` : ''}</span>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 18px', flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid #24252f' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search player..." style={{ background: '#1a1b22', border: '1px solid #484858', borderRadius: 3, padding: '5px 10px', color: '#f5f0e8', fontFamily: 'inherit', fontSize: 11, width: 140 }} />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={() => setSort(s => s === 'name' ? 'most' : s === 'most' ? 'least' : 'name')} style={btn()}>Sort: {sort === 'name' ? 'A-Z' : sort === 'most' ? 'Most' : 'Least'}</button>
          {admin && <button onClick={() => { setShowScanner(s => !s); setShowRoster(false); }} style={btn(showScanner ? 'active' : 'default')}>📷 Scan</button>}
          {admin && <button onClick={() => { setShowRoster(s => !s); setShowScanner(false); }} style={btn(showRoster ? 'active' : 'default')}>👥 Roster</button>}
          {admin && <button onClick={() => setModal('add')} style={btn()}>+ Player</button>}
          {admin && <button onClick={() => setModal('report')} style={btn()}>Reports</button>}
          {admin && <button onClick={() => { setTargetsDraft(targets); setWeekStartDraft(weekStart); setModal('settings'); }} style={btn()}>⚙ Settings</button>}
          {admin && <button onClick={() => setModal('newweek')} style={btn('danger')}>New Week</button>}
        </div>
      </div>

      {admin && (showScanner || showRoster) && (
        <div style={{ padding: '12px 18px 0' }}>
          {showScanner && <Scanner players={visible} weekId={viewWeekId} onApplied={onScanApplied} onComplete={() => loadData()} />}
          {showRoster && <RosterSync players={players} onComplete={() => { setShowRoster(false); loadData(); }} />}
        </div>
      )}

      {admin && pending.length > 0 && (
        <div style={{ margin: '10px 18px 0', background: '#1a1f28', border: '1px solid #2a4a6a', borderRadius: 6, padding: '10px 14px' }}>
          <div style={{ fontSize: 10, color: '#60a5fa', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>Pending — join the tracker when a new week starts</div>
          {pending.map(p => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #20212a' }}>
              <span style={{ fontSize: 12, color: '#f5f0e8' }}>{p.name}</span>
              <div style={{ display: 'flex', gap: 10 }}>
                <span onClick={() => keepPlayer(p.id)} style={{ fontSize: 9, color: '#60a5fa', cursor: 'pointer', letterSpacing: '.06em', textTransform: 'uppercase' }}>Activate Now</span>
                <span onClick={() => removePlayer(p.id)} style={{ fontSize: 9, color: '#884444', cursor: 'pointer' }}>✕</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ overflowX: 'auto', padding: '0 18px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #2a2b36' }}>
              <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: '#c8a850', fontWeight: 400 }}>Player</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: '#c8a850', fontWeight: 400, width: 82 }}>Status</th>
              {RES.map(r => <th key={r} style={{ textAlign: 'right', padding: '6px 8px', fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', color: '#c8a850', fontWeight: 400, width: 76 }}>{RES_ICON[r]} {r}</th>)}
              {admin && <th style={{ width: 58 }} />}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={admin ? 8 : 7} style={{ textAlign: 'center', padding: 30, color: '#6b7280', fontSize: 11 }}>No players match</td></tr>
            )}
            {filtered.map((p, i) => {
              const isFlagged = p.status === 'flagged';
              return (
              <tr key={p.id} style={{ background: isFlagged ? '#2a0d0d' : i % 2 === 0 ? '#1a1b22' : '#22232c', borderBottom: '1px solid #20212a', borderLeft: isFlagged ? '3px solid #ef4444' : 'none' }}>
                <td style={{ padding: '7px 8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {admin && <span onClick={() => openEdit(p)} style={{ fontSize: 9, color: isFlagged ? '#f87171' : '#c8a855', cursor: 'pointer', letterSpacing: '.06em', textTransform: 'uppercase', flexShrink: 0 }}>Edit</span>}
                    <span onClick={() => openHistory(p)} style={{ fontSize: 12, color: isFlagged ? '#f87171' : '#f5f0e8', fontWeight: isFlagged ? 700 : 400, cursor: 'pointer', textDecoration: 'underline', textDecorationColor: '#33384a', textUnderlineOffset: 3 }}>
                      {p.name}
                    </span>
                    {isFlagged && <span style={{ fontSize: 9, color: '#f87171', background: '#ef444420', border: '1px solid #ef444440', borderRadius: 2, padding: '1px 5px' }}>NOT IN ROSTER</span>}
                  </div>
                </td>
                <td style={{ padding: '7px 8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: STAT_COL[p.statusLabel], flexShrink: 0 }} />
                    <span style={{ fontSize: 9, color: STAT_COL[p.statusLabel], letterSpacing: '.06em', textTransform: 'uppercase' }}>{p.statusLabel}</span>
                  </div>
                </td>
                {RES.map(r => <td key={r} style={{ textAlign: 'right', padding: '7px 8px', fontVariantNumeric: 'tabular-nums', color: resCol(p.totals[r] || 0, targets[r]), fontWeight: (p.totals[r] || 0) >= targets[r] ? 600 : 400, fontSize: 12 }}>{fmt(p.totals[r] || 0)}</td>)}
                {admin && (
                  <td style={{ padding: '7px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {isFlagged ? <>
                      <span onClick={() => keepPlayer(p.id)} style={{ fontSize: 9, color: '#c8a855', cursor: 'pointer', marginRight: 8, letterSpacing: '.06em', textTransform: 'uppercase' }}>Keep</span>
                      <span onClick={() => removePlayer(p.id)} style={{ fontSize: 9, color: '#ef4444', cursor: 'pointer', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>Remove</span>
                    </> : <span onClick={() => removePlayer(p.id)} style={{ fontSize: 9, color: '#884444', cursor: 'pointer' }}>✕</span>}
                  </td>
                )}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modal && (
        <div onClick={closeModal} style={{ position: 'fixed', inset: 0, background: '#000d', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#1e1f28', border: `1px solid ${modal === 'newweek' || modal === 'resetweek' ? '#991b1b' : '#e8a02040'}`, borderRadius: 6, padding: 26, width: 'min(420px,94vw)', maxHeight: '90vh', overflowY: 'auto' }}>

            {modal === 'add' && <>
              <div style={{ fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', color: '#e8a020', marginBottom: 16, fontWeight: 700 }}>Add Player</div>
              <div style={{ fontSize: 9, color: '#c8a855', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>Name</div>
              <input autoFocus style={inp()} value={newP.name} onChange={e => setNewP({ name: e.target.value })} onKeyDown={e => e.key === 'Enter' && addPlayer()} placeholder="Player name..." />
              <p style={{ fontSize: 10, color: '#c8a850', marginTop: 8 }}>Added as Pending — joins the tracker when the next week starts, or use Activate Now.</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
                <button onClick={closeModal} style={btn()}>Cancel</button>
                <button onClick={addPlayer} disabled={saving} style={btn('primary')}>{saving ? 'Adding...' : 'Add'}</button>
              </div>
            </>}

            {modal === 'edit' && editPlayer && <>
              <div style={{ fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', color: '#e8a020', marginBottom: 16, fontWeight: 700 }}>Edit Player</div>
              <div style={{ fontSize: 9, color: '#c8a855', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>Name</div>
              <input style={inp()} value={editName} onChange={e => setEditName(e.target.value)} />
              <div style={{ fontSize: 9, color: '#c8a850', letterSpacing: '.06em', marginTop: 14, marginBottom: 10 }}>WEEKLY TOTALS — {week}</div>
              {RES.map(r => (
                <div key={r} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 9, color: '#c8a855', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>{RES_ICON[r]} {r}</div>
                  <input type="number" style={inp(resCol(Number(editVals[r]) || 0, targets[r]))} value={editVals[r] ?? 0} onChange={e => setEditVals(v => ({ ...v, [r]: e.target.value }))} />
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
                <button onClick={closeModal} style={btn()}>Cancel</button>
                <button onClick={saveEdit} disabled={saving} style={btn('primary')}>{saving ? 'Saving...' : 'Save'}</button>
              </div>
            </>}

            {modal === 'history' && history && <>
              <div style={{ fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', color: '#e8a020', marginBottom: 4, fontWeight: 700 }}>{history.player.name}</div>
              <div style={{ fontSize: 9, color: '#c8a850', letterSpacing: '.06em', marginBottom: 14 }}>LAST 6 WEEKS</div>
              {!history.weeks && <div style={{ fontSize: 11, color: '#c8a855', padding: 20, textAlign: 'center' }}>Loading...</div>}
              {history.weeks && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #2a2b36' }}>
                        <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 9, color: '#c8a850', fontWeight: 400 }}>Week</th>
                        {RES.map(r => <th key={r} style={{ textAlign: 'right', padding: '4px 6px', fontSize: 11 }}>{RES_ICON[r]}</th>)}
                        <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 9, color: '#c8a850', fontWeight: 400 }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.weeks.map(w => {
                        const tot = RES.reduce((s, r) => s + (w.totals[r] || 0), 0);
                        return (
                          <tr key={w.weekId} style={{ borderBottom: '1px solid #20212a' }}>
                            <td style={{ padding: '5px 6px', color: '#c8a855', fontSize: 10 }}>{weekLabel(w.weekId)}</td>
                            {RES.map(r => <td key={r} style={{ textAlign: 'right', padding: '5px 6px', color: resCol(w.totals[r] || 0, targets[r]), fontVariantNumeric: 'tabular-nums' }}>{fmt(w.totals[r] || 0)}</td>)}
                            <td style={{ textAlign: 'right', padding: '5px 6px', color: '#f5f0e8', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt(tot)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                <button onClick={closeModal} style={btn()}>Close</button>
              </div>
            </>}

            {modal === 'report' && <>
              <div style={{ fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', color: '#e8a020', marginBottom: 12, fontWeight: 700 }}>Reports</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                {[['behind','Behind by RSS'],['top10','Top 10'],['zero','No RSS Sent'],['sixweek','6-Week Totals']].map(([t,l]) => (
                  <button key={t} onClick={() => setReportType(t)} style={{ ...btn(reportType === t ? 'active' : 'default'), fontSize: 9, padding: '4px 10px' }}>{l}</button>
                ))}
              </div>
              {reportParts.map((part, i) => (
                <div key={i} style={{ marginBottom: 12 }}>
                  <pre style={{ background: '#1a1b22', border: '1px solid #484858', borderRadius: 3, padding: 12, fontSize: 10, lineHeight: 1.7, color: '#d4b878', whiteSpace: 'pre-wrap', overflowY: 'auto', maxHeight: 220, fontFamily: 'inherit', marginBottom: 6 }}>{part}</pre>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 9, color: '#6b7280' }}>{part.length} chars</span>
                    <button onClick={() => copyPart(part, i)} style={btn('primary')}>{copied === i ? 'Copied!' : reportParts.length > 1 ? `Copy Part ${i + 1}` : 'Copy'}</button>
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid #2a2b36', paddingTop: 12, flexWrap: 'wrap' }}>
                <button onClick={exportWeekCSV} style={btn()}>CSV: This Week</button>
                <button onClick={exportSixWeekCSV} style={btn()}>CSV: 6 Weeks</button>
                <button onClick={closeModal} style={btn()}>Close</button>
              </div>
            </>}

            {modal === 'settings' && <>
              <div style={{ fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', color: '#e8a020', marginBottom: 16, fontWeight: 700 }}>Settings</div>
              <div style={{ fontSize: 9, color: '#c8a855', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>Week starts on</div>
              <select style={inp()} value={weekStartDraft} onChange={e => setWeekStartDraft(Number(e.target.value))}>
                {ALL_DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
              <div style={{ fontSize: 9, color: '#c8a850', letterSpacing: '.06em', marginTop: 14, marginBottom: 10 }}>WEEKLY TARGET PER RESOURCE</div>
              {RES.map(r => (
                <div key={r} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 9, color: '#c8a855', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>{RES_ICON[r]} {r}</div>
                  <input type="number" style={inp(RES_COL[r])} value={targetsDraft[r]} onChange={e => setTargetsDraft(v => ({ ...v, [r]: e.target.value }))} />
                </div>
              ))}
              <div style={{ borderTop: '1px solid #2a2b36', marginTop: 14, paddingTop: 12 }}>
                <button onClick={() => setModal('resetweek')} style={btn('danger')}>Reset This Week's Data</button>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
                <button onClick={closeModal} style={btn()}>Cancel</button>
                <button onClick={saveSettings} disabled={saving} style={btn('primary')}>{saving ? 'Saving...' : 'Save'}</button>
              </div>
            </>}

            {modal === 'newweek' && <>
              <div style={{ fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', color: '#ef4444', marginBottom: 14, fontWeight: 700 }}>Start New Week?</div>
              <p style={{ fontSize: 12, color: '#d4b878', lineHeight: 1.6, marginBottom: 8 }}>The tracker switches to {weekLabel(currentWeekId(weekStart))}. Previous data stays safe and can be browsed with the week arrows.</p>
              {pending.length > 0 && <p style={{ fontSize: 11, color: '#60a5fa', marginBottom: 8 }}>{pending.length} pending player{pending.length > 1 ? 's' : ''} will be activated.</p>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
                <button onClick={closeModal} style={btn()}>Cancel</button>
                <button onClick={startNewWeek} disabled={saving} style={btn('danger')}>{saving ? 'Starting...' : 'Start New Week'}</button>
              </div>
            </>}

            {modal === 'resetweek' && <>
              <div style={{ fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', color: '#ef4444', marginBottom: 14, fontWeight: 700 }}>Reset This Week's Data?</div>
              <p style={{ fontSize: 12, color: '#d4b878', lineHeight: 1.6, marginBottom: 18 }}>Deletes ALL RSS totals and submission ticks for {week}. This cannot be undone.</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setModal('settings')} style={btn()}>Cancel</button>
                <button onClick={resetThisWeek} disabled={saving} style={btn('danger')}>{saving ? 'Resetting...' : 'Delete Week Data'}</button>
              </div>
            </>}
          </div>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

                                                            
