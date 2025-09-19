import { prisma } from "@/lib/prisma";
import { parseCharacterSheet } from "./sheetParser";
import { getSpreadsheetMetadata } from "./google";
import { transformCharacterData, CharacterWithSources } from "@/lib/characterHelpers";
import { syncCharacterSheet } from "./characterSync";
import type { Prisma } from "@prisma/client";

export async function createOrUpdateCharacter(
  campaignId: string,
  spreadsheetId: string,
  playerEmail?: string
): Promise<CharacterWithSources> {
  try {
    // Get existing decisions for this campaign and globally
    const decisions = await prisma.decision.findMany({
      where: {
        OR: [
          { scope: "GLOBAL" },
          { scope: `CAMPAIGN:${campaignId}` },
        ],
      },
    });

    const decisionMap: Record<string, Prisma.JsonValue> = {};
    decisions.forEach(decision => {
      decisionMap[decision.key] = decision.value;
    });

    // Parse the character sheet
    const parsingResult = await parseCharacterSheet(spreadsheetId, decisionMap);
    
    // If there are decisions needed, store them as issues for queue processing
    for (const decision of parsingResult.needsDecision) {
      await prisma.issue.upsert({
        where: {
          // Create a unique key based on decision key and spreadsheet
          id: `decision-${spreadsheetId}-${decision.key}`,
        },
        create: {
          id: `decision-${spreadsheetId}-${decision.key}`,
          severity: "info",
          source: { 
            spreadsheetId,
            type: "decision_needed" 
          },
          sample: { key: decision.key, description: decision.description },
          proposed: { 
            path: decision.proposedPath, 
            type: decision.proposedType 
          },
          status: "open",
        },
        update: {
          status: "open", // Reset to open if it exists
          sample: { key: decision.key, description: decision.description },
          proposed: { 
            path: decision.proposedPath, 
            type: decision.proposedType 
          },
        },
      });
    }

    // Store parsing issues
    for (const issue of parsingResult.issues) {
      await prisma.issue.create({
        data: {
          severity: issue.severity,
          source: issue.source,
          sample: JSON.parse(JSON.stringify(issue.sample || null)),
          proposed: JSON.parse(JSON.stringify(issue.proposed || null)),
          status: "open",
        },
      });
    }

    // Get spreadsheet metadata for revision tracking
    const metadata = await getSpreadsheetMetadata(spreadsheetId);
    
    // Extract character name from parsed data
    const characterName = parsingResult.data.identity.name || "Unknown Character";
    
    // Create or update character record
    const character = await prisma.character.upsert({
      where: {
        campaignId_spreadsheetId: {
          campaignId,
          spreadsheetId,
        },
      },
      create: {
        campaignId,
        name: characterName,
        playerEmail,
        spreadsheetId,
        json: JSON.parse(JSON.stringify(parsingResult.data)),
        revId: metadata.version,
      },
      update: {
        name: characterName,
        json: JSON.parse(JSON.stringify(parsingResult.data)),
        revId: metadata.version,
        ...(playerEmail && { playerEmail }),
      },
    });

    return transformCharacterData({
      ...character,
      json: JSON.parse(JSON.stringify(parsingResult.data)),
    });
  } catch (error) {
    console.error("Error creating/updating character:", error);
    throw error;
  }
}

export async function getCharacter(id: string): Promise<CharacterWithSources | null> {
  const character = await prisma.character.findUnique({
    where: { id },
  });

  if (!character) return null;

  return transformCharacterData(character);
}

export async function listCampaignCharacters(campaignId: string, validateSheets: boolean = false): Promise<CharacterWithSources[]> {
  console.log(`listCampaignCharacters: campaignId=${campaignId}, validateSheets=${validateSheets}`);
  
  const characters = await prisma.character.findMany({
    where: { campaignId },
    orderBy: { name: "asc" },
  });

  console.log(`Found ${characters.length} characters in database for campaign ${campaignId}`);

  if (!validateSheets) {
    console.log('Skipping sheet validation, returning all characters');
    return characters.map(transformCharacterData);
  }

  console.log('Syncing character sheets with Google Drive...');
  
  // Get campaign info for sync
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId }
  });
  
  const validCharacters: CharacterWithSources[] = [];
  
  for (const character of characters) {
    console.log(`Syncing character ${character.name} (${character.id}) with sheet ${character.spreadsheetId}`);
    
    try {
      // Try to sync the character sheet (will create if missing)
      const syncResult = await syncCharacterSheet({
        ...character,
        playerEmail: character.playerEmail || undefined,
        json: character.json as Record<string, unknown> || {}
      }, {
        createIfMissing: true,
        preserveData: true,
        campaignName: campaign?.name,
        folderId: campaign?.folderId || undefined
      });
      
      if (syncResult.success) {
        console.log(`✅ Character ${character.name} synced successfully (${syncResult.action})`);
        
        // If a new sheet was created, get the updated character data
        let updatedCharacter = character;
        if (syncResult.newSpreadsheetId) {
          updatedCharacter = await prisma.character.findUnique({
            where: { id: character.id }
          }) || character;
        }
        
        // Now parse the current data from the sheet to get fresh values
        try {
          const decisions = await prisma.decision.findMany({
            where: {
              OR: [
                { scope: "GLOBAL" },
                { scope: `CAMPAIGN:${campaignId}` },
              ],
            },
          });
          
          const decisionMap: Record<string, Prisma.JsonValue> = {};
          decisions.forEach(decision => {
            decisionMap[decision.key] = decision.value;
          });
          
          const parsingResult = await parseCharacterSheet(updatedCharacter.spreadsheetId, decisionMap);
          
          // Update the character with fresh data from the sheet
          const updatedCharacterWithData = await prisma.character.update({
            where: { id: updatedCharacter.id },
            data: {
              json: JSON.parse(JSON.stringify(parsingResult.data)),
            }
          });
          
          validCharacters.push(transformCharacterData(updatedCharacterWithData));
          console.log(`📊 Updated character ${character.name} with fresh sheet data`);
          
        } catch (parseError) {
          console.warn(`⚠️ Failed to parse sheet data for ${character.name}, using existing data:`, parseError);
          validCharacters.push(transformCharacterData(updatedCharacter));
        }
        
      } else {
        console.warn(`❌ Failed to sync character ${character.name} (${character.id}), but including in results with cached data`);
        // Include the character with existing data even if sync failed
        validCharacters.push(transformCharacterData(character));
      }
      
    } catch (error) {
      console.warn(`❌ Error syncing character ${character.name} (${character.id}):`, error);
      // Include the character with existing data even if there was an error
      console.log(`📦 Including character ${character.name} with cached data`);
      validCharacters.push(transformCharacterData(character));
    }
  }

  console.log(`After sync: ${validCharacters.length} characters available (${characters.length} total)`);
  return validCharacters;
}

export async function refreshCharacter(id: string): Promise<CharacterWithSources> {
  const character = await prisma.character.findUnique({
    where: { id },
  });

  if (!character) {
    throw new Error("Character not found");
  }

  return createOrUpdateCharacter(
    character.campaignId,
    character.spreadsheetId,
    character.playerEmail || undefined
  );
}

export async function deleteCharacter(id: string): Promise<void> {
  await prisma.character.delete({
    where: { id },
  });
}