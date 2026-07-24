'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ContractStatus } from '@/types/contracts';

// ── Types ────────────────────────────────────────────────────────────────────

interface PenaltyAction {
  id: string;
  kind: string;
  status: string;
}

interface Contract {
  id: string;
  name: string;
  description: string;
  status: ContractStatus;
  immutable: boolean;
  parties: string;
  predicate: string;
  penalty: string;
  deadline: string | null;
  penaltyActions: PenaltyAction[];
}

interface EvalResult {
  holds: boolean;
  violated: boolean;
  detail?: string;
}

interface ContractsDockProps {
  campaignId: string;
}

// ── Style helpers ─────────────────────────────────────────────────────────────

const STATUS_CHIP: Record<ContractStatus, { label: string; bg: string; color: string }> = {
  ACTIVE:    { label: 'ACTIVE',     bg: 'rgba(34,171,148,0.18)',  color: 'var(--terminal-prime)' },
  VIOLATED:  { label: 'VIOLATED',   bg: 'rgba(247,82,95,0.18)',   color: 'var(--pillar-body)' },
  FULFILLED: { label: 'FULFILLED',  bg: 'rgba(255,204,120,0.25)', color: '#c9962e' },
  REVOKED:   { label: 'REVOKED',    bg: 'rgba(120,120,120,0.18)', color: '#888'    },
};

// ── Predicate / penalty JSON examples ────────────────────────────────────────

const PREDICATE_EXAMPLE = JSON.stringify(
  {
    op: 'lt',
    left: { op: 'tkv', characterId: 'CHARACTER_ID_HERE' },
    right: {
      op: 'mul',
      args: [
        { op: 'const', value: 0.2 },
        { op: 'totalSupply', excludeReserves: ['Terminal'] },
      ],
    },
  },
  null,
  2,
);

const PENALTY_EXAMPLE = JSON.stringify(
  { kind: 'FLAG_ADMIN', message: 'Describe what the admin should do when this fires.' },
  null,
  2,
);

const PARTIES_EXAMPLE = JSON.stringify(
  [{ type: 'CHARACTER', id: 'CHARACTER_ID_HERE', role: 'BOUND' }],
  null,
  2,
);

// ── Per-contract card ─────────────────────────────────────────────────────────

function ContractCard({ contract, onRefresh }: { contract: Contract; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [evalResult, setEvalResult] = useState<EvalResult | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [confirmingActionId, setConfirmingActionId] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const chip = STATUS_CHIP[contract.status] ?? STATUS_CHIP.REVOKED;

  const handleEvaluate = useCallback(async () => {
    setEvaluating(true);
    setEvalResult(null);
    try {
      const res = await fetch(`/api/contracts/${contract.id}/evaluate`, { method: 'POST' });
      const json = await res.json() as { result?: EvalResult; error?: string };
      if (res.ok && json.result) {
        setEvalResult(json.result);
        onRefresh();
      } else {
        setEvalResult({ holds: false, violated: false, detail: json.error ?? 'Evaluation failed' });
      }
    } catch {
      setEvalResult({ holds: false, violated: false, detail: 'Network error' });
    } finally {
      setEvaluating(false);
    }
  }, [contract.id, onRefresh]);

  const handlePenaltyAction = useCallback(async (actionId: string, action: 'confirm' | 'reject') => {
    if (action === 'confirm' && confirmingActionId !== actionId) {
      // First click → arm
      setConfirmingActionId(actionId);
      return;
    }
    setActionBusy(true);
    try {
      await fetch(`/api/penalty-actions/${actionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      onRefresh();
    } catch {
      // ignore — list will refresh on next poll
    } finally {
      setActionBusy(false);
      setConfirmingActionId(null);
    }
  }, [confirmingActionId, onRefresh]);

  return (
    <div
      style={{
        border: '1px solid rgba(176,138,54,0.45)',
        borderRadius: '4px',
        marginBottom: '8px',
        overflow: 'hidden',
        background: 'rgba(255,255,255,0.65)',
      }}
    >
      {/* Card header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 8px',
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(e => !e)}
      >
        {/* Expand arrow */}
        <span style={{ fontSize: '9px', color: '#c9962e', minWidth: '10px' }}>
          {expanded ? '▼' : '▶'}
        </span>

        {/* Name */}
        <span
          style={{
            fontFamily: 'var(--font-terminal), Consolas, monospace',
            fontSize: '11px',
            color: '#1a2430',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {contract.name}
        </span>

        {/* Immutable marker */}
        {contract.immutable && (
          <span
            title="Immutable — cannot be revoked via API"
            style={{
              fontSize: '9px',
              color: '#c9962e',
              border: '1px solid #c9962e',
              borderRadius: '2px',
              padding: '0 3px',
              lineHeight: '14px',
              fontFamily: 'var(--font-terminal), Consolas, monospace',
            }}
          >
            🔒 IMMUTABLE
          </span>
        )}

        {/* Status chip */}
        <span
          style={{
            fontSize: '9px',
            padding: '1px 5px',
            borderRadius: '3px',
            background: chip.bg,
            color: chip.color,
            fontFamily: 'var(--font-terminal), Consolas, monospace',
            fontWeight: 700,
            letterSpacing: '0.05em',
            flexShrink: 0,
          }}
        >
          {chip.label}
        </span>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div style={{ padding: '0 8px 8px 8px' }}>
          {/* Description */}
          {contract.description && (
            <p
              style={{
                fontFamily: 'var(--font-terminal), Consolas, monospace',
                fontSize: '10px',
                color: '#4a5a68',
                margin: '0 0 6px 0',
                lineHeight: 1.5,
              }}
            >
              {contract.description}
            </p>
          )}

          {/* Deadline */}
          {contract.deadline && (
            <div
              style={{
                fontSize: '9px',
                color: '#d0a030',
                fontFamily: 'var(--font-terminal), Consolas, monospace',
                marginBottom: '6px',
              }}
            >
              DEADLINE: {new Date(contract.deadline).toLocaleDateString()}
            </div>
          )}

          {/* Penalty actions */}
          {contract.penaltyActions.length > 0 && (
            <div
              style={{
                border: '1px solid var(--pillar-body)',
                borderRadius: '3px',
                padding: '6px 8px',
                marginBottom: '8px',
                background: 'rgba(247,82,95,0.08)',
              }}
            >
              {contract.penaltyActions.map(pa => (
                <div key={pa.id} style={{ marginBottom: '4px' }}>
                  <div
                    style={{
                      fontSize: '10px',
                      color: 'var(--pillar-body)',
                      fontFamily: 'var(--font-terminal), Consolas, monospace',
                      fontWeight: 700,
                      marginBottom: '4px',
                    }}
                  >
                    ⚠ PENALTY PENDING — {pa.kind}
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      disabled={actionBusy}
                      onClick={() => handlePenaltyAction(pa.id, 'confirm')}
                      style={{
                        padding: '2px 8px',
                        fontSize: '9px',
                        fontFamily: 'var(--font-terminal), Consolas, monospace',
                        fontWeight: 700,
                        letterSpacing: '0.05em',
                        background: confirmingActionId === pa.id ? 'var(--pillar-body)' : 'rgba(247,82,95,0.2)',
                        color: confirmingActionId === pa.id ? '#fff' : 'var(--pillar-body)',
                        border: '1px solid var(--pillar-body)',
                        borderRadius: '3px',
                        cursor: actionBusy ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {confirmingActionId === pa.id ? 'CONFIRM — EXECUTE?' : 'Confirm'}
                    </button>
                    <button
                      disabled={actionBusy}
                      onClick={() => {
                        setConfirmingActionId(null);
                        handlePenaltyAction(pa.id, 'reject').catch(() => null);
                      }}
                      style={{
                        padding: '2px 8px',
                        fontSize: '9px',
                        fontFamily: 'var(--font-terminal), Consolas, monospace',
                        background: 'rgba(120,120,120,0.2)',
                        color: '#888',
                        border: '1px solid #666',
                        borderRadius: '3px',
                        cursor: actionBusy ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Evaluate button + result */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              disabled={evaluating}
              onClick={handleEvaluate}
              style={{
                padding: '2px 8px',
                fontSize: '9px',
                fontFamily: 'var(--font-terminal), Consolas, monospace',
                background: 'rgba(34,171,148,0.15)',
                color: 'var(--terminal-prime)',
                border: '1px solid rgba(34,171,148,0.5)',
                borderRadius: '3px',
                cursor: evaluating ? 'not-allowed' : 'pointer',
              }}
            >
              {evaluating ? '...' : '⟳ evaluate'}
            </button>
            {evalResult && (
              <span
                style={{
                  fontSize: '9px',
                  fontFamily: 'var(--font-terminal), Consolas, monospace',
                  color: evalResult.holds ? 'var(--terminal-prime)' : 'var(--pillar-body)',
                }}
              >
                {evalResult.holds ? 'HOLDS' : evalResult.violated ? 'VIOLATED' : 'FALSE'}
                {evalResult.detail ? ` — ${evalResult.detail}` : ''}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Create dialog ─────────────────────────────────────────────────────────────

function CreateContractDialog({
  campaignId,
  onClose,
  onCreated,
}: {
  campaignId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [predicateRaw, setPredicateRaw] = useState(PREDICATE_EXAMPLE);
  const [penaltyRaw, setPenaltyRaw] = useState(PENALTY_EXAMPLE);
  const [partiesRaw, setPartiesRaw] = useState(PARTIES_EXAMPLE);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = useCallback(async () => {
    setFieldError(null);

    // Client-side JSON validation
    let predicate: unknown, penalty: unknown, parties: unknown;
    try { predicate = JSON.parse(predicateRaw); } catch { setFieldError('Predicate JSON is invalid'); return; }
    try { penalty   = JSON.parse(penaltyRaw);   } catch { setFieldError('Penalty JSON is invalid');   return; }
    try { parties   = JSON.parse(partiesRaw);   } catch { setFieldError('Parties JSON is invalid');   return; }

    if (!name.trim()) { setFieldError('Name is required'); return; }

    setBusy(true);
    try {
      const res = await fetch('/api/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined, campaignId, predicate, penalty, parties }),
      });
      if (res.ok) {
        onCreated();
        onClose();
      } else {
        const json = await res.json() as { error?: string };
        setFieldError(json.error ?? `HTTP ${res.status}`);
      }
    } catch {
      setFieldError('Network error — check console');
    } finally {
      setBusy(false);
    }
  }, [name, description, predicateRaw, penaltyRaw, partiesRaw, campaignId, onClose, onCreated]);

  return (
    // Backdrop
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: '#dce6f0',
          border: '2px solid var(--krma-gold)',
          borderRadius: '6px',
          width: '520px',
          maxHeight: '90vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Dialog header */}
        <div
          style={{
            background: '#000',
            padding: '8px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255,204,120,0.3)',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-header), Bebas Neue, Impact, sans-serif',
              fontSize: '18px',
              color: 'var(--krma-gold)',
              letterSpacing: '0.1em',
            }}
          >
            NEW CONTRACT
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '16px' }}
          >
            ⊗
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Name */}
          <label style={labelStyle}>
            <span style={labelTextStyle}>NAME *</span>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              style={inputStyle}
              placeholder="e.g. Tara TKV Cap"
            />
          </label>

          {/* Description */}
          <label style={labelStyle}>
            <span style={labelTextStyle}>DESCRIPTION</span>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              style={{ ...inputStyle, height: '56px', resize: 'vertical' }}
              placeholder="Optional prose description"
            />
          </label>

          {/* Predicate */}
          <label style={labelStyle}>
            <span style={labelTextStyle}>PREDICATE (JSON) *</span>
            <textarea
              value={predicateRaw}
              onChange={e => setPredicateRaw(e.target.value)}
              style={{ ...inputStyle, height: '120px', resize: 'vertical', fontSize: '10px' }}
            />
          </label>

          {/* Penalty */}
          <label style={labelStyle}>
            <span style={labelTextStyle}>PENALTY (JSON) *</span>
            <textarea
              value={penaltyRaw}
              onChange={e => setPenaltyRaw(e.target.value)}
              style={{ ...inputStyle, height: '80px', resize: 'vertical', fontSize: '10px' }}
            />
          </label>

          {/* Parties */}
          <label style={labelStyle}>
            <span style={labelTextStyle}>PARTIES (JSON array) *</span>
            <textarea
              value={partiesRaw}
              onChange={e => setPartiesRaw(e.target.value)}
              style={{ ...inputStyle, height: '80px', resize: 'vertical', fontSize: '10px' }}
            />
          </label>

          {/* Error */}
          {fieldError && (
            <div
              style={{
                fontSize: '10px',
                color: 'var(--pillar-body)',
                fontFamily: 'var(--font-terminal), Consolas, monospace',
                background: 'rgba(247,82,95,0.1)',
                border: '1px solid rgba(247,82,95,0.3)',
                borderRadius: '3px',
                padding: '6px 8px',
              }}
            >
              {fieldError}
            </div>
          )}

          {/* Submit */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
            <button
              onClick={handleSubmit}
              disabled={busy}
              style={{
                ...cancelBtnStyle,
                background: busy ? 'rgba(34,171,148,0.1)' : 'rgba(34,171,148,0.2)',
                color: 'var(--terminal-prime)',
                border: '1px solid rgba(34,171,148,0.6)',
                cursor: busy ? 'not-allowed' : 'pointer',
              }}
            >
              {busy ? 'Creating...' : '⊕ Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

const labelTextStyle: React.CSSProperties = {
  fontFamily: 'var(--font-terminal), Consolas, monospace',
  fontSize: '9px',
  color: '#c9962e',
  letterSpacing: '0.1em',
};

const inputStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid rgba(176,138,54,0.5)',
  borderRadius: '3px',
  color: '#1a2430',
  padding: '6px 8px',
  fontFamily: 'var(--font-terminal), Consolas, monospace',
  fontSize: '11px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box' as const,
};

const cancelBtnStyle: React.CSSProperties = {
  padding: '4px 12px',
  fontSize: '10px',
  fontFamily: 'var(--font-terminal), Consolas, monospace',
  background: 'rgba(120,120,120,0.15)',
  color: '#888',
  border: '1px solid #555',
  borderRadius: '3px',
  cursor: 'pointer',
};

// ── Main dock ─────────────────────────────────────────────────────────────────

export default function ContractsDock({ campaignId }: ContractsDockProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const fetchContracts = useCallback(async () => {
    try {
      const res = await fetch(`/api/contracts?campaignId=${encodeURIComponent(campaignId)}`);
      if (res.ok) {
        const json = await res.json() as { contracts: Contract[] };
        setContracts(json.contracts);
      }
    } catch {
      // silently skip — admin-only dock; auth errors are fine
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    fetchContracts();
  }, [fetchContracts]);

  return (
    <>
      {/* Floating dock */}
      <div
        style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
          zIndex: 60,
          width: '300px',
          display: 'flex',
          flexDirection: 'column',
          border: '2px solid var(--krma-gold)',
          borderRadius: '6px',
          overflow: 'hidden',
          boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header bar */}
        <div
          style={{
            background: '#000',
            padding: '6px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            userSelect: 'none',
            borderBottom: collapsed ? 'none' : '1px solid rgba(255,204,120,0.3)',
          }}
          onClick={() => setCollapsed(c => !c)}
        >
          {/* Title */}
          <span
            style={{
              fontFamily: 'var(--font-header), Bebas Neue, Impact, sans-serif',
              fontSize: '16px',
              color: '#fff',
              letterSpacing: '0.12em',
              flex: 1,
            }}
          >
            CONTRACTS
          </span>

          {/* Count chip */}
          {!collapsed && (
            <span
              style={{
                fontSize: '9px',
                padding: '0 5px',
                borderRadius: '3px',
                background: 'rgba(34,171,148,0.2)',
                color: 'var(--terminal-prime)',
                fontFamily: 'var(--font-terminal), Consolas, monospace',
                fontWeight: 700,
              }}
            >
              {contracts.length}
            </span>
          )}

          {/* Create button */}
          {!collapsed && (
            <button
              onClick={e => { e.stopPropagation(); setShowCreate(true); }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--terminal-prime)',
                fontSize: '16px',
                cursor: 'pointer',
                lineHeight: 1,
                padding: '0 2px',
              }}
              title="Create contract"
            >
              ⊕
            </button>
          )}

          {/* Collapse toggle */}
          <span style={{ color: 'var(--krma-gold)', fontSize: '10px' }}>
            {collapsed ? '▶' : '▼'}
          </span>
        </div>

        {/* Body */}
        {!collapsed && (
          <div
            style={{
              // Light tier-2 surface per canvas object style language — NOT dark theme
              background: 'rgba(220,230,240,0.95)',
              padding: '10px',
              maxHeight: '70vh',
              overflowY: 'auto',
              backdropFilter: 'blur(8px)',
            }}
          >
            {loading ? (
              <div
                style={{
                  color: 'var(--terminal-prime)',
                  fontSize: '10px',
                  fontFamily: 'var(--font-terminal), Consolas, monospace',
                  textAlign: 'center',
                  padding: '12px',
                }}
              >
                Loading…
              </div>
            ) : contracts.length === 0 ? (
              <div
                style={{
                  color: '#555',
                  fontSize: '10px',
                  fontFamily: 'var(--font-terminal), Consolas, monospace',
                  textAlign: 'center',
                  padding: '12px',
                }}
              >
                No contracts. ⊕ to create one.
              </div>
            ) : (
              contracts.map(c => (
                <ContractCard key={c.id} contract={c} onRefresh={fetchContracts} />
              ))
            )}
          </div>
        )}
      </div>

      {/* Create dialog */}
      {showCreate && (
        <CreateContractDialog
          campaignId={campaignId}
          onClose={() => setShowCreate(false)}
          onCreated={fetchContracts}
        />
      )}
    </>
  );
}
