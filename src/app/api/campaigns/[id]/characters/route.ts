import { NextRequest, NextResponse } from "next/server";
import { createOrUpdateCharacter, listCampaignCharacters } from "@/services/characters";
import { withAuth, validateRequired, createApiError, API_ERRORS } from "@/lib/apiHelpers";
import { CharacterFallbackService } from "@/services/characterFallback";
import { characterManager } from "@/services/characterManager";

export const GET = withAuth(async (
  session,
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  const url = new URL(request.url);

  // Check if we should use the new fallback service
  const useFallback = url.searchParams.get('useFallback') === 'true';
  const preferSheets = url.searchParams.get('preferSheets') === 'true';
  const autoSync = url.searchParams.get('autoSync') !== 'false'; // Default true
  const createMissingSheets = url.searchParams.get('createMissingSheets') !== 'false'; // Default true
  const fallbackOnError = url.searchParams.get('fallbackOnError') !== 'false'; // Default true

  if (useFallback) {
    console.log(`🔄 Using character manager for campaign ${id} characters`);

    const characters = await characterManager.loadCampaignCharacters(id, {
      preferSheets,
      useFallback: true,
      autoSync
    });

    return NextResponse.json({
      characters: characters.map(char => ({
        id: char.id,
        character: char.character,
        source: char.source,
        spreadsheetId: char.spreadsheetId,
        sheetsData: char.sheetsData,
        lastSynced: char.lastSynced
      })),
      summary: {
        total: characters.length,
        sources: {
          database: characters.filter(c => c.source === 'database').length,
          sheets: characters.filter(c => c.source === 'sheets').length
        }
      }
    });
  } else {
    // Legacy behavior
    const skipValidation = url.searchParams.get('skipValidation') === 'true';
    const validateSheets = !skipValidation;
    console.log(`Fetching characters for campaign ${id}, validation: ${validateSheets}`);

    const characters = await listCampaignCharacters(id, true);
    return NextResponse.json({ characters });
  }
});

export const POST = withAuth(async (
  session,
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { spreadsheetId, playerEmail } = await request.json();
  const { id } = await params;

  const validation = validateRequired({ spreadsheetId }, ['spreadsheetId']);
  if (!validation.isValid) {
    throw createApiError("Spreadsheet ID is required", API_ERRORS.BAD_REQUEST.status);
  }

  const character = await createOrUpdateCharacter(
    id,
    spreadsheetId.trim(),
    playerEmail?.trim()
  );

  return NextResponse.json({ character });
});