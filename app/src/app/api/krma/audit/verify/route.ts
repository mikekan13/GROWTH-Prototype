import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { fullAudit } from '@/services/krma/reconciliation';

export async function POST() {
  try {
    await requireRole('GODHEAD');
    const report = await fullAudit();

    return NextResponse.json({
      valid: report.valid,
      checkedAt: report.checkedAt.toISOString(),
      walletCount: report.walletCount,
      discrepancies: report.discrepancies.map(d => ({
        walletId: d.walletId,
        expected: d.expected.toString(),
        actual: d.actual.toString(),
      })),
      globalInvariantHolds: report.globalInvariantHolds,
      totalInWallets: report.totalInWallets.toString(),
      totalBurned: report.totalBurned.toString(),
      checksumChainValid: report.checksumChainValid,
      brokenAtSequence: report.brokenAtSequence?.toString() ?? null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
