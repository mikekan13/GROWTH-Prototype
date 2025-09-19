import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/apiHelpers";
import { prisma } from "@/lib/prisma";

interface TransferRequest {
  fromWalletId: string;
  toWalletId: string;
  amount: string; // String to handle large numbers
  transferType: 'liquid' | 'crystalized';
  reason?: string; // Optional reason for the transfer
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

    const body: TransferRequest = await request.json();
    const { fromWalletId, toWalletId, amount, transferType, reason } = body;

    // Validation
    if (!fromWalletId || !toWalletId || !amount || !transferType) {
      return NextResponse.json(
        { error: "Missing required fields: fromWalletId, toWalletId, amount, transferType" },
        { status: 400 }
      );
    }

    if (fromWalletId === toWalletId) {
      return NextResponse.json(
        { error: "Cannot transfer to the same wallet" },
        { status: 400 }
      );
    }

    if (!['liquid', 'crystalized'].includes(transferType)) {
      return NextResponse.json(
        { error: "Invalid transferType. Must be 'liquid' or 'crystalized'" },
        { status: 400 }
      );
    }

    const transferAmount = BigInt(amount);
    if (transferAmount <= 0) {
      return NextResponse.json(
        { error: "Transfer amount must be greater than 0" },
        { status: 400 }
      );
    }

    // Perform transfer in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Get source wallet
      const fromWallet = await tx.wallet.findUnique({
        where: { id: fromWalletId }
      });

      if (!fromWallet) {
        throw new Error("Source wallet not found");
      }

      // Get destination wallet
      const toWallet = await tx.wallet.findUnique({
        where: { id: toWalletId }
      });

      if (!toWallet) {
        throw new Error("Destination wallet not found");
      }

      // Check sufficient balance
      const currentBalance = transferType === 'liquid' ? fromWallet.liquid : fromWallet.crystalized;
      if (currentBalance < transferAmount) {
        throw new Error(`Insufficient ${transferType} balance. Available: ${currentBalance.toString()}, Requested: ${transferAmount.toString()}`);
      }

      // Perform the transfer
      const decrementField = transferType === 'liquid' ? { liquid: { decrement: transferAmount } } : { crystalized: { decrement: transferAmount } };
      const incrementField = transferType === 'liquid' ? { liquid: { increment: transferAmount } } : { crystalized: { increment: transferAmount } };

      // Update source wallet (subtract)
      const updatedFromWallet = await tx.wallet.update({
        where: { id: fromWalletId },
        data: decrementField
      });

      // Update destination wallet (add)
      const updatedToWallet = await tx.wallet.update({
        where: { id: toWalletId },
        data: incrementField
      });

      // Log the transaction for audit trail (using admin user ID)
      const adminUser = await tx.user.findUnique({
        where: { email: (session as { user: { email: string } }).user.email },
        select: { id: true }
      });

      if (adminUser) {
        await tx.krmaTransaction.create({
          data: {
            userId: adminUser.id,
            type: 'TRANSFER',
            amount: transferAmount,
            balance: updatedFromWallet.liquid + updatedFromWallet.crystalized, // Total balance after transfer
            description: reason || `Admin transfer: ${transferAmount.toString()} ${transferType} KRMA from ${fromWallet.ownerRef} to ${toWallet.ownerRef}`,
            metadata: {
              fromWallet: {
                id: fromWalletId,
                ownerType: fromWallet.ownerType,
                ownerRef: fromWallet.ownerRef
              },
              toWallet: {
                id: toWalletId,
                ownerType: toWallet.ownerType,
                ownerRef: toWallet.ownerRef
              },
              transferType,
              adminEmail: (session as { user: { email: string } }).user.email
            }
          }
        });
      }

      return {
        fromWallet: {
          id: updatedFromWallet.id,
          ownerType: updatedFromWallet.ownerType,
          ownerRef: updatedFromWallet.ownerRef,
          liquid: updatedFromWallet.liquid.toString(),
          crystalized: updatedFromWallet.crystalized.toString()
        },
        toWallet: {
          id: updatedToWallet.id,
          ownerType: updatedToWallet.ownerType,
          ownerRef: updatedToWallet.ownerRef,
          liquid: updatedToWallet.liquid.toString(),
          crystalized: updatedToWallet.crystalized.toString()
        },
        transferAmount: transferAmount.toString(),
        transferType
      };
    });

    return NextResponse.json({
      success: true,
      message: `Successfully transferred ${result.transferAmount} ${result.transferType} KRMA`,
      transfer: result
    });

  } catch (error) {
    console.error("Failed to transfer KRMA:", error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to transfer KRMA" },
      { status: 500 }
    );
  }
});