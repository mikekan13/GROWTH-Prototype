import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/apiHelpers";
import { KrmaService } from "@/lib/krma";

export const GET = withAuth(async (session, _request: NextRequest) => {
  try {
    const balance = await KrmaService.getBalance(session.id);
    
    return NextResponse.json({ 
      balance: balance?.toString() || "0",
      formatted: KrmaService.formatKrma(balance || BigInt(0))
    });
  } catch (error) {
    console.error("Failed to get KRMA balance:", error);
    return NextResponse.json(
      { error: "Failed to get balance" },
      { status: 500 }
    );
  }
});