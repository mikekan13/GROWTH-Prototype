import { prisma } from "./prisma";
import { KrmaTransactionType } from "@prisma/client";

export class KrmaService {
  /**
   * Add KRMA to a user's wallet
   */
  static async deposit(
    userId: string, 
    amount: bigint, 
    description?: string, 
    _metadata?: Record<string, unknown>
  ): Promise<{ success: boolean; newBalance: bigint; transactionId: string }> {
    const result = await prisma.$transaction(async (tx) => {
      // Get current user and balance
      const user = await tx.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        throw new Error("User not found");
      }

      const newBalance = user.krmaBalance + amount;

      // Update user balance
      await tx.user.update({
        where: { id: userId },
        data: { krmaBalance: newBalance }
      });

      // Create transaction record
      const transaction = await tx.krmaTransaction.create({
        data: {
          userId,
          type: KrmaTransactionType.DEPOSIT,
          amount,
          balance: newBalance,
          description
        }
      });

      return {
        success: true,
        newBalance,
        transactionId: transaction.id
      };
    });

    return result;
  }

  /**
   * Deduct KRMA from a user's wallet (if sufficient balance)
   */
  static async withdraw(
    userId: string, 
    amount: bigint, 
    description?: string, 
    _metadata?: Record<string, unknown>
  ): Promise<{ success: boolean; newBalance?: bigint; transactionId?: string; error?: string }> {
    const result = await prisma.$transaction(async (tx) => {
      // Get current user and balance
      const user = await tx.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        throw new Error("User not found");
      }

      if (user.krmaBalance < amount) {
        return {
          success: false,
          error: "Insufficient KRMA balance"
        };
      }

      const newBalance = user.krmaBalance - amount;

      // Update user balance
      await tx.user.update({
        where: { id: userId },
        data: { krmaBalance: newBalance }
      });

      // Create transaction record
      const transaction = await tx.krmaTransaction.create({
        data: {
          userId,
          type: KrmaTransactionType.WITHDRAWAL,
          amount: -amount, // Negative amount for withdrawals
          balance: newBalance,
          description
        }
      });

      return {
        success: true,
        newBalance,
        transactionId: transaction.id
      };
    });

    return result;
  }

  /**
   * Transfer KRMA between users
   */
  static async transfer(
    fromUserId: string,
    toUserId: string,
    amount: bigint,
    description?: string,
    _metadata?: Record<string, unknown>
  ): Promise<{ success: boolean; error?: string; transactionIds?: string[] }> {
    const result = await prisma.$transaction(async (_tx) => {
      // Withdraw from sender
      const withdrawResult = await this.withdraw(fromUserId, amount, `Transfer to user ${toUserId}: ${description}`);
      if (!withdrawResult.success) {
        return {
          success: false,
          error: withdrawResult.error
        };
      }

      // Deposit to receiver
      const depositResult = await this.deposit(toUserId, amount, `Transfer from user ${fromUserId}: ${description}`);

      return {
        success: true,
        transactionIds: [withdrawResult.transactionId!, depositResult.transactionId]
      };
    });

    return result;
  }

  /**
   * Get user's KRMA balance
   */
  static async getBalance(userId: string): Promise<bigint | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { krmaBalance: true }
    });

    return user?.krmaBalance || null;
  }

  /**
   * Get user's transaction history
   */
  static async getTransactionHistory(
    userId: string, 
    limit: number = 50
  ): Promise<Record<string, unknown>[]> {
    const transactions = await prisma.krmaTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    return transactions;
  }

  /**
   * Initialize a new user with starting KRMA (for Watchers)
   */
  static async initializeWatcher(userId: string, startingKrma: bigint = BigInt(0)): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { 
        role: "WATCHER",
        krmaBalance: startingKrma
      }
    });

    if (startingKrma > 0) {
      await this.deposit(userId, startingKrma, "Initial Watcher allocation");
    }
  }

  /**
   * Format KRMA amount for display
   */
  static formatKrma(amount: bigint): string {
    return amount.toLocaleString();
  }
}