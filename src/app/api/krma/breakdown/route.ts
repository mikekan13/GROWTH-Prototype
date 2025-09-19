import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/apiHelpers";
import { KrmaService } from "@/lib/krma";
import { prisma as _prisma } from "@/lib/prisma"; // TODO: Use for campaign ownership when implemented

export const GET = withAuth(async (session, _request: NextRequest) => {
  try {
    const userId = (session as { user: { id: string } }).user.id;
    console.log("🔍 Getting KRMA breakdown for user:", userId);

    // Get total KRMA balance
    const totalBalance = await KrmaService.getBalance(userId);
    console.log("💰 Total balance:", totalBalance);

    if (totalBalance === null) {
      console.log("⚠️ No balance found, returning zero values");
      return NextResponse.json({
        total: "0",
        crystallized: "0",
        liquid: "0",
        formatted: {
          total: "0",
          crystallized: "0",
          liquid: "0"
        },
        campaigns: 0
      });
    }

    // For now, just return 0 campaigns since we don't have GM relationship in Campaign model
    // TODO: Add GM relationship to Campaign model when we implement proper campaign ownership
    const campaigns: { id: string; name: string }[] = [];
    console.log("🎮 Found campaigns:", campaigns.length);

    // For now, assume 0 crystallized KRMA since we don't have the full budget system implemented
    // This will be replaced when the budget tracking is fully implemented
    const totalAllocated = BigInt(0);
    const liquidBalance = totalBalance - totalAllocated;

    const result = {
      total: totalBalance.toString(),
      crystallized: totalAllocated.toString(),
      liquid: liquidBalance.toString(),
      formatted: {
        total: KrmaService.formatKrma(totalBalance),
        crystallized: KrmaService.formatKrma(totalAllocated),
        liquid: KrmaService.formatKrma(liquidBalance)
      },
      campaigns: campaigns.length
    };

    console.log("✅ Returning KRMA breakdown:", result);
    return NextResponse.json(result);
  } catch (error) {
    console.error("❌ Failed to get KRMA breakdown:", error);
    return NextResponse.json(
      { error: "Failed to get KRMA breakdown", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
});