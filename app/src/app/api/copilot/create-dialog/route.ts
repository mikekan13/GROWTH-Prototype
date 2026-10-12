import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { assertLawfulInput } from '@/services/lawful-intake';
import { continueLocationCreateDialog } from '@/ai/copilot/create-dialog';

export const dynamic = 'force-dynamic';

const inputSchema = z.object({
  campaignId: z.string().min(1),
  formType: z.literal('location'),
  conversation: z.array(z.object({
    role: z.enum(['jewl', 'gm']),
    content: z.string(),
    // Optional base64 data URLs (data:image/...;base64,...) attached to the
    // turn. Multimodal call when present.
    images: z.array(z.string()).optional(),
  })),
  parentLocationId: z.string().optional(),
  /** When present, the dialog edits this existing Location instead of
   *  creating — JEWL sees its current state and proposes a revision. */
  editLocationId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await request.json();
    const input = inputSchema.parse(body);
    const lastGm = [...input.conversation].reverse().find((t) => t.role === 'gm');
    if (lastGm?.content) {
      await assertLawfulInput({ campaignId: input.campaignId, userId: session.user.id, username: session.user.username, text: lastGm.content, origin: 'CREATE_DIALOG' });
    }
    const response = await continueLocationCreateDialog(
      input.campaignId,
      input.conversation,
      input.parentLocationId,
      input.editLocationId,
    );
    return NextResponse.json({ response });
  } catch (error) {
    return errorResponse(error);
  }
}
