import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/sessionManager";
import { getNamedRanges } from "@/services/google";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const namedRanges = await getNamedRanges(id);
    return NextResponse.json({ namedRanges });
  } catch (error) {
    console.error("Named ranges API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch named ranges" },
      { status: 500 }
    );
  }
}