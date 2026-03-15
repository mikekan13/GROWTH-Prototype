'use client';

import { useState, useEffect, useCallback } from 'react';

interface ApplicationResponse {
  promptId: string;
  prompt: string;
  response: string;
  aiExpanded?: string;
}

interface Application {
  id: string;
  status: string;
  responses: string;
  gmNotes: string | null;
  createdAt: string;
  updatedAt: string;
  member: {
    user: { id: string; username: string };
  };
}

export default function ApplicationReviewPanel({ campaignId }: { campaignId: string }) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchApplications = useCallback(async () => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/applications`);
      if (res.ok) {
        const data = await res.json();
        setApplications(data.applications || []);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [campaignId]);

  useEffect(() => { fetchApplications(); }, [fetchApplications]);

  const handleReview = async (appId: string, action: 'APPROVED' | 'REVISION' | 'DENIED') => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/applications/${appId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, gmNotes: reviewNotes || undefined }),
      });
      if (res.ok) {
        setReviewNotes('');
        setExpandedId(null);
        fetchApplications();
      } else {
        const data = await res.json();
        alert(data.error || 'Review failed');
      }
    } catch { alert('Connection failed'); }
    finally { setSubmitting(false); }
  };

  const pending = applications.filter(a => a.status === 'SUBMITTED');
  const others = applications.filter(a => a.status !== 'SUBMITTED');

  if (loading) {
    return (
      <div className="text-center py-4 text-white/20 text-[10px] font-[family-name:var(--font-terminal)]">
        Loading applications...
      </div>
    );
  }

  if (applications.length === 0) {
    return (
      <div>
        <div className="text-[var(--accent-gold)] text-[10px] font-[family-name:var(--font-terminal)] tracking-[0.2em] uppercase mb-3 border-b border-[var(--accent-gold)]/20 pb-1">
          Trailblazer Applications
        </div>
        <div className="text-center py-6 text-white/20 text-[10px] font-[family-name:var(--font-terminal)]">
          No applications yet. Share your invite code with Trailblazers.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="text-[var(--accent-gold)] text-[10px] font-[family-name:var(--font-terminal)] tracking-[0.2em] uppercase mb-3 border-b border-[var(--accent-gold)]/20 pb-1">
        Trailblazer Applications
        {pending.length > 0 && (
          <span className="ml-2 px-1.5 py-0.5 bg-[var(--accent-gold)] text-black text-[8px] font-bold">
            {pending.length} PENDING
          </span>
        )}
      </div>

      <div className="space-y-2">
        {[...pending, ...others].map(app => {
          const responses: ApplicationResponse[] = JSON.parse(app.responses || '[]');
          const isExpanded = expandedId === app.id;

          return (
            <div key={app.id} className="border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
              {/* Header row */}
              <button
                onClick={() => { setExpandedId(isExpanded ? null : app.id); setReviewNotes(app.gmNotes || ''); }}
                className="w-full flex items-center justify-between p-3 text-left hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-white text-xs font-bold font-[family-name:var(--font-header)] tracking-wider uppercase">
                    {app.member.user.username}
                  </span>
                  <span className={`text-[8px] uppercase tracking-wider px-1.5 py-0.5 ${
                    app.status === 'SUBMITTED' ? 'bg-[var(--accent-gold)]/20 text-[var(--accent-gold)]'
                    : app.status === 'APPROVED' ? 'bg-[var(--accent-teal)]/20 text-[var(--accent-teal)]'
                    : app.status === 'REVISION' ? 'bg-[var(--pillar-body)]/20 text-[var(--pillar-body)]'
                    : app.status === 'DENIED' ? 'bg-red-500/20 text-red-400'
                    : 'bg-white/10 text-white/40'
                  }`}>
                    {app.status}
                  </span>
                </div>
                <span className="text-white/20 text-[9px]">{isExpanded ? '\u25B2' : '\u25BC'}</span>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="px-3 pb-3 space-y-3">
                  {responses.map((r, i) => (
                    <div key={r.promptId || i} className="border-l-2 border-[var(--accent-teal)]/20 pl-3">
                      <div className="text-[var(--accent-teal)]/60 text-[9px] font-[family-name:var(--font-terminal)] mb-1">
                        {r.prompt}
                      </div>
                      <div className="text-white/80 text-[11px] leading-relaxed whitespace-pre-wrap">
                        {r.aiExpanded || r.response}
                      </div>
                      {r.aiExpanded && (
                        <details className="mt-1">
                          <summary className="text-[8px] text-white/20 cursor-pointer font-[family-name:var(--font-terminal)]">
                            Original response
                          </summary>
                          <div className="text-white/30 text-[10px] mt-1 whitespace-pre-wrap">{r.response}</div>
                        </details>
                      )}
                    </div>
                  ))}

                  {/* Review controls */}
                  {(app.status === 'SUBMITTED' || app.status === 'REVISION') && (
                    <div className="mt-4 space-y-2">
                      <textarea
                        value={reviewNotes}
                        onChange={e => setReviewNotes(e.target.value)}
                        placeholder="Notes for the Trailblazer (visible on revision)..."
                        className="w-full bg-black/30 border border-white/10 text-white text-[11px] p-2 resize-none font-[family-name:var(--font-terminal)]"
                        rows={3}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleReview(app.id, 'APPROVED')}
                          disabled={submitting}
                          className="px-3 py-1.5 bg-[var(--accent-teal)] text-black text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-terminal)] hover:brightness-110 disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleReview(app.id, 'REVISION')}
                          disabled={submitting}
                          className="px-3 py-1.5 bg-[var(--accent-gold)] text-black text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-terminal)] hover:brightness-110 disabled:opacity-50"
                        >
                          Request Revision
                        </button>
                        <button
                          onClick={() => handleReview(app.id, 'DENIED')}
                          disabled={submitting}
                          className="px-3 py-1.5 bg-[var(--pillar-body)] text-white text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-terminal)] hover:brightness-110 disabled:opacity-50"
                        >
                          Deny
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Existing GM notes (for non-pending) */}
                  {app.gmNotes && app.status !== 'SUBMITTED' && (
                    <div className="mt-2 p-2 bg-white/5 border-l-2 border-[var(--accent-gold)]/40">
                      <div className="text-[8px] text-[var(--accent-gold)] uppercase tracking-wider mb-1 font-[family-name:var(--font-terminal)]">Watcher Notes</div>
                      <div className="text-white/50 text-[10px] whitespace-pre-wrap">{app.gmNotes}</div>
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
}
