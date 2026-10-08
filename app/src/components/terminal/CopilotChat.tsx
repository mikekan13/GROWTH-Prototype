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

  // Look (2026-10-08): the drawer's own language. Powder-blue page; JEWL speaks
  // in the book's margin voice — `[jEWL]:` + Consolas on the #383837 aside bar
  // (feed-grammar sheet §7, p 70); his asks for a yes/no are the p 64 held
  // question on that same bar with navy/gold Bebas answers; the person's turn is
  // ordinary reading text (Comfortaa) under a navy rule. Behaviour unchanged.
  return (
    <div className="jc" data-jewl-conversation>
      <style>{JEWL_CHAT_CSS}</style>
      {/* Messages */}
      <div ref={scrollRef} className="jc-scroll">
        {loadingHistory ? (
          <p className="jc-note"><span className="jc-bar">[...LOADING THE CONVERSATION...]</span></p>
        ) : messages.length === 0 ? (
          <div className="jc-turn jc-jewl">
            <p className="jc-msg"><span className="jc-aside"><b>[jEWL]:</b> Ask. I&apos;ve been watching.</span></p>
          </div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className={`jc-turn ${msg.role === 'user' ? 'jc-user' : 'jc-jewl'}`}>
              {msg.role === 'assistant' ? (
                <p className="jc-msg"><span className="jc-aside"><b>[jEWL]:</b> {msg.content}</span></p>
              ) : (
                <>
                  <div className="jc-who">
                    <span className="jc-tag">{msg.username || 'You'}:</span>
                    <span className="jc-time">{fmtTime(msg.createdAt)}</span>
                  </div>
                  <p className="jc-said">{msg.content}</p>
                </>
              )}

              {/* JEWL's asks — the p 64 held question on the grey bar */}
              {msg.actions.length > 0 && msg.actions.map(action => (
                <div key={action.id} className={`jc-ask jc-${action.status}`} data-jewl-action={action.status}>
                  <p className="jc-msg">
                    <span className="jc-kind">{action.type.replace(/_/g, ' ')}</span>
                    <span className="jc-aside">{action.description}</span>
                  </p>
                  {action.status === 'pending' && isGM && (
                    <div className="jc-answers">
                      <button onClick={() => handleAction(action, true)} className="jc-yes" data-no-hold>Confirm</button>
                      <button onClick={() => handleAction(action, false)} className="jc-no" data-no-hold>Cancel</button>
                    </div>
                  )}
                  {action.status === 'confirmed' && <p className="jc-state"><span className="jc-done">[DONE]</span></p>}
                  {action.status === 'cancelled' && <p className="jc-state"><span className="jc-bar">[CANCELLED]</span></p>}
                </div>
              ))}
            </div>
          ))
        )}

        {loading && (
          <p className="jc-note"><span className="jc-bar">[jEWL IS THINKING<span className="jc-caret">_</span>]</span></p>
        )}
      </div>

      {/* Input — the speak bar's shape: white field under a navy rule, navy/gold Send */}
      <div className="jc-input">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask jEWL…"
          aria-label="Ask jEWL"
          disabled={loading}
          className="text-[16px] md:text-[14px]"
        />
        <button onClick={handleSend} disabled={loading || !input.trim()} data-no-hold>
          {loading ? '…' : 'Send'}
        </button>
      </div>
    </div>
  );
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

const JEWL_CHAT_CSS = `
.jc{flex:1;min-height:0;display:flex;flex-direction:column;background:#cfe2f2;color:#000;font-family:var(--font-comfortaa),Comfortaa,sans-serif}
.jc *{box-sizing:border-box}
.jc-scroll{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:4px 12px 14px 14px}
.jc-turn{margin:12px 0 0}
.jc-msg{margin:0;font:700 14px/1.62 var(--font-terminal),Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere}
.jc-aside{background:#383837;color:#f5f4ef;padding:1px 5px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.jc-aside b{font-weight:700;color:#ffcc78}
.jc-user{border-left:4px solid #002f6c;padding:0 0 0 10px}
.jc-who{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.jc-tag{font:700 13px/1.5 var(--font-terminal),Consolas,monospace;color:#002f6c}
.jc-time{font:400 12px/1.5 var(--font-terminal),Consolas,monospace;color:#393937;flex:none}
.jc-said{margin:2px 0 0;font:400 15px/1.6 var(--font-comfortaa),Comfortaa,sans-serif;white-space:pre-wrap;overflow-wrap:anywhere}
.jc-ask{margin:8px 0 0}
.jc-kind{display:inline-block;font:400 15px/1.2 var(--font-bebas-neue),'Bebas Neue',sans-serif;letter-spacing:.04em;color:#ffcc78;background:#002f6c;padding:2px 6px 0;margin-right:6px}
.jc-answers{display:flex;gap:8px;margin:6px 0 0}
.jc-answers button{font:400 18px/1 var(--font-bebas-neue),'Bebas Neue',sans-serif;letter-spacing:.05em;height:36px;padding:3px 12px 0;border:0;cursor:pointer;white-space:nowrap}
.jc-yes{background:#002f6c;color:#ffcc78}
.jc-no{background:none;color:#002f6c;box-shadow:inset 0 0 0 2px #002f6c}
.jc-answers button:focus-visible{outline:3px solid #ffcc78;outline-offset:2px}
.jc-state{margin:4px 0 0;font:700 13px/1.62 var(--font-terminal),Consolas,monospace}
.jc-done{background:#22ab94;color:#222;padding:1px 5px}
.jc-cancelled .jc-aside{text-decoration:line-through;text-decoration-thickness:2px;opacity:.7}
.jc-note{margin:12px 0 0;font:700 13px/1.62 var(--font-terminal),Consolas,monospace}
.jc-bar{background:#000;color:#f5f4ef;padding:1px 5px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.jc-caret{animation:jc-caret 1s steps(1) infinite}
@keyframes jc-caret{0%,49%{opacity:1}50%,100%{opacity:0}}
@media (prefers-reduced-motion:reduce){.jc-caret{animation:none}}
.jc-input{flex:none;display:flex;gap:8px;align-items:stretch;background:#fafaf8;border-top:3px solid #000;padding:8px 10px 10px}
.jc-input input{flex:1;min-width:0;height:44px;outline:0;padding:0 8px;font-family:var(--font-comfortaa),Comfortaa,sans-serif;color:#000;background:#fff;border:0;border-left:4px solid #002f6c}
.jc-input input:disabled{opacity:.6}
.jc-input button{width:68px;min-height:36px;border:0;cursor:pointer;font:400 22px/1 var(--font-bebas-neue),'Bebas Neue',sans-serif;letter-spacing:.06em;background:#002f6c;color:#ffcc78}
.jc-input button:disabled{opacity:.55;cursor:default}
`;
