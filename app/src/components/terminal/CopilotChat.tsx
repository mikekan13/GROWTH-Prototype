'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface CopilotAction {
  id: string;
  type: string;
  description: string;
  params: Record<string, unknown>;
  status: 'pending' | 'confirmed' | 'cancelled';
}

interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  username?: string;
  actions: CopilotAction[];
  createdAt: string;
}

interface CopilotChatProps {
  campaignId: string;
  visible: boolean;
  userId?: string;
  username?: string;
  userRole?: string;
}

export default function CopilotChat({ campaignId, visible, username, userRole }: CopilotChatProps) {
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch history on mount
  useEffect(() => {
    async function fetchHistory() {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/copilot/history`);
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages || []);
        }
      } catch { /* silent */ }
      finally { setLoadingHistory(false); }
    }
    fetchHistory();
  }, [campaignId]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when tab becomes visible
  useEffect(() => {
    if (visible) inputRef.current?.focus();
  }, [visible]);

  const handleSend = useCallback(async () => {
    const msg = input.trim();
    if (!msg || loading) return;

    setInput('');
    setLoading(true);

    // Optimistic user message
    const tempId = `temp-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: tempId,
      role: 'user',
      content: msg,
      username: username || 'You',
      actions: [],
      createdAt: new Date().toISOString(),
    }]);

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/copilot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [...prev, {
          id: `resp-${Date.now()}`,
          role: 'assistant',
          content: data.message,
          actions: data.actions || [],
          createdAt: new Date().toISOString(),
        }]);
      } else {
        const data = await res.json().catch(() => ({ error: 'Unknown error' }));
        setMessages(prev => [...prev, {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `Error: ${data.error || 'Failed to get response'}`,
          actions: [],
          createdAt: new Date().toISOString(),
        }]);
      }
    } catch {
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: 'Error: Connection failed — is Ollama running?',
        actions: [],
        createdAt: new Date().toISOString(),
      }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, campaignId, username]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAction = async (action: CopilotAction, confirm: boolean) => {
    // Update action status locally
    setMessages(prev => prev.map(m => ({
      ...m,
      actions: m.actions.map(a =>
        a.id === action.id ? { ...a, status: confirm ? 'confirmed' as const : 'cancelled' as const } : a
      ),
    })));

    if (!confirm) return;

    // Execute the action via existing API endpoints
    try {
      let endpoint = '';
      let body: Record<string, unknown> = {};

      switch (action.type) {
        case 'create_forge_item':
          // Forge blueprints MUST go through the chain (Selva → Creator →
          // Kai → Et'herling). Author + confirm in two calls. Description
          // is taken from action.params.data.description, falling back to
          // a stringified data blob if the copilot only provided structured
          // hints.
          {
            const data = (action.params.data ?? {}) as Record<string, unknown>;
            const description =
              typeof data.description === 'string' && data.description.trim()
                ? data.description
                : JSON.stringify(data) || `${action.params.name} (auto-described)`;
            const authorRes = await fetch(`/api/campaigns/${campaignId}/forge/author`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: action.params.type || 'skill',
                name: action.params.name,
                description,
              }),
            });
            if (!authorRes.ok) {
              const err = await authorRes.json().catch(() => ({}));
              setMessages(prev => [...prev, {
                id: `act-err-${Date.now()}`,
                role: 'assistant',
                content: `Forge chain rejected the request: ${err.error || 'unknown error'}`,
                actions: [],
                createdAt: new Date().toISOString(),
              }]);
              return;
            }
            const { result } = await authorRes.json();
            endpoint = `/api/campaigns/${campaignId}/forge/author`;
            body = {
              type: result.type,
              name: result.canonicalName,
              data: result.data,
              karmicValue: result.suggestedKV,
            };
            // PUT to confirm (handled by the shared fetch below — note the
            // METHOD override via _method for clarity, but we'll just call
            // PUT explicitly).
            const confirmRes = await fetch(endpoint, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
            if (!confirmRes.ok) {
              const err = await confirmRes.json().catch(() => ({}));
              setMessages(prev => [...prev, {
                id: `act-err-${Date.now()}`,
                role: 'assistant',
                content: `Failed to persist forged blueprint: ${err.error || 'unknown error'}`,
                actions: [],
                createdAt: new Date().toISOString(),
              }]);
            } else {
              setMessages(prev => [...prev, {
                id: `act-ok-${Date.now()}`,
                role: 'assistant',
                content: `Forged "${result.canonicalName}" (${result.type}). KV ${result.suggestedKV}. Awaiting publish from the forge.`,
                actions: [],
                createdAt: new Date().toISOString(),
              }]);
            }
            return; // Skip the generic POST below — both calls handled inline.
          }
        case 'create_location':
          endpoint = `/api/campaigns/${campaignId}/locations`;
          body = {
            name: action.params.name,
            type: action.params.type || 'point_of_interest',
            data: action.params.data || {},
          };
          break;
        case 'create_campaign_item':
          endpoint = `/api/campaigns/${campaignId}/items`;
          body = {
            name: action.params.name,
            type: action.params.type || 'misc',
            data: action.params.data || {},
          };
          break;
        default:
          return;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMessages(prev => [...prev, {
          id: `act-err-${Date.now()}`,
          role: 'assistant',
          content: `Action failed: ${data.error || 'Unknown error'}`,
          actions: [],
          createdAt: new Date().toISOString(),
        }]);
      } else {
        setMessages(prev => [...prev, {
          id: `act-ok-${Date.now()}`,
          role: 'assistant',
          content: `Done — ${action.description}`,
          actions: [],
          createdAt: new Date().toISOString(),
        }]);
      }
    } catch {
      setMessages(prev => [...prev, {
        id: `act-err-${Date.now()}`,
        role: 'assistant',
        content: 'Action failed — connection error',
        actions: [],
        createdAt: new Date().toISOString(),
      }]);
    }
  };

  const isGM = userRole === 'WATCHER' || userRole === 'ADMIN' || userRole === 'GODHEAD';

  return (
    <div className="flex flex-col h-full" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {loadingHistory ? (
          <div className="text-center text-white/20 text-[10px] py-4">Loading history...</div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-[var(--accent-teal)]/40 text-[10px] tracking-[0.2em] uppercase mb-2">
              Campaign Co-pilot
            </div>
            <div className="text-white/20 text-[9px] max-w-xs mx-auto">
              Ask about characters, rules, the world — or ask me to create items, skills, locations. I know your campaign.
            </div>
          </div>
        ) : (
          messages.map(msg => (
            <div key={msg.id}>
              {/* Message bubble */}
              <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-2.5 py-1.5 text-[11px] leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-[var(--accent-teal)]/15 text-[var(--accent-teal)] border border-[var(--accent-teal)]/20'
                    : 'bg-white/5 text-white/80 border border-white/10'
                }`}>
                  {msg.role === 'user' && msg.username && (
                    <div className="text-[8px] text-[var(--accent-teal)]/50 uppercase tracking-wider mb-0.5">
                      {msg.username}
                    </div>
                  )}
                  {msg.role === 'assistant' && (
                    <div className="text-[8px] text-[var(--accent-gold)]/60 uppercase tracking-wider mb-0.5">
                      Co-pilot
                    </div>
                  )}
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>
              </div>

              {/* Action cards */}
              {msg.actions.length > 0 && (
                <div className="mt-1 space-y-1">
                  {msg.actions.map(action => (
                    <div key={action.id} className={`mx-2 p-2 border text-[10px] ${
                      action.status === 'confirmed' ? 'border-[var(--accent-teal)]/30 bg-[var(--accent-teal)]/5'
                      : action.status === 'cancelled' ? 'border-white/10 bg-white/3 opacity-40'
                      : 'border-[var(--accent-gold)]/30 bg-[var(--accent-gold)]/5'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-[var(--accent-gold)] uppercase tracking-wider text-[8px]">
                            {action.type.replace(/_/g, ' ')}
                          </span>
                          <div className="text-white/70 mt-0.5">{action.description}</div>
                        </div>
                        {action.status === 'pending' && isGM && (
                          <div className="flex gap-1 ml-2">
                            <button
                              onClick={() => handleAction(action, true)}
                              className="px-2 py-0.5 bg-[var(--accent-teal)] text-black text-[8px] uppercase tracking-wider hover:brightness-110"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => handleAction(action, false)}
                              className="px-2 py-0.5 bg-white/10 text-white/40 text-[8px] uppercase tracking-wider hover:bg-white/20"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                        {action.status === 'confirmed' && (
                          <span className="text-[var(--accent-teal)] text-[8px] uppercase">Done</span>
                        )}
                        {action.status === 'cancelled' && (
                          <span className="text-white/30 text-[8px] uppercase">Cancelled</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}

        {loading && (
          <div className="flex justify-start">
            <div className="px-2.5 py-1.5 bg-white/5 border border-white/10 text-[11px] text-white/30">
              <span className="animate-pulse">Thinking...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-[var(--accent-teal)]/20 px-3 py-2">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask the co-pilot..."
            disabled={loading}
            className="flex-1 bg-black/30 border border-[var(--accent-teal)]/20 text-white text-[11px] px-2 py-1.5 placeholder:text-white/20 focus:outline-none focus:border-[var(--accent-teal)]/50 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="px-3 py-1.5 bg-[var(--accent-teal)]/20 text-[var(--accent-teal)] text-[10px] uppercase tracking-wider border border-[var(--accent-teal)]/30 hover:bg-[var(--accent-teal)]/30 disabled:opacity-30"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
