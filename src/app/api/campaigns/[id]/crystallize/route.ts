import { NextRequest, NextResponse } from "next/server";
import { withAuth, validateRequired, createApiError, API_ERRORS } from "@/lib/apiHelpers";
import { KrmaController, CrystallizationType } from "@/lib/krmaController";

export const POST = withAuth(async (session, request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { id: campaignId } = await params;
    const { type, name, description, krmaAmount, metadata } = await request.json();

    const validation = validateRequired({ type, name, krmaAmount }, ['type', 'name', 'krmaAmount']);
    if (!validation.isValid) {
      throw createApiError("Type, name, and KRMA amount are required", API_ERRORS.BAD_REQUEST.status);
    }

    // Validate crystallization type
    const validTypes: CrystallizationType[] = ['NPC', 'ITEM', 'LOCATION', 'ENVIRONMENT', 'QUEST', 'ARTIFACT'];
    if (!validTypes.includes(type)) {
      throw createApiError("Invalid crystallization type", API_ERRORS.BAD_REQUEST.status);
    }

    // Validate KRMA amount
    const krmaAmountBigInt = BigInt(krmaAmount);
    if (krmaAmountBigInt <= 0) {
      throw createApiError("KRMA amount must be positive", API_ERRORS.BAD_REQUEST.status);
    }

    const result = await KrmaController.crystallizeKrma(session.id, {
      campaignId,
      type,
      name,
      description,
      krmaAmount: krmaAmountBigInt,
      metadata: metadata || {}
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        assetId: result.assetId,
        message: `Successfully crystallized ${krmaAmount} KRMA into ${type}: ${name}`
      });
    } else {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Failed to crystallize KRMA:", error);
    return NextResponse.json(
      { error: "Failed to crystallize KRMA" },
      { status: 500 }
    );
  }
});

// Get crystallized assets for campaign
export const GET = withAuth(async (session, request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { id: campaignId } = await params;
    
    const assets = await KrmaController.getCampaignAssets(campaignId);
    const totalValue = await KrmaController.getCampaignKrmaValue(campaignId);

    return NextResponse.json({
      assets: assets.map(asset => ({
        ...asset,
        krmaValue: asset.krmaValue.toString()
      })),
      totalKrmaValue: totalValue.toString()
    });
  } catch (error) {
    console.error("Failed to get campaign assets:", error);
    return NextResponse.json(
      { error: "Failed to get assets" },
      { status: 500 }
    );
  }
});