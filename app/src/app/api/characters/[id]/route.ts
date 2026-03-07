import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { getCharacter, updateCharacter, updateCharacterSchema } from '@/services/character';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const character = await getCharacter(id, session.user.id, session.user.role);
    return NextResponse.json({
      character: {
        id: character.id,
        name: character.name,
        status: character.status,
        data: JSON.parse(character.data),
        portrait: character.portrait,
        campaignName: character.campaign.name,
        backstory: character.backstory,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const input = updateCharacterSchema.parse(body);
    const updated = await updateCharacter(id, session.user.id, session.user.role, input);
    return NextResponse.json({
      character: { id: updated.id, name: updated.name, status: updated.status },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
