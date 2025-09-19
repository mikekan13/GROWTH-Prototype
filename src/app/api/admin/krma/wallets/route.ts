import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/apiHelpers";
import { prisma } from "@/lib/prisma";
import { KrmaTokenomics } from "@/lib/krmaTokenomics";

export const GET = withAuth(async (session, _request: NextRequest) => {
  try {
    // Admin access only for mikekan13@gmail.com (case-insensitive)
    if ((session as { user: { email: string } }).user?.email?.toLowerCase() !== "mikekan13@gmail.com") {
      return NextResponse.json(
        { error: "Unauthorized - Admin access required" },
        { status: 403 }
      );
    }
    // Get all wallets with owner details
    const wallets = await prisma.wallet.findMany({
      orderBy: [
        { ownerType: 'asc' },
        { liquid: 'desc' }
      ]
    });

    // Get users for context
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        krmaBalance: true
      }
    });

    const userMap = new Map(users.map(u => [u.id, u]));

    // Enrich wallet data
    const enrichedWallets = wallets.map(wallet => {
      const user = userMap.get(wallet.ownerRef);
      return {
        id: wallet.id,
        ownerType: wallet.ownerType,
        ownerRef: wallet.ownerRef,
        createdAt: wallet.createdAt,
        updatedAt: wallet.updatedAt,
        liquid: wallet.liquid.toString(),
        crystalized: wallet.crystalized.toString(),
        total: (wallet.liquid + wallet.crystalized).toString(),
        owner: wallet.ownerType === 'GODHEAD' || wallet.ownerType === 'TRAILBLAZER' || wallet.ownerType === 'WATCHER'
          ? user ? {
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
              krmaBalance: user.krmaBalance.toString() // Convert BigInt to string
            } : { name: wallet.ownerRef, email: null }
          : { name: wallet.ownerRef, email: null }
      };
    });

    // Calculate totals by type
    const totalsByType = wallets.reduce((acc, wallet) => {
      const type = wallet.ownerType;
      if (!acc[type]) {
        acc[type] = { liquid: BigInt(0), crystalized: BigInt(0), count: 0 };
      }
      acc[type].liquid += wallet.liquid;
      acc[type].crystalized += wallet.crystalized;
      acc[type].count += 1;
      return acc;
    }, {} as Record<string, { liquid: bigint; crystalized: bigint; count: number }>);

    // Convert BigInt to string for JSON
    const summaryByType = Object.entries(totalsByType).map(([type, data]) => ({
      ownerType: type,
      liquid: data.liquid.toString(),
      crystalized: data.crystalized.toString(),
      total: (data.liquid + data.crystalized).toString(),
      walletCount: data.count
    }));

    // Verify conservation
    const conservation = await KrmaTokenomics.verifyConservation();

    return NextResponse.json({
      wallets: enrichedWallets,
      summaryByType,
      conservation: {
        total: conservation.total.toString(),
        expected: conservation.expected.toString(),
        isValid: conservation.isValid,
        difference: (conservation.total - conservation.expected).toString()
      }
    });
  } catch (error) {
    console.error("Failed to get KRMA wallets:", error);
    return NextResponse.json(
      { error: "Failed to get wallets" },
      { status: 500 }
    );
  }
});