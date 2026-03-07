'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface BackstoryPrompt {
  prompt: string;
  response: string;
}

// Default narrative prompts — GM can add custom ones per campaign
const DEFAULT_PROMPTS = [
  'Where did you grow up? Describe your childhood.',
  'Who raised you? What was your relationship with them?',
  'What cultural or social group do you belong to?',
  'Describe your physical appearance — what do people notice first?',
  'What formative event shaped who you are today?',
  'What drives you? What do you want more than anything?',
  'What are you afraid of? What do you avoid?',
  'Is there anything else your Watcher should know?',
];

interface BackstoryEditorProps {
  characterId: string;
  characterName: string;
  existingResponses?: BackstoryPrompt[];
  existingStatus?: string;
  gmNotes?: string | null;
  customPrompts?: string[];
}

export default function BackstoryEditor({
  characterId,
  characterName,
  existingResponses,
  existingStatus,
  gmNotes,
  customPrompts,
}: BackstoryEditorProps) {
  const router = useRouter();

  // Merge default prompts with GM custom prompts
  const allPrompts = [...DEFAULT_PROMPTS, ...(customPrompts || [])];

  // Initialize responses from existing data or create empty entries
  const initResponses = (): BackstoryPrompt[] => {
    if (existingResponses?.length) {
      // Preserve existing responses, add any new prompts
      const existing = new Map(existingResponses.map(r => [r.prompt, r.response]));
      return allPrompts.map(prompt => ({
        prompt,
        response: existing.get(prompt) || '',
      }));
    }
    return allPrompts.map(prompt => ({ prompt, response: '' }));
  };

  const [responses, setResponses] = useState<BackstoryPrompt[]>(initResponses);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isLocked = existingStatus === 'APPROVED';

  function updateResponse(index: number, value: string) {
    setResponses(prev => prev.map((r, i) => i === index ? { ...r, response: value } : r));
  }

  async function handleSave(submit: boolean) {
    // Filter out empty responses for saving
    const filledResponses = responses.filter(r => r.response.trim());

    if (submit && filledResponses.length < 3) {
      setError('Please answer at least 3 prompts before submitting.');
      return;
    }

    setSaving(true);
    setError('');
    setSaved(false);

    const res = await fetch(`/api/characters/${characterId}/backstory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ responses: filledResponses, submit }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || 'Failed to save');
      setSaving(false);
      return;
    }

    setSaving(false);
    setSaved(true);
    if (submit) router.refresh();
  }

  const answeredCount = responses.filter(r => r.response.trim()).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="section-badge inline-block text-sm">
          Backstory: {characterName}
        </div>
        {existingStatus && (
          <span className={`text-xs uppercase tracking-wider ${
            existingStatus === 'APPROVED' ? 'text-[var(--accent-teal)]'
            : existingStatus === 'REVISION' ? 'text-[var(--accent-coral)]'
            : existingStatus === 'SUBMITTED' ? 'text-[var(--krma-gold)]'
            : 'text-[var(--surface-dark)]/40'
          }`}>
            {existingStatus}
          </span>
        )}
      </div>

      {gmNotes && existingStatus === 'REVISION' && (
        <div className="bg-[var(--accent-coral)]/10 border border-[var(--accent-coral)]/30 p-3">
          <div className="text-xs uppercase tracking-wider text-[var(--accent-coral)] mb-1">Watcher Notes</div>
          <p className="text-sm whitespace-pre-wrap">{gmNotes}</p>
        </div>
      )}

      <p className="text-xs text-[var(--surface-dark)]/60">
        Answer the prompts below to build your character&apos;s backstory. You don&apos;t need to answer every question —
        focus on what feels important. Your Watcher will use this to craft the mechanical character.
      </p>

      <div className="text-xs text-[var(--surface-dark)]/40">
        {answeredCount} of {responses.length} prompts answered
      </div>

      {/* Prompt sections */}
      <div className="space-y-4">
        {responses.map((r, i) => (
          <div key={i}>
            <label className="text-sm font-bold text-[var(--surface-dark)] block mb-1">
              {r.prompt}
            </label>
            <textarea
              value={r.response}
              onChange={e => updateResponse(i, e.target.value)}
              disabled={isLocked}
              rows={3}
              className="w-full px-3 py-2 bg-white/60 border border-[var(--surface-dark)]/20 text-sm leading-relaxed disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-[var(--accent-coral)]">{error}</p>}
      {saved && <p className="text-sm text-[var(--accent-teal)]">Saved.</p>}

      {!isLocked && (
        <div className="flex gap-3">
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            className="px-4 py-2 text-sm text-[var(--surface-dark)]/60 border border-[var(--surface-dark)]/20 disabled:opacity-50"
          >
            Save Draft
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={saving}
            className="px-6 py-2 bg-[var(--surface-dark)] text-[var(--accent-gold)] text-sm uppercase tracking-wider disabled:opacity-50"
          >
            {saving ? 'Submitting...' : 'Submit for Review'}
          </button>
        </div>
      )}

      {isLocked && (
        <div className="highlight-bar text-sm text-[var(--accent-teal)]">
          Backstory approved. Your Watcher is building your character sheet.
        </div>
      )}
    </div>
  );
}
