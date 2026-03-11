"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface CampaignSettingsFormProps {
  campaignId: string;
  initialData: {
    name: string;
    description: string;
    worldContext: string;
    status: string;
    maxTrailblazers: number;
    inviteCode: string;
    customPrompts: string[];
    currentMemberCount: number;
  };
}

const STATUSES = ['ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'] as const;

export default function CampaignSettingsForm({ campaignId, initialData }: CampaignSettingsFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [name, setName] = useState(initialData.name);
  const [description, setDescription] = useState(initialData.description);
  const [worldContext, setWorldContext] = useState(initialData.worldContext);
  const [status, setStatus] = useState(initialData.status);
  const [maxTrailblazers, setMaxTrailblazers] = useState(initialData.maxTrailblazers);
  const [inviteCode, setInviteCode] = useState(initialData.inviteCode);
  const [customPrompts, setCustomPrompts] = useState<string[]>(initialData.customPrompts);
  const [regenerating, setRegenerating] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: description || undefined,
          worldContext: worldContext || undefined,
          status,
          maxTrailblazers,
          customPrompts: customPrompts.filter(p => p.trim() !== ''),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to save');
        return;
      }

      setSuccess('Settings saved.');
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  async function handleRegenerateInvite() {
    if (!confirm('This will invalidate the current invite code. Continue?')) return;

    setRegenerating(true);
    setError('');
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/regenerate-invite`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to regenerate');
        return;
      }
      const data = await res.json();
      setInviteCode(data.inviteCode);
      setSuccess('Invite code regenerated.');
    } catch {
      setError('Network error');
    } finally {
      setRegenerating(false);
    }
  }

  function addPrompt() {
    if (customPrompts.length >= 20) return;
    setCustomPrompts([...customPrompts, '']);
  }

  function removePrompt(index: number) {
    setCustomPrompts(customPrompts.filter((_, i) => i !== index));
  }

  function updatePrompt(index: number, value: string) {
    const updated = [...customPrompts];
    updated[index] = value;
    setCustomPrompts(updated);
  }

  const inputClass =
    'w-full px-3 py-2 bg-white/60 border border-[var(--surface-dark)]/20 text-[var(--surface-dark)] font-[family-name:var(--font-terminal)] text-sm focus:outline-none focus:border-[var(--accent-teal)]';
  const labelClass =
    'block text-xs uppercase tracking-wider text-[var(--surface-dark)]/60 mb-1';

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Status Messages */}
      {error && (
        <div className="p-3 bg-[var(--accent-coral)]/10 border border-[var(--accent-coral)]/40 text-[var(--accent-coral)] text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 bg-[var(--accent-teal)]/10 border border-[var(--accent-teal)]/40 text-[var(--accent-teal)] text-sm">
          {success}
        </div>
      )}

      {/* Campaign Name */}
      <div>
        <label className={labelClass}>Campaign Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={100}
          required
          className={inputClass}
        />
      </div>

      {/* Description */}
      <div>
        <label className={labelClass}>Description</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          maxLength={2000}
          rows={3}
          className={inputClass}
          style={{ resize: 'vertical' }}
        />
      </div>

      {/* World Context */}
      <div>
        <label className={labelClass}>World Context</label>
        <textarea
          value={worldContext}
          onChange={e => setWorldContext(e.target.value)}
          maxLength={5000}
          rows={5}
          className={inputClass}
          style={{ resize: 'vertical' }}
          placeholder="Describe the world, setting, and lore for this campaign..."
        />
      </div>

      {/* Status */}
      <div>
        <label className={labelClass}>Status</label>
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          className={inputClass}
        >
          {STATUSES.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Max Trailblazers */}
      <div>
        <label className={labelClass}>
          Max Trailblazers (current: {initialData.currentMemberCount})
        </label>
        <input
          type="number"
          value={maxTrailblazers}
          onChange={e => setMaxTrailblazers(parseInt(e.target.value) || 1)}
          min={Math.max(1, initialData.currentMemberCount)}
          max={50}
          className={inputClass}
        />
      </div>

      {/* Invite Code */}
      <div>
        <label className={labelClass}>Invite Code</label>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[var(--accent-gold)] text-lg tracking-widest">
            {inviteCode}
          </span>
          <button
            type="button"
            onClick={handleRegenerateInvite}
            disabled={regenerating}
            className="px-3 py-1 text-xs uppercase tracking-wider border border-[var(--accent-coral)]/40 text-[var(--accent-coral)] hover:bg-[var(--accent-coral)]/10 disabled:opacity-50 transition-colors"
          >
            {regenerating ? 'Regenerating...' : 'Regenerate'}
          </button>
        </div>
      </div>

      {/* Custom Backstory Prompts */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className={labelClass}>Custom Backstory Prompts</label>
          <button
            type="button"
            onClick={addPrompt}
            disabled={customPrompts.length >= 20}
            className="text-xs text-[var(--accent-teal)] hover:underline disabled:opacity-40"
          >
            + Add Prompt
          </button>
        </div>
        {customPrompts.length === 0 ? (
          <p className="text-xs text-[var(--surface-dark)]/40">
            No custom prompts. Default backstory prompts will be used.
          </p>
        ) : (
          <div className="space-y-2">
            {customPrompts.map((prompt, i) => (
              <div key={i} className="flex gap-2">
                <input
                  type="text"
                  value={prompt}
                  onChange={e => updatePrompt(i, e.target.value)}
                  maxLength={500}
                  placeholder={`Prompt ${i + 1}`}
                  className={inputClass + ' flex-1'}
                />
                <button
                  type="button"
                  onClick={() => removePrompt(i)}
                  className="px-2 text-[var(--accent-coral)] hover:bg-[var(--accent-coral)]/10 text-sm"
                  title="Remove prompt"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Save */}
      <div className="flex items-center gap-4 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2 bg-[var(--accent-teal)] text-black text-xs uppercase tracking-[0.15em] font-[family-name:var(--font-terminal)] hover:bg-[var(--accent-teal)]/80 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/watcher/campaign/${campaignId}`)}
          className="px-4 py-2 text-xs uppercase tracking-wider text-[var(--surface-dark)]/60 hover:text-[var(--surface-dark)] transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
