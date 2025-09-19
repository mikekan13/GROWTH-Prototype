import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/apiHelpers";
import { KrmaService } from "@/lib/krma";
import { prisma } from "@/lib/prisma";

export const POST = withAuth(async (session, request: NextRequest) => {
  try {
    // Admin access only for Mikekan13@gmail.com
    if ((session as { user: { email: string } }).user?.email !== "Mikekan13@gmail.com") {
      return NextResponse.json(
        { error: "Unauthorized - Admin access required" },
        { status: 403 }
      );
    }
    const { action, userId, amount, description } = await request.json();
    
    if (!action || !userId) {
      return NextResponse.json(
        { error: "Action and userId are required" },
        { status: 400 }
      );
    }

    let result;
    const krmaAmount = amount ? BigInt(amount) : BigInt(0);

    switch (action) {
      case 'INITIALIZE_WATCHER':
        await KrmaService.initializeWatcher(userId, krmaAmount);
        result = { success: true, message: "Watcher initialized" };
        break;
        
      case 'DEPOSIT':
        if (!amount) {
          return NextResponse.json(
            { error: "Amount is required for deposits" },
            { status: 400 }
          );
        }
        result = await KrmaService.deposit(userId, krmaAmount, description || "Admin deposit");
        break;
        
      case 'GET_USER_INFO':
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            krmaBalance: true,
            createdAt: true,
            updatedAt: true
          }
        });
        
        if (!user) {
          return NextResponse.json(
            { error: "User not found" },
            { status: 404 }
          );
        }
        
        return NextResponse.json({
          user: {
            ...user,
            krmaBalance: user.krmaBalance.toString()
          }
        });
        
      default:
        return NextResponse.json(
          { error: "Invalid action" },
          { status: 400 }
        );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to perform admin KRMA action:", error);
    return NextResponse.json(
      { error: "Failed to perform action" },
      { status: 500 }
    );
  }
});