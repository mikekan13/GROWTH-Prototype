import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/sessionManager";
import { prisma } from "@/lib/prisma";
import { sheetsMapper } from "@/services/sheetsMapping";

/**
 * GET /api/characters/[id]/card-data
 *
 * Returns character data optimized for character card display.
 * Includes: name, portrait, TKV, attributes (with current/max), and WTH levels.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const params = await context.params;
    const characterId = params.id;

    // Get character data from database
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      select: {
        id: true,
        name: true,
        spreadsheetId: true,
        playerEmail: true,
        json: true,
        updatedAt: true,
        Campaign: {
          select: {
            id: true,
            gmUserId: true,
          }
        }
      }
    });

    if (!character) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    // Check if user has access to this character
    const hasAccess = character.Campaign.gmUserId === user.id ||
                     character.playerEmail === user.email;

    if (!hasAccess) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Read character data from Google Sheets
    console.log(`📊 Fetching character card data for ${character.name} from sheet ${character.spreadsheetId}`);

    let sheetData = null;
    let source = 'database';

    if (character.spreadsheetId) {
      try {
        sheetData = await sheetsMapper.readCharacterFromSheet(character.spreadsheetId);
        source = 'sheets';
        console.log(`✅ Successfully read character data from Google Sheets`);
      } catch (error) {
        console.warn(`⚠️ Could not read from Google Sheets, falling back to database:`, error);
        // Fall back to database data
        sheetData = character.json as Record<string, unknown>;
        source = 'database';
      }
    } else {
      // No spreadsheet ID, use database data
      sheetData = character.json as Record<string, unknown>;
      source = 'database';
    }

    if (!sheetData) {
      return NextResponse.json({
        success: false,
        error: "Could not read character data",
        fallback: {
          name: character.name,
          portrait: null,
          tkv: "0",
          attributes: {
            clout: { current: 0, max: 1 },
            celerity: { current: 0, max: 1 },
            constitution: { current: 0, max: 1 },
            focus: { current: 0, max: 1 },
            frequency: { current: 0, max: 1 },
            flow: { current: 0, max: 1 },
            willpower: { current: 0, max: 1 },
            wisdom: { current: 0, max: 1 },
            wit: { current: 0, max: 1 }
          }
        }
      }, { status: 200 });
    }

    // Transform the data into the format expected by CharacterCard component
    // For each attribute: max = level + augmentPositive - augmentNegative
    interface AttributeData {
      level?: number;
      current?: number;
      augmentPositive?: number;
      augmentNegative?: number;
    }

    const transformAttribute = (attr: AttributeData | undefined) => {
      if (!attr) return { current: 0, max: 1 };

      const level = attr.level || 0;
      const augmentPositive = attr.augmentPositive || 0;
      const augmentNegative = attr.augmentNegative || 0;
      const max = Math.max(1, level + augmentPositive - augmentNegative);

      return {
        current: attr.current || 0,
        max
      };
    };

    // Type assertion for sheet data structure
    const data = sheetData as Record<string, unknown>;
    const identity = data.identity as Record<string, unknown> | undefined;
    const attributes = data.attributes as Record<string, unknown> | undefined;
    const levels = data.levels as Record<string, unknown> | undefined;

    const cardData = {
      name: (identity?.name as string) || character.name,
      portrait: (identity?.image as string) || null,
      tkv: String(data.tkv || 0),
      attributes: {
        clout: transformAttribute(attributes?.clout as AttributeData | undefined),
        celerity: transformAttribute(attributes?.celerity as AttributeData | undefined),
        constitution: transformAttribute(attributes?.constitution as AttributeData | undefined),
        focus: transformAttribute(attributes?.focus as AttributeData | undefined),
        frequency: transformAttribute(attributes?.frequency as AttributeData | undefined),
        flow: transformAttribute(attributes?.flow as AttributeData | undefined),
        willpower: transformAttribute(attributes?.willpower as AttributeData | undefined),
        wisdom: transformAttribute(attributes?.wisdom as AttributeData | undefined),
        wit: transformAttribute(attributes?.wit as AttributeData | undefined),
      },
      levels: {
        healthLevel: (levels?.healthLevel as number) || 1,
        techLevel: (levels?.techLevel as number) || 1,
        wealthLevel: (levels?.wealthLevel as number) || 1,
      }
    };

    console.log(`✅ Returning card data for ${cardData.name}, source: ${source}`);

    return NextResponse.json({
      success: true,
      data: cardData,
      source,
      lastSyncedFromSheets: character.updatedAt.toISOString(),
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ Error fetching character card data:", error);
    return NextResponse.json({
      error: "Internal server error",
      details: process.env.NODE_ENV === 'development' ? String(error) : undefined
    }, { status: 500 });
  }
}