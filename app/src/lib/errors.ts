import { WITHHELD_STRING } from './withheld';

// Typed error classes for service layer → API route error handling

export class AppError extends Error {
  constructor(
    message: string,
    public status: number = 500,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * The local (inside-the-wall) model lane failed upstream — e.g. the RunPod
 * sync proxy's 502 HTML page over a vLLM context-length 400. `message` is
 * the technical line for logs; `userMessage` is the honest short line the
 * table sees instead of "Internal server error" (incident 2026-10-12).
 */
export class LocalLaneError extends AppError {
  constructor(message: string, public userMessage: string, public upstreamStatus: number) {
    super(message, 502);
    this.name = 'LocalLaneError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400);
    this.name = 'ValidationError';
  }
}

export class AuthError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401);
    this.name = 'AuthError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Not found') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409);
    this.name = 'ConflictError';
  }
}

/**
 * Seed first (Mike 2026-10-12): portrait creation waits for the character's
 * seed. 409 — the request is fine, the character isn't ready for it yet.
 */
export class SeedRequiredError extends ConflictError {
  constructor(message: string) {
    super(message);
    this.name = 'SeedRequiredError';
  }
}

export class InsufficientBalanceError extends AppError {
  constructor(message: string = 'Insufficient KRMA balance') {
    super(message, 422);
    this.name = 'InsufficientBalanceError';
  }
}

export class LedgerIntegrityError extends AppError {
  constructor(message: string = 'Ledger integrity violation') {
    super(message, 500);
    this.name = 'LedgerIntegrityError';
  }
}

/**
 * Lawfulness (unit 8b): the input was withheld — stored for a human moderator,
 * flagged, and never processed. The message is the fixed withheld string, so
 * the sender sees exactly that and nothing derived from the content.
 */
export class WithheldContentError extends AppError {
  constructor(message: string = WITHHELD_STRING) {
    super(message, 422);
    this.name = 'WithheldContentError';
  }
}

/**
 * The RunPod portrait endpoint refused or could not be reached. `code` is the
 * stable machine string the client switches on; `message` is the honest line
 * the admin sees instead of "pipeline returned null".
 */
export type PortraitEndpointCode =
  | 'ENDPOINT_PAUSED'
  | 'ENDPOINT_UNREACHABLE'
  | 'ENDPOINT_AUTH'
  | 'ENDPOINT_ERROR';

export class PortraitEndpointError extends AppError {
  constructor(public code: PortraitEndpointCode, message: string, status: number) {
    super(message, status);
    this.name = 'PortraitEndpointError';
  }
}

/**
 * Image designer (ruling 2026-10-13): clothing and gear come from the
 * character's inventory, never from an image edit. 422 with a stable code the
 * client switches on: `{ error: 'CLOTHING_FROM_INVENTORY', message }`.
 */
export class ClothingFromInventoryError extends AppError {
  readonly code = 'CLOTHING_FROM_INVENTORY' as const;
  constructor(message: string) {
    super(message, 422);
    this.name = 'ClothingFromInventoryError';
  }
}

/**
 * Image designer (Mike 2026-10-15): a designer edit outside the allowed
 * scope (hair, scars, tattoos, body mods, body underwear) — age, wounds,
 * expression, the locked identity. 422 `{ error: 'EDIT_OUT_OF_SCOPE', message }`.
 */
export class EditOutOfScopeError extends AppError {
  readonly code = 'EDIT_OUT_OF_SCOPE' as const;
  constructor(message: string) {
    super(message, 422);
    this.name = 'EditOutOfScopeError';
  }
}
