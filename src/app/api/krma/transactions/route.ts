import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/apiHelpers";
import { KrmaService } from "@/lib/krma";

export const GET = withAuth(async (session, request: NextRequest) => {
  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "50");
    
    const transactions = await KrmaService.getTransactionHistory((session as { user: { id: string } }).user.id, limit);
    
    return NextResponse.json({ 
      transactions: transactions.map(tx => ({
        ...tx,
        amount: (tx.amount as bigint).toString(),
        balance: (tx.balance as bigint).toString()
      }))
    });
  } catch (error) {
    console.error("Failed to get KRMA transactions:", error);
    return NextResponse.json(
      { error: "Failed to get transactions" },
      { status: 500 }
    );
  }
});

export const POST = withAuth(async (session, request: NextRequest) => {
  try {
    const { type, amount, description, metadata } = await request.json();
    
    if (!type || !amount) {
      return NextResponse.json(
        { error: "Type and amount are required" },
        { status: 400 }
      );
    }

    const krmaAmount = BigInt(amount);

    let result;
    switch (type) {
      case 'DEPOSIT':
        result = await KrmaService.deposit((session as { user: { id: string } }).user.id, krmaAmount, description, metadata);
        break;
      case 'WITHDRAWAL':
        result = await KrmaService.withdraw((session as { user: { id: string } }).user.id, krmaAmount, description, metadata);
        break;
      default:
        return NextResponse.json(
          { error: "Invalid transaction type" },
          { status: 400 }
        );
    }

    if (result.success) {
      return NextResponse.json({
        success: true,
        transactionId: result.transactionId,
        newBalance: result.newBalance?.toString()
      });
    } else {
      return NextResponse.json(
        { error: (result as { error?: string }).error || "Transaction failed" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Failed to process KRMA transaction:", error);
    return NextResponse.json(
      { error: "Failed to process transaction" },
      { status: 500 }
    );
  }
});