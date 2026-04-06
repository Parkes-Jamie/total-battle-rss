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

const fmt = v => v === 0 ? '—' : v >= 1000000 ? (v / 1000000).toFixed(2) + 'M' : (v / 1000).toFixed(1) + 'k';
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
  const [scanning, setScanning] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const [results, setResults] = useState([]); // [{resource, players: [{name, total, playerId}]}]
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState(null);
  const [undoData, setUndoData] = useState(null); // snapshot before last apply
  const [undoing, setUndoing] = useState(false);
  const [lastMsg, setLastMsg] = useState(null);
  const fileRef = useRef();

  const compressFile = file => new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const maxDim = 1200;
      let w = img.width, h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
        else { w = Math.round(w * maxDim / h); h = maxDim; }
      }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      res({ base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' });
    };
    img.src = URL.createObjectURL(file);
  });

  const scanFiles = async files => {
    const arr = Array.from(files);
    setTotalFiles(arr.length); setScanCount(0); setError(null); setScanning(true); setResults([]);
    const allResults = [];
    for (const file of arr) {
      try {
        const imageData = await compressFile(file);
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514', max_tokens: 2000,
            system: 'You extract data from Total Battle game screenshots showing resource contributions. Identify the resource type from the icon/label in the screenshot (Wood/Stone/Iron/Food/Silver). Extract ALL player names and amounts. Sum duplicates. Return ONLY JSON, no markdown.',
            messages: [{ role: 'user', content: [
              { type: 'image', source: { type: 'base64', media_type: imageData.mediaType, data: imageData.base64 } },
              { type: 'text', text: 'Identify the resource type shown (Wood, Stone, Iron, Food, or Silver) and extract all player names and their total amounts. Return: {"resource":"Wood","players":[{"name":"PlayerName","amount":123456}]}' }
            ]}]
          })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        const parsed = JSON.parse(data.content?.[0]?.text?.replace(/```json|```/g, '').trim());
        const resource = parsed.resource;
        if (!RES.includes(resource)) throw new Error(`Could not identify resource type in screenshot`);
        const matched = [];
        (parsed.players || []).forEach(({ name, amount }) => {
          const player = players.find(p => p.name.toLowerCase() === name.toLowerCase());
          if (player) {
            const ex = matched.find(m => m.playerId === player.id);
            if (ex) ex.total += Number(amount);
            else matched.push({ name: player.name, total: Number(amount), playerId: player.id });
          }
        });
        allResults.push({ resource, players: matched, file: file.name });
        setScanCount(c => c + 1);
      } catch (e) { setError('Error on ' + file.name + ': ' + e.message); }
    }
    setResults(allResults);
    setScanning(false);
  };

  const applyAll = async () => {
    if (!results.length) return;
    setApplying(true);
    // Snapshot current state for undo
    const snapshot = {};
    for (const r of results) {
      for (const p of r.players) {
        if (!snapshot[p.playerId]) {
          const { data: ex } = await supabase.from('weekly_totals').select('*').eq('player_id', p.playerId).eq('week_id', weekId).maybeSingle();
          snapshot[p.playerId] = ex || null;
        }
      }
    }
    setUndoData(snapshot);
    // Apply
    let totalUpdated = 0;
    for (const r of results) {
      const resource = r.resource.toLowerCase();
      for (const p of r.players) {
        const { data: ex } = await supabase.from('weekly_totals').select('*').eq('player_id', p.playerId).eq('week_id', weekId).maybeSingle();
        const cur = ex ? ex[resource] || 0 : 0;
        await supabase.from('weekly_totals').upsert({
          player_id: p.playerId, week_id: weekId,
          wood:   resource === 'wood'   ? cur + p.total : (ex?.wood   || 0),
          stone:  resource === 'stone'  ? cur + p.total : (ex?.stone  || 0),
          iron:   resource === 'iron'   ? cur + p.total : (ex?.iron   || 0),
          food:   resource === 'food'   ? cur + p.total : (ex?.food   || 0),
          silver: resource === 'silver' ? cur + p.total : (ex?.silver || 0),
        }, { onConflict: 'player_id,week_id' });
        totalUpdated++;
      }
    }
    const resources = [...new Set(results.map(r => r.resource))].join(', ');
    setLastMsg(`✓ Applied ${results.length} screenshot${results.length > 1 ? 's' : ''} — ${resources} — ${totalUpdated} player updates`);
    setResults([]);
    setApplying(false);
    onComplete();
  };

  const undo = async () => {
    if (!undoData) return;
    setUndoing(true);
    for (const [playerId, prev] of Object.entries(undoData)) {
      if (prev) {
        await supabase.from('weekly_totals').upsert({
          player_id: playerId, week_id: weekId,
          wood: prev.wood || 0, stone: prev.stone || 0, iron: prev.iron || 0, food: prev.food || 0, silver: prev.silver || 0,
        }, { onConflict: 'player_id,week_id' });
      } else {
        await supabase.from('weekly_totals').delete().eq('player_id', playerId).eq('week_id', weekId);
      }
    }
    setUndoData(null);
    setLastMsg('↩ Undo applied — data restored to previous state');
    setUndoing(false);
    onComplete();
  };

  const b = (v = 'default', dis) => ({ borderRadius: 3, padding: '6px 14px', fontSize: 10, fontFamily: 'inherit', letterSpacing: '.08em', cursor: dis ? 'not-allowed' : 'pointer', textTransform: 'uppercase', border: '1px solid', opacity: dis ? 0.5 : 1, ...(v === 'primary' ? { background: '#e8a020', color: '#0d0e10', borderColor: '#e8a020', fontWeight: 700 } : v === 'danger' ? { background: '#2a0a0a', color: '#f87171', borderColor: '#7f1d1d' } : v === 'undo' ? { background: '#1a1a2a', color: '#a78bfa', borderColor: '#4c4880' } : { background: '#24252f', color: '#d4b870', borderColor: '#484858' }) });

  return (
    <div style={{ background: '#1e1f28', border: '1px solid #e8a02040', borderRadius: 6, padding: 20, marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: '#e8a020', marginBottom: 8 }}>📷 Scan RSS Screenshots</div>
      <div style={{ fontSize: 11, color: '#c8a855', marginBottom: 14, lineHeight: 1.5 }}>Upload all your RSS screenshots at once — resource type is detected automatically from each screenshot.</div>

      {lastMsg && (
        <div style={{ fontSize: 11, color: lastMsg.startsWith('✓') ? '#22c55e' : '#a78bfa', background: '#1a1b22', border: '1px solid #484858', borderRadius: 3, padding: '8px 12px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{lastMsg}</span>
          {undoData && <button onClick={undo} disabled={undoing} style={{ ...b('undo', undoing), padding: '3px 10px', fontSize: 9 }}>{undoing ? 'Undoing...' : '↩ Undo'}</button>}
        </div>
      )}

      <div onClick={() => fileRef.current.click()}
        onDrop={e => { e.preventDefault(); scanFiles(e.dataTransfer.files); }}
        onDragOver={e => e.preventDefault()}
        style={{ border: '2px dashed #484858', borderRadius: 4, padding: 24, textAlign: 'center', cursor: 'pointer', marginBottom: 12 }}>
        <div style={{ color: '#d4b870', fontSize: 11, letterSpacing: '.06em' }}>
          {scanning ? `Scanning ${scanCount} of ${totalFiles}...` : 'Tap to select all RSS screenshots'}
        </div>
        {scanning && <div style={{ marginTop: 6, fontSize: 9, color: '#6b7280' }}>Detecting resource types automatically...</div>}
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => { scanFiles(e.target.files); e.target.value = ''; }} />

      {error && <div style={{ color: '#ef4444', fontSize: 11, padding: 10, background: '#2a0a0a', borderRadius: 3, border: '1px solid #7f1d1d', marginBottom: 12 }}>{error}</div>}

      {results.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: '#c8a855', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>{results.length} screenshots ready to apply</div>
          {results.map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 10px', background: i % 2 === 0 ? '#1e1f28' : '#24252f', borderRadius: 3, marginBottom: 2, fontSize: 11 }}>
              <span style={{ color: RES_COL[r.resource] }}>{RES_ICON[r.resource]} {r.resource}</span>
              <span style={{ color: '#c8a855' }}>{r.players.length} players</span>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={() => setResults([])} style={b()}>Clear</button>
            <button onClick={applyAll} disabled={applying} style={{ ...b('primary', applying), flex: 1 }}>
              {applying ? 'Applying...' : `Apply All ${results.length} Screenshots`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RosterSync({ players, onComplete }) {
  const [phase, setPhase] = useState('upload');
  const [scannedNames, setScannedNames] = useState(new Map());
  const [scanning, setScanning] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const [error, setError] = useState(null);
  const [applying, setApplying] = useState(false);
  const [toRemove, setToRemove] = useState(new Set());
  const [toAdd, setToAdd] = useState(new Set());
  const fileRef = useRef();

  const newPlayers = [...scannedNames.keys()].filter(n => !players.find(p => p.name.toLowerCase() === n.toLowerCase()));
  const missingPlayers = players.filter(p => ![...scannedNames.keys()].find(n => n.toLowerCase() === p.name.toLowerCase()));

  const handleFiles = async files => {
    const arr = Array.from(files);
    setTotalFiles(arr.length); setScanCount(0); setError(null); setScanning(true);
    const allNames = new Map(scannedNames);
    for (const file of arr) {
      try {
        const imageData = await new Promise(res => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const maxDim = 1200;
            let w = img.width, h = img.height;
            if (w > maxDim || h > maxDim) {
              if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
              else { w = Math.round(w * maxDim / h); h = maxDim; }
            }
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            res({ base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' });
          };
          img.src = URL.createObjectURL(file);
        });
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514', max_tokens: 1000,
            system: 'You are reading a Total Battle clan member list. Extract player names and their might/power numbers. Return a JSON array: [{"name":"PlayerName","might":12345678}]. No markdown.',
            messages: [{ role: 'user', content: [
              { type: 'image', source: { type: 'base64', media_type: imageData.mediaType, data: imageData.base64 } },
              { type: 'text', text: 'Extract all player names and their might/power numbers from this clan member list. Ignore rank labels and status text. Return JSON array of {name, might} objects.' }
            ]}]
          })
        });
        const data = await resp.json();
        if (data.error) throw new Error(data.error.message);
        const extracted = JSON.parse(data.content?.[0]?.text?.replace(/```json|```/g, '').trim());
        if (Array.isArray(extracted)) extracted.forEach(e => {
          const name = typeof e === 'string' ? e : e.name;
          const might = typeof e === 'object' ? (e.might || 0) : 0;
          if (name && name.trim()) allNames.set(name.trim(), might);
        });
        setScanCount(c => c + 1);
      } catch (e) { setError('Error scanning a screenshot: ' + e.message); }
    }
    setScannedNames(allNames);
    setScanning(false);
  };

  const goToReview = () => {
    setToAdd(new Set(newPlayers));
    setToRemove(new Set());
    setPhase('review');
  };

  const applyChanges = async () => {
    setApplying(true);
    for (const name of toAdd) {
      const might = scannedNames.get(name) || 0;
      await supabase.from('players').insert({ name, rank: 'Soldier', rank_order: 4, might });
    }
    for (const id of toRemove) {
      await supabase.from('players').delete().eq('id', id);
    }
    // Update might for all existing players found in scan
    for (const p of players) {
      const found = [...scannedNames.keys()].find(n => n.toLowerCase() === p.name.toLowerCase());
      if (found) {
        const might = scannedNames.get(found) || 0;
        if (might > 0) await supabase.from('players').update({ might }).eq('id', p.id);
      }
    }
    // Pass back IDs of players not seen (minus those being removed)
    const flagged = new Set(missingPlayers.filter(p => !toRemove.has(p.id)).map(p => p.id));
    setApplying(false);
    onComplete(flagged);
  };

  const b = (v = 'default', dis) => ({ borderRadius: 3, padding: '6px 14px', fontSize: 10, fontFamily: 'inherit', letterSpacing: '.08em', cursor: dis ? 'not-allowed' : 'pointer', textTransform: 'uppercase', border: '1px solid', opacity: dis ? 0.5 : 1, ...(v === 'primary' ? { background: '#e8a020', color: '#0d0e10', borderColor: '#e8a020', fontWeight: 700 } : v === 'danger' ? { background: '#2a0a0a', color: '#f87171', borderColor: '#7f1d1d' } : { background: '#24252f', color: '#d4b870', borderColor: '#484858' }) });

  return (
    <div style={{ background: '#1e1f28', border: '1px solid #e8a02040', borderRadius: 6, padding: 20, marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: '#e8a020', marginBottom: 16 }}>👥 Sync Roster</div>

      {phase === 'upload' && <>
        <p style={{ fontSize: 11, color: '#c8a855', lineHeight: 1.6, marginBottom: 14 }}>Upload all your clan member screenshots. Claude will scan them and show you who is new and who is missing.</p>
        <div onClick={() => fileRef.current.click()}
          style={{ border: '2px dashed #484858', borderRadius: 4, padding: 24, textAlign: 'center', cursor: 'pointer', marginBottom: 12 }}>
          <div style={{ color: '#d4b870', fontSize: 11, letterSpacing: '.06em' }}>
            {scanning ? `Scanning ${scanCount} of ${totalFiles}...` : scannedNames.size > 0 ? `${scannedNames.size} names found — drop more or click Review` : 'Tap to select clan member screenshots'}
          </div>
          {scanning && <div style={{ marginTop: 8, fontSize: 9, color: '#6b7280' }}>This may take a minute for multiple screenshots</div>}
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
            <div style={{ fontSize: 10, color: '#22c55e', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>New players ({newPlayers.length})</div>
            {newPlayers.map(name => (
              <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px', background: '#1a2a1a', borderRadius: 3, marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: '#f5f0e8' }}>{name}</span>
                <button onClick={() => setToAdd(s => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n; })}
                  style={{ ...b(toAdd.has(name) ? 'primary' : 'default'), padding: '2px 10px', fontSize: 9 }}>
                  {toAdd.has(name) ? '✓ Add' : 'Skip'}
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
                <span style={{ fontSize: 12, color: '#f5f0e8' }}>{p.name} <span style={{ fontSize: 9, color: '#6b7280' }}>{p.rank}</span></span>
                <button onClick={() => setToRemove(s => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })}
                  style={{ ...b(toRemove.has(p.id) ? 'danger' : 'default'), padding: '2px 10px', fontSize: 9 }}>
                  {toRemove.has(p.id) ? '✕ Remove' : 'Keep'}
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

function App() {
  const [players, setPlayers] = useState([]);
  const [submitted, setSubmitted] = useState(emptyS());
  const [filter, setFilter] = useState('All');
  const [sort, setSort] = useState('rank');
  const [modal, setModal] = useState(null);
  const [editId, setEditId] = useState(null);
  const [editVals, setEditVals] = useState({});
  const [editName, setEditName] = useState('');
  const [editRank, setEditRank] = useState('Soldier');
  const [newP, setNewP] = useState({ name: '', rank: 'Soldier' });
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showScanner, setShowScanner] = useState(false);
  const [showRoster, setShowRoster] = useState(false);
  const [flaggedIds, setFlaggedIds] = useState(new Set());
  const admin = isAdmin();
  const week = useMemo(getWeekLabel, []);
  const weekId = useMemo(getWeekId, []);
  const today = useMemo(todayIdx, []);

  useEffect(() => { loadData(); const iv = setInterval(loadData, 60000); return () => clearInterval(iv); }, []);

  const loadData = async () => {
    const { data: pd } = await supabase.from('players').select('*').order('rank_order').order('might', { ascending: false }).order('name');
    const { data: td } = await supabase.from('weekly_totals').select('*').eq('week_id', weekId);
    const { data: sd } = await supabase.from('submissions').select('*').eq('week_id', weekId).maybeSingle();
    const tm = {};
    (td || []).forEach(t => { tm[t.player_id] = { Wood: t.wood, Stone: t.stone, Iron: t.iron, Food: t.food, Silver: t.silver }; });
    setPlayers((pd || []).map(p => ({ id: p.id, name: p.name, rank: p.rank, might: p.might || 0, totals: tm[p.id] || emptyT() })));
    if (sd?.data) setSubmitted(sd.data);
    setLoading(false);
  };

  const toggleSubmit = async (day, res) => {
    if (!admin) return;
    const next = { ...submitted, [day]: { ...submitted[day], [res]: !submitted[day]?.[res] } };
    setSubmitted(next);
    await supabase.from('submissions').upsert({ week_id: weekId, data: next }, { onConflict: 'week_id' });
  };

  const processed = useMemo(() => players.map(p => ({
    ...p, status: getStatus(p.totals),
    worst: Math.min(...RES.map(r => p.totals[r] || 0)),
    total: RES.reduce((sum, r) => sum + (p.totals[r] || 0), 0),
  })), [players]);

  const filtered = useMemo(() => {
    let list = filter === 'All' ? [...processed] : processed.filter(p => p.status === filter);
    if (sort === 'rank') return list.sort((a, b) => rankIdx(a.rank) - rankIdx(b.rank) || (b.might || 0) - (a.might || 0) || a.name.localeCompare(b.name));
    if (sort === 'most') return list.sort((a, b) => b.total - a.total);
    if (sort === 'least') return list.sort((a, b) => a.total - b.total);
    return list.sort((a, b) => a.worst - b.worst);
  }, [processed, filter, sort]);

  const summary = useMemo(() => { const c = { Done: 0, 'On Track': 0, Slow: 0, Behind: 0 }; processed.forEach(p => c[p.status]++); return c; }, [processed]);

  const closeModal = () => { setModal(null); setEditId(null); };
  const openEdit = p => { setEditVals({ ...p.totals }); setEditId(p.id); setEditName(p.name); setEditRank(p.rank); setModal('edit'); };

  const saveEdit = async () => {
    setSaving(true);
    const t = Object.fromEntries(RES.map(r => [r, Number(editVals[r]) || 0]));
    await supabase.from('players').update({ name: editName.trim(), rank: editRank, rank_order: rankIdx(editRank) }).eq('id', editId);
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
    if (!window.confirm('Reset week? This cannot be undone.')) return;
    setSaving(true);
    await supabase.from('weekly_totals').delete().eq('week_id', weekId);
    await supabase.from('submissions').delete().eq('week_id', weekId);
    setSubmitted(emptyS()); await loadData(); setSaving(false); closeModal();
  };

  const [reportType, setReportType] = useState('full');

  const report = useMemo(() => {
    const totalFor = p => RES.reduce((s, r) => s + (p.totals[r] || 0), 0);
    if (reportType === 'zero') {
      const zero = processed.filter(p => totalFor(p) === 0).sort((a, b) => rankIdx(a.rank) - rankIdx(b.rank));
      return [`ZERO CONTRIBUTORS — ${week}`, `${zero.length} players have sent nothing this week.`, '', ...zero.map(p => `${p.name} (${p.rank})`)].join('\n');
    }
    if (reportType === 'under') {
      const under = processed.filter(p => totalFor(p) > 0 && p.status !== 'Done').sort((a, b) => rankIdx(a.rank) - rankIdx(b.rank));
      return [`UNDER TARGET — ${week}`, `${under.length} players contributing but not hitting targets.`, '', ...under.map(p => {
        const shorts = RES.filter(r => (p.totals[r] || 0) < TARGET).map(r => `${r}: ${((TARGET - (p.totals[r] || 0)) / 1000).toFixed(1)}k short`);
        return `${p.name} (${p.rank}): ${shorts.join(', ')}`;
      })].join('\n');
    }
    if (reportType === 'top5') {
      const top = [...processed].sort((a, b) => totalFor(b) - totalFor(a)).slice(0, 5);
      return [`TOP 5 CONTRIBUTORS — ${week}`, '', ...top.map((p, i) => `${i + 1}. ${p.name} (${p.rank}) — ${(totalFor(p) / 1000000).toFixed(2)}M total`)].join('\n');
    }
    const done = processed.filter(p => p.status === 'Done').map(p => p.name);
    const out = processed.filter(p => p.status !== 'Done').sort((a, b) => rankIdx(a.rank) - rankIdx(b.rank)).map(p => {
      const s = RES.filter(r => (p.totals[r] || 0) < TARGET).map(r => `${r}: ${((TARGET - (p.totals[r] || 0)) / 1000).toFixed(1)}k short`);
      return `${p.name} (${p.rank}): ${s.join(', ')}`;
    });
    return [`WEEKLY RSS REPORT — ${week}`, '', `COMPLETED (${done.length}):`, done.length ? done.join(', ') : 'None', '', `OUTSTANDING (${out.length}):`, ...out].join('\n');
  }, [processed, week, reportType]);

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
          <div style={{ fontSize: 9, color: '#c8a850', letterSpacing: '.1em', marginTop: 2 }}>{admin ? 'TOTAL BATTLE · CLAN COMMAND' : 'TSS · THE SILVER SWORDS'}</div>
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
          <button onClick={() => setSort(s => s === 'rank' ? 'most' : s === 'most' ? 'least' : 'rank')} style={btn()}>Sort: {sort === 'rank' ? 'Rank' : sort === 'most' ? 'Most' : 'Least'}</button>
          {admin && <button onClick={() => { setShowScanner(s => !s); setShowRoster(false); }} style={btn(showScanner ? 'active' : 'default')}>📷 Scan</button>}
          {admin && <button onClick={() => { setShowRoster(s => !s); setShowScanner(false); }} style={btn(showRoster ? 'active' : 'default')}>👥 Roster</button>}
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

      {admin && showRoster && (
        <div style={{ padding: '12px 18px 0' }}>
          <RosterSync players={players} onComplete={(flagged) => { setShowRoster(false); if (flagged) setFlaggedIds(flagged); loadData(); }} />
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
            {filtered.map((p, i) => {
              const isNew = p.rank === 'Soldier' && p.totals && Object.values(p.totals).every(v => v === 0);
              const isFlagged = flaggedIds.has(p.id);
              return (
              <tr key={p.id} style={{ background: isFlagged ? '#2a0d0d' : isNew ? '#2a1a00' : i % 2 === 0 ? '#1a1b22' : '#22232c', borderBottom: '1px solid #20212a', borderLeft: isFlagged ? '3px solid #ef4444' : isNew ? '3px solid #e8a020' : 'none' }}>
                <td style={{ padding: '5px 0 5px 8px' }}><div style={{ width: 3, height: 30, borderRadius: 2, background: RANK_COL[p.rank], opacity: .85 }} /></td>
                <td style={{ padding: '5px 8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {admin && <span onClick={() => openEdit(p)} style={{ fontSize: 9, color: isFlagged ? '#f87171' : isNew ? '#e8a020' : '#c8a855', cursor: 'pointer', letterSpacing: '.06em', textTransform: 'uppercase', flexShrink: 0 }} onMouseOver={e => e.target.style.color = '#e8a020'} onMouseOut={e => e.target.style.color = isFlagged ? '#f87171' : isNew ? '#e8a020' : '#c8a855'}>Edit</span>}
                    <div>
                      <div style={{ fontSize: 12, color: isFlagged ? '#f87171' : isNew ? '#e8a020' : '#f5f0e8', fontWeight: isFlagged ? 700 : 400 }}>
                        {p.name}
                        {isFlagged && <span style={{ fontSize: 9, color: '#f87171', background: '#ef444420', border: '1px solid #ef444440', borderRadius: 2, padding: '1px 5px', marginLeft: 6 }}>NOT IN ROSTER</span>}
                        {isNew && !isFlagged && <span style={{ fontSize: 9, color: '#e8a020', background: '#e8a02020', border: '1px solid #e8a02040', borderRadius: 2, padding: '1px 5px', marginLeft: 4 }}>NEW</span>}
                      </div>
                      <div style={{ fontSize: 9, color: RANK_COL[p.rank], letterSpacing: '.08em', textTransform: 'uppercase', marginTop: 1 }}>{p.rank}</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '5px 8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: STAT_COL[getStatus(p.totals)], flexShrink: 0 }} />
                    <span style={{ fontSize: 9, color: STAT_COL[getStatus(p.totals)], letterSpacing: '.06em', textTransform: 'uppercase' }}>{getStatus(p.totals)}</span>
                  </div>
                </td>
                {RES.map(r => <td key={r} style={{ textAlign: 'right', padding: '5px 8px', fontVariantNumeric: 'tabular-nums', color: resCol(p.totals[r] || 0), fontWeight: (p.totals[r] || 0) >= TARGET ? 600 : 400, fontSize: 12 }}>{fmt(p.totals[r] || 0)}</td>)}
                {admin && (
                  <td style={{ padding: '5px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {isFlagged && <>
                      <span onClick={() => setFlaggedIds(s => { const n = new Set(s); n.delete(p.id); return n; })} style={{ fontSize: 9, color: '#c8a855', cursor: 'pointer', marginRight: 8, letterSpacing: '.06em', textTransform: 'uppercase' }}>Keep</span>
                      <span onClick={() => removePlayer(p.id)} style={{ fontSize: 9, color: '#ef4444', cursor: 'pointer', fontWeight: 700, marginRight: 8, letterSpacing: '.06em', textTransform: 'uppercase' }}>Remove</span>
                    </>}
                    {!isFlagged && <span onClick={() => removePlayer(p.id)} style={{ fontSize: 9, color: '#884444', cursor: 'pointer' }} onMouseOver={e => e.target.style.color = '#ef4444'} onMouseOut={e => e.target.style.color = '#884444'}>✕</span>}
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
              <div style={{ fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', color: '#e8a020', marginBottom: 16, fontWeight: 700 }}>Edit Player</div>
              <div style={{ fontSize: 9, color: '#c8a855', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>Name</div>
              <input style={inp()} value={editName} onChange={e => setEditName(e.target.value)} placeholder="Player name..." />
              <div style={{ fontSize: 9, color: '#c8a855', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4, marginTop: 10 }}>Rank</div>
              <select style={inp()} value={editRank} onChange={e => setEditRank(e.target.value)}>
                {RANKS.map(r => <option key={r}>{r}</option>)}
              </select>
              <div style={{ fontSize: 9, color: '#c8a850', letterSpacing: '.06em', marginTop: 14, marginBottom: 10 }}>WEEKLY TOTALS</div>
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
              <div style={{ fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', color: '#e8a020', marginBottom: 12, fontWeight: 700 }}>Reports</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                {[['full','Full Report'],['zero','Zero Contrib'],['under','Under Target'],['top5','Top 5']].map(([t,l]) => (
                  <button key={t} onClick={() => setReportType(t)} style={{ ...btn(reportType === t ? 'active' : 'default'), fontSize: 9, padding: '4px 10px' }}>{l}</button>
                ))}
              </div>
              <pre style={{ background: '#1a1b22', border: '1px solid #484858', borderRadius: 3, padding: 12, fontSize: 10, lineHeight: 1.8, color: '#d4b878', whiteSpace: 'pre-wrap', overflowY: 'auto', maxHeight: 300, fontFamily: 'inherit', marginBottom: 14 }}>{report}</pre>
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
