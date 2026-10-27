"use client";

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import EyetehrnetLogo from '@/components/EyetehrnetLogo';
import {
  type CampaignAISettings,
  type AIFeature,
  type AIProviderChoice,
  CLOUD_ONLY_FEATURES,
} from '@/ai/types';

/**
 * GM-configurable AI features (T20). forgeAuthoring is cloud-only and shown
 * locked. INV-69: player-facing copy says "Copilot", never JEWL.
 */
const AI_FEATURES: { key: AIFeature; label: string; hint: string }[] = [
  { key: 'copilot', label: 'Copilot', hint: 'Campaign co-pilot chat' },
  { key: 'portraitGeneration', label: 'Portrait Generation', hint: 'Character image generation' },
  { key: 'referenceDescription', label: 'Reference Description', hint: 'Describe uploaded reference photos' },
];

const PROFILE_FIELDS = [
  { key: 'firstName', label: 'First Name' },
  { key: 'pronouns', label: 'Pronouns' },
  { key: 'bio', label: 'Bio' },
  { key: 'experienceLevel', label: 'Experience Level' },
  { key: 'systemsPlayed', label: 'Systems Played' },
  { key: 'playstylePreferences', label: 'Playstyle' },
  { key: 'conflictStyle', label: 'Conflict Style' },
  { key: 'availableDays', label: 'Available Days' },
  { key: 'timezone', label: 'Timezone' },
];

const LISTING_STATUSES = ['UNLISTED', 'LISTED', 'CLOSED'] as const;

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
    listingStatus: string;
    listingDescription: string;
    listingTags: string[];
    requiredFields: string[];
    aiSettings: CampaignAISettings;
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
  const [listingStatus, setListingStatus] = useState(initialData.listingStatus);
  const [listingDescription, setListingDescription] = useState(initialData.listingDescription);
  const [listingTags, setListingTags] = useState<string[]>(initialData.listingTags);
  const [tagInput, setTagInput] = useState('');
  const [requiredFields, setRequiredFields] = useState<string[]>(initialData.requiredFields);
  const [savingListing, setSavingListing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  // AI settings (T20) — separate save target: /ai-settings PATCH.
  const [aiDefaultProvider, setAiDefaultProvider] = useState<AIProviderChoice>(
    initialData.aiSettings.defaultProvider,
  );
  const [aiOverrides, setAiOverrides] = useState<Partial<Record<AIFeature, AIProviderChoice>>>(
    initialData.aiSettings.overrides ?? {},
  );
  const [aiVisionModel, setAiVisionModel] = useState(initialData.aiSettings.localVisionModel ?? '');
  const [aiTextModel, setAiTextModel] = useState(initialData.aiSettings.localTextModel ?? '');
  // Recursive genesis (2026-10-16): every person JEWL seeds gets her own
  // sketch + sail walk in the background. Default ON.
  const [aiRecursiveGenesis, setAiRecursiveGenesis] = useState(initialData.aiSettings.recursiveGenesis !== false);
  // How a being's thoughts read in the out-of-session novel view (Mike 2026-10-26). Default 'inner'.
  const [aiThoughtStyle, setAiThoughtStyle] = useState<'inner' | 'narrator'>(initialData.aiSettings.thoughtStyle === 'narrator' ? 'narrator' : 'inner');
  // Rolls as popup + card (2026-10-26): the Watcher's beings default to AI-chosen Effort; a Trailblazer's popup times out to the AI.
  const [aiRollEffort, setAiRollEffort] = useState<'ai' | 'manual'>(initialData.aiSettings.rollEffort === 'manual' ? 'manual' : 'ai');
  const [aiRollTimeout, setAiRollTimeout] = useState<number>(initialData.aiSettings.rollTimeoutSec ?? 60);
  const [savingAI, setSavingAI] = useState(false);

  function setOverride(feature: AIFeature, choice: 'default' | AIProviderChoice) {
    setAiOverrides(prev => {
      const next = { ...prev };
      if (choice === 'default') delete next[feature];
      else next[feature] = choice;
      return next;
    });
  }

  async function handleSaveAI() {
    setSavingAI(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/ai-settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defaultProvider: aiDefaultProvider,
          overrides: aiOverrides,
          localVisionModel: aiVisionModel.trim() || undefined,
          localTextModel: aiTextModel.trim() || undefined,
          recursiveGenesis: aiRecursiveGenesis,
          thoughtStyle: aiThoughtStyle,
          rollEffort: aiRollEffort,
          rollTimeoutSec: Math.min(600, Math.max(10, Math.round(aiRollTimeout) || 60)),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to save AI settings');
        return;
      }
      setSuccess('AI settings updated.');
    } catch {
      setError('Network error');
    } finally {
      setSavingAI(false);
    }
  }

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

  async function handleSaveListing() {
    setSavingListing(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/listing`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingStatus, listingDescription, listingTags, requiredFields }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to save listing');
        return;
      }
      setSuccess('Listing updated.');
    } catch {
      setError('Network error');
    } finally {
      setSavingListing(false);
    }
  }

  function addTag() {
    const t = tagInput.trim();
    if (!t || listingTags.includes(t)) return;
    setListingTags([...listingTags, t]);
    setTagInput('');
  }

  function toggleRequiredField(key: string) {
    setRequiredFields(prev =>
      prev.includes(key) ? prev.filter(f => f !== key) : [...prev, key]
    );
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

      {/* EŶ∃tehrNET Listing */}
      <div className="border-t border-[var(--accent-teal)]/20 pt-6 space-y-4">
        <h3 className="flex items-center gap-2">
          <EyetehrnetLogo scale={0.65} />
          <span className="text-xs uppercase tracking-[0.15em] font-[family-name:var(--font-header)] text-[var(--accent-teal)]/80">Listing</span>
        </h3>

        <div>
          <label className={labelClass}>Listing Status</label>
          <select value={listingStatus} onChange={e => setListingStatus(e.target.value)} className={inputClass}>
            {LISTING_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <p className="text-[10px] text-[var(--surface-dark)]/40 mt-1">
            LISTED = visible on the public hub. UNLISTED = invite-only. CLOSED = no new applications.
          </p>
        </div>

        <div>
          <label className={labelClass}>Listing Description (public pitch)</label>
          <textarea
            value={listingDescription}
            onChange={e => setListingDescription(e.target.value)}
            maxLength={5000}
            rows={4}
            className={inputClass}
            style={{ resize: 'vertical' }}
            placeholder="Write a compelling pitch for potential players..."
          />
        </div>

        <div>
          <label className={labelClass}>Tags</label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
              placeholder="Add a tag..."
              maxLength={50}
              className={inputClass + ' flex-1'}
            />
            <button type="button" onClick={addTag} className="px-3 py-1 bg-[var(--accent-teal)]/20 border border-[var(--accent-teal)]/40 text-[var(--accent-teal)] text-xs hover:bg-[var(--accent-teal)]/30">
              Add
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {listingTags.map(tag => (
              <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 bg-[var(--surface-dark)]/5 border border-[var(--surface-dark)]/15 text-xs">
                {tag}
                <button type="button" onClick={() => setListingTags(listingTags.filter(t => t !== tag))} className="text-[var(--pillar-body)] hover:text-[var(--pillar-body)]/80">&times;</button>
              </span>
            ))}
          </div>
        </div>

        <div>
          <label className={labelClass}>Required Profile Fields</label>
          <p className="text-[10px] text-[var(--surface-dark)]/40 mb-2">
            Select which profile fields applicants must have filled in
          </p>
          <div className="flex flex-wrap gap-2">
            {PROFILE_FIELDS.map(f => (
              <button
                key={f.key}
                type="button"
                onClick={() => toggleRequiredField(f.key)}
                className={`px-2 py-1 text-xs border transition-colors ${
                  requiredFields.includes(f.key)
                    ? 'bg-[var(--accent-gold)]/20 border-[var(--accent-gold)] text-[var(--accent-gold)]'
                    : 'border-[var(--surface-dark)]/20 text-[var(--surface-dark)]/50 hover:border-[var(--surface-dark)]/40'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={handleSaveListing}
          disabled={savingListing}
          className="px-6 py-2 bg-[var(--accent-teal)] text-black text-xs uppercase tracking-[0.15em] font-[family-name:var(--font-terminal)] hover:bg-[var(--accent-teal)]/80 disabled:opacity-50 transition-colors"
        >
          {savingListing ? 'Saving...' : 'Save Listing'}
        </button>
      </div>

      {/* AI Settings (T20) */}
      <div className="border-t border-[var(--accent-teal)]/20 pt-6 space-y-4">
        <h3 className="text-xs uppercase tracking-[0.15em] font-[family-name:var(--font-header)] text-[var(--accent-teal)]/80">
          AI Settings
        </h3>
        <p className="text-[10px] text-[var(--surface-dark)]/40 -mt-2">
          Choose local (your own hardware) or cloud for each AI feature. System-critical AI always runs in the cloud.
        </p>

        <div>
          <label className={labelClass}>Default Provider</label>
          <select
            value={aiDefaultProvider}
            onChange={e => setAiDefaultProvider(e.target.value as AIProviderChoice)}
            className={inputClass}
          >
            <option value="cloud">Cloud</option>
            <option value="local">Local</option>
          </select>
          <p className="text-[10px] text-[var(--surface-dark)]/40 mt-1">
            Used for any feature set to &ldquo;Use default&rdquo; below.
          </p>
        </div>

        <div>
          <label className={labelClass}>Per-Feature Override</label>
          <div className="space-y-2">
            {AI_FEATURES.map(f => (
              <div key={f.key} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm text-[var(--surface-dark)]">{f.label}</div>
                  <div className="text-[10px] text-[var(--surface-dark)]/40">{f.hint}</div>
                </div>
                <select
                  value={aiOverrides[f.key] ?? 'default'}
                  onChange={e => setOverride(f.key, e.target.value as 'default' | AIProviderChoice)}
                  className={inputClass + ' w-40 flex-shrink-0'}
                >
                  <option value="default">Use default</option>
                  <option value="cloud">Cloud</option>
                  <option value="local">Local</option>
                </select>
              </div>
            ))}
            {CLOUD_ONLY_FEATURES.map(key => (
              <div key={key} className="flex items-center justify-between gap-3 opacity-60">
                <div className="min-w-0">
                  <div className="text-sm text-[var(--surface-dark)]">Forge Authoring</div>
                  <div className="text-[10px] text-[var(--surface-dark)]/40">Blueprint authoring &mdash; cloud-only</div>
                </div>
                <span className="w-40 flex-shrink-0 text-right text-xs uppercase tracking-wider text-[var(--accent-gold)]">
                  Cloud (locked)
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Local Vision Model</label>
            <input
              type="text"
              value={aiVisionModel}
              onChange={e => setAiVisionModel(e.target.value)}
              maxLength={100}
              placeholder="llava"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Local Text Model</label>
            <input
              type="text"
              value={aiTextModel}
              onChange={e => setAiTextModel(e.target.value)}
              maxLength={100}
              placeholder="gemma2:9b"
              className={inputClass}
            />
          </div>
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={aiRecursiveGenesis}
            onChange={e => setAiRecursiveGenesis(e.target.checked)}
            className="mt-0.5 accent-[var(--accent-teal)]"
          />
          <span>
            <span className={labelClass}>Recursive genesis</span>
            <span className="block text-[10px] text-white/40 leading-snug">
              Every person JEWL seeds in a character&apos;s world gets a genesis of her own in the background
              (a sketch, then the walk in sail mode — one level deep). Off = seeds stay shells until you deepen them.
            </span>
          </span>
        </label>

        <div>
          <label className={labelClass}>Thoughts in the novel view</label>
          <select
            value={aiThoughtStyle}
            onChange={e => setAiThoughtStyle(e.target.value === 'narrator' ? 'narrator' : 'inner')}
            className={inputClass}
            data-setting="thoughtStyle"
          >
            <option value="inner">The being&apos;s own words, an inner line</option>
            <option value="narrator">Reported in the narrator&apos;s voice</option>
          </select>
          <span className="block text-[10px] text-white/40 leading-snug mt-1">
            Out of a session the Terminal reads as a novel. Inner = &ldquo;I know this door.&rdquo; in italics; narrator = &ldquo;He knew this door.&rdquo;
          </span>
        </div>

        <div>
          <label className={labelClass}>Effort on rolls for your beings</label>
          <select
            value={aiRollEffort}
            onChange={e => setAiRollEffort(e.target.value === 'manual' ? 'manual' : 'ai')}
            className={inputClass}
            data-setting="rollEffort"
          >
            <option value="ai">The AI chooses (rolls resolve at once)</option>
            <option value="manual">I set it (a roll popup opens for me)</option>
          </select>
          <span className="block text-[10px] text-white/40 leading-snug mt-1">
            Applies to beings you control. A Trailblazer always sets their own Effort.
          </span>
        </div>

        <div>
          <label className={labelClass}>Trailblazer roll timeout (seconds)</label>
          <input
            type="number"
            min={10}
            max={600}
            value={aiRollTimeout}
            onChange={e => setAiRollTimeout(Number(e.target.value))}
            className={inputClass}
            data-setting="rollTimeoutSec"
          />
          <span className="block text-[10px] text-white/40 leading-snug mt-1">
            If a player does not answer their roll popup in time, the AI chooses their Effort and the card says so.
          </span>
        </div>

        <button
          type="button"
          onClick={handleSaveAI}
          disabled={savingAI}
          className="px-6 py-2 bg-[var(--accent-teal)] text-black text-xs uppercase tracking-[0.15em] font-[family-name:var(--font-terminal)] hover:bg-[var(--accent-teal)]/80 disabled:opacity-50 transition-colors"
        >
          {savingAI ? 'Saving...' : 'Save AI Settings'}
        </button>
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
