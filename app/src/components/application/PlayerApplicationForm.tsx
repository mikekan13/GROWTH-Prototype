'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface TemplatePrompt {
  id: string;
  prompt: string;
  required: boolean;
  category: string;
}

interface ResponseItem {
  promptId: string;
  prompt: string;
  response: string;
  aiExpanded?: string;
}

interface ApplicationData {
  id: string;
  status: string;
  responses: string;
  gmNotes: string | null;
}

export default function PlayerApplicationForm({ campaignId, campaignName }: { campaignId: string; campaignName: string }) {
  const router = useRouter();
  const [prompts, setPrompts] = useState<TemplatePrompt[]>([]);
  const [responses, setResponses] = useState<Record<string, ResponseItem>>({});
  const [application, setApplication] = useState<ApplicationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expandingId, setExpandingId] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [templateRes, appRes] = await Promise.all([
        fetch(`/api/campaigns/${campaignId}/application/template`),
        fetch(`/api/campaigns/${campaignId}/application`),
      ]);

      if (templateRes.ok) {
        const tData = await templateRes.json();
        setPrompts(tData.prompts || []);
      }

      if (appRes.ok) {
        const aData = await appRes.json();
        if (aData.application) {
          setApplication(aData.application);
          const saved: ResponseItem[] = JSON.parse(aData.application.responses || '[]');
          const map: Record<string, ResponseItem> = {};
          saved.forEach(r => { map[r.promptId] = r; });
          setResponses(map);
        }
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [campaignId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const updateResponse = (promptId: string, prompt: string, value: string) => {
    setResponses(prev => ({
      ...prev,
      [promptId]: { promptId, prompt, response: value, aiExpanded: prev[promptId]?.aiExpanded },
    }));
  };

  const handleExpand = async (promptId: string, prompt: string) => {
    const current = responses[promptId];
    if (!current?.response || current.response.length < 10) {
      alert('Write at least a couple sentences before expanding.');
      return;
    }

    setExpandingId(promptId);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/application/expand`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptId, prompt, response: current.response }),
      });
      if (res.ok) {
        const data = await res.json();
        setResponses(prev => ({
          ...prev,
          [promptId]: { ...prev[promptId], aiExpanded: data.expanded },
        }));
      } else {
        const data = await res.json();
        alert(data.error || 'AI expansion failed');
      }
    } catch { alert('Connection failed — is Ollama running?'); }
    finally { setExpandingId(null); }
  };

  const handleSave = async (submit: boolean) => {
    if (submit) {
      // Validate required prompts
      const missing = prompts.filter(p => p.required && (!responses[p.id] || !responses[p.id].response.trim()));
      if (missing.length > 0) {
        alert(`Please answer required prompts: ${missing.map(m => m.prompt.slice(0, 40) + '...').join(', ')}`);
        return;
      }
      setSubmitting(true);
    } else {
      setSaving(true);
    }

    const responseList = prompts
      .map(p => responses[p.id])
      .filter((r): r is ResponseItem => !!r && !!r.response.trim());

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/application`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responses: responseList, submit }),
      });
      if (res.ok) {
        const data = await res.json();
        setApplication(data.application);
        if (submit) {
          setSaveMessage('Application submitted!');
        } else {
          setSaveMessage('Draft saved.');
        }
        setTimeout(() => setSaveMessage(''), 3000);
      } else {
        const data = await res.json();
        alert(data.error || 'Save failed');
      }
    } catch { alert('Connection failed'); }
    finally { setSaving(false); setSubmitting(false); }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto p-8">
        <div className="text-sm text-[var(--surface-dark)]/40">Loading application...</div>
      </div>
    );
  }

  const isReadOnly = application?.status === 'APPROVED' || application?.status === 'DENIED' || application?.status === 'SUBMITTED';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={() => router.push('/trailblazer')}
          className="text-xs text-[var(--surface-dark)]/40 hover:text-[var(--surface-dark)]/60 uppercase tracking-wider"
        >
          &larr; Back to Portal
        </button>
        <h1 className="font-[family-name:var(--font-header)] text-3xl tracking-wider text-[var(--surface-dark)] mt-1">
          Apply to {campaignName}
        </h1>
      </div>

      {/* Status bar */}
      {application && (
        <div className={`p-3 border text-sm ${
          application.status === 'SUBMITTED' ? 'bg-[var(--accent-gold)]/10 border-[var(--accent-gold)]/30 text-[var(--accent-gold)]'
          : application.status === 'APPROVED' ? 'bg-[var(--accent-teal)]/10 border-[var(--accent-teal)]/30 text-[var(--accent-teal)]'
          : application.status === 'REVISION' ? 'bg-[var(--pillar-body)]/10 border-[var(--pillar-body)]/30 text-[var(--pillar-body)]'
          : application.status === 'DENIED' ? 'bg-red-100 border-red-300 text-red-600'
          : 'bg-white/40 border-[var(--surface-dark)]/10 text-[var(--surface-dark)]/60'
        }`}>
          <span className="text-xs uppercase tracking-wider font-bold">Status: {application.status}</span>
          {application.status === 'SUBMITTED' && (
            <span className="ml-2 text-xs"> — Your application is being reviewed by the Watcher.</span>
          )}
          {application.status === 'APPROVED' && (
            <span className="ml-2 text-xs"> — Welcome, Trailblazer. The Watcher will create your character.</span>
          )}
        </div>
      )}

      {/* GM Revision notes */}
      {application?.gmNotes && application.status === 'REVISION' && (
        <div className="p-3 bg-[var(--accent-gold)]/10 border border-[var(--accent-gold)]/30">
          <div className="text-xs uppercase tracking-wider text-[var(--accent-gold)] font-bold mb-1">Watcher Notes</div>
          <div className="text-sm text-[var(--surface-dark)]/80 whitespace-pre-wrap">{application.gmNotes}</div>
        </div>
      )}

      {/* Prompts */}
      <div className="space-y-6">
        {prompts.map(p => {
          const current = responses[p.id];
          return (
            <div key={p.id} className="space-y-2">
              <label className="block text-sm font-bold text-[var(--surface-dark)]">
                {p.prompt}
                {p.required && <span className="text-[var(--pillar-body)] ml-1">*</span>}
              </label>
              <span className="text-[10px] uppercase tracking-wider text-[var(--surface-dark)]/30">{p.category}</span>

              <textarea
                value={current?.response || ''}
                onChange={e => updateResponse(p.id, p.prompt, e.target.value)}
                disabled={isReadOnly}
                placeholder="Share your story..."
                className="w-full border border-[var(--surface-dark)]/10 p-3 text-sm resize-none bg-white disabled:bg-gray-50 disabled:text-[var(--surface-dark)]/40"
                rows={4}
              />

              {/* AI expanded version */}
              {current?.aiExpanded && (
                <div className="p-3 bg-[var(--accent-teal)]/5 border border-[var(--accent-teal)]/20">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] uppercase tracking-wider text-[var(--accent-teal)] font-[family-name:var(--font-terminal)]">
                      AI-Enhanced Version
                    </span>
                    <button
                      onClick={() => setResponses(prev => ({
                        ...prev,
                        [p.id]: { ...prev[p.id], aiExpanded: undefined },
                      }))}
                      className="text-[9px] text-[var(--surface-dark)]/30 hover:text-[var(--pillar-body)]"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="text-sm text-[var(--surface-dark)]/80 whitespace-pre-wrap leading-relaxed">
                    {current.aiExpanded}
                  </div>
                </div>
              )}

              {/* Enhance button */}
              {!isReadOnly && (
                <button
                  onClick={() => handleExpand(p.id, p.prompt)}
                  disabled={expandingId === p.id || !current?.response}
                  className="text-xs text-[var(--accent-teal)] hover:underline font-[family-name:var(--font-terminal)] disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {expandingId === p.id ? 'Enhancing...' : current?.aiExpanded ? 'Re-enhance with AI' : 'Enhance with AI'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Action buttons */}
      {!isReadOnly && (
        <div className="flex items-center gap-3 pt-4 border-t border-[var(--surface-dark)]/10">
          <button
            onClick={() => handleSave(false)}
            disabled={saving || submitting}
            className="px-4 py-2 text-xs uppercase tracking-[0.1em] font-[family-name:var(--font-terminal)] border border-[var(--surface-dark)]/20 text-[var(--surface-dark)]/60 hover:border-[var(--accent-teal)]/40 hover:text-[var(--accent-teal)] transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Draft'}
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={saving || submitting}
            className="px-4 py-2 text-xs uppercase tracking-[0.1em] font-[family-name:var(--font-terminal)] bg-[var(--accent-teal)] text-black hover:brightness-110 disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Submit Application'}
          </button>
          {saveMessage && (
            <span className="text-xs text-[var(--accent-teal)]">{saveMessage}</span>
          )}
        </div>
      )}
    </div>
  );
}
