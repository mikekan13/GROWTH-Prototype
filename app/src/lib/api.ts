// API route utility — converts service/validation errors to HTTP responses
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AppError } from './errors';

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    const message = error.issues.map(e => e.message).join(', ');
    return NextResponse.json({ error: message }, { status: 400 });
  }
  if (error instanceof AppError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error('Unhandled error:', error);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
