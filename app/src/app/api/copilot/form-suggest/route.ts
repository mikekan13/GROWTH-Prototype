import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { suggestForLocationCreate } from '@/ai/copilot/form-suggest';

export const dynamic = 'force-dynamic';

const inputSchema = z.object({
  campaignId: z.string().min(1),
  formType: z.literal('location-create'),
  formState: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    krmaReserve: z.number().optional(),
  }),
  parentLocationId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const body = await request.json();
    const input = inputSchema.parse(body);
    const suggestion = await suggestForLocationCreate(
      input.campaignId,
      input.formState,
      input.parentLocationId,
    );
    return NextResponse.json({ suggestion });
  } catch (error) {
    return errorResponse(error);
  }
}
