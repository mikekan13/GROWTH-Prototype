import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/apiHelpers";
import { prisma } from "@/lib/prisma";
import { HolderType } from "@prisma/client";

interface DestroyRequest {
  walletId: string;
  reason?: string;
}

export const POST = withAuth(async (session, request: NextRequest) => {
  try {
    // Admin access only for Mikekan13@gmail.com
    if ((session as { user: { email: string } }).user?.email !== "Mikekan13@gmail.com") {
      return NextResponse.json(
        { error: "Unauthorized - Admin access required" },
        { status: 403 }
      );
    }

    const body: DestroyRequest = await request.json();
    const { walletId, reason } = body;

    // Validation
    if (!walletId) {
      return NextResponse.json(
        { error: "Missing required field: walletId" },
        { status: 400 }
      );
    }

    // Perform destruction in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Get the wallet to destroy
      const wallet = await tx.wallet.findUnique({
        where: { id: walletId }
      });

      if (!wallet) {
        throw new Error("Wallet not found");
      }

      // Don't allow destruction of TERMINAL wallets (system reserves)
      if (wallet.ownerType === HolderType.TERMINAL) {
        throw new Error("Cannot destroy system TERMINAL wallets");
      }

      // Get Terminal3 wallet to return KRMA to
      const terminalWallet = await tx.wallet.findUnique({
        where: {
          ownerType_ownerRef: {
            ownerType: HolderType.TERMINAL,
            ownerRef: 'Terminal3'
          }
        }
      });

      if (!terminalWallet) {
        throw new Error("Terminal3 wallet not found");
      }

      const totalKrmaToReturn = wallet.liquid + wallet.crystalized;

      // Return all KRMA to Terminal3 if wallet has any balance
      if (totalKrmaToReturn > BigInt(0)) {
        await tx.wallet.update({
          where: { id: terminalWallet.id },
          data: {
            liquid: {
              increment: totalKrmaToReturn
            }
          }
        });
      }

      // Delete associated user data if this is a WATCHER/TRAILBLAZER/GODHEAD wallet
      let deletedUser = null;
      if (wallet.ownerType === HolderType.WATCHER || wallet.ownerType === HolderType.TRAILBLAZER || wallet.ownerType === HolderType.GODHEAD) {
        const userId = wallet.ownerRef;

        // Get user data before deletion
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true, name: true, role: true }
        });

        if (user) {
          // Delete GM profile if exists
          await tx.gMProfile.deleteMany({
            where: { userId: userId }
          });

          // Delete player profile if exists
          await tx.playerProfile.deleteMany({
            where: { userId: userId }
          });

          // Delete user accounts
          await tx.account.deleteMany({
            where: { userId: userId }
          });

          // Delete user sessions
          await tx.session.deleteMany({
            where: { userId: userId }
          });

          // Delete KRMA transactions
          await tx.krmaTransaction.deleteMany({
            where: { userId: userId }
          });

          // Delete the user
          await tx.user.delete({
            where: { id: userId }
          });

          deletedUser = user;
        }
      }

      // Delete the wallet
      await tx.wallet.delete({
        where: { id: walletId }
      });

      // Log the destruction for audit trail
      const adminUser = await tx.user.findUnique({
        where: { email: (session as { user: { email: string } }).user.email },
        select: { id: true }
      });

      if (adminUser) {
        await tx.krmaTransaction.create({
          data: {
            userId: adminUser.id,
            type: 'WITHDRAWAL',
            amount: totalKrmaToReturn,
            balance: BigInt(0), // Wallet is destroyed so balance is 0
            description: reason || `Admin destroyed wallet: ${totalKrmaToReturn.toString()} KRMA returned to Terminal3`,
            metadata: {
              destroyedWallet: {
                id: walletId,
                ownerType: wallet.ownerType,
                ownerRef: wallet.ownerRef,
                liquid: wallet.liquid.toString(),
                crystalized: wallet.crystalized.toString(),
                total: totalKrmaToReturn.toString()
              },
              deletedUser: deletedUser ? {
                id: deletedUser.id,
                email: deletedUser.email,
                name: deletedUser.name,
                role: deletedUser.role
              } : null,
              returnedToTerminal: totalKrmaToReturn.toString(),
              adminEmail: (session as { user: { email: string } }).user.email
            }
          }
        });
      }

      return {
        wallet: {
          id: walletId,
          ownerType: wallet.ownerType,
          ownerRef: wallet.ownerRef,
          liquid: wallet.liquid.toString(),
          crystalized: wallet.crystalized.toString(),
          total: totalKrmaToReturn.toString()
        },
        deletedUser,
        krmaReturned: totalKrmaToReturn.toString()
      };
    });

    return NextResponse.json({
      success: true,
      message: `Successfully destroyed wallet and returned ${result.krmaReturned} KRMA to Terminal3`,
      destruction: result
    });

  } catch (error) {
    console.error("Failed to destroy wallet:", error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to destroy wallet" },
      { status: 500 }
    );
  }
});