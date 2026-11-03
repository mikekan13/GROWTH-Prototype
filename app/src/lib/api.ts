// API route utility — converts service/validation errors to HTTP responses
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AppError, ClothingFromInventoryError, EditOutOfScopeError, LocalLaneError, PortraitEndpointError, UnheldThingError } from './errors';

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    const message = error.issues.map(e => e.message).join(', ');
    return NextResponse.json({ error: message }, { status: 400 });
  }
  if (error instanceof LocalLaneError) {
    console.error(error.message);
    return NextResponse.json({ error: error.userMessage }, { status: error.status });
  }
  if (error instanceof PortraitEndpointError) {
    console.error(`[portraits] ${error.code}: ${error.message}`);
    return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
  }
  if (error instanceof ClothingFromInventoryError || error instanceof EditOutOfScopeError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
  }
  if (error instanceof UnheldThingError) {
    // 2026-11-03: `withheld` is what the table-test harness reads; `error` is what the speak bar shows.
    return NextResponse.json({ error: error.message, withheld: error.message, reason: 'unheld_thing', things: error.things, actorId: error.actorId }, { status: 422 });
  }
  if (error instanceof AppError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error('Unhandled error:', error);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
