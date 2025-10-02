import { prisma } from "@/lib/prisma";
import { getSpreadsheetMetadata, copySpreadsheet, shareSpreadsheet, getOrCreateCampaignFolder, listFolderContents } from "./google";
// import { createOrUpdateCharacter } from "./characters";
import { writeCharacterDataToSheet } from "./sheetWriter";

interface SyncOptions {
  createIfMissing?: boolean;
  preserveData?: boolean;
  campaignName?: string;
  folderId?: string;
}

export async function syncCharacterSheet(
  character: {
    id: string;
    campaignId: string;
    name: string;
    playerEmail?: string;
    spreadsheetId: string;
    json: Record<string, unknown>;
  },
  options: SyncOptions = {}
): Promise<{ success: boolean; newSpreadsheetId?: string; action: string }> {
  
  const { createIfMissing = true, preserveData = true, campaignName, folderId } = options;
  
  console.log(`🔄 Syncing character sheet for "${character.name}" (${character.id})`);
  console.log(`   Current sheet ID: ${character.spreadsheetId}`);
  
  try {
    // Check if the sheet exists in the campaign folder by listing folder contents
    if (folderId) {
      const folderContents = await listFolderContents(folderId);
      console.log(`📁 Campaign folder ${folderId} contents:`, folderContents.map(f => ({ id: f.id, name: f.name })));
      
      // Check if our sheet is actually in the folder contents
      const sheetInFolder = folderContents.some(file => file.id === character.spreadsheetId);
      
      if (!sheetInFolder) {
        console.log(`❌ Sheet ${character.spreadsheetId} not found in campaign folder, recreating...`);
        throw new Error("Sheet not in campaign folder");
      }
    }
    
    // Also check if the sheet exists and is accessible
    const _metadata = await getSpreadsheetMetadata(character.spreadsheetId);
    console.log(`✅ Sheet exists and is in correct location`);
    return { success: true, action: "verified" };
    
  } catch (error) {
    console.log(`❌ Sheet issue: ${error instanceof Error ? error.message : 'Unknown error'}`);
    
    if (!createIfMissing) {
      console.log(`⚠️ Not creating new sheet as createIfMissing is false`);
      return { success: false, action: "not_found" };
    }
    
    console.log(`🛠️  Attempting to create new sheet for character "${character.name}"`);
    
    try {
      // Create new character sheet from template
      const newSheet = await createCharacterSheetFromTemplate(character, campaignName, folderId);
      
      if (preserveData && character.json) {
        console.log(`📝 Restoring character data to new sheet...`);
        try {
          await writeCharacterDataToSheet(newSheet.id, character.json);
        } catch (writeError) {
          console.warn(`⚠️ Failed to restore character data to new sheet, but sheet was created:`, writeError);
        }
      }
      
      // Update database with new sheet ID
      await prisma.character.update({
        where: { id: character.id },
        data: { spreadsheetId: newSheet.id }
      });
      
      console.log(`✅ Character "${character.name}" synced with new sheet: ${newSheet.id}`);
      
      return { 
        success: true, 
        newSpreadsheetId: newSheet.id,
        action: "recreated" 
      };
      
    } catch (createError) {
      console.error(`❌ Failed to create new sheet for character "${character.name}":`, createError);
      
      // Check if it's a template access issue
      if (createError instanceof Error && createError.message.includes('not accessible')) {
        console.warn(`🔧 Template access issue - character "${character.name}" will use cached data`);
        return { success: false, action: "template_inaccessible" };
      }
      
      return { success: false, action: "creation_failed" };
    }
  }
}

async function createCharacterSheetFromTemplate(
  character: { name: string; playerEmail?: string; campaignId: string },
  campaignName?: string,
  providedFolderId?: string
): Promise<{ id: string; name: string; url: string }> {
  
  // Use provided template ID or fall back to environment variable
  const sourceSpreadsheetId = process.env.CHARACTER_TEMPLATE_ID;
  
  if (!sourceSpreadsheetId) {
    throw new Error("No character template configured (CHARACTER_TEMPLATE_ID environment variable not set)");
  }

  // First verify the template exists and is accessible
  try {
    console.log(`🔍 Verifying template ${sourceSpreadsheetId} is accessible...`);
    await getSpreadsheetMetadata(sourceSpreadsheetId);
    console.log(`✅ Template verified and accessible`);
  } catch (templateError) {
    console.error(`❌ Template ${sourceSpreadsheetId} is not accessible:`, templateError);
    throw new Error(`Character template (${sourceSpreadsheetId}) is not accessible. Please check the template ID and permissions.`);
  }

  // Ensure campaign has a folder if campaign info provided
  let targetFolderId = providedFolderId;
  if (character.campaignId && campaignName && !providedFolderId && process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID) {
    try {
      console.log(`📁 Creating/getting folder for campaign "${campaignName}"`);
      const campaignFolder = await getOrCreateCampaignFolder(character.campaignId, campaignName);
      targetFolderId = campaignFolder.id || undefined;
      console.log(`✅ Using campaign folder ID: ${targetFolderId}`);
    } catch (error) {
      console.warn("Failed to create campaign folder, continuing without folder:", error);
    }
  }

  let newSpreadsheet;
  
  try {
    // Try to copy the template spreadsheet
    newSpreadsheet = await copySpreadsheet(
      sourceSpreadsheetId,
      `${character.name} - Character Sheet`,
      targetFolderId
    );
  } catch (templateError) {
    throw new Error(`Failed to create sheet from template: ${templateError instanceof Error ? templateError.message : 'Unknown error'}`);
  }

  if (!newSpreadsheet.id) {
    throw new Error("Failed to get new spreadsheet ID");
  }

  // Share with the player if email provided
  if (character.playerEmail?.trim()) {
    try {
      await shareSpreadsheet(newSpreadsheet.id, character.playerEmail, "writer");
      console.log(`📧 Shared new sheet with ${character.playerEmail}`);
    } catch (shareError) {
      console.warn(`Failed to share sheet with ${character.playerEmail}:`, shareError);
    }
  }

  return {
    id: newSpreadsheet.id,
    name: newSpreadsheet.name || `${character.name} - Character Sheet`,
    url: `https://docs.google.com/spreadsheets/d/${newSpreadsheet.id}/edit`,
  };
}

export async function syncAllCampaignCharacters(
  campaignId: string,
  options: SyncOptions = {}
): Promise<{
  total: number;
  verified: number;
  recreated: number;
  failed: number;
  results: Array<{ characterId: string; name: string; result: Record<string, unknown> }>;
}> {
  
  console.log(`🔄 Starting full campaign sync for campaign ${campaignId}`);
  
  // Get campaign info
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId }
  });
  
  if (!campaign) {
    throw new Error(`Campaign ${campaignId} not found`);
  }
  
  // Get all characters for this campaign
  const characters = await prisma.character.findMany({
    where: { campaignId },
    orderBy: { name: "asc" }
  });
  
  console.log(`📋 Found ${characters.length} characters to sync`);
  
  const results = [];
  let verified = 0;
  let recreated = 0;
  let failed = 0;
  
  for (const character of characters) {
    const result = await syncCharacterSheet({
      ...character,
      playerEmail: character.playerEmail || undefined,
      spreadsheetId: character.spreadsheetId || '',
      json: character.json as Record<string, unknown> || {}
    }, {
      ...options,
      campaignName: campaign.name,
      folderId: campaign.folderId || undefined
    });
    
    results.push({
      characterId: character.id,
      name: character.name,
      result: result as Record<string, unknown>
    });
    
    if (result.success) {
      if (result.action === "verified") {
        verified++;
      } else if (result.action === "recreated") {
        recreated++;
      }
    } else {
      failed++;
    }
  }
  
  console.log(`✅ Campaign sync complete: ${verified} verified, ${recreated} recreated, ${failed} failed`);
  
  return {
    total: characters.length,
    verified,
    recreated,
    failed,
    results
  };
}