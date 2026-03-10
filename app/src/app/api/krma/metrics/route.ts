import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { getGlobalMetrics } from '@/services/krma/wallet';

export async function GET() {
  try {
    await requireRole('GODHEAD');
    const metrics = await getGlobalMetrics();

    return NextResponse.json({
      reserves: metrics.reserves.map(r => ({
        label: r.label,
        balance: r.balance.toString(),
      })),
      totalCirculation: metrics.totalCirculation.toString(),
      totalInReserves: metrics.totalInReserves.toString(),
      totalBurned: metrics.totalBurned.toString(),
      burnCapRemaining: metrics.burnCapRemaining.toString(),
      totalWallets: metrics.totalWallets,
      totalTransactions: metrics.totalTransactions,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
