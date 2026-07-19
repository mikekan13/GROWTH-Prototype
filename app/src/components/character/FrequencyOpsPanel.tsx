'use client';

/**
 * Frequency Ops Panel — the Deplete / Burn picker.
 *
 * Per Mike's canon (frequency-three-operations + r-2026-07-19-01):
 *   - DEPLETE = reduce CURRENT pool only (damage / mid-session cost). Refills on rest.
 *   - BURN    = permanent destruction (1:1 against max, scaled by sink-balance).
 *               Carries a preview pass because the multiplier shifts with global burn flux.
 *   - Upgrades happen via the trainable→Long-Rest advancement loop
 *     (r-2026-07-15-01), NOT here. The old Spend-credits-KRMA op is retired
 *     (r-2026-07-19-01): living stats are never a wallet-liquidity source.
 *
 * Renders inline (modal layer can wrap), takes character id + current
 * level/current, executes via the relevant API and notifies parent on success.
 */

import { useState } from 'react';

type Op = 'deplete' | 'burn';

interface Props {
  characterId: string;
  currentLevel: number;        // frequency.level (max)
  currentPool: number;         // frequency.current
  onClose: () => void;
  onApplied: (result: AppliedResult) => void;
}

export interface AppliedResult {
  op: Op;
  amount: number;
  newLevel: number;
  newPool: number;
  /** Burn-only: cost charged after multiplier */
  scaledCost?: number;
  /** Burn-only: multiplier (1.0 = baseline) */
  multiplier?: number;
}

const OP_COLOR: Record<Op, string> = {
  deplete: '#ffcc78',   // gold (KRMA) — pool damage
  burn:    '#E8585A',   // coral (Body accent) — destruction
};

const OP_LABEL: Record<Op, string> = {
  deplete: 'Deplete',
  burn:    'Burn',
};

const OP_HINT: Record<Op, string> = {
  deplete: 'Reduce CURRENT pool only. Refills on rest.',
  burn:    'Permanent destruction. Scaled by global burn flux.',
};

export default function FrequencyOpsPanel({
  characterId,
  currentLevel,
  currentPool,
  onClose,
  onApplied,
}: Props) {
  const [op, setOp] = useState<Op>('deplete');
  const [amount, setAmount] = useState(1);
  const [reason, setReason] = useState('');
  const [burnBaseCost, setBurnBaseCost] = useState(1);
  const [burnDescription, setBurnDescription] = useState('');
  const [burnPreview, setBurnPreview] = useState<{
    scaledCost: number;
    multiplier: number;
    burnSinkBalance: string;
    maxFrequencyAfter: number;
    insufficientFrequency: boolean;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const accent = OP_COLOR[op];

  const handlePreviewBurn = async () => {
    setError(null);
    setPreviewing(true);
    setBurnPreview(null);
    try {
      const res = await fetch(`/api/characters/${characterId}/burn?preview=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseCost: burnBaseCost,
          outcomeDescription: burnDescription || '(unspecified outcome)',
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Preview failed' }));
        setError(err.error || 'Preview failed');
        return;
      }
      const data = await res.json();
      setBurnPreview({
        scaledCost: data.scaledCost,
        multiplier: data.multiplier,
        burnSinkBalance: data.burnSinkBalance,
        maxFrequencyAfter: data.maxFrequencyAfter,
        insufficientFrequency: data.insufficientFrequency,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setPreviewing(false);
    }
  };

  const handleApply = async () => {
    setError(null);
    setSubmitting(true);
    try {
      if (op === 'burn') {
        if (!burnPreview) {
          setError('Run preview before burning');
          setSubmitting(false);
          return;
        }
        const res = await fetch(`/api/characters/${characterId}/burn`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            baseCost: burnBaseCost,
            outcomeDescription: burnDescription || '(unspecified outcome)',
            confirmedCost: burnPreview.scaledCost,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Burn failed' }));
          setError(err.error || 'Burn failed');
          return;
        }
        const data = await res.json();
        onApplied({
          op: 'burn',
          amount: burnPreview.scaledCost,
          newLevel: data.maxFrequencyAfter ?? burnPreview.maxFrequencyAfter,
          newPool: Math.min(currentPool, data.maxFrequencyAfter ?? burnPreview.maxFrequencyAfter),
          scaledCost: burnPreview.scaledCost,
          multiplier: burnPreview.multiplier,
        });
        return;
      }

      // Deplete
      const res = await fetch(`/api/characters/${characterId}/frequency`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op, amount, reason: reason || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `${OP_LABEL[op]} failed` }));
        setError(err.error || `${OP_LABEL[op]} failed`);
        return;
      }
      const data = await res.json();
      onApplied({
        op,
        amount,
        newLevel: data.maxAfter,
        newPool: data.currentAfter,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  };

  // Validation
  const canApply = (() => {
    if (submitting) return false;
    if (op === 'burn') return burnBaseCost > 0 && !!burnPreview && !burnPreview.insufficientFrequency;
    return amount > 0 && currentPool - amount >= 0; // deplete
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.78)' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md border"
        style={{ borderColor: `${accent}55`, background: '#0a0a14', boxShadow: `0 0 80px ${accent}33` }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: 'rgba(255,255,255,0.08)' }}
        >
          <div className="flex items-center gap-3">
            <span className="text-[12px] font-[family-name:var(--font-terminal)] tracking-[0.18em] uppercase" style={{ color: accent }}>
              Frequency Ops
            </span>
            <span className="text-[11px] font-[family-name:var(--font-terminal)] text-white/40">
              {currentPool} / {currentLevel}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 text-white/40 hover:text-[#E8585A] transition-colors"
          >✕</button>
        </div>

        {/* Op picker */}
        <div className="grid grid-cols-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          {(['deplete', 'burn'] as const).map(o => (
            <button
              key={o}
              onClick={() => { setOp(o); setError(null); setBurnPreview(null); }}
              className="py-3 text-[11px] uppercase tracking-[0.12em] font-[family-name:var(--font-terminal)] transition-colors"
              style={{
                color: op === o ? OP_COLOR[o] : 'rgba(255,255,255,0.4)',
                background: op === o ? `${OP_COLOR[o]}14` : 'transparent',
                borderBottom: op === o ? `2px solid ${OP_COLOR[o]}` : '2px solid transparent',
              }}
            >
              {OP_LABEL[o]}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          <div className="text-[11px] font-[family-name:var(--font-terminal)] text-white/50 leading-relaxed">
            {OP_HINT[op]}
          </div>

          {op === 'burn' ? (
            <>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-[0.12em] text-white/40 font-[family-name:var(--font-terminal)]">
                  Base Cost (KRMA, pre-multiplier)
                </label>
                <input
                  type="number"
                  min={1}
                  max={1_000_000}
                  value={burnBaseCost}
                  onChange={(e) => { setBurnBaseCost(Math.max(1, Number(e.target.value) || 1)); setBurnPreview(null); }}
                  className="w-full px-3 py-2 text-[14px] font-[family-name:var(--font-bebas-neue)] bg-black/40 border text-white"
                  style={{ borderColor: `${accent}44` }}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-[0.12em] text-white/40 font-[family-name:var(--font-terminal)]">
                  Outcome (what the burn buys)
                </label>
                <textarea
                  rows={2}
                  maxLength={500}
                  value={burnDescription}
                  onChange={(e) => setBurnDescription(e.target.value)}
                  placeholder="Re-roll the killing blow; bend a fate moment; etc."
                  className="w-full px-3 py-2 text-[12px] font-[family-name:var(--font-terminal)] bg-black/40 border text-white placeholder:text-white/25 resize-none"
                  style={{ borderColor: `${accent}33` }}
                />
              </div>

              <button
                onClick={handlePreviewBurn}
                disabled={previewing || burnBaseCost < 1}
                className="w-full py-2 text-[11px] uppercase tracking-[0.12em] font-[family-name:var(--font-terminal)] border disabled:opacity-30"
                style={{ borderColor: `${accent}55`, color: accent }}
              >
                {previewing ? 'Previewing...' : 'Preview Scaled Cost'}
              </button>

              {burnPreview && (
                <div className="border p-3 space-y-2"
                  style={{ borderColor: `${accent}55`, background: `${accent}08` }}
                >
                  <div className="flex justify-between text-[12px] font-[family-name:var(--font-terminal)]">
                    <span className="text-white/50">Multiplier</span>
                    <span className="text-white/90">×{burnPreview.multiplier.toFixed(3)}</span>
                  </div>
                  <div className="flex justify-between text-[12px] font-[family-name:var(--font-terminal)]">
                    <span className="text-white/50">Scaled Cost</span>
                    <span className="text-[14px] font-[family-name:var(--font-bebas-neue)]" style={{ color: accent }}>
                      {burnPreview.scaledCost} Ҝ
                    </span>
                  </div>
                  <div className="flex justify-between text-[12px] font-[family-name:var(--font-terminal)]">
                    <span className="text-white/50">Max Frequency After</span>
                    <span className={burnPreview.insufficientFrequency ? 'text-[#E8585A]' : 'text-white/90'}>
                      {burnPreview.maxFrequencyAfter}
                    </span>
                  </div>
                  {burnPreview.insufficientFrequency && (
                    <div className="text-[11px] text-[#E8585A] font-[family-name:var(--font-terminal)]">
                      Burn would push max Frequency below 0 — not allowed.
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-[0.12em] text-white/40 font-[family-name:var(--font-terminal)]">
                  Amount
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setAmount(Math.max(1, amount - 1))}
                    className="w-9 h-9 border text-white/60"
                    style={{ borderColor: `${accent}44` }}
                  >−</button>
                  <input
                    type="number"
                    min={1}
                    value={amount}
                    onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))}
                    className="flex-1 px-3 py-2 text-center text-[16px] font-[family-name:var(--font-bebas-neue)] bg-black/40 border text-white"
                    style={{ borderColor: `${accent}44` }}
                  />
                  <button
                    onClick={() => setAmount(amount + 1)}
                    className="w-9 h-9 border text-white/60"
                    style={{ borderColor: `${accent}44` }}
                  >+</button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-[0.12em] text-white/40 font-[family-name:var(--font-terminal)]">
                  Reason (optional, logged)
                </label>
                <input
                  type="text"
                  maxLength={300}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Damage source / cost paid"
                  className="w-full px-3 py-2 text-[12px] font-[family-name:var(--font-terminal)] bg-black/40 border text-white placeholder:text-white/25"
                  style={{ borderColor: `${accent}33` }}
                />
              </div>

              {/* Preview line */}
              <div className="border p-2 text-[12px] font-[family-name:var(--font-terminal)]"
                style={{ borderColor: `${accent}33`, background: `${accent}08` }}
              >
                <div className="flex justify-between">
                  <span className="text-white/50">Pool</span>
                  <span style={{ color: accent }}>
                    {currentPool} → {Math.max(0, currentPool - amount)}
                  </span>
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="border p-2 text-[11px] font-[family-name:var(--font-terminal)]"
              style={{ borderColor: '#E8585A55', background: 'rgba(232,88,90,0.08)', color: '#E8585A' }}
            >
              ✗ {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t"
          style={{ borderColor: 'rgba(255,255,255,0.08)' }}
        >
          <button
            onClick={onClose}
            className="px-3 py-2 text-[11px] uppercase tracking-[0.1em] font-[family-name:var(--font-terminal)] text-white/40 hover:text-white/70"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!canApply}
            className="px-5 py-2 text-[11px] uppercase tracking-[0.12em] font-[family-name:var(--font-terminal)] font-bold disabled:opacity-30"
            style={{
              background: canApply ? accent : `${accent}40`,
              color: '#000',
            }}
          >
            {submitting ? 'Applying...' : `${OP_LABEL[op]} ›`}
          </button>
        </div>
      </div>
    </div>
  );
}
