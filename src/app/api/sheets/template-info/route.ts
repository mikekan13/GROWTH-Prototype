import { NextRequest, NextResponse } from "next/server";
import { getServiceAccountAuth } from "@/services/google";
import { google } from "googleapis";

export async function GET(_request: NextRequest) {
  try {
    const templateId = process.env.CHARACTER_TEMPLATE_ID;

    if (!templateId) {
      return NextResponse.json({ error: "No template ID configured" }, { status: 500 });
    }

    console.log(`🔍 Retrieving template info and named ranges for ID: ${templateId}`);

    try {
      // Use service account authentication (doesn't require user login)
      const auth = await getServiceAccountAuth();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sheets = google.sheets({ version: "v4", auth: auth as any });

      // Get spreadsheet info with named ranges
      const response = await sheets.spreadsheets.get({
        spreadsheetId: templateId,
        fields: "properties,sheets(properties(title,sheetId)),namedRanges",
      });

      const spreadsheetData = response.data;
      const namedRanges = spreadsheetData.namedRanges || [];

      console.log(`✅ Found ${namedRanges.length} named ranges in template`);

      // Enhanced named ranges with more details
      interface NamedRange {
        name: string;
        range?: {
          sheetId?: number;
          startRowIndex?: number;
          startColumnIndex?: number;
          endRowIndex?: number;
          endColumnIndex?: number;
        };
      }

      interface SheetProperties {
        properties?: {
          sheetId?: number;
          title?: string;
        };
      }

      const enhancedNamedRanges = (namedRanges as NamedRange[]).map((namedRange) => {
        const range = namedRange.range;
        const sheetId = range?.sheetId;

        // Find the sheet name
        const sheet = (spreadsheetData.sheets as SheetProperties[] | undefined)?.find(
          (s) => s.properties?.sheetId === sheetId
        );
        const sheetName = sheet?.properties?.title || "Unknown";

        // Format the range in A1 notation
        let a1Notation = "";
        if (range?.startRowIndex !== undefined && range?.startColumnIndex !== undefined) {
          const startCol = String.fromCharCode(65 + range.startColumnIndex);
          const startRow = range.startRowIndex + 1;

          if (range?.endRowIndex !== undefined && range?.endColumnIndex !== undefined) {
            const endCol = String.fromCharCode(65 + range.endColumnIndex - 1);
            const endRow = range.endRowIndex;
            a1Notation = `${sheetName}!${startCol}${startRow}:${endCol}${endRow}`;
          } else {
            a1Notation = `${sheetName}!${startCol}${startRow}`;
          }
        }

        return {
          name: namedRange.name,
          sheetName,
          sheetId,
          a1Notation,
          range: {
            startRow: range?.startRowIndex ? range.startRowIndex + 1 : undefined,
            endRow: range?.endRowIndex,
            startColumn: range?.startColumnIndex ? range.startColumnIndex + 1 : undefined,
            endColumn: range?.endColumnIndex,
            startColumnLetter: range?.startColumnIndex !== undefined ? String.fromCharCode(65 + range.startColumnIndex) : undefined,
            endColumnLetter: range?.endColumnIndex !== undefined ? String.fromCharCode(65 + range.endColumnIndex - 1) : undefined,
          },
          rawRange: range,
        };
      });

      interface EnhancedNamedRange {
        name: string;
        sheetName: string;
        sheetId?: number;
        a1Notation: string;
        range: {
          startRow?: number;
          endRow?: number;
          startColumn?: number;
          endColumn?: number;
          startColumnLetter?: string;
          endColumnLetter?: string;
        };
        rawRange?: unknown;
      }

      // Group by category based on naming patterns
      const categorizedRanges = {
        attributes: (enhancedNamedRanges as EnhancedNamedRange[]).filter((nr) =>
          nr.name.toLowerCase().includes('attribute') ||
          nr.name.toLowerCase().includes('stat') ||
          nr.name.toLowerCase().includes('ability')
        ),
        skills: (enhancedNamedRanges as EnhancedNamedRange[]).filter((nr) =>
          nr.name.toLowerCase().includes('skill')
        ),
        inventory: (enhancedNamedRanges as EnhancedNamedRange[]).filter((nr) =>
          nr.name.toLowerCase().includes('inventory') ||
          nr.name.toLowerCase().includes('item') ||
          nr.name.toLowerCase().includes('equipment')
        ),
        character: (enhancedNamedRanges as EnhancedNamedRange[]).filter((nr) =>
          nr.name.toLowerCase().includes('name') ||
          nr.name.toLowerCase().includes('character') ||
          nr.name.toLowerCase().includes('player') ||
          nr.name.toLowerCase().includes('level') ||
          nr.name.toLowerCase().includes('class') ||
          nr.name.toLowerCase().includes('race')
        ),
        combat: (enhancedNamedRanges as EnhancedNamedRange[]).filter((nr) =>
          nr.name.toLowerCase().includes('hp') ||
          nr.name.toLowerCase().includes('health') ||
          nr.name.toLowerCase().includes('ac') ||
          nr.name.toLowerCase().includes('armor') ||
          nr.name.toLowerCase().includes('attack') ||
          nr.name.toLowerCase().includes('damage')
        ),
        other: (enhancedNamedRanges as EnhancedNamedRange[]).filter((nr) => {
          const name = nr.name.toLowerCase();
          return !name.includes('attribute') &&
                 !name.includes('stat') &&
                 !name.includes('ability') &&
                 !name.includes('skill') &&
                 !name.includes('inventory') &&
                 !name.includes('item') &&
                 !name.includes('equipment') &&
                 !name.includes('name') &&
                 !name.includes('character') &&
                 !name.includes('player') &&
                 !name.includes('level') &&
                 !name.includes('class') &&
                 !name.includes('race') &&
                 !name.includes('hp') &&
                 !name.includes('health') &&
                 !name.includes('ac') &&
                 !name.includes('armor') &&
                 !name.includes('attack') &&
                 !name.includes('damage');
        })
      };

      return NextResponse.json({
        success: true,
        templateId,
        templateName: spreadsheetData.properties?.title,
        totalNamedRanges: namedRanges.length,
        categorizedRanges,
        allNamedRanges: enhancedNamedRanges,
        sheets: (spreadsheetData.sheets as SheetProperties[] | undefined)?.map((s) => ({
          name: s.properties?.title,
          sheetId: s.properties?.sheetId,
        })),
        url: `https://docs.google.com/spreadsheets/d/${templateId}/edit`,
      });
    } catch (error) {
      console.error("❌ Failed to retrieve template info:", error);

      return NextResponse.json({
        success: false,
        templateId,
        error: error instanceof Error ? error.message : "Unknown error",
        url: `https://docs.google.com/spreadsheets/d/${templateId}/edit`,
      }, { status: 500 });
    }
  } catch (error) {
    console.error("❌ Template info endpoint failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}