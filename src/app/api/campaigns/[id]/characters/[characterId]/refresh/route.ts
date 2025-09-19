import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { refreshCharacter } from "@/services/characters";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; characterId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { characterId } = await params;
    const character = await refreshCharacter(characterId);

    return NextResponse.json({ character });
  } catch (error) {
    console.error("Refresh character error:", error);
    
    if (error instanceof Error && error.message === "Character not found") {
      return NextResponse.json(
        { error: "Character not found" },
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      { error: "Failed to refresh character" },
      { status: 500 }
    );
  }
}