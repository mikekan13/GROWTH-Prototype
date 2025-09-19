import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDecisionHistory } from "@/services/decisions";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
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