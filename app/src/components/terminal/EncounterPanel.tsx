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

interface FullParticipant {
  id: string; name: string; side: string; control: 'player' | 'gm' | 'branch';
  pools: Record<Pillar, number>; gauges: { celerity: number; frequency: number; wisdom: number };
  skills: Array<{ name: string; level: number; governors: string[] }>;
  attrs?: Record<string, { current: number; max: number }>;
  fateDie?: string;
  heldItemName: string | null; heldResist: number; heldCondition?: number; downed: boolean;
  perceived?: undefined;
}
/** Another being as a Trailblazer's character knows it (PERCEPTION_FEED): only known aspect values. */
interface SeenParticipant {
  id: string; name: string; side: string; control: 'player' | 'gm' | 'branch'; downed: boolean;
  perceived: true; known: Array<{ aspect: string; label: string; value: string }>;
}
type Participant = FullParticipant | SeenParticipant;
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
  damageType?: 'bashing' | 'slashing' | 'piercing'; baseDamage?: number; redirectTo?: string; effort?: number; dr?: number;
}

const KINDS: Kind[] = ['attack', 'skill', 'move', 'negate', 'block', 'reserve', 'hold'];
const PILLARS: Pillar[] = ['body', 'spirit', 'soul'];
// Look (2026-10-08): the book's combat voice (p 131) — ONE black-void block per
// encounter, inside it Consolas on black, the record's kinds as pillar bars
// (damage/down = Body red, negate = Spirit purple, block/redirect = Terminal
// teal), sides and pools as the book's pillar tags (p 21), Bebas buttons
// outlined in paper, the one forward move (Run round) in KRMA gold. Phone:
// ≥ 12 px text, 16 px fields, 36 px targets. Behaviour unchanged.
const btnCls = (active = false) => (active ? 'ep-b on' : 'ep-b');
/** Fields stay 16 px below md so iOS never zooms the page on focus. */
const fieldCls = 'ep-f text-[16px] md:text-[13px]';

const KIND_CLS: Record<string, string> = {
  check: 'k-check', damage: 'k-body', downed: 'k-body', negate: 'k-spirit',
  redirect: 'k-teal', block: 'k-teal', skip: 'k-dim', action: 'k-dim', note: 'k-dim',
};

const ENCOUNTER_CSS = `
.ep{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;background:#000;color:#f5f4ef;padding:10px 12px 14px;font:400 13px/1.5 var(--font-terminal),Consolas,monospace}
.ep *{box-sizing:border-box}
.ep>*+*{margin-top:12px}
.ep>*{max-width:760px}
.ep-hd{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px}
.ep-title{font:700 14px/1.4 var(--font-terminal),Consolas,monospace;color:#f5f4ef}
.ep-state{font:400 15px/1 var(--font-bebas-neue),'Bebas Neue',sans-serif;letter-spacing:.05em;padding:3px 6px 1px;background:#ffcc78;color:#000}
.ep-state.off{background:#393937;color:#f5f4ef}
.ep-round{font:700 13px/1.4 var(--font-terminal),Consolas,monospace;color:#f5f4ef}
.ep-row{display:flex;flex-wrap:wrap;gap:6px}
.ep-b{font:400 17px/1 var(--font-bebas-neue),'Bebas Neue',sans-serif;letter-spacing:.06em;min-height:36px;padding:3px 10px 0;border:0;cursor:pointer;white-space:nowrap;background:none;color:#f5f4ef;box-shadow:inset 0 0 0 1.5px #8d97a5}
.ep-b.on{background:#f5f4ef;color:#000;box-shadow:none}
.ep-b:disabled{opacity:.45;cursor:default}
.ep-b:focus-visible,.ep-go:focus-visible{outline:3px solid #ffcc78;outline-offset:2px}
.ep-go{display:block;width:100%;min-height:44px;border:0;cursor:pointer;font:400 22px/1 var(--font-bebas-neue),'Bebas Neue',sans-serif;letter-spacing:.06em;padding:4px 12px 0;background:#ffcc78;color:#000}
.ep-go:disabled{opacity:.5;cursor:default}
.ep-sec{font:700 13px/1.4 var(--font-terminal),Consolas,monospace;color:#8d97a5;letter-spacing:.04em;text-transform:uppercase}
.ep-who{border-top:1px solid #393937}
.ep-p{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 8px;align-items:center;padding:8px 0;border-bottom:1px solid #393937}
.ep-p.down{opacity:.55}
.ep-name{min-height:36px;padding:2px 8px;border:0;background:#222;color:#f5f4ef;font:700 14px/1.3 var(--font-terminal),Consolas,monospace;text-align:left;cursor:pointer;overflow-wrap:anywhere;justify-self:start;max-width:100%}
.ep-name.on{background:#f5f4ef;color:#000}
.ep-name:focus-visible{outline:3px solid #ffcc78;outline-offset:2px}
.ep-tags{display:flex;flex-wrap:wrap;gap:4px;grid-column:1/-1;align-items:center}
.ep-t{font:700 12px/1 var(--font-terminal),Consolas,monospace;padding:4px 5px;white-space:nowrap}
.t-hostile,.t-body{background:#f7525f;color:#000}
.t-party{background:#22ab94;color:#000}
.t-other,.t-ctl{background:#393937;color:#f5f4ef}
.t-spirit{background:#582a72;color:#f5f4ef}
.t-soul{background:#002f6c;color:#f5f4ef}
.t-freq{background:#ffcc78;color:#000}
.t-freq.zero{background:#f7525f}
.t-down{background:#f7525f;color:#000;font-family:var(--font-bebas-neue),'Bebas Neue',sans-serif;font-size:15px;font-weight:400;letter-spacing:.06em;padding:3px 6px 1px}
.ep-sub{grid-column:1/-1;font:400 12px/1.5 var(--font-terminal),Consolas,monospace;color:#8d97a5;overflow-wrap:anywhere}
.ep-sub b{color:#ffcc78;font-weight:700}
.ep-ed{border-left:4px solid #ffcc78;padding:2px 0 2px 10px}
.ep-ed>*+*{margin-top:8px}
.ep-d{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding-bottom:8px;border-bottom:1px solid #393937}
.ep-f{min-height:36px;background:#222;color:#f5f4ef;border:0;border-bottom:2px solid #8d97a5;padding:2px 6px;font-family:var(--font-terminal),Consolas,monospace;outline:0;border-radius:0}
.ep-f:focus{border-bottom-color:#ffcc78}
.ep-f::placeholder{color:#8d97a5}
.ep-f.wide{width:100%}
.ep-f.desc{flex:1 1 160px;min-width:0}
.ep-f.num{width:56px}
.ep-lb{display:inline-flex;align-items:center;gap:4px;font:400 12px var(--font-terminal),Consolas,monospace;color:#8d97a5}
.ep-hint{font:400 12px/1.5 var(--font-terminal),Consolas,monospace;color:#8d97a5}
.ep-err{font:700 13px/1.5 var(--font-terminal),Consolas,monospace}
.ep-err span{background:#f7525f;color:#000;padding:1px 5px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.ep-cast{display:grid;grid-template-columns:minmax(0,1fr);gap:4px}
.ep-cast .who{font:700 14px/1.3 var(--font-terminal),Consolas,monospace;color:#f5f4ef;padding-top:4px}
.ep-log{display:flex;flex-direction:column;gap:3px}
.ep-log .order{font:700 13px/1.5 var(--font-terminal),Consolas,monospace;color:#8d97a5;margin-top:4px}
.ep-log .ln{font:400 13px/1.62 var(--font-terminal),Consolas,monospace;color:#f5f4ef;overflow-wrap:anywhere;padding-left:10px}
.ep-log .k{font-weight:700;padding:1px 5px;margin-right:6px}
.k-check{background:#393937;color:#f5f4ef}
.k-body{background:#f7525f;color:#000}
.k-spirit{background:#582a72;color:#f5f4ef}
.k-teal{background:#22ab94;color:#000}
.k-dim{background:#222;color:#8d97a5}
.ep-log .downed{font:700 13px/1.62 var(--font-terminal),Consolas,monospace}
.ep-log .downed span{background:#f7525f;color:#000;padding:1px 5px}
`;

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
      // Only a live (ACTIVE/PAUSED) encounter auto-opens; resolved ones stay
      // in the list as buttons so "resolve" really returns to the create form.
      const live = (j.encounters ?? []).find((e: { status: string }) => e.status === 'ACTIVE' || e.status === 'PAUSED');
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

  // Only a being whose full sheet reached this viewer can be declared for (perceived ones are someone else's).
  const selected = useMemo(() => {
    const p = enc?.state.participants.find(q => q.id === who);
    return p && !p.perceived ? p : null;
  }, [enc, who]);
  const draftCounts = useMemo(() => {
    const c: Record<Pillar, number> = { body: 0, spirit: 0, soul: 0 };
    for (const d of drafts) c[d.pillar]++;
    return c;
  }, [drafts]);

  // ── Create ────────────────────────────────────────────────────────────
  if (!enc) {
    const chosen = Object.entries(sides).filter(([, s]) => s);
    return (
      <div className="ep" data-encounter-panel="new">
        <style>{ENCOUNTER_CSS}</style>
        <div className="ep-sec">New encounter — six seconds at a time</div>
        {list.length > 0 && (
          <div className="ep-row">
            {list.map(e => (
              <button key={e.id} className={btnCls()} data-no-hold onClick={() => load(e.id)}>{e.name} · {e.status} · r{e.round}</button>
            ))}
          </div>
        )}
        <input className={`${fieldCls} wide`} placeholder="Encounter name" value={name} onChange={e => setName(e.target.value)} />
        <textarea className={`${fieldCls} wide`} style={{ minHeight: 64, resize: 'vertical' }} placeholder="Scene setup (what the GM narrates — everyone perceives this through their own senses)" value={scene} onChange={e => setScene(e.target.value)} />
        <div className="ep-cast">
          {campaignCharacters.map(c => (
            <div key={c.id}>
              <div className="who">{c.name}</div>
              <div className="ep-row" style={{ marginTop: 4 }}>
                {['', 'party', 'hostile', 'other'].map(s => (
                  <button key={s || 'out'} className={btnCls((sides[c.id] ?? '') === s)} data-no-hold onClick={() => setSides(prev => ({ ...prev, [c.id]: s }))}>{s || 'out'}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button
          className="ep-go"
          data-no-hold
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
        {error && <p className="ep-err" style={{ margin: 0 }}><span>{error}</span></p>}
      </div>
    );
  }

  // ── Active ────────────────────────────────────────────────────────────
  const last = enc.state.rounds.at(-1) ?? null;
  const pName = (id: string | null) => enc.state.participants.find(p => p.id === id)?.name ?? id ?? '';
  const declaredFor = (id: string) => enc.state.intentions.filter(i => i.participantId === id).length;

  return (
    <div className="ep" data-encounter-panel="live">
      <style>{ENCOUNTER_CSS}</style>
      <div className="ep-hd">
        <span className="ep-title">{enc.name}</span>
        <span className={enc.status === 'ACTIVE' ? 'ep-state' : 'ep-state off'}>{enc.status}</span>
        <span className="ep-round">Round {enc.round} done</span>
      </div>
      <div className="ep-row">
        <button className={btnCls()} data-no-hold onClick={() => load(enc.id)}>refresh</button>
        {enc.status !== 'ACTIVE' && <button className={btnCls()} data-no-hold onClick={() => run('status', async () => setEnc((await api(`/${enc.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'ACTIVE' }) })).encounter))}>activate</button>}
        {enc.status === 'ACTIVE' && <button className={btnCls()} data-no-hold onClick={() => run('status', async () => setEnc((await api(`/${enc.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'PAUSED' }) })).encounter))}>pause</button>}
        <button className={btnCls()} data-no-hold onClick={() => run('status', async () => { await api(`/${enc.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'RESOLVED' }) }); setEnc(null); await refreshList(); })}>resolve</button>
        <button className={btnCls()} data-no-hold onClick={() => setEnc(null)}>new</button>
      </div>

      {/* Participants — name (tap to declare), then the book's pillar tags */}
      <div className="ep-who">
        {enc.state.participants.map(p => (
          <div key={p.id} className={p.downed ? 'ep-p down' : 'ep-p'} data-combatant={p.id}>
            <button className={who === p.id ? 'ep-name on' : 'ep-name'} data-no-hold onClick={() => { setWho(p.id); setDrafts([]); }}>{p.name}</button>
            {enc.status === 'ACTIVE' ? (
              <button className={btnCls()} data-no-hold onClick={() => run('downed', async () => setEnc((await api(`/${enc.id}`, { method: 'PATCH', body: JSON.stringify({ participantId: p.id, downed: !p.downed }) })).encounter))}>
                {p.downed ? 'stand up' : 'put down'}
              </button>
            ) : <span />}
            <div className="ep-tags">
              {p.downed && <span className="ep-t t-down">Down</span>}
              <span className={`ep-t ${p.side === 'hostile' ? 't-hostile' : p.side === 'party' ? 't-party' : 't-other'}`}>{p.side}</span>
              <span className="ep-t t-ctl">{p.control}</span>
              {!p.perceived && <>
                <span className="ep-t t-body" title="Body pool">B {p.pools.body}</span>
                <span className="ep-t t-spirit" title="Spirit pool">S {p.pools.spirit}</span>
                <span className="ep-t t-soul" title="Soul pool">So {p.pools.soul}</span>
                {p.attrs?.frequency && <span className={p.attrs.frequency.current <= 0 ? 'ep-t t-freq zero' : 'ep-t t-freq'}>Frequency {p.attrs.frequency.current}/{p.attrs.frequency.max}</span>}
              </>}
            </div>
            {p.perceived ? (
              <div className="ep-sub" data-perceived-participant>
                {p.known.map((k, i) => <span key={k.aspect}>{i > 0 && ' · '}{k.label}: {k.value}</span>)}
              </div>
            ) : (
              <div className="ep-sub">
                cel {p.gauges.celerity} · frq {p.gauges.frequency} · wis {p.gauges.wisdom}
                {p.heldItemName && <> · holds {p.heldItemName} (r{p.heldResist}{p.heldCondition !== undefined ? `, c${p.heldCondition}` : ''})</>}
                {declaredFor(p.id) > 0 && <> · <b>declared {declaredFor(p.id)}</b></>}
                {enc.state.lastPlan[p.id] && <> · last: {enc.state.lastPlan[p.id].source}{enc.state.lastPlan[p.id].note ? ` — ${enc.state.lastPlan[p.id].note}` : ''}</>}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Intention editor (GM override for anyone) */}
      {selected && !selected.downed && enc.status === 'ACTIVE' && (
        <div className="ep-ed">
          <div className="ep-sec" style={{ color: '#ffcc78', textTransform: 'none' }}>
            Declare for {selected.name} — B {draftCounts.body}/{selected.pools.body} · S {draftCounts.spirit}/{selected.pools.spirit} · So {draftCounts.soul}/{selected.pools.soul}
          </div>
          {drafts.map((d, i) => (
            <div key={i} className="ep-d">
              <select className={fieldCls} value={d.pillar} onChange={e => setDrafts(ds => ds.map((x, j) => j === i ? { ...x, pillar: e.target.value as Pillar } : x))}>
                {PILLARS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select className={fieldCls} value={d.kind} onChange={e => setDrafts(ds => ds.map((x, j) => j === i ? { ...x, kind: e.target.value as Kind } : x))}>
                {KINDS.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
              <input className={`${fieldCls} desc`} placeholder="what they do" value={d.description} onChange={e => setDrafts(ds => ds.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
              <select className={fieldCls} value={d.skillName ?? ''} onChange={e => setDrafts(ds => ds.map((x, j) => j === i ? { ...x, skillName: e.target.value || undefined } : x))}>
                <option value="">unskilled</option>
                {selected.skills.map(s => <option key={s.name} value={s.name}>{s.name} ({s.level}; {s.governors.join('/')})</option>)}
              </select>
              <select className={fieldCls} value={d.targetId ?? ''} onChange={e => setDrafts(ds => ds.map((x, j) => j === i ? { ...x, targetId: e.target.value || undefined } : x))}>
                <option value="">no target</option>
                {enc.state.participants.filter(p => p.id !== selected.id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {d.kind === 'attack' && (<>
                <select className={fieldCls} value={d.damageType ?? 'bashing'} onChange={e => setDrafts(ds => ds.map((x, j) => j === i ? { ...x, damageType: e.target.value as IntentionDraft['damageType'] } : x))}>
                  {['bashing', 'slashing', 'piercing'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input className={`${fieldCls} num`} type="number" min={1} max={20} title="base damage" value={d.baseDamage ?? 2} onChange={e => setDrafts(ds => ds.map((x, j) => j === i ? { ...x, baseDamage: Number(e.target.value) } : x))} />
              </>)}
              {(d.kind === 'attack' || d.kind === 'skill') && (
                <label className="ep-lb" title="situational difficulty — the GM's call">
                  DR <input className={`${fieldCls} num`} type="number" min={1} max={60} value={d.dr ?? 10} onChange={e => setDrafts(ds => ds.map((x, j) => j === i ? { ...x, dr: Number(e.target.value) || 10 } : x))} />
                </label>
              )}
              {(d.kind === 'attack' || d.kind === 'skill' || d.kind === 'negate' || d.kind === 'block') && (
                <label className="ep-lb">
                  effort <input className={`${fieldCls} num`} type="number" min={0} max={50} value={d.effort ?? 0} onChange={e => setDrafts(ds => ds.map((x, j) => j === i ? { ...x, effort: Number(e.target.value) || 0 } : x))} />
                </label>
              )}
              <button className={btnCls()} data-no-hold aria-label="Remove this action" style={{ minWidth: 36 }} onClick={() => setDrafts(ds => ds.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <div className="ep-row" style={{ alignItems: 'center' }}>
            <button className={btnCls()} data-no-hold onClick={() => setDrafts(ds => [...ds, { pillar: 'body', kind: 'attack', description: '', damageType: 'bashing', baseDamage: 2, redirectTo: selected.heldResist > 0 ? 'held' : undefined }])}>+ action</button>
            <button
              className={btnCls(true)}
              data-no-hold
              disabled={
                !!busy || drafts.length === 0
                || drafts.some(d => !d.description)
                || drafts.some(d => (d.kind === 'attack' || d.kind === 'negate') && !d.targetId)
                || drafts.some(d => d.kind === 'negate' && !d.skillName)
                || PILLARS.some(pl => draftCounts[pl] > selected.pools[pl])
              }
              onClick={() => run('declare', async () => {
                const j = await api(`/${enc.id}/intentions`, { method: 'POST', body: JSON.stringify({ participantId: selected.id, intentions: drafts }) });
                setEnc(j.encounter); setDrafts([]);
              })}
            >
              {busy === 'declare' ? 'Declaring…' : 'Declare'}
            </button>
            <span className="ep-hint">Undeclared participants plan their own round (their branch). Declaring overrides the ACT step.</span>
          </div>
        </div>
      )}

      {/* Run */}
      {enc.status === 'ACTIVE' && (
        <button className="ep-go" data-no-hold disabled={!!busy} onClick={() => run('round', async () => { const j = await api(`/${enc.id}/round`, { method: 'POST' }); setEnc(j.encounter); })}>
          {busy === 'round' ? 'Six seconds passing…' : `Run round ${enc.round + 1}`}
        </button>
      )}
      {error && <p className="ep-err" style={{ margin: 0 }}><span>{error}</span></p>}

      {/* Record */}
      {last && (
        <div className="ep-log" data-encounter-record>
          <div className="ep-sec">Round {last.round} — the record</div>
          {last.log.map((l, i) => (l.kind === 'order' ? (
            <div key={i} className="order">{l.text}</div>
          ) : (
            <div key={i} className="ln"><span className={`k ${KIND_CLS[l.kind] ?? 'k-check'}`}>[{l.kind}]</span>{l.text}</div>
          )))}
          {last.downed.length > 0 && <div className="downed"><span>Down: {last.downed.map(pName).join(', ')}</span></div>}
        </div>
      )}
      {enc.state.rounds.length > 1 && (
        <div className="ep-hint">{enc.state.rounds.length} rounds recorded — earlier rounds are in the terminal feed.</div>
      )}
    </div>
  );
}
