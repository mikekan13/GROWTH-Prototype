import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { getProfile, updateProfile, updateWatcherProfile, trailblazerProfileSchema, watcherProfileSchema } from '@/services/profile';
import { setAiTrainingConsent } from '@/services/consent';

export async function GET() {
  try {
    const session = await requireAuth();
    const profile = await getProfile(session.user.id);
    return NextResponse.json(profile);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireAuth();
    const body = await request.json();

    // Handle both profile types in one request
    const result: Record<string, unknown> = {};

    if (body.profile !== undefined) {
      const validated = trailblazerProfileSchema.parse(body.profile);
      result.profile = await updateProfile(session.user.id, validated);
    }

    if (body.watcherProfile !== undefined) {
      const validated = watcherProfileSchema.parse(body.watcherProfile);
      result.watcherProfile = await updateWatcherProfile(session.user.id, session.user.role, validated);
    }

    // AI-training consent (provenance ledger, 2026-09-20): an explicit boolean, recorded with a timestamp.
    if (typeof body.aiTrainingConsent === 'boolean') {
      result.aiTrainingConsent = await setAiTrainingConsent(session.user.id, body.aiTrainingConsent);
    }

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
