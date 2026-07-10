/**
 * Contract system types + predicate DSL (T13, INV-115).
 *
 * A Contract is a Terminal-enforced obligation: parties, a predicate that
 * must HOLD, an optional deadline, and a typed penalty. The predicate is a
 * small composable JSON DSL evaluated over the ledger and entity state —
 * never free-form code.
 *
 * Semantics: predicate === the invariant. While it evaluates TRUE the
 * contract holds; the moment it evaluates FALSE the contract is VIOLATED
 * and the penalty pipeline fires (destructive penalties require ADMIN
 * confirmation — nothing dissolves automatically).
 *
 * Precision note: KRMA amounts are BigInt in the ledger but the DSL
 * evaluates in Number so ratios like `0.20 * totalSupply` work. Total
 * supply is 1e11 — comfortably inside Number's 2^53 integer range.
 */
import { z } from 'zod';

// ============================================================
// Numeric expressions
// ============================================================

export type NumExpr =
  | { op: 'const'; value: number }
  /** Character's total karmic value: locked KV (attributes/skills/traits/
   *  fate) + the balances of wallets linked to the character (its own
   *  wallet and its godhead wallet, if any). "Frequency is the character's
   *  KRMA pool" — TKV counts liquid + locked (ruling 2026-07-10 #1/#3). */
  | { op: 'tkv'; characterId: string }
  | { op: 'walletBalance'; walletId: string }
  /** Balance of a RESERVE wallet identified by label (e.g. 'Terminal'). */
  | { op: 'reserveBalance'; label: string }
  /** Sum of ALL wallet balances (current circulating supply — shrinks with
   *  Burn), minus any reserves named in excludeReserves. */
  | { op: 'totalSupply'; excludeReserves?: string[] }
  | { op: 'add' | 'mul'; args: NumExpr[] }
  | { op: 'sub' | 'div'; left: NumExpr; right: NumExpr };

export const numExprSchema: z.ZodType<NumExpr> = z.lazy(() =>
  z.union([
    z.object({ op: z.literal('const'), value: z.number().finite() }),
    z.object({ op: z.literal('tkv'), characterId: z.string().min(1) }),
    z.object({ op: z.literal('walletBalance'), walletId: z.string().min(1) }),
    z.object({ op: z.literal('reserveBalance'), label: z.string().min(1) }),
    z.object({
      op: z.literal('totalSupply'),
      excludeReserves: z.array(z.string()).optional(),
    }),
    z.object({ op: z.enum(['add', 'mul']), args: z.array(numExprSchema).min(1) }),
    z.object({ op: z.enum(['sub', 'div']), left: numExprSchema, right: numExprSchema }),
  ]),
);

// ============================================================
// Predicates
// ============================================================

export type ContractPredicate =
  | { op: 'lt' | 'lte' | 'gt' | 'gte' | 'eq'; left: NumExpr; right: NumExpr }
  | { op: 'and' | 'or'; args: ContractPredicate[] }
  | { op: 'not'; arg: ContractPredicate }
  /** TRUE while now < dateISO. An obligation "achieve X by D" is written
   *  `or(X, before(D))` — it holds until the deadline passes unfulfilled. */
  | { op: 'before'; dateISO: string };

export const contractPredicateSchema: z.ZodType<ContractPredicate> = z.lazy(() =>
  z.union([
    z.object({
      op: z.enum(['lt', 'lte', 'gt', 'gte', 'eq']),
      left: numExprSchema,
      right: numExprSchema,
    }),
    z.object({ op: z.enum(['and', 'or']), args: z.array(contractPredicateSchema).min(1) }),
    z.object({ op: z.literal('not'), arg: contractPredicateSchema }),
    z.object({ op: z.literal('before'), dateISO: z.string().min(1) }),
  ]),
);

// ============================================================
// Penalties
// ============================================================

/** Which penalty kinds execute without a human in the loop. Everything
 *  else creates a PENDING_CONFIRMATION PenaltyAction for ADMIN. */
export const AUTO_EXECUTABLE_PENALTIES = ['FLAG_ADMIN'] as const;

export type ContractPenalty =
  /** The flag IS the penalty — creates the ADMIN-visible action record. */
  | { kind: 'FLAG_ADMIN'; message: string }
  /** Ledger transfer. Executes only after ADMIN confirmation. */
  | {
      kind: 'KRMA_TRANSFER';
      fromWalletId: string;
      /** Destination wallet, or a reserve label like 'Terminal'. */
      toWalletId?: string;
      toReserveLabel?: string;
      /** Fixed amount, or 'ALL' for the source's full balance at execution. */
      amount: number | 'ALL';
    }
  /** Sets Character.status (e.g. 'FROZEN'). ADMIN confirmation required. */
  | { kind: 'STATUS_CHANGE'; characterId: string; status: string }
  /** Dissolution NEVER auto-executes — it creates a flagged confirmation;
   *  execution sets Character.status to 'DISSOLVED' (content semantics of
   *  what dissolution means beyond that are played out in Prime). */
  | { kind: 'DISSOLUTION'; characterId: string };

export const contractPenaltySchema: z.ZodType<ContractPenalty> = z.union([
  z.object({ kind: z.literal('FLAG_ADMIN'), message: z.string().min(1) }),
  z
    .object({
      kind: z.literal('KRMA_TRANSFER'),
      fromWalletId: z.string().min(1),
      toWalletId: z.string().min(1).optional(),
      toReserveLabel: z.string().min(1).optional(),
      amount: z.union([z.number().positive().finite(), z.literal('ALL')]),
    })
    .refine((p) => !!p.toWalletId !== !!p.toReserveLabel, {
      message: 'Exactly one of toWalletId / toReserveLabel required',
    }),
  z.object({
    kind: z.literal('STATUS_CHANGE'),
    characterId: z.string().min(1),
    status: z.string().min(1),
  }),
  z.object({ kind: z.literal('DISSOLUTION'), characterId: z.string().min(1) }),
]);

// ============================================================
// Parties
// ============================================================

export type ContractParty = {
  type: 'CHARACTER' | 'GODHEAD' | 'USER' | 'CAMPAIGN';
  id: string;
  /** BOUND = the obligation falls on them; ENFORCER = verifies (Triu);
   *  BENEFICIARY = gains from fulfillment. */
  role?: 'BOUND' | 'ENFORCER' | 'BENEFICIARY';
};

export const contractPartySchema: z.ZodType<ContractParty> = z.object({
  type: z.enum(['CHARACTER', 'GODHEAD', 'USER', 'CAMPAIGN']),
  id: z.string().min(1),
  role: z.enum(['BOUND', 'ENFORCER', 'BENEFICIARY']).optional(),
});

// ============================================================
// Status vocabularies (SQLite — no enums; validated in service layer)
// ============================================================

export const CONTRACT_STATUSES = ['ACTIVE', 'VIOLATED', 'FULFILLED', 'REVOKED'] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const PENALTY_ACTION_STATUSES = [
  'PENDING_CONFIRMATION',
  'EXECUTED',
  'REJECTED',
] as const;
export type PenaltyActionStatus = (typeof PENALTY_ACTION_STATUSES)[number];

export type EvaluationTrigger = 'LEDGER_COMMIT' | 'SWEEP' | 'MANUAL';

/** Detail payload written with every evaluation (audit log). */
export interface EvaluationDetail {
  holds: boolean;
  /** Computed values for every leaf NumExpr, keyed by a path string —
   *  what the numbers actually were at evaluation time. */
  leaves: Record<string, number>;
  error?: string;
}
