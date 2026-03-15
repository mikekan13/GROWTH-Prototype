import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { getCampaignListing, updateListing, updateListingSchema } from '@/services/hub';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const listing = await getCampaignListing(id);
    return NextResponse.json(listing);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const validated = updateListingSchema.parse(body);

    const result = await updateListing(id, session.user.id, session.user.role, validated);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
