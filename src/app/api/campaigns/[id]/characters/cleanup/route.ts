import { NextRequest, NextResponse } from "next/server";
// import { listCampaignCharacters } from "@/services/characters";
import { syncAllCampaignCharacters } from "@/services/characterSync";
import { withAuth } from "@/lib/apiHelpers";

export const POST = withAuth(async (
  session,
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  
  console.log(`🧹 Manual sync requested for campaign ${id}`);
  
  try {
    // Perform full campaign sync - this will recreate missing sheets and sync data
    const syncResults = await syncAllCampaignCharacters(id, {
      createIfMissing: true,
      preserveData: true
    });
    
    console.log(`✅ Sync complete. Results:`, syncResults);
    
    return NextResponse.json({ 
      message: "Character sync complete",
      total: syncResults.total,
      verified: syncResults.verified,
      recreated: syncResults.recreated,
      failed: syncResults.failed,
      details: syncResults.results
    });
    
  } catch (error) {
    console.error(`❌ Sync failed for campaign ${id}:`, error);
    return NextResponse.json({
      error: "Sync failed",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
});