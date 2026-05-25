'use client';

/**
 * GodheadPersonaPanel — admin-only inline editor for the AI persona that
 * runs a Godhead character. Renders on the character page below the regular
 * CharacterSheet/CharacterTab when viewer is ADMIN and entityType=GODHEAD.
 *
 * Reads + writes via the godhead-admin API (/api/admin/godheads/[name]).
 * Surfaces: system prompt, temperature, default model, domain, pillar.
 * Also shows live metrics (invocation count, last invocation, token totals)
 * so Mike can see the agent's activity at a glance from the character page.
 */

import { useCallback, useEffect, useState } from 'react';

interface PersonaData {
  name: string;
  pillar: string;
  domain: string;
  systemPrompt: string;
  temperature: number;
  defaultModel: string | null;
  walletBalance: string;
  invocationCount: number;
  lastInvocationAt: string | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostEstimateUSD: number;
  memoryEntryCount: number;
}

interface Props {
  godheadName: string;   // matches Character.name and GodHead.name
}

const MODEL_OPTIONS = [
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 (cheap, fast)' },
  { value: 'claude-sonnet-4-6',         label: 'Sonnet 4.6 (balanced)' },
  { value: 'claude-opus-4-7',           label: 'Opus 4.7 (deep reasoning)' },
];

const PILLAR_OPTIONS = ['MERCY', 'BALANCE', 'SEVERITY', 'TRINITY'];

export default function GodheadPersonaPanel({ godheadName }: Props) {
  const [data, setData] = useState<PersonaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // Local form state (mirrors fetched data, mutated by inputs)
  const [systemPrompt, setSystemPrompt] = useState('');
  const [temperature, setTemperature] = useState(0.6);
  const [defaultModel, setDefaultModel] = useState<string>('claude-sonnet-4-6');
  const [domain, setDomain] = useState('');
  const [pillar, setPillar] = useState<string>('BALANCE');
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/godheads/${encodeURIComponent(godheadName)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Load failed' }));
        setError(err.error || 'Load failed');
        return;
      }
      const d = (await res.json()) as PersonaData;
      setData(d);
      setSystemPrompt(d.systemPrompt);
      setTemperature(d.temperature);
      setDefaultModel(d.defaultModel ?? 'claude-sonnet-4-6');
      setDomain(d.domain);
      setPillar(d.pillar);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [godheadName]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/godheads/${encodeURIComponent(godheadName)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt, temperature, defaultModel, domain, pillar }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Save failed' }));
        setError(err.error || 'Save failed');
        return;
      }
      setSaveMsg('Persona saved.');
      setDirty(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSaving(false);
    }
  };

  // Mutators that flip dirty
  const onSP = (v: string) => { setSystemPrompt(v); setDirty(true); setSaveMsg(null); };
  const onTemp = (v: number) => { setTemperature(v); setDirty(true); setSaveMsg(null); };
  const onModel = (v: string) => { setDefaultModel(v); setDirty(true); setSaveMsg(null); };
  const onDomain = (v: string) => { setDomain(v); setDirty(true); setSaveMsg(null); };
  const onPillar = (v: string) => { setPillar(v); setDirty(true); setSaveMsg(null); };

  if (loading && !data) {
    return (
      <div className="max-w-4xl mx-auto mt-6 border p-4 text-center text-[12px] font-[family-name:var(--font-terminal)] text-white/40"
        style={{ borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.4)' }}
      >
        Loading godhead persona…
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="max-w-4xl mx-auto mt-6 border p-3 text-[12px] font-[family-name:var(--font-terminal)]"
        style={{ borderColor: '#E8585A55', background: 'rgba(232,88,90,0.08)', color: '#E8585A' }}
      >
        ✗ {error}
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="max-w-4xl mx-auto mt-6 border"
      style={{ borderColor: '#22ab9433', background: '#0a0a14', boxShadow: '0 0 32px rgba(34,171,148,0.08)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b"
        style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'linear-gradient(90deg, rgba(34,171,148,0.08) 0%, rgba(0,0,0,0.5) 100%)' }}
      >
        <div>
          <div className="text-[11px] font-[family-name:var(--font-terminal)] tracking-[0.2em] uppercase text-[#22ab94]">
            ◈ Godhead Persona · ADMIN
          </div>
          <div className="text-[14px] font-[family-name:var(--font-header)] tracking-[0.1em] text-white mt-0.5">
            {data.name}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-terminal)] text-white/40">
            Pillar
          </div>
          <div className="text-[12px] font-[family-name:var(--font-terminal)] text-[#22ab94]">
            {data.pillar}
          </div>
        </div>
      </div>

      {/* Live metrics strip */}
      <div className="grid grid-cols-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <Metric label="Invocations" value={data.invocationCount.toString()} />
        <Metric label="Tokens (in+out)" value={(data.totalInputTokens + data.totalOutputTokens).toLocaleString()} />
        <Metric label="Cost est" value={`$${data.totalCostEstimateUSD.toFixed(4)}`} />
        <Metric label="KRMA Wallet" value={`${Number(data.walletBalance).toLocaleString()} Ҝ`} color="#ffcc78" />
      </div>
      {data.lastInvocationAt && (
        <div className="px-5 py-1.5 text-[10px] font-[family-name:var(--font-terminal)] text-white/30 border-b"
          style={{ borderColor: 'rgba(255,255,255,0.06)' }}
        >
          Last invocation: {new Date(data.lastInvocationAt).toLocaleString()} · {data.memoryEntryCount} memory entries
        </div>
      )}

      {/* Editable fields */}
      <div className="p-5 space-y-4">
        {/* Pillar + Model + Temperature row */}
        <div className="grid grid-cols-3 gap-3">
          <Field label="Pillar">
            <select
              value={pillar}
              onChange={(e) => onPillar(e.target.value)}
              className="w-full px-2 py-1.5 text-[12px] font-[family-name:var(--font-terminal)] bg-black/40 border text-white"
              style={{ borderColor: 'rgba(255,255,255,0.15)' }}
            >
              {PILLAR_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Default Model">
            <select
              value={defaultModel}
              onChange={(e) => onModel(e.target.value)}
              className="w-full px-2 py-1.5 text-[12px] font-[family-name:var(--font-terminal)] bg-black/40 border text-white"
              style={{ borderColor: 'rgba(255,255,255,0.15)' }}
            >
              {MODEL_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </Field>
          <Field label={`Temperature (${temperature.toFixed(2)})`}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={temperature}
              onChange={(e) => onTemp(Number(e.target.value))}
              className="w-full"
            />
          </Field>
        </div>

        {/* Domain */}
        <Field label="Domain (one-line summary)">
          <textarea
            rows={2}
            maxLength={500}
            value={domain}
            onChange={(e) => onDomain(e.target.value)}
            className="w-full px-2 py-1.5 text-[12px] font-[family-name:var(--font-terminal)] bg-black/40 border text-white resize-none"
            style={{ borderColor: 'rgba(255,255,255,0.15)' }}
          />
        </Field>

        {/* System prompt */}
        <Field label={`System Prompt (${systemPrompt.length} / 20,000)`}>
          <textarea
            rows={14}
            maxLength={20_000}
            value={systemPrompt}
            onChange={(e) => onSP(e.target.value)}
            className="w-full px-3 py-2 text-[12px] font-[family-name:var(--font-terminal)] bg-black/40 border text-white resize-y"
            style={{ borderColor: '#22ab9444', minHeight: '240px', lineHeight: 1.6 }}
            placeholder="Persona, domain authority instructions, operating principles…"
          />
        </Field>

        {error && (
          <div className="border p-2 text-[11px] font-[family-name:var(--font-terminal)]"
            style={{ borderColor: '#E8585A55', background: 'rgba(232,88,90,0.08)', color: '#E8585A' }}
          >
            ✗ {error}
          </div>
        )}
        {saveMsg && (
          <div className="border p-2 text-[11px] font-[family-name:var(--font-terminal)] text-center"
            style={{ borderColor: 'rgba(34,171,148,0.4)', background: 'rgba(34,171,148,0.08)', color: '#22ab94' }}
          >
            ✓ {saveMsg}
          </div>
        )}

        {/* Save bar */}
        <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <span className="text-[10px] font-[family-name:var(--font-terminal)] text-white/30 uppercase tracking-[0.1em]">
            {dirty ? '● unsaved changes' : '○ saved'}
          </span>
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="px-5 py-2 text-[11px] uppercase tracking-[0.12em] font-[family-name:var(--font-terminal)] font-bold disabled:opacity-30 transition-all"
            style={{
              background: dirty && !saving ? 'linear-gradient(135deg, #22ab94, #1a8d7a)' : 'rgba(34,171,148,0.3)',
              color: '#000',
              boxShadow: dirty && !saving ? '0 0 20px rgba(34,171,148,0.3)' : 'none',
            }}
          >
            {saving ? 'Saving...' : 'Save Persona ›'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="px-4 py-2 border-r last:border-r-0" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
      <div className="text-[9px] uppercase tracking-[0.15em] font-[family-name:var(--font-terminal)] text-white/40">
        {label}
      </div>
      <div className="text-[14px] font-[family-name:var(--font-bebas-neue)] mt-0.5" style={{ color: color ?? '#F5F4EF' }}>
        {value}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] uppercase tracking-[0.12em] font-[family-name:var(--font-terminal)] text-white/40">
        {label}
      </label>
      {children}
    </div>
  );
}
