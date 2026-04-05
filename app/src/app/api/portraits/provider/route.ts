import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { getProviderStatuses } from '@/ai/portraits/portrait-service';

/**
 * GET /api/portraits/provider
 *
 * Check portrait generation provider status.
 * Returns availability, queue length, and VRAM usage for each provider.
 */
export async function GET() {
  try {
    await requireAuth();
    const statuses = await getProviderStatuses();
    return NextResponse.json(statuses);
  } catch (error) {
    return errorResponse(error);
  }
}
