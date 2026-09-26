import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { listProvenance } from '@/services/provenance';

export const dynamic = 'force-dynamic';

const querySchema = z.object({ assetType: z.string().min(1).max(40), assetId: z.string().min(1) });

// GET /api/provenance?assetType=…&assetId=… — the creation manifests for one asset.
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const q = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    return NextResponse.json({ provenance: await listProvenance(q.assetType, q.assetId) });
  } catch (error) {
    return errorResponse(error);
  }
}
