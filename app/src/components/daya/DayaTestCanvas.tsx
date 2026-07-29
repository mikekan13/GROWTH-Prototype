'use client';

/**
 * WP12 test canvas — the create-and-converse flow for a persona-harness
 * entity, built directly against the API routes in
 * src/app/api/characters/[id]/daya/*. Deliberately thin: this component
 * owns UI state only, every mutation is a plain fetch to a service-backed
 * route (src/daya/authoring.ts, conversation.ts, timeskip.ts).
 */
import { useCallback, useEffect, useState } from 'react';

interface CharacterSummary {
  id: string;
  name: string;
  entityType: string;
  status: string;
}

interface DayaAuthoringStateDTO {
  wrapped: boolean;
  entityId?: string;
  status?: string;
  introspection?: number;
  persona?: {
    voice?: { register?: string; rhythm?: string; images?: string[] };
    bias?: { selfRegard?: number; optimism?: number; projection?: number; denial?: number; catastrophize?: number };
    identityNarrative?: string;
    voiceNotes?: string;
  };
  affect?: { morale: number; stress: number; grief: number };
  believed?: Record<string, unknown> | null;
  goals: Array<{ id: string; description: string; status: string; priority: number }>;
  recentMemories: Array<{ id: string; content: string; source: string; narrativeCycle: number; realTime: string }>;
}

interface ConverseResultDTO {
  status: 'ok' | 'disabled' | 'dormant' | 'core_offline';
  action?: { kind: string; content?: string };
  memoryEntryId?: string;
  detail?: string;
}

interface TimeSkipResultDTO {
  framing?: string;
  status: 'ok' | 'disabled' | 'dormant' | 'no_active_vine' | 'core_offline';
  statedIntent?: string;
  adjudication?: { outcome: string; experienceEvent: { content: string; valence: number; salience: number } };
  dreamed?: boolean;
  detail?: string;
}

interface ChatLine {
  who: 'gm' | 'entity' | 'system';
  text: string;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `Request to ${url} failed`);
  return json as T;
}

export default function DayaTestCanvas({
  campaignId,
  campaignName,
  characters,
  userRole,
}: {
  campaignId: string;
  campaignName: string;
  characters: CharacterSummary[];
  userRole: string;
}) {
  const [characterId, setCharacterId] = useState<string>(characters[0]?.id ?? '');
  const [state, setState] = useState<DayaAuthoringStateDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [introspection, setIntrospection] = useState(0.5);
  const [voiceRegister, setVoiceRegister] = useState('');
  const [voiceRhythm, setVoiceRhythm] = useState('');
  const [bias, setBias] = useState({ selfRegard: 0, optimism: 0, projection: 0, denial: 0, catastrophize: 0 });
  const [identityNarrative, setIdentityNarrative] = useState('');

  const [vineDraft, setVineDraft] = useState('');
  const [memoryDraft, setMemoryDraft] = useState('');

  const [chat, setChat] = useState<ChatLine[]>([]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const [framing, setFraming] = useState('');
  const [alsoDream, setAlsoDream] = useState(false);
  const [timeSkipResult, setTimeSkipResult] = useState<TimeSkipResultDTO | null>(null);

  const refresh = useCallback(async () => {
    if (!characterId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/characters/${characterId}/daya`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to load state');
      const s = json as DayaAuthoringStateDTO;
      setState(s);
      setIntrospection(s.introspection ?? 0.5);
      setVoiceRegister(s.persona?.voice?.register ?? '');
      setVoiceRhythm(s.persona?.voice?.rhythm ?? '');
      setBias({
        selfRegard: s.persona?.bias?.selfRegard ?? 0,
        optimism: s.persona?.bias?.optimism ?? 0,
        projection: s.persona?.bias?.projection ?? 0,
        denial: s.persona?.bias?.denial ?? 0,
        catastrophize: s.persona?.bias?.catastrophize ?? 0,
      });
      setIdentityNarrative(s.persona?.identityNarrative ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [characterId]);

  useEffect(() => {
    void refresh();
    setChat([]);
    setTimeSkipResult(null);
  }, [refresh]);

  async function handleWrap() {
    setError(null);
    try {
      await postJson(`/api/characters/${characterId}/daya/wrap`, {});
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleSaveAuthoring() {
    setError(null);
    try {
      const res = await fetch(`/api/characters/${characterId}/daya`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          introspection,
          voice: { register: voiceRegister || undefined, rhythm: voiceRhythm || undefined },
          bias,
          identityNarrative: identityNarrative || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to save authoring');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleAddVine() {
    if (!vineDraft.trim()) return;
    setError(null);
    try {
      await postJson(`/api/characters/${characterId}/daya/vines`, {
        vines: [{ description: vineDraft.trim(), priority: 3 }],
      });
      setVineDraft('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleAddMemory() {
    if (!memoryDraft.trim()) return;
    setError(null);
    try {
      await postJson(`/api/characters/${characterId}/daya/memories`, {
        memories: [{ content: memoryDraft.trim() }],
      });
      setMemoryDraft('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleSetStatus(status: 'ACTIVE' | 'DORMANT') {
    setError(null);
    try {
      await postJson(`/api/characters/${characterId}/daya/enable`, { status });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleSend() {
    if (!message.trim()) return;
    const text = message.trim();
    setMessage('');
    setChat((prev) => [...prev, { who: 'gm', text }]);
    setSending(true);
    try {
      const result = await postJson<ConverseResultDTO>(`/api/characters/${characterId}/daya/converse`, { message: text });
      if (result.status === 'disabled') {
        setChat((prev) => [...prev, { who: 'system', text: 'DAYA_ENABLED is off — this trigger was only audited, not run.' }]);
      } else if (result.status === 'dormant') {
        setChat((prev) => [...prev, { who: 'system', text: 'She is not awake yet — flip the enable gate above.' }]);
      } else if (result.status === 'core_offline') {
        setChat((prev) => [...prev, { who: 'system', text: `Her core isn't reachable right now (${result.detail ?? 'L1 offline'}) — the pod may not be up.` }]);
      } else if (result.action?.kind === 'speak') {
        setChat((prev) => [...prev, { who: 'entity', text: result.action?.content ?? '' }]);
      } else if (result.action?.kind === 'act') {
        setChat((prev) => [...prev, { who: 'entity', text: `*${result.action?.content ?? 'acts'}*` }]);
      } else if (result.action?.kind === 'attend') {
        setChat((prev) => [...prev, { who: 'entity', text: `*attends to ${result.action?.content ?? 'something'}*` }]);
      } else if (result.action?.kind === 'held') {
        setChat((prev) => [...prev, { who: 'system', text: 'That intervention was held (embodiment seal flagged it) — not delivered.' }]);
      } else {
        setChat((prev) => [...prev, { who: 'entity', text: '*rests, quietly*' }]);
      }
      await refresh();
    } catch (err) {
      setChat((prev) => [...prev, { who: 'system', text: err instanceof Error ? err.message : String(err) }]);
    } finally {
      setSending(false);
    }
  }

  async function handleTimeSkip() {
    setError(null);
    try {
      const result = await postJson<TimeSkipResultDTO>(`/api/characters/${characterId}/daya/timeskip`, {
        framing: framing || undefined,
        alsoDream,
      });
      setTimeSkipResult(result);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const selectedCharacter = characters.find((c) => c.id === characterId);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '2rem 1rem', fontFamily: 'Consolas, monospace' }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: 4 }}>Persona-harness test canvas</h1>
      <p style={{ opacity: 0.7, marginBottom: 24 }}>Campaign: {campaignName} · role: {userRole}</p>

      <section style={{ marginBottom: 24 }}>
        <label style={{ display: 'block', marginBottom: 8 }}>
          Character
          <select
            value={characterId}
            onChange={(e) => setCharacterId(e.target.value)}
            style={{ display: 'block', marginTop: 4, padding: 6, width: '100%' }}
          >
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.entityType})
              </option>
            ))}
          </select>
        </label>
        {!characterId && <p>No characters in this campaign yet — create one first via the normal creation flow.</p>}
      </section>

      {error && (
        <div style={{ background: '#f7525f22', border: '1px solid #f7525f', padding: 8, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading && <p>Loading…</p>}

      {characterId && state && (
        <>
          <section style={{ border: '1px solid #ccc', padding: 16, marginBottom: 16 }}>
            <h2 style={{ fontSize: '1.1rem', marginBottom: 8 }}>1. Wrap</h2>
            {!state.wrapped ? (
              <button onClick={handleWrap}>Wrap {selectedCharacter?.name} as a persona-harness entity</button>
            ) : (
              <p>
                Wrapped — entity {state.entityId} · status <b>{state.status}</b>
                {state.affect && (
                  <> · mood morale={state.affect.morale.toFixed(2)} stress={state.affect.stress.toFixed(2)} grief={state.affect.grief.toFixed(2)}</>
                )}
              </p>
            )}
          </section>

          {state.wrapped && (
            <>
              <section style={{ border: '1px solid #ccc', padding: 16, marginBottom: 16 }}>
                <h2 style={{ fontSize: '1.1rem', marginBottom: 8 }}>2. Author</h2>
                <label style={{ display: 'block', marginBottom: 8 }}>
                  Introspection ({introspection.toFixed(2)})
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={introspection}
                    onChange={(e) => setIntrospection(Number(e.target.value))}
                    style={{ display: 'block', width: '100%' }}
                  />
                </label>
                <label style={{ display: 'block', marginBottom: 8 }}>
                  Voice register
                  <input value={voiceRegister} onChange={(e) => setVoiceRegister(e.target.value)} style={{ display: 'block', width: '100%', padding: 4 }} />
                </label>
                <label style={{ display: 'block', marginBottom: 8 }}>
                  Voice rhythm
                  <input value={voiceRhythm} onChange={(e) => setVoiceRhythm(e.target.value)} style={{ display: 'block', width: '100%', padding: 4 }} />
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  {(Object.keys(bias) as Array<keyof typeof bias>).map((key) => (
                    <label key={key}>
                      {key} ({bias[key].toFixed(2)})
                      <input
                        type="range"
                        min={-1}
                        max={1}
                        step={0.1}
                        value={bias[key]}
                        onChange={(e) => setBias((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                        style={{ display: 'block', width: '100%' }}
                      />
                    </label>
                  ))}
                </div>
                <label style={{ display: 'block', marginBottom: 8 }}>
                  Identity narrative
                  <textarea
                    value={identityNarrative}
                    onChange={(e) => setIdentityNarrative(e.target.value)}
                    rows={4}
                    style={{ display: 'block', width: '100%', padding: 4 }}
                  />
                </label>
                <button onClick={handleSaveAuthoring}>Save authoring</button>
              </section>

              <section style={{ border: '1px solid #ccc', padding: 16, marginBottom: 16 }}>
                <h2 style={{ fontSize: '1.1rem', marginBottom: 8 }}>3. Vines (goals) &amp; seeded memories</h2>
                <div style={{ marginBottom: 12 }}>
                  <input
                    value={vineDraft}
                    onChange={(e) => setVineDraft(e.target.value)}
                    placeholder="e.g. wants to reopen the shop her mother lost"
                    style={{ width: '70%', padding: 4 }}
                  />
                  <button onClick={handleAddVine} style={{ marginLeft: 8 }}>Add vine</button>
                  <ul>
                    {state.goals.map((g) => (
                      <li key={g.id}>
                        {g.description} — {g.status} (priority {g.priority})
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <textarea
                    value={memoryDraft}
                    onChange={(e) => setMemoryDraft(e.target.value)}
                    placeholder="A lived memory, first person — no mechanical vocabulary"
                    rows={2}
                    style={{ width: '70%', padding: 4 }}
                  />
                  <button onClick={handleAddMemory} style={{ marginLeft: 8, verticalAlign: 'top' }}>Seed memory</button>
                  <ul>
                    {state.recentMemories.map((m) => (
                      <li key={m.id}>
                        [{m.source}, cycle {m.narrativeCycle}] {m.content}
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              <section style={{ border: '1px solid #ccc', padding: 16, marginBottom: 16 }}>
                <h2 style={{ fontSize: '1.1rem', marginBottom: 8 }}>4. Enable</h2>
                <p>Status: <b>{state.status}</b></p>
                {state.status === 'ACTIVE' ? (
                  <button onClick={() => handleSetStatus('DORMANT')}>Put back to sleep</button>
                ) : (
                  <button onClick={() => handleSetStatus('ACTIVE')}>Wake her</button>
                )}
              </section>

              <section style={{ border: '1px solid #ccc', padding: 16, marginBottom: 16 }}>
                <h2 style={{ fontSize: '1.1rem', marginBottom: 8 }}>5. Converse</h2>
                <div style={{ minHeight: 120, border: '1px solid #eee', padding: 8, marginBottom: 8, maxHeight: 300, overflowY: 'auto' }}>
                  {chat.length === 0 && <p style={{ opacity: 0.6 }}>No messages yet.</p>}
                  {chat.map((line, i) => (
                    <p key={i} style={{ margin: '4px 0', fontStyle: line.who === 'system' ? 'italic' : 'normal', opacity: line.who === 'system' ? 0.7 : 1 }}>
                      <b>{line.who === 'gm' ? 'You' : line.who === 'entity' ? selectedCharacter?.name ?? 'Her' : 'System'}:</b> {line.text}
                    </p>
                  ))}
                </div>
                <input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleSend();
                  }}
                  placeholder="Say something to her…"
                  style={{ width: '70%', padding: 4 }}
                  disabled={sending}
                />
                <button onClick={handleSend} disabled={sending} style={{ marginLeft: 8 }}>
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </section>

              <section style={{ border: '1px solid #ccc', padding: 16, marginBottom: 16 }}>
                <h2 style={{ fontSize: '1.1rem', marginBottom: 8 }}>6. Time-skip</h2>
                <input
                  value={framing}
                  onChange={(e) => setFraming(e.target.value)}
                  placeholder='e.g. "a week passes"'
                  style={{ width: '60%', padding: 4 }}
                />
                <label style={{ marginLeft: 12 }}>
                  <input type="checkbox" checked={alsoDream} onChange={(e) => setAlsoDream(e.target.checked)} /> also run a dream tick
                </label>
                <button onClick={handleTimeSkip} style={{ marginLeft: 8 }}>Run time-skip</button>
                {timeSkipResult && (
                  <div style={{ marginTop: 8, padding: 8, background: '#0000000a' }}>
                    <p><b>Status:</b> {timeSkipResult.status}</p>
                    {timeSkipResult.statedIntent && <p><b>She tried:</b> {timeSkipResult.statedIntent}</p>}
                    {timeSkipResult.adjudication && <p><b>What happened:</b> {timeSkipResult.adjudication.outcome}</p>}
                    {timeSkipResult.dreamed && <p>A dream tick thickened it afterward.</p>}
                    {timeSkipResult.detail && <p style={{ opacity: 0.7 }}>{timeSkipResult.detail}</p>}
                  </div>
                )}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
