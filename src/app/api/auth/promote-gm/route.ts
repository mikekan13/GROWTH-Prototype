import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/apiHelpers";
import { KrmaTokenomics } from "@/lib/krmaTokenomics";

export const POST = withAuth(async (session, request: NextRequest) => {
  try {
    // For now, allow any user to promote themselves to GM for testing
    // In production, this would have proper authorization/payment checks
    
    const { signupMonth } = await request.json();
    
    await KrmaTokenomics.onGMSignup(session.id, signupMonth || 1);
    
    return NextResponse.json({ 
      success: true, 
      message: "Successfully promoted to GM with 10,000 KRMA seed",
      krmaReceived: 10000
    });
  } catch (error: unknown) {
    console.error("Failed to promote user to GM:", error);
    
    // Check if user is already a GM
    if (error instanceof Error && error.message?.includes("Unique constraint failed")) {
      return NextResponse.json(
        { error: "User is already a GM" },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: "Failed to promote to GM" },
      { status: 500 }
    );
  }
});