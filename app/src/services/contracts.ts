/**
 * Contract system service (T13, INV-115).
 *
 * Contracts are Terminal-enforced obligations. This service owns:
 *  - CRUD (immutable contracts reject every mutation path except seeding)
 *  - the predicate evaluator (pure READS over ledger + entity state — the
 *    only writes are the append-only ContractEvaluation audit rows and the
 *    status flip on violation; INV-14)
 *  - the penalty pipeline (every penalty lands as a PENDING_CONFIRMATION
 *    PenaltyAction; ADMIN confirms → execution. Nothing destructive is
 *    automatic — "Dissolution" is a status change behind a human gate.)
 *
 * Feature flag: set CONTRACTS_ENABLED=false to disable evaluation hooks
 * (rollback lever per T13). CRUD stays available.
 */
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { executeTransaction } from '@/services/krma/ledger';
import { calculateTKV } from '@/services/krma/evaluator';
import { emit as emitGodHeadEvent } from '@/services/godhead-dispatcher';
import type { GrowthCharacter } from '@/types/growth';
import {
  contractPartySchema,
  contractPredicateSchema,
  contractPenaltySchema,
  CONTRACT_STATUSES,
  type ContractPenalty,
  type ContractPredicate,
  type ContractStatus,
  type EvaluationDetail,
  type EvaluationTrigger,
  type NumExpr,
} from '@/types/contracts';

export function contractsEnabled(): boolean {
  return process.env.CONTRACTS_ENABLED !== 'false';
}

// ============================================================
// Schemas
// ============================================================

export const createContractSchema = z.object({
  name: z.string().min(1, 'Contract name required').max(200),
  description: z.string().max(5000).optional(),
  campaignId: z.string().optional(),
  parties: z.array(contractPartySchema).min(1, 'At least one party required'),
  predicate: contractPredicateSchema,
  penalty: contractPenaltySchema,
  deadline: z.coerce.date().optional(),
  voteRef: z.string().optional(),
});

export const updateContractSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  parties: z.array(contractPartySchema).min(1).optional(),
  predicate: contractPredicateSchema.optional(),
  penalty: contractPenaltySchema.optional(),
  deadline: z.coerce.date().nullable().optional(),
  voteRef: z.string().nullable().optional(),
  status: z.enum(CONTRACT_STATUSES).optional(),
});

// ============================================================
// CRUD
// ============================================================

/**
 * Create a contract. `opts.allowImmutable` is ONLY passed by seed scripts —
 * the API route never exposes it (immutable contracts are hard-coded below
 * the vote layer, INV-101/INV-115).
 */
export async function createContract(
  input: z.infer<typeof createContractSchema>,
  createdBy: string,
  opts: { allowImmutable?: boolean; immutable?: boolean } = {},
) {
  const validated = createContractSchema.parse(input);
  if (opts.immutable && !opts.allowImmutable) {
    throw new ForbiddenError('Immutable contracts can only be created by seeding');
  }
  return prisma.contract.create({
    data: {
      name: validated.name,
      description: validated.description ?? '',
      campaignId: validated.campaignId ?? null,
      parties: JSON.stringify(validated.parties),
      predicate: JSON.stringify(validated.predicate),
      penalty: JSON.stringify(validated.penalty),
      deadline: validated.deadline ?? null,
      immutable: !!opts.immutable,
      voteRef: validated.voteRef ?? null,
      createdBy,
    },
  });
}

export async function getContract(id: string) {
  const contract = await prisma.contract.findUnique({
    where: { id },
    include: {
      penaltyActions: { orderBy: { createdAt: 'desc' } },
      evaluations: { orderBy: { evaluatedAt: 'desc' }, take: 10 },
    },
  });
  if (!contract) throw new NotFoundError('Contract not found');
  return contract;
}

export async function listContracts(filter: { campaignId?: string; status?: ContractStatus } = {}) {
  return prisma.contract.findMany({
    where: {
      ...(filter.campaignId !== undefined ? { campaignId: filter.campaignId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
    },
    include: { penaltyActions: { where: { status: 'PENDING_CONFIRMATION' } } },
    orderBy: { createdAt: 'asc' },
  });
}

export async function updateContract(id: string, input: z.infer<typeof updateContractSchema>) {
  const validated = updateContractSchema.parse(input);
  const existing = await prisma.contract.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Contract not found');
  if (existing.immutable) {
    throw new ForbiddenError('Immutable contract — terms are hard-coded below the vote layer');
  }
  return prisma.contract.update({
    where: { id },
    data: {
      ...(validated.name !== undefined ? { name: validated.name } : {}),
      ...(validated.description !== undefined ? { description: validated.description } : {}),
      ...(validated.parties !== undefined ? { parties: JSON.stringify(validated.parties) } : {}),
      ...(validated.predicate !== undefined ? { predicate: JSON.stringify(validated.predicate) } : {}),
      ...(validated.penalty !== undefined ? { penalty: JSON.stringify(validated.penalty) } : {}),
      ...(validated.deadline !== undefined ? { deadline: validated.deadline } : {}),
      ...(validated.voteRef !== undefined ? { voteRef: validated.voteRef } : {}),
      ...(validated.status !== undefined ? { status: validated.status } : {}),
    },
  });
}

/** Soft delete: contracts are never removed, they're REVOKED (audit trail). */
export async function revokeContract(id: string) {
  const existing = await prisma.contract.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Contract not found');
  if (existing.immutable) {
    throw new ForbiddenError('Immutable contract — cannot be revoked');
  }
  return prisma.contract.update({ where: { id }, data: { status: 'REVOKED' } });
}

// ============================================================
// Predicate evaluator
// ============================================================

async function sumWalletBalances(where: object): Promise<number> {
  const agg = await prisma.wallet.aggregate({ _sum: { balance: true }, where });
  return Number(agg._sum.balance ?? BigInt(0));
}

/**
 * A character's total karmic value for contract purposes: locked KV
 * (attributes/skills/traits/fate — the deterministic KV evaluator) plus
 * the liquid balances of wallets linked to the character (its CHARACTER
 * wallet and its godhead's wallet, if any). Ruling 2026-07-10 #1/#3:
 * Frequency is the character's KRMA pool; payout basis is total KRMA.
 */
async function computeCharacterTKV(characterId: string): Promise<number> {
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character) throw new ValidationError(`tkv: character ${characterId} not found`);

  let locked = 0;
  try {
    const charData = JSON.parse(character.data) as GrowthCharacter;
    // heldItems omitted for now — item KV attribution to bearer TKV is a
    // balancing-pass refinement; wallet + sheet KV covers the contract cases.
    locked = calculateTKV(charData).total;
  } catch {
    locked = 0; // characters without parseable sheet data have no locked KV
  }

  const liquid = await sumWalletBalances({ characterId });
  const godhead = await prisma.godHead.findUnique({ where: { characterId } });
  let godheadLiquid = 0;
  if (godhead?.walletId) {
    const w = await prisma.wallet.findUnique({ where: { id: godhead.walletId } });
    godheadLiquid = Number(w?.balance ?? BigInt(0));
  }

  return locked + liquid + godheadLiquid;
}

async function evalNum(expr: NumExpr, leaves: Record<string, number>, path: string): Promise<number> {
  switch (expr.op) {
    case 'const':
      return expr.value;
    case 'tkv': {
      const v = await computeCharacterTKV(expr.characterId);
      leaves[`${path}:tkv(${expr.characterId})`] = v;
      return v;
    }
    case 'walletBalance': {
      const w = await prisma.wallet.findUnique({ where: { id: expr.walletId } });
      if (!w) throw new ValidationError(`walletBalance: wallet ${expr.walletId} not found`);
      const v = Number(w.balance);
      leaves[`${path}:walletBalance(${expr.walletId})`] = v;
      return v;
    }
    case 'reserveBalance': {
      const w = await prisma.wallet.findFirst({
        where: { walletType: 'RESERVE', label: expr.label },
      });
      if (!w) throw new ValidationError(`reserveBalance: reserve '${expr.label}' not found`);
      const v = Number(w.balance);
      leaves[`${path}:reserveBalance(${expr.label})`] = v;
      return v;
    }
    case 'totalSupply': {
      let v = await sumWalletBalances({});
      for (const label of expr.excludeReserves ?? []) {
        const w = await prisma.wallet.findFirst({
          where: { walletType: 'RESERVE', label },
        });
        v -= Number(w?.balance ?? BigInt(0));
      }
      leaves[`${path}:totalSupply(-${(expr.excludeReserves ?? []).join(',') || 'none'})`] = v;
      return v;
    }
    case 'add':
    case 'mul': {
      let acc = expr.op === 'add' ? 0 : 1;
      for (let i = 0; i < expr.args.length; i++) {
        const v = await evalNum(expr.args[i], leaves, `${path}.${i}`);
        acc = expr.op === 'add' ? acc + v : acc * v;
      }
      return acc;
    }
    case 'sub':
    case 'div': {
      const l = await evalNum(expr.left, leaves, `${path}.l`);
      const r = await evalNum(expr.right, leaves, `${path}.r`);
      if (expr.op === 'div' && r === 0) throw new ValidationError('div: division by zero');
      return expr.op === 'sub' ? l - r : l / r;
    }
  }
}

async function evalPredicate(
  pred: ContractPredicate,
  leaves: Record<string, number>,
  path = '$',
): Promise<boolean> {
  switch (pred.op) {
    case 'lt':
    case 'lte':
    case 'gt':
    case 'gte':
    case 'eq': {
      const l = await evalNum(pred.left, leaves, `${path}.left`);
      const r = await evalNum(pred.right, leaves, `${path}.right`);
      switch (pred.op) {
        case 'lt': return l < r;
        case 'lte': return l <= r;
        case 'gt': return l > r;
        case 'gte': return l >= r;
        case 'eq': return l === r;
      }
      break;
    }
    case 'and': {
      for (let i = 0; i < pred.args.length; i++) {
        if (!(await evalPredicate(pred.args[i], leaves, `${path}.${i}`))) return false;
      }
      return true;
    }
    case 'or': {
      for (let i = 0; i < pred.args.length; i++) {
        if (await evalPredicate(pred.args[i], leaves, `${path}.${i}`)) return true;
      }
      return false;
    }
    case 'not':
      return !(await evalPredicate(pred.arg, leaves, `${path}.not`));
    case 'before':
      return Date.now() < new Date(pred.dateISO).getTime();
  }
  return false;
}

// ============================================================
// Evaluation pipeline
// ============================================================

export interface EvaluationResult {
  contractId: string;
  holds: boolean;
  violated: boolean; // this evaluation flipped it
  detail: EvaluationDetail;
}

/**
 * Evaluate one contract and record the result (append-only audit log).
 * On a fresh violation: status → VIOLATED and a PENDING_CONFIRMATION
 * PenaltyAction is created (deduped — one pending action per contract).
 */
export async function evaluateContract(
  contractId: string,
  trigger: EvaluationTrigger,
): Promise<EvaluationResult> {
  const contract = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!contract) throw new NotFoundError('Contract not found');

  const leaves: Record<string, number> = {};
  let holds = true;
  let error: string | undefined;
  try {
    const predicate = contractPredicateSchema.parse(JSON.parse(contract.predicate));
    holds = await evalPredicate(predicate, leaves);
  } catch (e) {
    // An unevaluable predicate is a soft failure: log it, don't violate.
    error = e instanceof Error ? e.message : String(e);
    holds = true;
  }

  const detail: EvaluationDetail = { holds, leaves, ...(error ? { error } : {}) };
  await prisma.contractEvaluation.create({
    data: {
      contractId: contract.id,
      holds,
      detail: JSON.stringify(detail),
      trigger,
    },
  });

  let violated = false;
  if (!holds && contract.status === 'ACTIVE') {
    violated = true;
    await prisma.contract.update({
      where: { id: contract.id },
      data: { status: 'VIOLATED' },
    });
    const pending = await prisma.penaltyAction.findFirst({
      where: { contractId: contract.id, status: 'PENDING_CONFIRMATION' },
    });
    if (!pending) {
      const penalty = contractPenaltySchema.parse(JSON.parse(contract.penalty)) as ContractPenalty;
      await prisma.penaltyAction.create({
        data: {
          contractId: contract.id,
          kind: penalty.kind,
          payload: JSON.stringify(penalty),
        },
      });
    }
    // T31: lifecycle emission — Triu's verification duty (TRINITY,
    // ruling 2026-07-10 #2) sees every violation.
    void emitGodHeadEvent('contract.violated', {
      contractId: contract.id,
      contractName: contract.name,
      campaignId: contract.campaignId,
      trigger,
    });
  }

  return { contractId: contract.id, holds, violated, detail };
}

export async function evaluateAllActive(trigger: EvaluationTrigger): Promise<EvaluationResult[]> {
  const active = await prisma.contract.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true },
  });
  const results: EvaluationResult[] = [];
  for (const c of active) {
    results.push(await evaluateContract(c.id, trigger));
  }
  return results;
}

// ============================================================
// Ledger hook (called fire-and-forget from executeTransaction)
// ============================================================

const globalForContracts = globalThis as unknown as {
  __contractEvalTimer?: ReturnType<typeof setTimeout> | null;
};

/**
 * Debounced post-ledger-commit evaluation: bursts of transactions (seeding,
 * batch funding) collapse into one evaluation pass ~2s after the last commit.
 */
export function onLedgerCommit(): void {
  if (!contractsEnabled()) return;
  if (globalForContracts.__contractEvalTimer) {
    clearTimeout(globalForContracts.__contractEvalTimer);
  }
  globalForContracts.__contractEvalTimer = setTimeout(() => {
    globalForContracts.__contractEvalTimer = null;
    evaluateAllActive('LEDGER_COMMIT').catch((err) =>
      console.error('[contracts] post-ledger evaluation failed:', err),
    );
  }, 2_000);
}

// ============================================================
// Penalty pipeline
// ============================================================

export async function listPendingPenaltyActions() {
  return prisma.penaltyAction.findMany({
    where: { status: 'PENDING_CONFIRMATION' },
    include: { contract: true },
    orderBy: { createdAt: 'asc' },
  });
}

/** ADMIN confirms → the penalty executes. */
export async function confirmPenaltyAction(id: string, adminUserId: string) {
  const action = await prisma.penaltyAction.findUnique({ where: { id }, include: { contract: true } });
  if (!action) throw new NotFoundError('Penalty action not found');
  if (action.status !== 'PENDING_CONFIRMATION') {
    throw new ValidationError(`Penalty action already ${action.status}`);
  }

  const penalty = contractPenaltySchema.parse(JSON.parse(action.payload)) as ContractPenalty;
  let transactionId: string | null = null;

  switch (penalty.kind) {
    case 'FLAG_ADMIN':
      break; // acknowledging the flag IS the execution
    case 'KRMA_TRANSFER': {
      let toWalletId = penalty.toWalletId;
      if (!toWalletId && penalty.toReserveLabel) {
        const reserve = await prisma.wallet.findFirst({
          where: { walletType: 'RESERVE', label: penalty.toReserveLabel },
        });
        if (!reserve) throw new ValidationError(`Reserve '${penalty.toReserveLabel}' not found`);
        toWalletId = reserve.id;
      }
      if (!toWalletId) throw new ValidationError('KRMA_TRANSFER penalty has no destination');
      let amount: bigint;
      if (penalty.amount === 'ALL') {
        const from = await prisma.wallet.findUnique({ where: { id: penalty.fromWalletId } });
        amount = from?.balance ?? BigInt(0);
      } else {
        amount = BigInt(Math.floor(penalty.amount));
      }
      if (amount > BigInt(0)) {
        const record = await executeTransaction({
          fromWalletId: penalty.fromWalletId,
          toWalletId,
          amount,
          state: 'FLUID',
          reason: 'CONTRACT_PENALTY',
          description: `Contract penalty — ${action.contract.name}`,
          metadata: { contractId: action.contractId, penaltyActionId: action.id },
          actorId: adminUserId,
          actorType: 'USER',
          idempotencyKey: `contract-penalty:${action.id}`,
        });
        transactionId = record.id;
      }
      break;
    }
    case 'STATUS_CHANGE':
    case 'DISSOLUTION': {
      const characterId = penalty.characterId;
      const status = penalty.kind === 'DISSOLUTION' ? 'DISSOLVED' : penalty.status;
      const character = await prisma.character.findUnique({ where: { id: characterId } });
      if (!character) throw new NotFoundError(`Character ${characterId} not found`);
      await prisma.character.update({ where: { id: characterId }, data: { status } });
      break;
    }
  }

  return prisma.penaltyAction.update({
    where: { id },
    data: {
      status: 'EXECUTED',
      resolvedBy: adminUserId,
      resolvedAt: new Date(),
      transactionId,
    },
  });
}

/** ADMIN rejects → nothing executes; contract stays VIOLATED for review. */
export async function rejectPenaltyAction(id: string, adminUserId: string) {
  const action = await prisma.penaltyAction.findUnique({ where: { id } });
  if (!action) throw new NotFoundError('Penalty action not found');
  if (action.status !== 'PENDING_CONFIRMATION') {
    throw new ValidationError(`Penalty action already ${action.status}`);
  }
  return prisma.penaltyAction.update({
    where: { id },
    data: { status: 'REJECTED', resolvedBy: adminUserId, resolvedAt: new Date() },
  });
}
