import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { getCharacterSheetFacts } from '@/services/character-sheet-facts';

/**
 * GET the blocks genesis made (CharacterBlockLink ⨝ ForgeItem, with narrative
 * paint), plus the sheet facts the card renders beside them: canonical age,
 * TKV, memory-ledger count/last time and GRO.vines. Campaign members only.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const facts = await getCharacterSheetFacts(id, { id: session.user.id, role: session.user.role });
    return NextResponse.json(facts);
  } catch (error) {
    return errorResponse(error);
  }
}
