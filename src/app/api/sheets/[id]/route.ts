import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSpreadsheetInfo, getSheetData } from "@/services/google";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const range = searchParams.get("range");

    if (range) {
      // Get specific range data
      const data = await getSheetData(id, range);
      return NextResponse.json({ range, values: data });
    } else {
      // Get spreadsheet info
      const info = await getSpreadsheetInfo(id);
      return NextResponse.json(info);
    }
  } catch (error) {
    console.error("Sheets API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch spreadsheet data" },
      { status: 500 }
    );
  }
}