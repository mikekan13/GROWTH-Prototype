import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const headers = request.headers;
    
    // Google Drive sends change notifications here
    const resourceId = headers.get("x-goog-resource-id");
    const resourceState = headers.get("x-goog-resource-state");
    const channelId = headers.get("x-goog-channel-id");
    
    console.log("Drive change notification:", {
      resourceId,
      resourceState,
      channelId,
      body
    });

    if (resourceState === "update" && resourceId) {
      // Find campaigns that use this spreadsheet
      const sheets = await prisma.sheetRef.findMany({
        where: {
          spreadsheetId: resourceId,
        },
        include: {
          Campaign: true,
        },
      });

      for (const sheet of sheets) {
        // Mark characters for refresh
        await prisma.character.updateMany({
          where: {
            campaignId: sheet.campaignId,
            spreadsheetId: resourceId,
          },
          data: {
            // We could set a "needsRefresh" flag here
            updatedAt: new Date(),
          },
        });

        console.log(`Marked characters for refresh in campaign ${sheet.Campaign.name}`);
      }
    }

    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("Drive changes webhook error:", error);
    return NextResponse.json(
      { error: "Failed to process change notification" },
      { status: 500 }
    );
  }
}

// Handle verification requests from Google
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const challenge = searchParams.get("challenge");
  
  if (challenge) {
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  
  return NextResponse.json({ status: "ok" });
}