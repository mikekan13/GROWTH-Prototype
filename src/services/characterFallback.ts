import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { readCharacterFromSheet, type GROWTHCharacterFromSheet } from "./sheetReader";
import { writeCharacterDataToSheet } from "./sheetWriter";
import { syncCharacterSheet } from "./characterSync";
import type { CharacterData as CharacterNodeData } from "@/components/nodes/CharacterCard";

export interface CharacterFallbackOptions {
  preferSheets?: boolean;
  autoSync?: boolean;
  createMissingSheets?: boolean;
  fallbackOnError?: boolean;
}

export interface CharacterDataResult {
  data: CharacterNodeData | null;
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
          await this.createCharacterSheet({
            ...dbCharacter,
            json: dbCharacter.json as Record<string, unknown> | null
          });
          // Refetch after sheet creation
          return this.getCharacterData(characterId, { ...options, createMissingSheets: false });
        }

        return {
          data: this.convertDbToGrowthData({
            ...dbCharacter,
            json: dbCharacter.json as Record<string, unknown> | null
          }),
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
            const dbData = this.convertDbToGrowthData({ ...dbCharacter, json: dbCharacter.json as Record<string, unknown> | null });
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
              data: this.convertDbToGrowthData({ ...dbCharacter, json: dbCharacter.json as Record<string, unknown> | null }),
              source: 'database',
              spreadsheetId,
              syncStatus: 'error'
            };
          }
        } else {
          // Try database first, enhance with sheets if available
          const dbData = this.convertDbToGrowthData({ ...dbCharacter, json: dbCharacter.json as Record<string, unknown> | null });

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
            data: this.convertDbToGrowthData({ ...dbCharacter, json: dbCharacter.json as Record<string, unknown> | null }),
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
  ): Promise<CharacterNodeData | null> {
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
  }): CharacterNodeData {
    // Convert database character to GROWTH format
    const json = (dbCharacter.json as Record<string, unknown>) || {};

    interface DbAttribute {
      current?: number;
      level?: number;
      modifier?: number;
      augmentPositive?: number;
      augmentNegative?: number;
    }

    interface RequiredAttribute {
      current: number;
      level: number;
      modifier: number;
      augmentPositive: number;
      augmentNegative: number;
    }

    // Helper to ensure attribute has all required properties
    const ensureAttribute = (attr: DbAttribute | undefined): RequiredAttribute => ({
      current: attr?.current ?? 0,
      level: attr?.level ?? 10,
      modifier: attr?.modifier ?? 0,
      augmentPositive: attr?.augmentPositive ?? 0,
      augmentNegative: attr?.augmentNegative ?? 0
    });

    // Map old database attribute names to new GROWTH attribute names
    const dbAttributes = (json.attributes as Record<string, DbAttribute>) || {};
    const growthAttributes = {
      // Body Pillar - all Cs
      clout: ensureAttribute(dbAttributes.clout),
      celerity: ensureAttribute(dbAttributes.celerity),
      constitution: ensureAttribute(dbAttributes.constitution),

      // Soul Pillar - all Fs
      focus: ensureAttribute(dbAttributes.focus),
      flow: ensureAttribute(dbAttributes.flow),
      frequency: ensureAttribute(dbAttributes.frequency),

      // Spirit Pillar - all Ws
      wisdom: ensureAttribute(dbAttributes.wisdom),
      wit: ensureAttribute(dbAttributes.wit),
      willpower: ensureAttribute(dbAttributes.willpower),
    };

    const position = json.position as { x?: number; y?: number } | undefined;
    console.log(`🎯 Position debug for character ${dbCharacter.id}:`, {
      'dbCharacter.x': dbCharacter.x,
      'dbCharacter.y': dbCharacter.y,
      'json.position?.x': position?.x,
      'json.position?.y': position?.y,
      'final x': dbCharacter.x ?? position?.x ?? 0,
      'final y': dbCharacter.y ?? position?.y ?? 0
    });

    return {
      id: dbCharacter.id,
      name: dbCharacter.name,
      type: 'character',
      x: dbCharacter.x ?? position?.x ?? 0,
      y: dbCharacter.y ?? position?.y ?? 0,
      krmaValue: 0, // TODO: Calculate from character value
      connections: [], // TODO: Load from database relationships
      color: '#4CAF50', // Default green for characters

      characterDetails: {
        attributes: growthAttributes,
        levels: json.levels as unknown as { healthLevel: number; wealthLevel: number; techLevel: number } | undefined,
        // Store GROWTH-specific data (not part of standard CharacterData interface)
        ...(json as Record<string, unknown>)
      }
    } as CharacterNodeData;
  }

  private static convertSheetsToGrowthData(sheetsCharacter: GROWTHCharacterFromSheet): CharacterNodeData {
    return {
      id: sheetsCharacter.id,
      name: sheetsCharacter.name,
      type: 'character',
      x: 0, // Position is NEVER stored in sheets - always comes from database
      y: 0,
      krmaValue: 0, // TODO: Calculate from character value
      connections: [], // TODO: Load from database relationships
      color: '#4CAF50', // Default green for characters

      characterDetails: {
        attributes: sheetsCharacter.attributes,
        levels: sheetsCharacter.levels as unknown as { healthLevel: number; wealthLevel: number; techLevel: number } | undefined,
        // Store GROWTH-specific data from sheets
        ...(sheetsCharacter as unknown as Record<string, unknown>)
      }
    } as CharacterNodeData;
  }

  private static mergeCharacterData(
    dbData: CharacterNodeData,
    sheetsData: CharacterNodeData
  ): CharacterNodeData {
    // Sheets data takes precedence for core attributes and stats
    // Database data used for position, inventory, spells (not in sheets)
    console.log(`🎯 Merging character data - Using DB position: (${dbData.x}, ${dbData.y})`);

    return {
      ...dbData, // Start with database data

      // Override with sheets data for core character info
      name: sheetsData.name || dbData.name,

      // Position is ALWAYS from database - sheets never involved
      x: dbData.x,
      y: dbData.y,

      // Merge characterDetails - sheets data takes precedence for most fields
      characterDetails: {
        ...dbData.characterDetails,
        ...sheetsData.characterDetails,

        // Keep database-only data (using type assertion for extended properties)
        ...(dbData.characterDetails as Record<string, unknown>)
      }
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
        folderId: dbCharacter.Campaign?.folderId || undefined
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
    data: Partial<CharacterNodeData>,
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
              json: data as unknown as Prisma.InputJsonValue
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