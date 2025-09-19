import { prisma } from "@/lib/prisma";
import { readCharacterFromSheet, type GROWTHCharacterFromSheet } from "./sheetReader";
import { writeCharacterDataToSheet } from "./sheetWriter";
import { syncCharacterSheet } from "./characterSync";
import type { GROWTHCharacterData } from "@/components/nodes/CharacterCard";

export interface CharacterFallbackOptions {
  preferSheets?: boolean;
  autoSync?: boolean;
  createMissingSheets?: boolean;
  fallbackOnError?: boolean;
}

export interface CharacterDataResult {
  data: GROWTHCharacterData | null;
  source: 'database' | 'sheets' | 'hybrid';
  spreadsheetId?: string;
  syncStatus?: 'synced' | 'sheets_newer' | 'database_newer' | 'error';
  error?: string;
}

export class CharacterFallbackService {

  static async getCharacterData(
    characterId: string,
    options: CharacterFallbackOptions = {}
  ): Promise<CharacterDataResult> {
    const {
      preferSheets = false,
      autoSync = true,
      createMissingSheets = true,
      fallbackOnError = true
    } = options;

    console.log(`🔄 Fetching character data for ${characterId} (preferSheets: ${preferSheets})`);

    try {
      // Always get database record first for metadata
      const dbCharacter = await prisma.character.findUnique({
        where: { id: characterId },
        include: { Campaign: true }
      });

      if (!dbCharacter) {
        console.log(`❌ Character ${characterId} not found in database`);
        return { data: null, source: 'database', error: 'Character not found' };
      }

      // If no spreadsheet linked, return database data
      if (!dbCharacter.spreadsheetId) {
        console.log(`📋 Character ${characterId} has no linked spreadsheet`);

        if (createMissingSheets && autoSync) {
          console.log(`🛠️ Creating new spreadsheet for character ${characterId}`);
          await this.createCharacterSheet(dbCharacter);
          // Refetch after sheet creation
          return this.getCharacterData(characterId, { ...options, createMissingSheets: false });
        }

        return {
          data: this.convertDbToGrowthData(dbCharacter),
          source: 'database',
          syncStatus: 'error'
        };
      }

      const spreadsheetId = dbCharacter.spreadsheetId;

      try {
        if (preferSheets) {
          // Try sheets first, but always merge with database for position data
          const sheetsData = await this.getFromSheets(characterId, spreadsheetId);
          if (sheetsData) {
            console.log(`✅ Got character data from Google Sheets, merging with database position`);
            const dbData = this.convertDbToGrowthData(dbCharacter);
            const mergedData = this.mergeCharacterData(dbData, sheetsData);
            return {
              data: mergedData,
              source: 'hybrid',
              spreadsheetId,
              syncStatus: 'synced'
            };
          }

          if (fallbackOnError) {
            console.log(`⚠️ Falling back to database data`);
            return {
              data: this.convertDbToGrowthData(dbCharacter),
              source: 'database',
              spreadsheetId,
              syncStatus: 'error'
            };
          }
        } else {
          // Try database first, enhance with sheets if available
          const dbData = this.convertDbToGrowthData(dbCharacter);

          try {
            const sheetsData = await this.getFromSheets(characterId, spreadsheetId);
            if (sheetsData && autoSync) {
              console.log(`🔄 Merging database and sheets data`);
              const mergedData = this.mergeCharacterData(dbData, sheetsData);
              return {
                data: mergedData,
                source: 'hybrid',
                spreadsheetId,
                syncStatus: 'synced'
              };
            }
          } catch (sheetsError) {
            console.warn(`⚠️ Could not read from sheets, using database data:`, sheetsError);
          }

          return {
            data: dbData,
            source: 'database',
            spreadsheetId,
            syncStatus: 'database_newer'
          };
        }

      } catch (error) {
        console.error(`❌ Error accessing character data:`, error);

        if (fallbackOnError) {
          return {
            data: this.convertDbToGrowthData(dbCharacter),
            source: 'database',
            spreadsheetId,
            syncStatus: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }

        throw error;
      }

    } catch (error) {
      console.error(`❌ Failed to get character data for ${characterId}:`, error);
      return {
        data: null,
        source: 'database',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }

    return { data: null, source: 'database', error: 'No data source available' };
  }

  private static async getFromSheets(
    characterId: string,
    spreadsheetId: string
  ): Promise<GROWTHCharacterData | null> {
    try {
      const sheetsCharacter = await readCharacterFromSheet(spreadsheetId, characterId);
      if (!sheetsCharacter) return null;

      // Convert sheets format to our component format
      return this.convertSheetsToGrowthData(sheetsCharacter);

    } catch (error) {
      console.error(`❌ Failed to read from sheets ${spreadsheetId}:`, error);
      return null;
    }
  }

  private static convertDbToGrowthData(dbCharacter: {
    id: string;
    name: string;
    json: Record<string, unknown> | null;
    x?: number | null;
    y?: number | null;
  }): GROWTHCharacterData {
    // Convert database character to GROWTH format
    const json = (dbCharacter.json as Record<string, unknown>) || {};

    // Map old database attribute names to new GROWTH attribute names
    const dbAttributes = (json.attributes as Record<string, any>) || {};
    const growthAttributes = {
      // Body Pillar - all Cs
      clout: dbAttributes.clout || { current: 0, level: 10, modifier: 0, augmentPositive: 0, augmentNegative: 0 },
      celerity: dbAttributes.celerity || { current: 0, level: 10, modifier: 0, augmentPositive: 0, augmentNegative: 0 },
      constitution: dbAttributes.constitution || { current: 0, level: 10, modifier: 0, augmentPositive: 0, augmentNegative: 0 },

      // Soul Pillar - all Fs
      focus: dbAttributes.focus || { current: 0, level: 10, modifier: 0, augmentPositive: 0, augmentNegative: 0 },
      flow: dbAttributes.flow || { current: 0, level: 10, modifier: 0, augmentPositive: 0, augmentNegative: 0 },
      frequency: dbAttributes.frequency || { current: 0, level: 10, modifier: 0, augmentPositive: 0, augmentNegative: 0 },

      // Spirit Pillar - all Ws
      wisdom: dbAttributes.wisdom || { current: 0, level: 10, modifier: 0, augmentPositive: 0, augmentNegative: 0 },
      wit: dbAttributes.wit || { current: 0, level: 10, modifier: 0, augmentPositive: 0, augmentNegative: 0 },
      willpower: dbAttributes.willpower || { current: 0, level: 10, modifier: 0, augmentPositive: 0, augmentNegative: 0 },
    };

    console.log(`🎯 Position debug for character ${dbCharacter.id}:`, {
      'dbCharacter.x': dbCharacter.x,
      'dbCharacter.y': dbCharacter.y,
      'json.position?.x': json.position?.x,
      'json.position?.y': json.position?.y,
      'final x': dbCharacter.x ?? json.position?.x ?? 0,
      'final y': dbCharacter.y ?? json.position?.y ?? 0
    });

    return {
      id: dbCharacter.id,
      name: dbCharacter.name,
      image: json.identity?.image,
      type: 'character',
      x: dbCharacter.x ?? json.position?.x ?? 0,
      y: dbCharacter.y ?? json.position?.y ?? 0,

      attributes: growthAttributes,

      creation: json.creation || {
        seed: { name: 'Unknown', baseFateDie: 'd6', frequencyBudget: 20 },
        root: { name: 'Unknown', primaryPillar: 'Balance', flavorText: '' },
        branch: { name: 'Unknown', associatedPillar: 'Balance', flavorText: '' }
      },

      magicPillars: json.magicPillars || {
        mercy: { schools: [], nectars: [] },
        severity: { schools: [], nectars: [] },
        balance: { schools: [], nectars: [] }
      },

      levels: json.levels || { overall: 1, body: 1, soul: 1, spirit: 1 },
      conditions: json.conditions || [],
      skills: json.skills || [],
      inventory: json.inventory || [],
      spells: json.spells || [],
      notes: json.notes || ''
    };
  }

  private static convertSheetsToGrowthData(sheetsCharacter: GROWTHCharacterFromSheet): GROWTHCharacterData {
    return {
      id: sheetsCharacter.id,
      name: sheetsCharacter.name,
      image: sheetsCharacter.image,
      type: 'character',
      x: 0, // Position is NEVER stored in sheets - always comes from database
      y: 0,

      attributes: sheetsCharacter.attributes,
      creation: sheetsCharacter.creation,
      magicPillars: sheetsCharacter.magicPillars,
      levels: sheetsCharacter.levels,
      conditions: sheetsCharacter.conditions,
      skills: sheetsCharacter.skills,
      inventory: [], // TODO: Add inventory support to sheets
      spells: [], // TODO: Add spells support to sheets
      notes: '' // TODO: Add notes support to sheets
    };
  }

  private static mergeCharacterData(
    dbData: GROWTHCharacterData,
    sheetsData: GROWTHCharacterData
  ): GROWTHCharacterData {
    // Sheets data takes precedence for core attributes and stats
    // Database data used for position, inventory, spells (not in sheets)
    console.log(`🎯 Merging character data - Using DB position: (${dbData.x}, ${dbData.y})`);

    return {
      ...dbData, // Start with database data

      // Override with sheets data for core character info
      name: sheetsData.name || dbData.name,
      image: sheetsData.image || dbData.image,
      attributes: sheetsData.attributes,
      creation: sheetsData.creation,
      magicPillars: sheetsData.magicPillars,
      levels: sheetsData.levels,
      conditions: sheetsData.conditions,
      skills: sheetsData.skills,

      // Keep database data for things not in sheets
      inventory: dbData.inventory,
      spells: dbData.spells,
      notes: dbData.notes,
      // Position is ALWAYS from database - sheets never involved
      x: dbData.x,
      y: dbData.y
    };
  }

  private static async createCharacterSheet(dbCharacter: {
    id: string;
    name: string;
    campaignId: string;
    playerEmail?: string | null;
    spreadsheetId?: string | null;
    json: Record<string, unknown> | null;
    Campaign?: { name?: string; folderId?: string | null } | null;
  }): Promise<void> {
    try {
      console.log(`🛠️ Creating character sheet for ${dbCharacter.name}`);

      const result = await syncCharacterSheet({
        id: dbCharacter.id,
        campaignId: dbCharacter.campaignId,
        name: dbCharacter.name,
        playerEmail: dbCharacter.playerEmail || undefined,
        spreadsheetId: dbCharacter.spreadsheetId || '',
        json: (dbCharacter.json as Record<string, unknown>) || {}
      }, {
        createIfMissing: true,
        preserveData: true,
        campaignName: dbCharacter.Campaign?.name,
        folderId: dbCharacter.Campaign?.folderId
      });

      if (result.success && result.newSpreadsheetId) {
        console.log(`✅ Created character sheet: ${result.newSpreadsheetId}`);
      } else {
        console.warn(`⚠️ Character sheet creation failed:`, result);
      }

    } catch (error) {
      console.error(`❌ Failed to create character sheet:`, error);
      throw error;
    }
  }

  static async saveCharacterData(
    characterId: string,
    data: Partial<GROWTHCharacterData>,
    options: { syncToSheets?: boolean; updateDatabase?: boolean } = {}
  ): Promise<{ success: boolean; error?: string }> {
    const { syncToSheets = true, updateDatabase = true } = options;

    try {
      let dbResult = true;
      let sheetsResult = true;

      // Update database
      if (updateDatabase) {
        try {
          await prisma.character.update({
            where: { id: characterId },
            data: {
              name: data.name,
              json: data as Record<string, unknown>
            }
          });
          console.log(`✅ Updated character ${characterId} in database`);
        } catch (dbError) {
          console.error(`❌ Failed to update database:`, dbError);
          dbResult = false;
        }
      }

      // Sync to sheets
      if (syncToSheets) {
        try {
          const character = await prisma.character.findUnique({
            where: { id: characterId }
          });

          if (character?.spreadsheetId) {
            await writeCharacterDataToSheet(character.spreadsheetId, data as Record<string, unknown>);
            console.log(`✅ Synced character ${characterId} to Google Sheets`);
          }
        } catch (sheetsError) {
          console.error(`❌ Failed to sync to sheets:`, sheetsError);
          sheetsResult = false;
        }
      }

      return {
        success: dbResult && sheetsResult,
        error: !dbResult ? 'Database update failed' : !sheetsResult ? 'Sheets sync failed' : undefined
      };

    } catch (error) {
      console.error(`❌ Failed to save character data:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  static async listCampaignCharacters(
    campaignId: string,
    options: CharacterFallbackOptions = {}
  ): Promise<CharacterDataResult[]> {
    try {
      const characters = await prisma.character.findMany({
        where: { campaignId },
        orderBy: { name: 'asc' }
      });

      console.log(`📋 Found ${characters.length} characters in campaign ${campaignId}`);

      const results = await Promise.all(
        characters.map(char => this.getCharacterData(char.id, options))
      );

      return results;

    } catch (error) {
      console.error(`❌ Failed to list campaign characters:`, error);
      return [];
    }
  }
}

// Convenience functions for direct use
export const getCharacterWithFallback = CharacterFallbackService.getCharacterData;
export const saveCharacterWithSync = CharacterFallbackService.saveCharacterData;
export const listCampaignCharactersWithFallback = CharacterFallbackService.listCampaignCharacters;