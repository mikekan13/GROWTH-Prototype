"use client";

import React, { useEffect, useState, useCallback } from 'react';

interface TransactionRow {
  id: string;
  sequenceNumber: string;
  fromWalletId: string;
  toWalletId: string;
  amount: string;
  state: string;
  reason: string;
  description: string;
  createdAt: string;
  campaignId?: string | null;
  actorId?: string | null;
  actorType?: string | null;
}

interface TransactionHistoryProps {
  /** Either 'me' to load the current user's wallet, or { kind: 'character', id }. */
  source: 'me' | { kind: 'character'; id: string };
  /** Optional filter — restricts to one reason code (server-side filter). */
  reasonFilter?: string;
  /** Title shown in the panel header. */
  title?: string;
  /** Optional onClose handler for canvas overlay use. */
  onClose?: () => void;
}

const REASON_COLOR: Record<string, string> = {
  GENESIS_SEED: '#ffcc78',
  RESERVE_TRANSFER: '#ffcc78',
  CAMPAIGN_FUND: '#22ab94',
  CAMPAIGN_DEFUND: '#E8585A',
  CHARACTER_INVEST: '#582a72',
  CHARACTER_ADJUST: '#888',
  SESSION_REWARD: '#3EB89A',
  GROVINE_NECTAR: '#D4A830',
  STORY_INFLUENCE: '#582a72',
  BLUEPRINT_AUTHOR: '#22ab94',
  DEATH_BODY_RETURN: '#E84040',
  DEATH_SOUL_SPLIT: '#E84040',
  DEATH_SPIRIT_TO_PLAYER: '#E84040',
};

function fmtAmount(amount: string): string {
  // Ledger amounts arrive as bigint-stringified ints. Display is decorative —
  // strip a leading minus, comma-format the digits.
  const negative = amount.startsWith('-');
  const digits = negative ? amount.slice(1) : amount;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (negative ? '-' : '') + grouped;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

export default function TransactionHistory({ source, reasonFilter, title, onClose }: TransactionHistoryProps) {
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const limit = 20;

  const url = (off: number) => {
    const base = source === 'me'
      ? '/api/krma/wallets/me/transactions'
      : `/api/krma/wallets/character/${source.id}/transactions`;
    const q = new URLSearchParams({ limit: String(limit), offset: String(off) });
    if (reasonFilter) q.set('reason', reasonFilter);
    return `${base}?${q.toString()}`;
  };

  const load = useCallback(async (off: number) => {
    setLoading(true);
    try {
      const res = await fetch(url(off), { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setRows(data.transactions ?? []);
        setTotal(data.total ?? 0);
        setOffset(data.offset ?? 0);
      } else {
        setRows([]); setTotal(0);
      }
    } catch {
      setRows([]); setTotal(0);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, reasonFilter]);

  useEffect(() => { load(0); }, [load]);

  const hasPrev = offset > 0;
  const hasNext = offset + limit < total;

  return (
    <div className="border" style={{ backgroundColor: '#1a1a2e', borderColor: '#ffcc78', borderRadius: '3px', width: '440px' }}>
      <div className="p-3 text-white cursor-grab" style={{ background: 'linear-gradient(135deg, #582a72 0%, #3d1952 100%)', borderRadius: '2px 2px 0 0' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">{'₿'}</span>
            <div>
              <h3 className="font-semibold text-sm" style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.08em', fontSize: '15px' }}>{title ?? 'TRANSACTIONS'}</h3>
              <p className="text-xs" style={{ color: '#ffcc78', fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '10px' }}>
                {total} total {reasonFilter ? `(filter: ${reasonFilter})` : ''}
              </p>
            </div>
          </div>
          {onClose && (
            <button onClick={e => { e.stopPropagation(); onClose(); }} onMouseDown={e => e.stopPropagation()}
              className="p-1 hover:bg-white/20 transition-colors" style={{ borderRadius: '2px' }}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>
      </div>

      <div className="p-3" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
        {loading ? (
          <div className="text-center text-gray-400 text-sm py-4">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-4">No transactions yet.</div>
        ) : (
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {rows.map(tx => {
              const color = REASON_COLOR[tx.reason] ?? '#888';
              return (
                <div key={tx.id} className="p-1.5 border" style={{ borderRadius: '2px', backgroundColor: '#2a2a3e', borderColor: '#3a3a4e', borderLeftColor: color, borderLeftWidth: '3px' }}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[8px] px-1 font-bold" style={{ backgroundColor: color, color: '#1a1a2e', borderRadius: '2px', fontFamily: 'var(--font-bebas-neue)' }}>
                        {tx.reason}
                      </span>
                      <span className="text-[9px]" style={{ color: '#666' }}>#{tx.sequenceNumber}</span>
                    </div>
                    <span className="text-sm font-bold" style={{ color }}>
                      {fmtAmount(tx.amount)} {'₿'}
                    </span>
                  </div>
                  {tx.description && (
                    <p className="text-[10px] mt-0.5" style={{ color: '#aaa', lineHeight: 1.3 }}>{tx.description}</p>
                  )}
                  <p className="text-[8px] mt-0.5" style={{ color: '#555' }}>{fmtDate(tx.createdAt)} {'•'} state: {tx.state}</p>
                </div>
              );
            })}
          </div>
        )}

        {(hasPrev || hasNext) && (
          <div className="flex justify-between items-center mt-3 pt-2 border-t" style={{ borderColor: '#3a3a4e' }}>
            <button onClick={() => load(Math.max(0, offset - limit))} disabled={!hasPrev}
              className="text-[9px] px-2 py-0.5 uppercase"
              style={{ color: hasPrev ? '#ffcc78' : '#555', border: '1px solid', borderColor: hasPrev ? '#ffcc7855' : '#3a3a4e', borderRadius: '2px' }}>
              ← Prev
            </button>
            <span className="text-[9px]" style={{ color: '#888' }}>
              {offset + 1}–{Math.min(offset + limit, total)} of {total}
            </span>
            <button onClick={() => load(offset + limit)} disabled={!hasNext}
              className="text-[9px] px-2 py-0.5 uppercase"
              style={{ color: hasNext ? '#ffcc78' : '#555', border: '1px solid', borderColor: hasNext ? '#ffcc7855' : '#3a3a4e', borderRadius: '2px' }}>
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
