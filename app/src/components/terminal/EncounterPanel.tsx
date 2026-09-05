"use client";

/**
 * EncounterPanel — the ENCOUNTER tab (Unit 1 of the reality simulation).
 *
 * GM surface for one round through the engine: build the encounter from the
 * campaign's characters, set the scene, declare intentions for anyone (the
 * GM's override — a player's own declarations come in Unit 2 UI), run the
 * round, read the slot-by-slot record. Walking version of the encounter card
 * (Mike: "think Roll20 … a card on the canvas"); it lives in the terminal
 * until the canvas card exists.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';

type Pillar = 'body' | 'spirit' | 'soul';
type Kind = 'attack' | 'skill' | 'move' | 'negate' | 'block' | 'reserve' | 'hold';

interface Participant {
  id: string; name: string; side: string; control: 'player' | 'gm' | 'branch';
  pools: Record<Pillar, number>; gauges: { celerity: number; frequency: number; wisdom: number };
  skills: Array<{ name: string; level: number; governors: string[] }>;
  heldItemName: string | null; heldResist: number; downed: boolean;
}
interface LogEntry { slot: number; kind: string; actorId: string | null; targetId: string | null; text: string }
interface RoundResult { round: number; log: LogEntry[]; downed: string[] }
interface Encounter {
  id: string; name: string; status: string; round: number;
  state: {
    participants: Participant[];
    intentions: Array<{ id: string; participantId: string; pillar: Pillar; kind: Kind; description: string }>;
    sceneNarration: string | null;
    rounds: RoundResult[];
    lastPlan: Record<string, { source: string; note?: string }>;
  };
}
interface IntentionDraft {
  pillar: Pillar; kind: Kind; description: string; skillName?: string; targetId?: string;
  damageType?: 'bashing' | 'slashing' | 'piercing'; baseDamage?: number; redirectTo?: string;
}

const KINDS: Kind[] = ['attack', 'skill', 'move', 'negate', 'block', 'reserve', 'hold'];
const PILLARS: Pillar[] = ['body', 'spirit', 'soul'];
const mono = { fontFamily: 'var(--font-terminal), Consolas, monospace' } as const;
const btn = (active = false): React.CSSProperties => ({
  ...mono, fontSize: 12, padding: '3px 8px', cursor: 'pointer', borderRadius: 2,
  color: active ? '#0a0a1a' : 'var(--terminal-prime)',
  backgroundColor: active ? 'var(--terminal-prime)' : 'transparent',
  border: '1px solid rgba(34,171,148,0.5)',
});
const field: React.CSSProperties = { ...mono, fontSize: 12, background: '#0a0a1a', color: '#CBD9E8', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 2, padding: '2px 4px' };

const KIND_COLOR: Record<string, string> = {
  order: '#888', check: '#CBD9E8', damage: '#f7525f', downed: '#f7525f', negate: '#582a72',
  redirect: '#22ab94', block: '#22ab94', skip: '#666', action: '#aaa', note: '#aaa',
};

export default function EncounterPanel({
  campaignId,
  campaignCharacters,
  onEvent,
}: {
  campaignId: string;
  campaignCharacters: Array<{ id: string; name: string }>;
  onEvent?: () => void;
}) {
  const [list, setList] = useState<Array<{ id: string; name: string; status: string; round: number }>>([]);
  const [enc, setEnc] = useState<Encounter | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // create form
  const [name, setName] = useState('');
  const [scene, setScene] = useState('');
  const [sides, setSides] = useState<Record<string, string>>({}); // characterId → side ('' = not in)

  // intention editor
  const [who, setWho] = useState<string>('');
  const [drafts, setDrafts] = useState<IntentionDraft[]>([]);

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const res = await fetch(`/api/campaigns/${campaignId}/encounters${path}`, { headers: { 'Content-Type': 'application/json' }, ...init });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || json.message || `HTTP ${res.status}`);
    return json;
  }, [campaignId]);

  const refreshList = useCallback(async () => {
    try {
      const j = await api('');
      setList(j.encounters ?? []);
      const live = (j.encounters ?? []).find((e: { status: string }) => e.status === 'ACTIVE' || e.status === 'PAUSED') ?? (j.encounters ?? [])[0];
      if (live) {
        const d = await api(`/${live.id}`);
        setEnc(d.encounter);
      } else {
        setEnc(null);
      }
    } catch (e) { setError((e as Error).message); }
  }, [api]);

  useEffect(() => { refreshList(); }, [refreshList]);

  const load = useCallback(async (id: string) => {
    try { const d = await api(`/${id}`); setEnc(d.encounter); setError(null); } catch (e) { setError((e as Error).message); }
  }, [api]);

  const run = useCallback(async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label); setError(null);
    try { await fn(); onEvent?.(); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }, [onEvent]);

  const selected = useMemo(() => enc?.state.participants.find(p => p.id === who) ?? null, [enc, who]);
  const draftCounts = useMemo(() => {
    const c: Record<Pillar, number> = { body: 0, spirit: 0, soul: 0 };
    for (const d of drafts) c[d.pillar]++;
    return c;
  }, [drafts]);

  // ── Create ────────────────────────────────────────────────────────────
  if (!enc) {
    const chosen = Object.entries(sides).filter(([, s]) => s);
    return (
      <div className="flex-1 overflow-y-auto p-3 space-y-3" style={mono}>
        <div style={{ color: 'var(--terminal-prime)', fontSize: 13 }}>NEW ENCOUNTER — six seconds at a time</div>
        {list.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {list.map(e => (
              <button key={e.id} style={btn()} onClick={() => load(e.id)}>{e.name} · {e.status} · r{e.round}</button>
            ))}
          </div>
        )}
        <input style={{ ...field, width: '100%' }} placeholder="Encounter name" value={name} onChange={e => setName(e.target.value)} />
        <textarea style={{ ...field, width: '100%', minHeight: 60 }} placeholder="Scene setup (what the GM narrates — everyone perceives this through their own senses)" value={scene} onChange={e => setScene(e.target.value)} />
        <div className="space-y-1">
          {campaignCharacters.map(c => (
            <div key={c.id} className="flex items-center gap-2">
              <span style={{ color: '#CBD9E8', fontSize: 12, minWidth: 140 }}>{c.name}</span>
              {['', 'party', 'hostile', 'other'].map(s => (
                <button key={s || 'out'} style={btn((sides[c.id] ?? '') === s)} onClick={() => setSides(prev => ({ ...prev, [c.id]: s }))}>{s || 'out'}</button>
              ))}
            </div>
          ))}
        </div>
        <button
          style={btn(true)}
          disabled={!name || chosen.length === 0 || !!busy}
          onClick={() => run('create', async () => {
            const j = await api('', { method: 'POST', body: JSON.stringify({ name, sceneNarration: scene || undefined, participants: chosen.map(([characterId, side]) => ({ characterId, side })) }) });
            const created: Encounter = j.encounter;
            const a = await api(`/${created.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'ACTIVE' }) });
            setEnc(a.encounter);
            await refreshList();
          })}
        >
          {busy === 'create' ? 'Creating…' : 'Create + go ACTIVE'}
        </button>
        {error && <div style={{ color: '#f7525f', fontSize: 12 }}>{error}</div>}
      </div>
    );
  }

  // ── Active ────────────────────────────────────────────────────────────
  const last = enc.state.rounds.at(-1) ?? null;
  const pName = (id: string | null) => enc.state.participants.find(p => p.id === id)?.name ?? id ?? '';
  const declaredFor = (id: string) => enc.state.intentions.filter(i => i.participantId === id).length;

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3" style={mono}>
      <div className="flex items-center gap-2 flex-wrap">
        <span style={{ color: 'var(--terminal-prime)', fontSize: 13 }}>{enc.name}</span>
        <span style={{ color: '#888', fontSize: 12 }}>{enc.status} · round {enc.round} done</span>
        <button style={btn()} onClick={() => load(enc.id)}>refresh</button>
        {enc.status !== 'ACTIVE' && <button style={btn()} onClick={() => run('status', async () => setEnc((await api(`/${enc.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'ACTIVE' }) })).encounter))}>activate</button>}
        {enc.status === 'ACTIVE' && <button style={btn()} onClick={() => run('status', async () => setEnc((await api(`/${enc.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'PAUSED' }) })).encounter))}>pause</button>}
        <button style={btn()} onClick={() => run('status', async () => { await api(`/${enc.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'RESOLVED' }) }); setEnc(null); await refreshList(); })}>resolve</button>
        <button style={btn()} onClick={() => setEnc(null)}>new</button>
      </div>

      {/* Participants */}
      <div className="space-y-1">
        {enc.state.participants.map(p => (
          <div key={p.id} className="flex items-center gap-2 flex-wrap" style={{ fontSize: 12, color: p.downed ? '#666' : '#CBD9E8' }}>
            <button style={btn(who === p.id)} onClick={() => { setWho(p.id); setDrafts([]); }}>{p.name}</button>
            <span style={{ color: p.side === 'hostile' ? '#f7525f' : '#22ab94' }}>{p.side}</span>
            <span style={{ color: '#888' }}>{p.control}</span>
            <span>B{p.pools.body} S{p.pools.spirit} So{p.pools.soul}</span>
            <span style={{ color: '#888' }}>cel {p.gauges.celerity} · frq {p.gauges.frequency} · wis {p.gauges.wisdom}</span>
            {p.heldItemName && <span style={{ color: '#888' }}>holds {p.heldItemName} (r{p.heldResist})</span>}
            {p.downed && <span style={{ color: '#f7525f' }}>DOWN</span>}
            {declaredFor(p.id) > 0 && <span style={{ color: '#D0A030' }}>declared {declaredFor(p.id)}</span>}
            {enc.state.lastPlan[p.id] && <span style={{ color: '#666' }}>last: {enc.state.lastPlan[p.id].source}{enc.state.lastPlan[p.id].note ? ` — ${enc.state.lastPlan[p.id].note}` : ''}</span>}
          </div>
        ))}
      </div>

      {/* Intention editor (GM override for anyone) */}
      {selected && !selected.downed && enc.status === 'ACTIVE' && (
        <div className="space-y-1" style={{ border: '1px solid rgba(34,171,148,0.3)', padding: 6 }}>
          <div style={{ color: 'var(--terminal-prime)', fontSize: 12 }}>
            Declare for {selected.name} — B {draftCounts.body}/{selected.pools.body} · S {draftCounts.spirit}/{selected.pools.spirit} · So {draftCounts.soul}/{selected.pools.soul}
          </div>
          {drafts.map((d, i) => (
            <div key={i} className="flex items-center gap-1 flex-wrap">
              <select style={field} value={d.pillar} onChange={e => setDrafts(ds => ds.map((x, j) => j === i ? { ...x, pillar: e.target.value as Pillar } : x))}>
                {PILLARS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select style={field} value={d.kind} onChange={e => setDrafts(ds => ds.map((x, j) => j === i ? { ...x, kind: e.target.value as Kind } : x))}>
                {KINDS.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
              <input style={{ ...field, width: 180 }} placeholder="what they do" value={d.description} onChange={e => setDrafts(ds => ds.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
              <select style={field} value={d.skillName ?? ''} onChange={e => setDrafts(ds => ds.map((x, j) => j === i ? { ...x, skillName: e.target.value || undefined } : x))}>
                <option value="">unskilled</option>
                {selected.skills.map(s => <option key={s.name} value={s.name}>{s.name} ({s.level}; {s.governors.join('/')})</option>)}
              </select>
              <select style={field} value={d.targetId ?? ''} onChange={e => setDrafts(ds => ds.map((x, j) => j === i ? { ...x, targetId: e.target.value || undefined } : x))}>
                <option value="">no target</option>
                {enc.state.participants.filter(p => p.id !== selected.id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {d.kind === 'attack' && (<>
                <select style={field} value={d.damageType ?? 'bashing'} onChange={e => setDrafts(ds => ds.map((x, j) => j === i ? { ...x, damageType: e.target.value as IntentionDraft['damageType'] } : x))}>
                  {['bashing', 'slashing', 'piercing'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input style={{ ...field, width: 44 }} type="number" min={1} max={20} value={d.baseDamage ?? 2} onChange={e => setDrafts(ds => ds.map((x, j) => j === i ? { ...x, baseDamage: Number(e.target.value) } : x))} />
              </>)}
              <button style={btn()} onClick={() => setDrafts(ds => ds.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <div className="flex gap-1 flex-wrap">
            <button style={btn()} onClick={() => setDrafts(ds => [...ds, { pillar: 'body', kind: 'attack', description: '', damageType: 'bashing', baseDamage: 2, redirectTo: selected.heldResist > 0 ? 'held' : undefined }])}>+ action</button>
            <button
              style={btn(true)}
              disabled={!!busy || drafts.length === 0 || drafts.some(d => !d.description)}
              onClick={() => run('declare', async () => {
                const j = await api(`/${enc.id}/intentions`, { method: 'POST', body: JSON.stringify({ participantId: selected.id, intentions: drafts }) });
                setEnc(j.encounter); setDrafts([]);
              })}
            >
              {busy === 'declare' ? 'Declaring…' : 'Declare'}
            </button>
            <span style={{ color: '#666', fontSize: 11 }}>Undeclared participants plan their own round (their branch). Declaring overrides the ACT step.</span>
          </div>
        </div>
      )}

      {/* Run */}
      {enc.status === 'ACTIVE' && (
        <button style={btn(true)} disabled={!!busy} onClick={() => run('round', async () => { const j = await api(`/${enc.id}/round`, { method: 'POST' }); setEnc(j.encounter); })}>
          {busy === 'round' ? 'Six seconds passing…' : `Run round ${enc.round + 1}`}
        </button>
      )}
      {error && <div style={{ color: '#f7525f', fontSize: 12 }}>{error}</div>}

      {/* Record */}
      {last && (
        <div className="space-y-0.5" style={{ fontSize: 12 }}>
          <div style={{ color: 'var(--terminal-prime)' }}>Round {last.round} — the record</div>
          {last.log.map((l, i) => (
            <div key={i} style={{ color: KIND_COLOR[l.kind] ?? '#CBD9E8', paddingLeft: l.kind === 'order' ? 0 : 12 }}>
              {l.kind === 'order' ? l.text : `[${l.kind}] ${l.text}`}
            </div>
          ))}
          {last.downed.length > 0 && <div style={{ color: '#f7525f' }}>Down: {last.downed.map(pName).join(', ')}</div>}
        </div>
      )}
      {enc.state.rounds.length > 1 && (
        <div style={{ color: '#666', fontSize: 11 }}>{enc.state.rounds.length} rounds recorded — earlier rounds are in the terminal feed.</div>
      )}
    </div>
  );
}
