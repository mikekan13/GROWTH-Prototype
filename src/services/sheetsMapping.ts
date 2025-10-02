/**
 * Google Sheets Named Ranges Mapping Service
 * Maps GROWTH character data to/from Google Sheets template
 * Based on sub-agent extraction of 91 named ranges across 14 sheets
 */

import {
  GrowthCharacter,
  GrowthAttributes,
  SheetsNamedRanges,
  // TODO: These types may be used in future sheet mapping features
  // GrowthSkills,
  // GrowthNectars,
  // SheetsMappingConfig
} from '@/types/growth';
import { getSheetsService } from './google';

// Template ID from sub-agent research
const CHARACTER_TEMPLATE_ID = process.env.CHARACTER_TEMPLATE_ID || '1-4O9-hSkGf8J_Pp729fXaiyBdzTL-pG12t76XX0r1rQ';

// Named ranges mapping (extracted by sub-agent)
export const SHEETS_NAMED_RANGES: SheetsNamedRanges = {
  // Character Information (14 ranges)
  CharacterName: 'Main!B1:C2',
  CharacterImage: 'Main!D1:E2',
  HealthLevel: 'Main!T1:V2',
  TechLevel: 'Main!W1:Y2',
  WealthLevel: 'Main!Z1:AB2',
  TKV: 'TKV',

  // Attributes (24 ranges) - 8 main attributes with levels/current/modifiers
  CloutLevel: 'Main!_5:_6',
  currentClout: 'Main!c6:c6',
  CloutMod: 'Main!e6:e6',
  CelerityLevel: 'Main!_7:_8',
  currentCelerity: 'Main!c8:c8',
  CelerityMod: 'Main!e8:e8',
  ConstitutionLevel: 'Main!_9:_10',
  currentConstitution: 'Main!c10:c10',
  ConstitutionMod: 'Main!e10:e10',
  FlowLevel: 'Main!_11:_12',
  currentFlow: 'Main!c12:c12',
  FlowMod: 'Main!e12:e12',
  FrequencyLevel: 'Main!_13:_14',
  currentFrequency: 'Main!c14:c14',
  FrequencyMod: 'Main!e14:e14',
  FocusLevel: 'Main!_15:_16',
  currentFocus: 'Main!c16:c16',
  FocusMod: 'Main!e16:e16',
  WillpowerLevel: 'Main!_17:_18',
  currentWillpower: 'Main!c18:c18',
  WillpowerMod: 'Main!e18:e18',
  WisdomLevel: 'Main!_19:_20',
  currentWisdom: 'Main!c20:c20',
  WisdomMod: 'Main!e20:e20',
  WitLevel: 'Main!_21:_22',
  currentWit: 'Main!c22:c22',
  WitMod: 'Main!e22:e22',

  // Goals & Opportunities (15 ranges)
  Goal1: 'Main!G18:N19',
  Goal1Key: 'Main!O18:P19',
  Goal2: 'Main!G20:N21',
  Goal2Key: 'Main!O20:P21',
  Goal3: 'Main!G22:N23',
  Goal3Key: 'Main!O22:P23',
  Goal4: 'Main!G24:N25',
  Goal4Key: 'Main!O24:P25',
  Goal5: 'Main!G26:N27',
  Goal5Key: 'Main!O26:P27',
  Opportunity1: 'Main!G29:N30',
  Opportunity1Key: 'Main!O29:P30',
  Opportunity2: 'Main!G31:N32',
  Opportunity2Key: 'Main!O31:P32',
  Opportunity3: 'Main!G33:N34',
  Opportunity3Key: 'Main!O33:P34',
  Opportunity4: 'Main!G35:N36',
  Opportunity4Key: 'Main!O35:P36',
  Opportunity5: 'Main!G37:N38',
  Opportunity5Key: 'Main!O37:P38',

  // Combat & Vitals (9 ranges)
  HEAD: 'Vitals!C3:C3',
  TORSO: 'Vitals!C5:C5',
  RIGHTARM: 'Vitals!C7:C7',
  LEFTARM: 'Vitals!C9:C9',
  RIGHTUPPERLEG: 'Vitals!C11:C11',
  LEFTUPPERLEG: 'Vitals!C13:C13',
  RIGHTLOWERLEG: 'Vitals!C15:C15',
  LEFTLOWERLEG: 'Vitals!C17:C17',
  RestRate: 'Vitals!C21:C21',

  // Inventory (2 ranges)
  InventoryWeight: 'Inventory!G2:G2',
  PossessionsWeight: 'Possessions!G2:G2',

  // Nectar Abilities (8 ranges)
  CombatNectars: 'Combat!A:Z',
  LearningNectars: 'Learning!A:Z',
  MagicNectars: 'Magic!A:Z',
  SocialNectars: 'Social!A:Z',
  UtilityNectars: 'Utility!A:Z',
  SupernaturalNectars: 'Supernatural!A:Z',
  SuperTechNectars: 'SuperTech!A:Z',
  NaturalNectars: 'Natural!A:Z',

  // Dice Rolling (4 ranges)
  RollResult: 'DiceRoller!B5:B5',
  DicePool: 'DiceRoller!B7:B7',
  SelectedSkill: 'DiceRoller!B9:B9',
  SkillBonus: 'DiceRoller!B11:B11'
};

import { sheets_v4 } from 'googleapis';

export class SheetsCharacterMapper {
  private sheets: sheets_v4.Sheets | null = null;
  private templateId: string;

  constructor(templateId: string = CHARACTER_TEMPLATE_ID) {
    this.templateId = templateId;
  }

  private async initSheets() {
    if (!this.sheets) {
      this.sheets = await getSheetsService();
    }
    return this.sheets;
  }

  /**
   * Read values from multiple named ranges in a single batch request
   */
  async batchReadNamedRanges(spreadsheetId: string, ranges: string[]): Promise<Record<string, unknown>> {
    const sheets = await this.initSheets();

    try {
      const response = await sheets.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges,
        valueRenderOption: 'UNFORMATTED_VALUE',
        dateTimeRenderOption: 'FORMATTED_STRING'
      });

      interface ValueRange {
        values?: unknown[][];
      }

      const result: Record<string, unknown> = {};
      (response.data.valueRanges as ValueRange[] | undefined)?.forEach((valueRange, index: number) => {
        const rangeName = ranges[index];
        const values = valueRange.values;

        // Extract single value or array based on range
        if (values && values.length > 0) {
          if (values.length === 1 && values[0].length === 1) {
            result[rangeName] = values[0][0];
          } else {
            result[rangeName] = values;
          }
        } else {
          result[rangeName] = null;
        }
      });

      return result;
    } catch (error) {
      console.error('Error reading named ranges:', error);
      throw error;
    }
  }

  /**
   * Write values to multiple named ranges in a single batch request
   */
  async batchWriteNamedRanges(spreadsheetId: string, updates: Record<string, unknown>): Promise<void> {
    const sheets = await this.initSheets();

    const data = Object.entries(updates).map(([range, value]) => ({
      range,
      values: Array.isArray(value) ? value : [[value]]
    }));

    try {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data
        }
      });
    } catch (error) {
      console.error('Error writing named ranges:', error);
      throw error;
    }
  }

  /**
   * Map GROWTH attributes to Google Sheets ranges
   */
  mapAttributesToRanges(attributes: GrowthAttributes): Record<string, unknown> {
    return {
      [SHEETS_NAMED_RANGES.CloutLevel]: attributes.clout.level,
      [SHEETS_NAMED_RANGES.currentClout]: attributes.clout.current,
      [SHEETS_NAMED_RANGES.CloutMod]: attributes.clout.modifier,

      [SHEETS_NAMED_RANGES.CelerityLevel]: attributes.celerity.level,
      [SHEETS_NAMED_RANGES.currentCelerity]: attributes.celerity.current,
      [SHEETS_NAMED_RANGES.CelerityMod]: attributes.celerity.modifier,

      [SHEETS_NAMED_RANGES.ConstitutionLevel]: attributes.constitution.level,
      [SHEETS_NAMED_RANGES.currentConstitution]: attributes.constitution.current,
      [SHEETS_NAMED_RANGES.ConstitutionMod]: attributes.constitution.modifier,

      [SHEETS_NAMED_RANGES.FlowLevel]: attributes.flow.level,
      [SHEETS_NAMED_RANGES.currentFlow]: attributes.flow.current,
      [SHEETS_NAMED_RANGES.FlowMod]: attributes.flow.modifier,

      [SHEETS_NAMED_RANGES.FrequencyLevel]: attributes.frequency.level,
      [SHEETS_NAMED_RANGES.currentFrequency]: attributes.frequency.current,
      [SHEETS_NAMED_RANGES.FrequencyMod]: attributes.frequency.modifier,

      [SHEETS_NAMED_RANGES.FocusLevel]: attributes.focus.level,
      [SHEETS_NAMED_RANGES.currentFocus]: attributes.focus.current,
      [SHEETS_NAMED_RANGES.FocusMod]: attributes.focus.modifier,

      [SHEETS_NAMED_RANGES.WillpowerLevel]: attributes.willpower.level,
      [SHEETS_NAMED_RANGES.currentWillpower]: attributes.willpower.current,
      [SHEETS_NAMED_RANGES.WillpowerMod]: attributes.willpower.modifier,

      [SHEETS_NAMED_RANGES.WisdomLevel]: attributes.wisdom.level,
      [SHEETS_NAMED_RANGES.currentWisdom]: attributes.wisdom.current,
      [SHEETS_NAMED_RANGES.WisdomMod]: attributes.wisdom.modifier,

      [SHEETS_NAMED_RANGES.WitLevel]: attributes.wit.level,
      [SHEETS_NAMED_RANGES.currentWit]: attributes.wit.current,
      [SHEETS_NAMED_RANGES.WitMod]: attributes.wit.modifier
    };
  }

  /**
   * Map Google Sheets ranges back to GROWTH attributes
   */
  mapRangesToAttributes(ranges: Record<string, unknown>): Partial<GrowthAttributes> {
    return {
      clout: {
        level: ranges[SHEETS_NAMED_RANGES.CloutLevel] || 10,
        current: ranges[SHEETS_NAMED_RANGES.currentClout] || 10,
        modifier: ranges[SHEETS_NAMED_RANGES.CloutMod] || 0,
        augmentPositive: 0,
        augmentNegative: 0
      },
      celerity: {
        level: ranges[SHEETS_NAMED_RANGES.CelerityLevel] || 10,
        current: ranges[SHEETS_NAMED_RANGES.currentCelerity] || 10,
        modifier: ranges[SHEETS_NAMED_RANGES.CelerityMod] || 0,
        augmentPositive: 0,
        augmentNegative: 0
      },
      constitution: {
        level: ranges[SHEETS_NAMED_RANGES.ConstitutionLevel] || 10,
        current: ranges[SHEETS_NAMED_RANGES.currentConstitution] || 10,
        modifier: ranges[SHEETS_NAMED_RANGES.ConstitutionMod] || 0,
        augmentPositive: 0,
        augmentNegative: 0
      },
      flow: {
        level: ranges[SHEETS_NAMED_RANGES.FlowLevel] || 10,
        current: ranges[SHEETS_NAMED_RANGES.currentFlow] || 10,
        modifier: ranges[SHEETS_NAMED_RANGES.FlowMod] || 0,
        augmentPositive: 0,
        augmentNegative: 0
      },
      frequency: {
        level: ranges[SHEETS_NAMED_RANGES.FrequencyLevel] || 10,
        current: ranges[SHEETS_NAMED_RANGES.currentFrequency] || 10,
        modifier: ranges[SHEETS_NAMED_RANGES.FrequencyMod] || 0,
        augmentPositive: 0,
        augmentNegative: 0
      },
      focus: {
        level: ranges[SHEETS_NAMED_RANGES.FocusLevel] || 10,
        current: ranges[SHEETS_NAMED_RANGES.currentFocus] || 10,
        modifier: ranges[SHEETS_NAMED_RANGES.FocusMod] || 0,
        augmentPositive: 0,
        augmentNegative: 0
      },
      willpower: {
        level: ranges[SHEETS_NAMED_RANGES.WillpowerLevel] || 10,
        current: ranges[SHEETS_NAMED_RANGES.currentWillpower] || 10,
        modifier: ranges[SHEETS_NAMED_RANGES.WillpowerMod] || 0,
        augmentPositive: 0,
        augmentNegative: 0
      },
      wisdom: {
        level: ranges[SHEETS_NAMED_RANGES.WisdomLevel] || 10,
        current: ranges[SHEETS_NAMED_RANGES.currentWisdom] || 10,
        modifier: ranges[SHEETS_NAMED_RANGES.WisdomMod] || 0,
        augmentPositive: 0,
        augmentNegative: 0
      },
      wit: {
        level: ranges[SHEETS_NAMED_RANGES.WitLevel] || 10,
        current: ranges[SHEETS_NAMED_RANGES.currentWit] || 10,
        modifier: ranges[SHEETS_NAMED_RANGES.WitMod] || 0,
        augmentPositive: 0,
        augmentNegative: 0
      }
    };
  }

  /**
   * Read full character data from Google Sheets
   */
  async readCharacterFromSheet(spreadsheetId: string): Promise<Partial<GrowthCharacter>> {
    console.log('📖 Reading character data from sheet:', spreadsheetId);

    // Read all core character ranges in a single batch
    const coreRanges = [
      SHEETS_NAMED_RANGES.CharacterName,
      SHEETS_NAMED_RANGES.CharacterImage,
      SHEETS_NAMED_RANGES.HealthLevel,
      SHEETS_NAMED_RANGES.TechLevel,
      SHEETS_NAMED_RANGES.WealthLevel,
      SHEETS_NAMED_RANGES.TKV,

      // All attribute ranges
      ...Object.entries(SHEETS_NAMED_RANGES)
        .filter(([key]) => key.includes('Level') || key.includes('current') || key.includes('Mod'))
        .map(([, range]) => range),

      // Vitals ranges
      SHEETS_NAMED_RANGES.HEAD,
      SHEETS_NAMED_RANGES.TORSO,
      SHEETS_NAMED_RANGES.RIGHTARM,
      SHEETS_NAMED_RANGES.LEFTARM,
      SHEETS_NAMED_RANGES.RIGHTUPPERLEG,
      SHEETS_NAMED_RANGES.LEFTUPPERLEG,
      SHEETS_NAMED_RANGES.RIGHTLOWERLEG,
      SHEETS_NAMED_RANGES.LEFTLOWERLEG,
      SHEETS_NAMED_RANGES.RestRate,

      // Inventory
      SHEETS_NAMED_RANGES.InventoryWeight,
      SHEETS_NAMED_RANGES.PossessionsWeight
    ];

    const ranges = await this.batchReadNamedRanges(spreadsheetId, coreRanges);

    // Map ranges to character structure
    const character: Partial<GrowthCharacter> = {
      identity: {
        name: ranges[SHEETS_NAMED_RANGES.CharacterName] || 'Unnamed Character',
        image: ranges[SHEETS_NAMED_RANGES.CharacterImage] || ''
      },

      levels: {
        healthLevel: ranges[SHEETS_NAMED_RANGES.HealthLevel] || 1,
        techLevel: ranges[SHEETS_NAMED_RANGES.TechLevel] || 1,
        wealthLevel: ranges[SHEETS_NAMED_RANGES.WealthLevel] || 1
      },

      tkv: ranges[SHEETS_NAMED_RANGES.TKV] || 0,

      attributes: this.mapRangesToAttributes(ranges) as GrowthAttributes,

      vitals: {
        bodyParts: {
          HEAD: ranges[SHEETS_NAMED_RANGES.HEAD] || 0,
          NECK: 0, // Not tracked in current sheet
          TORSO: ranges[SHEETS_NAMED_RANGES.TORSO] || 0,
          RIGHTARM: ranges[SHEETS_NAMED_RANGES.RIGHTARM] || 0,
          LEFTARM: ranges[SHEETS_NAMED_RANGES.LEFTARM] || 0,
          RIGHTUPPERLEG: ranges[SHEETS_NAMED_RANGES.RIGHTUPPERLEG] || 0,
          LEFTUPPERLEG: ranges[SHEETS_NAMED_RANGES.LEFTUPPERLEG] || 0,
          RIGHTLOWERLEG: ranges[SHEETS_NAMED_RANGES.RIGHTLOWERLEG] || 0,
          LEFTLOWERLEG: ranges[SHEETS_NAMED_RANGES.LEFTLOWERLEG] || 0
        },
        baseResist: 10,
        restRate: ranges[SHEETS_NAMED_RANGES.RestRate] || 1,
        carryLevel: ranges[SHEETS_NAMED_RANGES.currentClout] || 10,
        weightStatus: 'Fine'
      },

      inventory: {
        weight: (ranges[SHEETS_NAMED_RANGES.InventoryWeight] || 0) + (ranges[SHEETS_NAMED_RANGES.PossessionsWeight] || 0),
        items: []
      }
    };

    console.log('✅ Character data loaded from sheet:', {
      name: character.identity?.name,
      healthLevel: character.levels?.healthLevel,
      cloutLevel: character.attributes?.clout?.level
    });

    return character;
  }

  /**
   * Write full character data to Google Sheets
   */
  async writeCharacterToSheet(spreadsheetId: string, character: GrowthCharacter): Promise<void> {
    console.log('📝 Writing character data to sheet:', spreadsheetId);

    const updates: Record<string, unknown> = {
      // Character identity
      [SHEETS_NAMED_RANGES.CharacterName]: character.identity.name,
      [SHEETS_NAMED_RANGES.CharacterImage]: character.identity.image || '',

      // Levels
      [SHEETS_NAMED_RANGES.HealthLevel]: character.levels.healthLevel,
      [SHEETS_NAMED_RANGES.TechLevel]: character.levels.techLevel,
      [SHEETS_NAMED_RANGES.WealthLevel]: character.levels.wealthLevel,

      // Vitals
      [SHEETS_NAMED_RANGES.HEAD]: character.vitals.bodyParts.HEAD,
      [SHEETS_NAMED_RANGES.TORSO]: character.vitals.bodyParts.TORSO,
      [SHEETS_NAMED_RANGES.RIGHTARM]: character.vitals.bodyParts.RIGHTARM,
      [SHEETS_NAMED_RANGES.LEFTARM]: character.vitals.bodyParts.LEFTARM,
      [SHEETS_NAMED_RANGES.RIGHTUPPERLEG]: character.vitals.bodyParts.RIGHTUPPERLEG,
      [SHEETS_NAMED_RANGES.LEFTUPPERLEG]: character.vitals.bodyParts.LEFTUPPERLEG,
      [SHEETS_NAMED_RANGES.RIGHTLOWERLEG]: character.vitals.bodyParts.RIGHTLOWERLEG,
      [SHEETS_NAMED_RANGES.LEFTLOWERLEG]: character.vitals.bodyParts.LEFTLOWERLEG,
      [SHEETS_NAMED_RANGES.RestRate]: character.vitals.restRate,

      // Inventory weight
      [SHEETS_NAMED_RANGES.InventoryWeight]: character.inventory.weight,

      // Attributes
      ...this.mapAttributesToRanges(character.attributes)
    };

    await this.batchWriteNamedRanges(spreadsheetId, updates);

    console.log('✅ Character data written to sheet successfully');
  }

  /**
   * Sync character data from database to Google Sheets
   */
  async syncDatabaseToSheet(character: GrowthCharacter, spreadsheetId: string): Promise<void> {
    console.log('🔄 Syncing database to sheet for character:', character.identity.name);

    try {
      await this.writeCharacterToSheet(spreadsheetId, character);
      console.log('✅ Database-to-sheet sync complete');
    } catch (error) {
      console.error('❌ Failed to sync database to sheet:', error);
      throw error;
    }
  }

  /**
   * Sync character data from Google Sheets to database format
   */
  async syncSheetToDatabase(spreadsheetId: string): Promise<Partial<GrowthCharacter>> {
    console.log('🔄 Syncing sheet to database format for spreadsheet:', spreadsheetId);

    try {
      const character = await this.readCharacterFromSheet(spreadsheetId);
      console.log('✅ Sheet-to-database sync complete');
      return character;
    } catch (error) {
      console.error('❌ Failed to sync sheet to database:', error);
      throw error;
    }
  }
}

// Default instance
export const sheetsMapper = new SheetsCharacterMapper();

// Validation utilities based on GROWTH mechanics research
export const GrowthValidation = {
  minimumFrequency: 1,

  maxNectarsAndThorns: (fateDie: string): number => {
    const dieValue = parseInt(fateDie.replace('d', ''));
    return dieValue;
  },

  getSkillDie: (level: number): string => {
    if (level <= 3) return `+${level}`;
    if (level <= 5) return 'd4';
    if (level <= 7) return 'd6';
    if (level <= 11) return 'd8';
    if (level <= 19) return 'd12';
    if (level === 20) return 'd20';
    return 'd6'; // fallback
  },

  isEncumbered: (carriedWeight: number, cloutLevel: number): boolean => {
    return carriedWeight > cloutLevel;
  },

  canUseItem: (characterTechLevel: number, itemTechLevel: number): boolean => {
    return characterTechLevel >= itemTechLevel;
  },

  shouldMakeDeathSaves: (currentAge: number, fatedAge: number): boolean => {
    return currentAge >= fatedAge;
  }
};