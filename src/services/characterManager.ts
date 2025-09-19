/**
 * GROWTH Character Management Service
 * Handles character creation, loading, and synchronization between database and Google Sheets
 * Based on sub-agent findings and user guidance on GROWTH mechanics
 */

import { prisma } from '@/lib/prisma';
import { GrowthCharacter } from '@/types/growth';
import { sheetsMapper } from './sheetsMapping';

export interface CharacterLoadOptions {
  preferSheets?: boolean;
  useFallback?: boolean;
  autoSync?: boolean;
}

export interface CharacterSource {
  id: string;
  name: string;
  source: 'database' | 'sheets';
  character?: any; // Database character data
  sheetsData?: Partial<GrowthCharacter>; // Google Sheets character data
  spreadsheetId?: string;
  lastSynced?: Date;
}

export class CharacterManager {

  /**
   * Load characters for a campaign with improved stability
   */
  async loadCampaignCharacters(
    campaignId: string,
    options: CharacterLoadOptions = {}
  ): Promise<CharacterSource[]> {
    const { preferSheets = false, useFallback = true, autoSync = false } = options;

    console.log('🔄 Loading characters for campaign:', campaignId, { options });

    try {
      // Always start with database characters
      const dbCharacters = await this.loadDatabaseCharacters(campaignId);
      console.log('📊 Database characters loaded:', dbCharacters.length);

      // If we have database characters and not preferring sheets, return them
      if (dbCharacters.length > 0 && !preferSheets) {
        console.log('✅ Returning database characters');
        return dbCharacters;
      }

      // Try to load from Google Sheets if preferSheets or no database characters
      if (preferSheets || (dbCharacters.length === 0 && useFallback)) {
        console.log('📝 Attempting to load from Google Sheets...');
        const sheetsCharacters = await this.loadSheetsCharacters(campaignId);

        if (sheetsCharacters.length > 0) {
          console.log('✅ Google Sheets characters loaded:', sheetsCharacters.length);

          // Auto-sync to database if requested
          if (autoSync) {
            await this.syncSheetsToDatabase(campaignId, sheetsCharacters);
          }

          return sheetsCharacters;
        }
      }

      // Return database characters if available
      if (dbCharacters.length > 0) {
        console.log('✅ Falling back to database characters');
        return dbCharacters;
      }

      // No characters found anywhere - return sample characters for display
      console.log('⚠️ No characters found, generating sample characters');
      return this.generateSampleCharacters(campaignId);

    } catch (error) {
      console.error('❌ Error loading campaign characters:', error);

      // Fallback to database if available
      try {
        const dbCharacters = await this.loadDatabaseCharacters(campaignId);
        if (dbCharacters.length > 0) {
          console.log('🔄 Using database fallback after error');
          return dbCharacters;
        }
      } catch (dbError) {
        console.error('❌ Database fallback also failed:', dbError);
      }

      // Final fallback to sample characters
      return this.generateSampleCharacters(campaignId);
    }
  }

  /**
   * Load characters from database
   */
  private async loadDatabaseCharacters(campaignId: string): Promise<CharacterSource[]> {
    const characters = await prisma.character.findMany({
      where: { campaignId },
      orderBy: { name: 'asc' }
    });

    return characters.map(char => ({
      id: char.id,
      name: char.name,
      source: 'database' as const,
      character: {
        id: char.id,
        name: char.name,
        ...char.json as any
      },
      spreadsheetId: char.spreadsheetId || undefined,
      lastSynced: char.updatedAt
    }));
  }

  /**
   * Load characters from Google Sheets (campaign folder)
   */
  private async loadSheetsCharacters(campaignId: string): Promise<CharacterSource[]> {
    // TODO: Implement Google Sheets character discovery
    // This would involve:
    // 1. Finding the campaign folder
    // 2. Looking for character sheets in the characters subfolder
    // 3. Reading character data from each sheet using sheetsMapper

    console.log('🚧 Google Sheets character loading not yet implemented');
    return [];
  }

  /**
   * Sync characters from Google Sheets to database
   */
  private async syncSheetsToDatabase(
    campaignId: string,
    sheetsCharacters: CharacterSource[]
  ): Promise<void> {
    console.log('🔄 Syncing characters from sheets to database...');

    for (const sheetChar of sheetsCharacters) {
      if (!sheetChar.sheetsData || !sheetChar.spreadsheetId) continue;

      try {
        // Check if character already exists in database
        const existing = await prisma.character.findFirst({
          where: {
            campaignId,
            spreadsheetId: sheetChar.spreadsheetId
          }
        });

        const characterData = {
          name: sheetChar.sheetsData.identity?.name || sheetChar.name,
          json: sheetChar.sheetsData,
          spreadsheetId: sheetChar.spreadsheetId
        };

        if (existing) {
          // Update existing character
          await prisma.character.update({
            where: { id: existing.id },
            data: characterData
          });
          console.log(`✅ Updated character: ${characterData.name}`);
        } else {
          // Create new character
          await prisma.character.create({
            data: {
              ...characterData,
              campaignId
            }
          });
          console.log(`✅ Created character: ${characterData.name}`);
        }
      } catch (error) {
        console.error(`❌ Failed to sync character ${sheetChar.name}:`, error);
      }
    }
  }

  /**
   * Generate sample characters for display when no real characters exist
   */
  private generateSampleCharacters(campaignId: string): CharacterSource[] {
    return [
      {
        id: 'sample-1',
        name: 'Zara Nightwhisper',
        source: 'database',
        character: this.createSampleCharacter('Zara Nightwhisper', {
          clout: 12, celerity: 14, constitution: 11,
          flow: 13, frequency: 15, focus: 10,
          willpower: 16, wisdom: 12, wit: 9
        })
      },
      {
        id: 'sample-2',
        name: 'Marcus Ironheart',
        source: 'database',
        character: this.createSampleCharacter('Marcus Ironheart', {
          clout: 16, celerity: 10, constitution: 14,
          flow: 8, frequency: 12, focus: 13,
          willpower: 11, wisdom: 10, wit: 14
        })
      },
      {
        id: 'sample-3',
        name: 'Luna Starweaver',
        source: 'database',
        character: this.createSampleCharacter('Luna Starweaver', {
          clout: 9, celerity: 13, constitution: 10,
          flow: 16, frequency: 14, focus: 15,
          willpower: 12, wisdom: 17, wit: 11
        })
      }
    ];
  }

  /**
   * Create a sample character with proper GROWTH structure
   */
  private createSampleCharacter(name: string, attributes: Record<string, number>): any {
    return {
      identity: { name },
      levels: {
        healthLevel: 4,
        techLevel: 4,
        wealthLevel: 4
      },
      conditions: {
        weak: false, clumsy: false, exhausted: false, muted: false,
        deathsDoor: false, deafened: false, overwhelmed: false,
        confused: false, incoherent: false
      },
      attributes: {
        clout: {
          level: attributes.clout,
          current: attributes.clout,
          augmentPositive: 0,
          augmentNegative: 0
        },
        celerity: {
          level: attributes.celerity,
          current: attributes.celerity,
          augmentPositive: 0,
          augmentNegative: 0
        },
        constitution: {
          level: attributes.constitution,
          current: attributes.constitution,
          augmentPositive: 0,
          augmentNegative: 0
        },
        flow: {
          level: attributes.flow,
          current: attributes.flow,
          augmentPositive: 0,
          augmentNegative: 0
        },
        frequency: {
          level: attributes.frequency,
          current: attributes.frequency
        },
        focus: {
          level: attributes.focus,
          current: attributes.focus,
          augmentPositive: 0,
          augmentNegative: 0
        },
        willpower: {
          level: attributes.willpower,
          current: attributes.willpower,
          augmentPositive: 0,
          augmentNegative: 0
        },
        wisdom: {
          level: attributes.wisdom,
          current: attributes.wisdom,
          augmentPositive: 0,
          augmentNegative: 0
        },
        wit: {
          level: attributes.wit,
          current: attributes.wit,
          augmentPositive: 0,
          augmentNegative: 0
        }
      },
      creation: {
        seed: { baseFateDie: 'd6' }
      },
      skills: { skills: [] },
      magic: {
        mercy: { schools: [], knownSpells: [] },
        severity: { schools: [], knownSpells: [] },
        balance: { schools: [], knownSpells: [] }
      },
      nectars: {
        combat: [], learning: [], magic: [], social: [], utility: [],
        supernatural: [], supertech: [], negative: [], natural: []
      },
      vitals: {
        bodyParts: {
          HEAD: 0, NECK: 0, TORSO: 0, RIGHTARM: 0, LEFTARM: 0,
          RIGHTUPPERLEG: 0, LEFTUPPERLEG: 0, RIGHTLOWERLEG: 0, LEFTLOWERLEG: 0
        },
        baseResist: 10,
        restRate: 1,
        carryLevel: attributes.clout,
        weightStatus: 'Fine'
      },
      inventory: { weight: 0, items: [] },
      notes: ''
    };
  }

  /**
   * Create a new character with Google Sheets integration
   */
  async createCharacter(
    campaignId: string,
    characterName: string,
    playerEmail?: string
  ): Promise<CharacterSource> {
    console.log('🎭 Creating new character:', characterName);

    try {
      // Create Google Sheet from template
      const { copySpreadsheet } = await import('./google');
      const templateId = process.env.CHARACTER_TEMPLATE_ID;

      if (!templateId) {
        throw new Error('CHARACTER_TEMPLATE_ID environment variable is required');
      }

      const copiedSheet = await copySpreadsheet(
        templateId,
        `${characterName.trim()} - Character Sheet`
      );

      if (!copiedSheet.id) {
        throw new Error('Failed to copy template spreadsheet');
      }

      // Create character in database
      const character = await prisma.character.create({
        data: {
          name: characterName.trim(),
          campaignId,
          spreadsheetId: copiedSheet.id,
          playerEmail: playerEmail || null,
          json: this.createSampleCharacter(characterName, {
            clout: 10, celerity: 10, constitution: 10,
            flow: 10, frequency: 10, focus: 10,
            willpower: 10, wisdom: 10, wit: 10
          })
        }
      });

      console.log('✅ Character created successfully:', character.name);

      return {
        id: character.id,
        name: character.name,
        source: 'database',
        character: {
          id: character.id,
          name: character.name,
          ...character.json as any
        },
        spreadsheetId: character.spreadsheetId || undefined,
        lastSynced: character.updatedAt
      };

    } catch (error) {
      console.error('❌ Failed to create character:', error);
      throw error;
    }
  }
}

// Default instance
export const characterManager = new CharacterManager();