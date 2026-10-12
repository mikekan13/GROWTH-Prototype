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
