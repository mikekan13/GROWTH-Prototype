/**
 * Co-pilot chip — persistent floating presence on every campaign surface.
 *
 * Mounts once in the root layout. Self-detects whether we're inside a
 * campaign route (/campaign/[id]/... or /watcher/campaign/[id]/...) and
 * renders only there. Outside a campaign, returns null.
 *
 * Hotkeys: "/" opens (when not typing in another input); Ctrl/Cmd-K
 * toggles from anywhere; Esc closes. Click the chip to toggle.
 *
 * The chip itself is the always-visible "presence." The expand panel is
 * a small chat surface bound to the existing /api/campaigns/[id]/copilot
 * endpoints. Action confirmations stay in the Terminal panel's CopilotChat
 * for now — this MVP is conversation + send only.
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';

interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  username?: string;
  createdAt: string;
}

interface SessionUser {
  id: string;
  username: string;
  role: string;
}

function extractCampaignId(pathname: string): string | null {
  const m1 = pathname.match(/^\/campaign\/([^/?#]+)/);
  if (m1) return m1[1];
  const m2 = pathname.match(/^\/watcher\/campaign\/([^/?#]+)/);
  if (m2) return m2[1];
  return null;
}

export function JewlChip() {
  const pathname = usePathname();
  const campaignId = extractCampaignId(pathname);

  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<SessionUser | null>(null);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Hotkeys
  useEffect(() => {
    if (!campaignId) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isTyping =
        !!target && (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable
        );

      // Ctrl/Cmd-K toggles from anywhere
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(o => !o);
        return;
      }
      // "/" opens when not typing
      if (e.key === '/' && !isTyping && !open) {
        e.preventDefault();
        setOpen(true);
        return;
      }
      // Esc closes when open
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
        return;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [campaignId, open]);

  // Lazy-load session + history when first opened
  useEffect(() => {
    if (!open || !campaignId) return;

    if (!session) {
      fetch('/api/auth/me')
        .then(r => (r.ok ? r.json() : null))
        .then(s => {
          if (s?.user) setSession(s.user);
        })
        .catch(() => {});
    }

    fetch(`/api/campaigns/${campaignId}/copilot/history`)
      .then(r => (r.ok ? r.json() : { messages: [] }))
      .then(d => setMessages(d.messages || []))
      .catch(() => {});

    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open, campaignId, session]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleSend = useCallback(async () => {
    if (!campaignId) return;
    const msg = input.trim();
    if (!msg || loading) return;

    setInput('');
    setLoading(true);

    const tempId = `temp-${Date.now()}`;
    setMessages(prev => [
      ...prev,
      {
        id: tempId,
        role: 'user',
        content: msg,
        username: session?.username,
        createdAt: new Date().toISOString(),
      },
    ]);

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/copilot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [
          ...prev,
          {
            id: `resp-${Date.now()}`,
            role: 'assistant',
            content: data.message,
            createdAt: new Date().toISOString(),
          },
        ]);
      } else {
        const data = await res.json().catch(() => ({}));
        setMessages(prev => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: `Error: ${data.error || 'Failed to get response'}`,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    } catch {
      setMessages(prev => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: 'Error: connection failed.',
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, campaignId, session]);

  if (!campaignId) return null;

  return (
    <>
      {/* Floating chip — always-visible presence */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close co-pilot' : 'Open co-pilot'}
        title="Co-pilot  ( / or Ctrl-K )"
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: 'rgba(0, 0, 0, 0.85)',
          border: '1px solid rgba(208, 160, 48, 0.5)',
          boxShadow: open
            ? '0 0 16px rgba(208, 160, 48, 0.45)'
            : '0 2px 12px rgba(0,0,0,0.6)',
          color: '#D0A030',
          fontFamily: 'Consolas, monospace',
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.boxShadow = '0 0 18px rgba(208, 160, 48, 0.55)';
          e.currentTarget.style.borderColor = 'rgba(208, 160, 48, 0.9)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.boxShadow = open
            ? '0 0 16px rgba(208, 160, 48, 0.45)'
            : '0 2px 12px rgba(0,0,0,0.6)';
          e.currentTarget.style.borderColor = 'rgba(208, 160, 48, 0.5)';
        }}
      >
        <span style={{ letterSpacing: '1px' }}>{'>_'}</span>
      </button>

      {/* Expand panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Co-pilot"
          style={{
            position: 'fixed',
            bottom: 84,
            right: 20,
            width: 380,
            height: 500,
            maxHeight: 'calc(100vh - 120px)',
            background: 'rgba(0, 0, 0, 0.96)',
            border: '1px solid rgba(208, 160, 48, 0.4)',
            boxShadow:
              '0 8px 32px rgba(0,0,0,0.85), 0 0 24px rgba(208, 160, 48, 0.18)',
            zIndex: 9998,
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'Consolas, monospace',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid rgba(208, 160, 48, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                color: '#D0A030',
                fontSize: 10,
                letterSpacing: '0.3em',
                textTransform: 'uppercase',
              }}
            >
              Co-pilot
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255,255,255,0.4)',
                cursor: 'pointer',
                fontSize: 14,
                padding: '0 4px',
                fontFamily: 'Consolas, monospace',
                lineHeight: 1,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = 'rgba(255,255,255,0.4)';
              }}
            >
              ⊗
            </button>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {messages.length === 0 && !loading ? (
              <div
                style={{
                  textAlign: 'center',
                  marginTop: 40,
                  color: 'rgba(255,255,255,0.3)',
                  fontSize: 10,
                  padding: '0 20px',
                  lineHeight: 1.7,
                }}
              >
                <div
                  style={{
                    color: 'rgba(208, 160, 48, 0.5)',
                    fontSize: 9,
                    letterSpacing: '0.25em',
                    textTransform: 'uppercase',
                    marginBottom: 10,
                  }}
                >
                  Campaign Co-pilot
                </div>
                Ask about characters, rules, the world.<br />I know your campaign.
              </div>
            ) : (
              messages.map(m => (
                <div
                  key={m.id}
                  style={{
                    alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '88%',
                    padding: '6px 10px',
                    fontSize: 11,
                    lineHeight: 1.5,
                    background:
                      m.role === 'user'
                        ? 'rgba(34, 171, 148, 0.12)'
                        : 'rgba(255,255,255,0.05)',
                    border:
                      m.role === 'user'
                        ? '1px solid rgba(34, 171, 148, 0.25)'
                        : '1px solid rgba(255,255,255,0.1)',
                    color:
                      m.role === 'user' ? '#22ab94' : 'rgba(255,255,255,0.88)',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {m.role === 'assistant' && (
                    <div
                      style={{
                        fontSize: 8,
                        color: 'rgba(208, 160, 48, 0.65)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.18em',
                        marginBottom: 2,
                      }}
                    >
                      Co-pilot
                    </div>
                  )}
                  {m.role === 'user' && m.username && (
                    <div
                      style={{
                        fontSize: 8,
                        color: 'rgba(34, 171, 148, 0.65)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.18em',
                        marginBottom: 2,
                      }}
                    >
                      {m.username}
                    </div>
                  )}
                  {m.content}
                </div>
              ))
            )}
            {loading && (
              <div
                style={{
                  alignSelf: 'flex-start',
                  maxWidth: '88%',
                  padding: '6px 10px',
                  fontSize: 11,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.5)',
                }}
              >
                <span
                  style={{ animation: 'jewlchip-pulse 1.4s ease-in-out infinite' }}
                >
                  Thinking...
                </span>
              </div>
            )}
          </div>

          {/* Input */}
          <div
            style={{
              flexShrink: 0,
              padding: '10px 12px',
              borderTop: '1px solid rgba(208, 160, 48, 0.2)',
              display: 'flex',
              gap: 8,
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask the co-pilot..."
              disabled={loading}
              style={{
                flex: 1,
                background: 'rgba(0,0,0,0.5)',
                border: '1px solid rgba(208, 160, 48, 0.25)',
                color: '#fff',
                fontSize: 11,
                padding: '6px 8px',
                fontFamily: 'Consolas, monospace',
                outline: 'none',
                transition: 'border-color 0.15s ease',
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = 'rgba(208, 160, 48, 0.6)';
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = 'rgba(208, 160, 48, 0.25)';
              }}
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              style={{
                background: 'rgba(34, 171, 148, 0.2)',
                color: '#22ab94',
                border: '1px solid rgba(34, 171, 148, 0.4)',
                fontSize: 9,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                padding: '0 12px',
                fontFamily: 'Consolas, monospace',
                cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                opacity: loading || !input.trim() ? 0.4 : 1,
              }}
            >
              Send
            </button>
          </div>

          <style>{`
            @keyframes jewlchip-pulse {
              0%, 100% { opacity: 0.45; }
              50% { opacity: 1; }
            }
          `}</style>
        </div>
      )}
    </>
  );
}
