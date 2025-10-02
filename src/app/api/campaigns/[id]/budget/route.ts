import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/apiHelpers";
import { KrmaBudgetManager } from "@/lib/krmaBudgetManager";

// Get campaign budget validation
export const GET = withAuth(async (session, request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { id: campaignId } = await params;
    
    // Get detailed budget validation
    const validation = await KrmaBudgetManager.validateCampaignBudget(campaignId, session.id);
    
    // Get summary for UI display
    const summary = await KrmaBudgetManager.getCampaignBudgetSummary(campaignId, session.id);
    
    return NextResponse.json({
      validation: {
        ...validation,
        gmTotalKrma: validation.gmTotalKrma.toString(),
        allocatedKrma: validation.allocatedKrma.toString(),
        liquidKrma: validation.liquidKrma.toString(),
        overBudget: validation.overBudget.toString(),
        breakdown: {
          ...validation.breakdown,
          characters: validation.breakdown.characters.map(char => ({
            ...char,
            krmaValue: char.krmaValue.toString(),
            breakdown: Object.fromEntries(
              Object.entries(char.breakdown).map(([k, v]) => [k, v.toString()])
            )
          })),
          worldAssets: validation.breakdown.worldAssets.toString(),
          liquidRemaining: validation.breakdown.liquidRemaining.toString()
        }
      },
      summary
    });
  } catch (error) {
    console.error("Failed to get campaign budget:", error);
    return NextResponse.json(
      { error: "Failed to get budget validation" },
      { status: 500 }
    );
  }
});

// Validate character creation against budget
export const POST = withAuth(async (session, request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { id: campaignId } = await params;
    const { action, characterData } = await request.json();
    
    if (action === 'validate_character_creation') {
      const validation = await KrmaBudgetManager.validateCharacterCreation(
        campaignId,
        characterData,
        session.id
      );
      
      return NextResponse.json({
        canCreate: validation.canCreate,
        requiredKrma: validation.requiredKrma.toString(),
        availableKrma: validation.availableKrma.toString(),
        error: validation.error
      });
    }
    
    if (action === 'auto_heal_violations') {
      const { strategy } = await request.json();
      const healing = await KrmaBudgetManager.autoHealBudgetViolations(
        campaignId,
        session.id,
        strategy || 'proportional'
      );
      
      return NextResponse.json({
        healed: healing.healed,
        adjustments: healing.adjustments.map(adj => ({
          ...adj,
          oldKrma: adj.oldKrma.toString(),
          newKrma: adj.newKrma.toString()
        }))
      });
    }
    
    return NextResponse.json(
      { error: "Invalid action" },
      { status: 400 }
    );
    
  } catch (error) {
    console.error("Failed to process budget validation:", error);
    return NextResponse.json(
      { error: "Failed to process budget validation" },
      { status: 500 }
    );
  }
});