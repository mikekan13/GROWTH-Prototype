import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { listCharacters, createCharacter, createCharacterSchema } from '@/services/character';

export async function GET() {
  try {
    const session = await requireAuth();
    const characters = await listCharacters(session.user.id);
    return NextResponse.json({
      characters: characters.map(c => ({
        id: c.id,
        name: c.name,
        status: c.status,
        campaignName: c.campaign.name,
        updatedAt: c.updatedAt,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await request.json();
    const input = createCharacterSchema.parse(body);
    const character = await createCharacter(session.user.id, input);
    return NextResponse.json({ character: { id: character.id, name: character.name } }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
