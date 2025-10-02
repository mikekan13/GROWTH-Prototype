import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/sessionManager";
import { getDecisionHistory } from "@/services/decisions";

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get("campaignId");

    const history = await getDecisionHistory(campaignId || undefined);
    return NextResponse.json({ history });
  } catch (error) {
    console.error("Get decision history error:", error);
    return NextResponse.json(
      { error: "Failed to fetch decision history" },
      { status: 500 }
    );
  }
}