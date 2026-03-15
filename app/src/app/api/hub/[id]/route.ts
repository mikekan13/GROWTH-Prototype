import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api';
import { getCampaignListing } from '@/services/hub';

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
