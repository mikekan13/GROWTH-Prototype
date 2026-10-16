import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { establishCurrency, listCurrencies } from '@/services/currency';

export const dynamic = 'force-dynamic';

/** The campaign's currencies (stored-KRMA vehicles; Mike 2026-10-16). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAuth();
    const { id: campaignId } = await params;
    const includeRetired = request.nextUrl.searchParams.get('all') === '1';
    const currencies = await listCurrencies(campaignId, { includeRetired });
    return NextResponse.json({ currencies });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Establish or re-rate a currency (GM / ADMIN). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;
    const body = await request.json();
    const r = await establishCurrency(campaignId, { id: session.user.id, role: session.user.role }, body);
    return NextResponse.json(r, { status: r.created ? 201 : 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
