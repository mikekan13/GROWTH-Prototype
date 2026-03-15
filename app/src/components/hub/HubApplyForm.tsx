'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ProfileSummary from '@/components/profile/ProfileSummary';
import Link from 'next/link';

interface Prompt {
  id: string;
  prompt: string;
  required: boolean;
  category: string;
}

interface HubApplyFormProps {
  campaignId: string;
  campaignName: string;
  prompts: Prompt[];
  requiredFields: string[];
  userProfile: {
    username: string;
    role: string;
    profile: Record<string, unknown> | null;
  };
}

export default function HubApplyForm({
  campaignId, campaignName, prompts, requiredFields, userProfile,
}: HubApplyFormProps) {
  const router = useRouter();
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function updateResponse(promptId: string, value: string) {
    setResponses(prev => ({ ...prev, [promptId]: value }));
  }

  async function handleSubmit() {
    // Validate required prompts
    const missing = prompts.filter(p => p.required && !(responses[p.id] || '').trim());
    if (missing.length > 0) {
      setError('Please answer all required questions');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch(`/api/hub/${campaignId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          responses: prompts.map(p => ({
            promptId: p.id,
            prompt: p.prompt,
            response: responses[p.id] || '',
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to submit application');
        return;
      }

      router.push('/trailblazer');
      router.refresh();
    } catch {
      setError('Network error — please try again');
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = 'w-full bg-[var(--surface-dark)]/5 border border-[var(--surface-dark)]/20 p-2 text-sm font-[family-name:var(--font-terminal)] focus:border-[var(--accent-teal)] focus:outline-none min-h-[60px] resize-y';

  return (
    <div className="space-y-8">
      {/* Section 1: Profile Summary */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-[0.15em] font-[family-name:var(--font-header)] text-[var(--surface-dark)]/70">
            Your Profile
          </h2>
          <Link href="/profile/edit" className="text-xs text-[var(--accent-teal)] hover:underline font-[family-name:var(--font-terminal)]">
            Edit Profile
          </Link>
        </div>
        <div className="p-4 border border-[var(--surface-dark)]/10 bg-white/30">
          <ProfileSummary
            username={userProfile.username}
            role={userProfile.role}
            profile={userProfile.profile as never}
            requiredFields={requiredFields}
            showCompleteness={requiredFields.length > 0}
          />
        </div>
      </div>

      {/* Section 2: Campaign Questions */}
      <div className="space-y-4">
        <h2 className="text-xs uppercase tracking-[0.15em] font-[family-name:var(--font-header)] text-[var(--surface-dark)]/70">
          Campaign Questions — {campaignName}
        </h2>
        {prompts.map(p => (
          <div key={p.id}>
            <label className="text-sm text-[var(--surface-dark)] block mb-1">
              {p.prompt}
              {p.required && <span className="text-[var(--pillar-body)] ml-1">*</span>}
            </label>
            <textarea
              className={inputClass}
              value={responses[p.id] || ''}
              onChange={e => updateResponse(p.id, e.target.value)}
              maxLength={5000}
            />
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="text-sm text-[var(--pillar-body)] p-2 border border-[var(--pillar-body)]/20 bg-[var(--pillar-body)]/5">
          {error}
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="px-8 py-2 bg-[var(--accent-teal)] text-white text-sm font-[family-name:var(--font-terminal)] tracking-wider uppercase hover:bg-[var(--accent-teal)]/80 disabled:opacity-50 transition-colors"
      >
        {submitting ? 'Submitting...' : 'Submit Application'}
      </button>
    </div>
  );
}
