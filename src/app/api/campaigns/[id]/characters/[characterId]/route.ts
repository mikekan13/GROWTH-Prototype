import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/sessionManager";
import { getCharacter } from "@/services/characters";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; characterId: string }> }
) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { characterId } = await params;
    const character = await getCharacter(characterId);

    if (!character) {
      return NextResponse.json(
        { error: "Character not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ character });
  } catch (error) {
    console.error("Get character error:", error);
    return NextResponse.json(
      { error: "Failed to fetch character" },
      { status: 500 }
    );
  }
}