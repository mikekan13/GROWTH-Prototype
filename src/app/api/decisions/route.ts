import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listPendingDecisions, resolveDecision } from "@/services/decisions";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decisions = await listPendingDecisions();
    return NextResponse.json({ decisions });
  } catch (error) {
    console.error("Get decisions error:", error);
    return NextResponse.json(
      { error: "Failed to fetch decisions" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { issueId, response, campaignId } = await request.json();

    if (!issueId || !response) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    await resolveDecision(issueId, response, campaignId);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Resolve decision error:", error);
    return NextResponse.json(
      { error: "Failed to resolve decision" },
      { status: 500 }
    );
  }
}