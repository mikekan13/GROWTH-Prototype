import { NextRequest, NextResponse } from "next/server";
import { withAuth, createApiError, API_ERRORS } from "@/lib/apiHelpers";
import { KrmaController } from "@/lib/krmaController";

export const POST = withAuth(async (session, request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  try {
    const resolvedParams = await params;
    const assetId = resolvedParams.id;
    const { returnPercentage } = await request.json();

    // Default to 100% return if not specified
    const returnPct = returnPercentage !== undefined ? parseFloat(returnPercentage) : 100;

    if (returnPct < 0 || returnPct > 100) {
      throw createApiError("Return percentage must be between 0 and 100", API_ERRORS.BAD_REQUEST.status);
    }

    const result = await KrmaController.dissolveAsset(assetId, returnPct);

    if (result.success) {
      return NextResponse.json({
        success: true,
        krmaReturned: result.krmaReturned?.toString(),
        returnPercentage: returnPct,
        message: `Asset dissolved, ${result.krmaReturned} KRMA returned (${returnPct}% rate)`
      });
    } else {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Failed to dissolve asset:", error);
    return NextResponse.json(
      { error: "Failed to dissolve asset" },
      { status: 500 }
    );
  }
});