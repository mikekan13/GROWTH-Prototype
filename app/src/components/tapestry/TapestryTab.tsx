'use client';

import { useState, useEffect, useCallback } from 'react';

interface CanvasNode {
  id: string;
  name: string;
  type: string;
  characterData?: unknown;
}

interface TapestryTabProps {
  campaignId: string;
  isGM: boolean;
  nodes: CanvasNode[];
}

// --- Application types ---
interface ApplicationResponse {
  promptId: string;
  prompt: string;
  response: string;
  aiExpanded?: string;
}

interface Application {
  id: string;
  status: string;
  responses: string; // JSON
  gmNotes: string | null;
  profileSnapshot: string | null;
  createdAt: string;
  updatedAt: string;
  member: {
    user: { id: string; username: string };
  };
}

interface TemplatePrompt {
  id: string;
  prompt: string;
  required: boolean;
  category: string;
}

type SubTab = 'applications' | 'grovines';

const CATEGORIES = ['backstory', 'character', 'personality', 'mechanics', 'meta', 'interest', 'safety', 'other'];

// --- Application Template Editor ---
function TemplateEditor({ campaignId }: { campaignId: string }) {
  const [prompts, setPrompts] = useState<TemplatePrompt[]>([]);
  const [isDefault, setIsDefault] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [message, setMessage] = useState('');

  const fetchTemplate = useCallback(async () => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/application/template`);
      if (res.ok) {
        const data = await res.json();
        setPrompts(data.prompts || []);
        setIsDefault(data.isDefault);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [campaignId]);

  useEffect(() => { fetchTemplate(); }, [fetchTemplate]);

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/application/template`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompts }),
      });
      if (res.ok) {
        setMessage('Template saved');
        setIsDefault(false);
        setTimeout(() => setMessage(''), 3000);
      } else {
        const data = await res.json();
        setMessage(data.error || 'Save failed');
      }
    } catch { setMessage('Network error'); }
    finally { setSaving(false); }
  };

  const addPrompt = () => {
    if (prompts.length >= 20) return;
    setPrompts([...prompts, {
      id: `custom-${Date.now()}`,
      prompt: '',
      required: false,
      category: 'backstory',
    }]);
  };

  const removePrompt = (index: number) => {
    setPrompts(prompts.filter((_, i) => i !== index));
  };

  const updatePrompt = (index: number, field: keyof TemplatePrompt, value: string | boolean) => {
    setPrompts(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p));
  };

  const movePrompt = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= prompts.length) return;
    const updated = [...prompts];
    [updated[index], updated[target]] = [updated[target], updated[index]];
    setPrompts(updated);
  };

  if (loading) return null;

  return (
    <div className="mb-6 border border-white/10" style={{ background: 'rgba(0,0,0,0.2)' }}>
      <button
        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-white/5 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-[9px] font-[family-name:var(--font-terminal)] tracking-[0.2em] uppercase text-[var(--accent-gold)]">
          Application Questions
        </span>
        {isDefault && (
          <span className="text-[8px] font-[family-name:var(--font-terminal)] text-white/20 uppercase tracking-wider">
            (defaults)
          </span>
        )}
        <span className="text-white/15 text-[9px] font-[family-name:var(--font-terminal)] ml-auto">
          {prompts.length} question{prompts.length !== 1 ? 's' : ''}
        </span>
        <span className="text-white/20 text-[10px]">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 border-t border-white/5 space-y-2 mt-0">
          <div className="text-[8px] text-white/20 font-[family-name:var(--font-terminal)] tracking-wider mt-2">
            These questions appear when players apply to your campaign.
          </div>

          {prompts.map((p, i) => (
            <div key={p.id} className="flex gap-2 items-start p-2 border border-white/5" style={{ background: 'rgba(0,0,0,0.2)' }}>
              {/* Reorder */}
              <div className="flex flex-col gap-0.5 pt-1">
                <button
                  onClick={() => movePrompt(i, -1)}
                  disabled={i === 0}
                  className="text-white/20 hover:text-white/50 disabled:opacity-20 text-[9px] leading-none"
                >▲</button>
                <button
                  onClick={() => movePrompt(i, 1)}
                  disabled={i === prompts.length - 1}
                  className="text-white/20 hover:text-white/50 disabled:opacity-20 text-[9px] leading-none"
                >▼</button>
              </div>

              <div className="flex-1 space-y-1">
                <textarea
                  value={p.prompt}
                  onChange={e => updatePrompt(i, 'prompt', e.target.value)}
                  placeholder="Enter your question..."
                  maxLength={500}
                  rows={2}
                  className="w-full bg-black/40 border border-white/10 p-1.5 text-[11px] text-white/70 font-[family-name:var(--font-terminal)] resize-none focus:border-[var(--accent-teal)]/40 focus:outline-none"
                />
                <div className="flex items-center gap-3">
                  <select
                    value={p.category}
                    onChange={e => updatePrompt(i, 'category', e.target.value)}
                    className="bg-black/40 border border-white/10 px-1.5 py-0.5 text-[9px] text-white/50 font-[family-name:var(--font-terminal)] focus:outline-none"
                  >
                    {CATEGORIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={p.required}
                      onChange={e => updatePrompt(i, 'required', e.target.checked)}
                      className="accent-[var(--accent-teal)]"
                    />
                    <span className="text-[9px] text-white/40 font-[family-name:var(--font-terminal)] uppercase tracking-wider">
                      Required
                    </span>
                  </label>
                </div>
              </div>

              <button
                onClick={() => removePrompt(i)}
                className="text-white/15 hover:text-[#E8585A] text-[11px] px-1 pt-1 transition-colors"
                title="Remove question"
              >✕</button>
            </div>
          ))}

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={addPrompt}
              disabled={prompts.length >= 20}
              className="px-3 py-1 text-[10px] uppercase tracking-[0.1em] font-[family-name:var(--font-terminal)] border border-white/10 text-white/30 hover:border-[var(--accent-teal)]/40 hover:text-[var(--accent-teal)] disabled:opacity-30 transition-colors"
            >
              + Add Question
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1 text-[10px] uppercase tracking-[0.1em] font-[family-name:var(--font-terminal)] bg-[var(--accent-teal)] text-black hover:brightness-110 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Save Template'}
            </button>
            {message && (
              <span className="text-[9px] text-[var(--accent-teal)] font-[family-name:var(--font-terminal)]">
                {message}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Application Review Panel ---
function ApplicationReviewPanel({ campaignId }: { campaignId: string }) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [gmNotes, setGmNotes] = useState<Record<string, string>>({});

  const fetchApplications = useCallback(async () => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/applications`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setApplications(data.applications || []);
    } catch {
      setError('Failed to load applications');
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => { fetchApplications(); }, [fetchApplications]);

  const handleReview = async (appId: string, action: 'APPROVED' | 'REVISION' | 'DENIED') => {
    setReviewingId(appId);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/applications/${appId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, gmNotes: gmNotes[appId] || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Review failed');
        return;
      }
      // Refresh list
      await fetchApplications();
      setExpandedId(null);
    } catch {
      alert('Network error');
    } finally {
      setReviewingId(null);
    }
  };

  const parseResponses = (json: string): ApplicationResponse[] => {
    try { return JSON.parse(json); } catch { return []; }
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-white/20 text-[10px] font-[family-name:var(--font-terminal)]">
        Loading applications...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-[#E8585A]/60 text-[10px] font-[family-name:var(--font-terminal)]">
        {error}
      </div>
    );
  }

  // Group by status: SUBMITTED first, then REVISION, DRAFT, APPROVED, DENIED
  const statusOrder: Record<string, number> = { SUBMITTED: 0, REVISION: 1, DRAFT: 2, APPROVED: 3, DENIED: 4 };
  const sorted = [...applications].sort((a, b) => (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5));

  const submitted = sorted.filter(a => a.status === 'SUBMITTED');
  const revision = sorted.filter(a => a.status === 'REVISION');
  const approved = sorted.filter(a => a.status === 'APPROVED');
  const denied = sorted.filter(a => a.status === 'DENIED');
  const drafts = sorted.filter(a => a.status === 'DRAFT');

  if (applications.length === 0) {
    return (
      <div className="text-center py-12 text-white/20 text-[10px] font-[family-name:var(--font-terminal)]">
        No applications yet. List your campaign on the hub to receive applications.
      </div>
    );
  }

  const statusColor = (status: string) => {
    switch (status) {
      case 'SUBMITTED': return 'var(--accent-gold)';
      case 'APPROVED': return 'var(--accent-teal)';
      case 'REVISION': return '#E8585A';
      case 'DENIED': return '#888';
      case 'DRAFT': return 'rgba(255,255,255,0.25)';
      default: return 'rgba(255,255,255,0.25)';
    }
  };

  const renderGroup = (label: string, apps: Application[], color: string) => {
    if (apps.length === 0) return null;
    return (
      <div className="mb-6">
        <div
          className="text-[9px] font-[family-name:var(--font-terminal)] tracking-[0.2em] uppercase mb-2 pb-1 border-b"
          style={{ color, borderColor: `${color}33` }}
        >
          {label} ({apps.length})
        </div>
        <div className="space-y-2">
          {apps.map(app => {
            const isExpanded = expandedId === app.id;
            const responses = parseResponses(app.responses);
            const isActionable = app.status === 'SUBMITTED' || app.status === 'REVISION';
            return (
              <div
                key={app.id}
                className="border"
                style={{ borderColor: `${statusColor(app.status)}33`, background: 'rgba(0,0,0,0.3)' }}
              >
                {/* Header row */}
                <button
                  className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-white/5 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : app.id)}
                >
                  <span className="text-white text-xs font-bold font-[family-name:var(--font-header)] tracking-wider">
                    {app.member.user.username}
                  </span>
                  <span
                    className="text-[8px] uppercase tracking-[0.15em] font-[family-name:var(--font-terminal)] px-1.5 py-0.5"
                    style={{ background: `${statusColor(app.status)}20`, color: statusColor(app.status) }}
                  >
                    {app.status}
                  </span>
                  <span className="text-white/15 text-[9px] font-[family-name:var(--font-terminal)] ml-auto">
                    {responses.length} response{responses.length !== 1 ? 's' : ''}
                  </span>
                  <span className="text-white/20 text-[10px]">
                    {isExpanded ? '▾' : '▸'}
                  </span>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-3 pb-3 space-y-3 border-t border-white/5">
                    {/* Responses */}
                    {responses.map((r, i) => (
                      <div key={r.promptId || i} className="mt-3">
                        <div className="text-[9px] uppercase tracking-wider text-[var(--accent-teal)]/60 font-[family-name:var(--font-terminal)] mb-1">
                          {r.prompt}
                        </div>
                        <div className="text-white/70 text-[11px] leading-relaxed whitespace-pre-wrap font-[family-name:var(--font-terminal)]">
                          {r.response || <span className="text-white/15 italic">No response</span>}
                        </div>
                        {r.aiExpanded && (
                          <div className="mt-1 pl-2 border-l border-[var(--accent-teal)]/20">
                            <div className="text-[8px] text-[var(--accent-teal)]/40 font-[family-name:var(--font-terminal)] uppercase tracking-wider mb-0.5">
                              AI Enhanced
                            </div>
                            <div className="text-white/50 text-[10px] leading-relaxed whitespace-pre-wrap font-[family-name:var(--font-terminal)]">
                              {r.aiExpanded}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Existing GM notes */}
                    {app.gmNotes && (
                      <div className="p-2 border border-[var(--accent-gold)]/20" style={{ background: 'rgba(208,168,48,0.05)' }}>
                        <div className="text-[8px] text-[var(--accent-gold)] font-[family-name:var(--font-terminal)] uppercase tracking-wider mb-1">
                          Your Notes
                        </div>
                        <div className="text-white/60 text-[10px] whitespace-pre-wrap">{app.gmNotes}</div>
                      </div>
                    )}

                    {/* Action area — only for actionable applications */}
                    {isActionable && (
                      <div className="pt-2 border-t border-white/5 space-y-2">
                        <textarea
                          value={gmNotes[app.id] || ''}
                          onChange={e => setGmNotes(prev => ({ ...prev, [app.id]: e.target.value }))}
                          placeholder="Notes for the applicant (optional)..."
                          className="w-full bg-black/40 border border-white/10 p-2 text-[11px] text-white/70 font-[family-name:var(--font-terminal)] resize-none focus:border-[var(--accent-teal)]/40 focus:outline-none"
                          rows={2}
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleReview(app.id, 'APPROVED')}
                            disabled={reviewingId === app.id}
                            className="px-3 py-1 text-[10px] uppercase tracking-[0.1em] font-[family-name:var(--font-terminal)] bg-[var(--accent-teal)] text-black hover:brightness-110 disabled:opacity-50 transition-colors"
                          >
                            {reviewingId === app.id ? '...' : 'Approve'}
                          </button>
                          <button
                            onClick={() => handleReview(app.id, 'REVISION')}
                            disabled={reviewingId === app.id}
                            className="px-3 py-1 text-[10px] uppercase tracking-[0.1em] font-[family-name:var(--font-terminal)] border border-[var(--accent-gold)]/40 text-[var(--accent-gold)] hover:bg-[var(--accent-gold)]/10 disabled:opacity-50 transition-colors"
                          >
                            {reviewingId === app.id ? '...' : 'Request Revision'}
                          </button>
                          <button
                            onClick={() => handleReview(app.id, 'DENIED')}
                            disabled={reviewingId === app.id}
                            className="px-3 py-1 text-[10px] uppercase tracking-[0.1em] font-[family-name:var(--font-terminal)] border border-white/10 text-white/30 hover:border-[#E8585A]/40 hover:text-[#E8585A] disabled:opacity-50 transition-colors"
                          >
                            {reviewingId === app.id ? '...' : 'Deny'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <>
      {renderGroup('Awaiting Review', submitted, 'var(--accent-gold)')}
      {renderGroup('Revision Requested', revision, '#E8585A')}
      {renderGroup('Drafts', drafts, 'rgba(255,255,255,0.25)')}
      {renderGroup('Approved', approved, 'var(--accent-teal)')}
      {renderGroup('Denied', denied, '#888')}
    </>
  );
}

// --- Combined Applications + Template Panel ---
function ApplicationsPanel({ campaignId }: { campaignId: string }) {
  return (
    <>
      <TemplateEditor campaignId={campaignId} />
      <ApplicationReviewPanel campaignId={campaignId} />
    </>
  );
}

// --- GRO.vines Panel ---
function GrovinesPanel({ nodes }: { nodes: CanvasNode[] }) {
  const characterNodes = nodes.filter(n => n.type === 'character' && n.characterData);

  const nodesWithActiveVines = characterNodes.filter(node => {
    const charData = node.characterData as Record<string, unknown>;
    const grovines = (charData?.grovines as Array<{ status: string }>) || [];
    return grovines.some(v => v.status === 'active');
  });

  if (nodesWithActiveVines.length === 0) {
    return (
      <div className="text-center py-12 text-white/20 text-[10px] font-[family-name:var(--font-terminal)]">
        No active GRO.vines. Characters can set goals during play or Harvests.
      </div>
    );
  }

  return (
    <>
      {nodesWithActiveVines.map(node => {
        const charData = node.characterData as Record<string, unknown>;
        const grovines = (charData?.grovines as Array<{ id: string; goal: string; resistance: string; opportunity: string; status: string }>) || [];
        const active = grovines.filter(v => v.status === 'active');
        return (
          <div key={node.id} className="mb-4">
            <div className="text-white text-xs font-bold font-[family-name:var(--font-header)] tracking-wider uppercase mb-2">
              {node.name}
            </div>
            {active.map(vine => (
              <div key={vine.id} className="ml-4 mb-2 p-3 border-l-2 border-[var(--accent-teal)]/30" style={{ background: 'rgba(34,171,148,0.05)' }}>
                <div className="text-white text-[11px] font-bold mb-1">{vine.goal}</div>
                <div className="grid grid-cols-3 gap-3 text-[9px]">
                  <div>
                    <span className="text-[#4ade80] font-bold">G</span>
                    <span className="text-white/40 ml-1">{vine.goal.length > 30 ? `${vine.goal.substring(0, 30)}...` : vine.goal}</span>
                  </div>
                  <div>
                    <span className="text-[#E8585A] font-bold">R</span>
                    <span className="text-white/40 ml-1">{vine.resistance || 'Hidden'}</span>
                  </div>
                  <div>
                    <span className="text-[#ffcc78] font-bold">O</span>
                    <span className="text-white/40 ml-1">{vine.opportunity || 'Awaiting'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}

// --- Main TapestryTab ---
export default function TapestryTab({ campaignId, isGM, nodes }: TapestryTabProps) {
  const [subTab, setSubTab] = useState<SubTab>(isGM ? 'applications' : 'grovines');

  const subTabs: { key: SubTab; label: string; gmOnly?: boolean }[] = [
    ...(isGM ? [{ key: 'applications' as SubTab, label: 'Applications', gmOnly: true }] : []),
    { key: 'grovines', label: 'GRO.vines' },
  ];

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--surface-dark)' }}>
      {/* Header with sub-tabs */}
      <div className="flex items-center gap-1 px-6 pt-4 pb-0">
        {subTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setSubTab(tab.key)}
            className={`text-[10px] font-[family-name:var(--font-terminal)] tracking-[0.2em] uppercase px-4 py-1.5 transition-colors ${
              subTab === tab.key
                ? 'text-[var(--accent-teal)] border-b-2 border-[var(--accent-teal)]'
                : 'text-white/25 hover:text-white/40 border-b-2 border-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}
        <span className="text-white/15 text-[8px] font-[family-name:var(--font-terminal)] tracking-wider ml-auto">
          TAPESTRY://narrative.threads
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          {subTab === 'applications' && isGM && (
            <ApplicationsPanel campaignId={campaignId} />
          )}
          {subTab === 'grovines' && (
            <GrovinesPanel nodes={nodes} />
          )}
        </div>
      </div>
    </div>
  );
}
