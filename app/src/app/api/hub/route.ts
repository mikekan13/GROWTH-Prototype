import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api';
import { listListedCampaigns, listingFiltersSchema } from '@/services/hub';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const filters = listingFiltersSchema.parse({
      search: searchParams.get('search') || undefined,
      genre: searchParams.get('genre') || undefined,
      page: searchParams.get('page') || undefined,
      limit: searchParams.get('limit') || undefined,
    });

    const result = await listListedCampaigns(filters);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
