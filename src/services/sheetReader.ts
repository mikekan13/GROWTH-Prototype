import { getNamedRanges, batchGetSheetData } from "./google";
import type { GROWTHAttribute } from "@/components/nodes/CharacterCard";

export interface GROWTHCharacterFromSheet {
  id: string;
  name: string;
  image?: string;
  attributes: {
    clout: GROWTHAttribute;
    celerity: GROWTHAttribute;
    constitution: GROWTHAttribute;
    focus: GROWTHAttribute;
    frequency: GROWTHAttribute;
    flow: GROWTHAttribute;
    willpower: GROWTHAttribute;
    wisdom: GROWTHAttribute;
    wit: GROWTHAttribute;
  };
  creation: {
    seed: { name: string; baseFateDie: string; frequencyBudget: number };
    root: { name: string; primaryPillar: string; flavorText: string };
    branch: { name: string; associatedPillar: string; flavorText: string };
  };
  magicPillars: {
    mercy: { schools: string[]; nectars: string[] };
    severity: { schools: string[]; nectars: string[] };
    balance: { schools: string[]; nectars: string[] };
  };
  levels: {
    overall: number;
    body: number;
    soul: number;
    spirit: number;
  };
  conditions: string[];
  skills: Array<{ name: string; level: number; pillar: string }>;
}

// Map Google Sheets named ranges to our data structure
const NAMED_RANGE_MAP = {
  // Character Identity
  characterName: 'CharacterName',
  characterImage: 'CharacterImage',

  // Attribute Current Values
  currentClout: 'currentClout',
  currentCelerity: 'currentCelerity',
  currentConstitution: 'currentConstitution',
  currentFocus: 'currentFocus',
  currentFrequency: 'currentFrequency',
  currentFlow: 'currentFlow',
  currentWillpower: 'currentWillpower',
  currentWisdom: 'currentWisdom',
  currentWit: 'currentWit',

  // Attribute Levels (not used for Frequency)
  cloutLevel: 'CloutLevel',
  celerityLevel: 'CelerityLevel',
  constitutionLevel: 'ConstitutionLevel',
  focusLevel: 'FocusLevel',
  frequency: 'Frequency', // Special: Frequency is just a raw value
  flowLevel: 'FlowLevel',
  willpowerLevel: 'WillpowerLevel',
  wisdomLevel: 'WisdomLevel',
  witLevel: 'WitLevel',

  // Attribute Augments (Equipment/Magic)
  cloutAugmentPositive: 'CloutAugmentPositive',
  celerityAugmentPositive: 'CelerityAugmentPositive',
  constitutionAugmentPositive: 'ConstitutionAugmentPositive',
  focusAugmentPositive: 'FocusAugmentPositive',
  // Frequency has no augments
  flowAugmentPositive: 'FlowAugmentPositive',
  willpowerAugmentPositive: 'WillpowerAugmentPositive',
  wisdomAugmentPositive: 'WisdomAugmentPositive',
  witAugmentPositive: 'WitAugmentPositive',

  cloutAugmentNegative: 'CloutAugmentNegative',
  celerityAugmentNegative: 'CelerityAugmentNegative',
  constitutionAugmentNegative: 'ConstitutionAugmentNegative',
  focusAugmentNegative: 'FocusAugmentNegative',
  // Frequency has no augments
  flowAugmentNegative: 'FlowAugmentNegative',
  willpowerAugmentNegative: 'WillpowerAugmentNegative',
  wisdomAugmentNegative: 'WisdomAugmentNegative',
  witAugmentNegative: 'WitAugmentNegative',

  // Creation System
  seedName: 'SeedName',
  seedBaseFateDie: 'SeedBaseFateDie',
  seedFrequencyBudget: 'SeedFrequencyBudget',
  rootName: 'RootName',
  rootPrimaryPillar: 'RootPrimaryPillar',
  rootFlavorText: 'RootFlavorText',
  branchName: 'BranchName',
  branchAssociatedPillar: 'BranchAssociatedPillar',
  branchFlavorText: 'BranchFlavorText',

  // Levels
  overallLevel: 'OverallLevel',
  bodyLevel: 'BodyLevel',
  soulLevel: 'SoulLevel',
  spiritLevel: 'SpiritLevel',

  // Magic Pillars - Schools
  mercySchools: 'MercySchools',
  severitySchools: 'SeveritySchools',
  balanceSchools: 'BalanceSchools',

  // Magic Pillars - Nectars
  mercyNectars: 'MercyNectars',
  severityNectars: 'SeverityNectars',
  balanceNectars: 'BalanceNectars',

  // Conditions (status effects)
  conditions: 'Conditions',

  // Skills
  skills: 'Skills',
} as const;

export async function readCharacterFromSheet(
  spreadsheetId: string,
  characterId: string
): Promise<GROWTHCharacterFromSheet | null> {
  console.log(`📖 Reading character data from sheet ${spreadsheetId}`);

  try {
    // First check if the sheet has named ranges
    const namedRanges = await getNamedRanges(spreadsheetId);
    console.log(`📋 Found ${namedRanges.length} named ranges in sheet`);

    if (namedRanges.length === 0) {
      console.warn(`⚠️ No named ranges found in sheet ${spreadsheetId} - might not be a GROWTH character sheet`);
      return null;
    }

    // Batch get all the data we need
    const rangeNames = Object.values(NAMED_RANGE_MAP);
    const availableRanges = rangeNames.filter(rangeName =>
      namedRanges.some(nr => nr.name === rangeName)
    );

    console.log(`📊 Reading ${availableRanges.length} data ranges from sheet`);

    const valueRanges = await batchGetSheetData(spreadsheetId, availableRanges);

    // Create a map of range name to value for easy lookup
    // Map uses the KEYS from NAMED_RANGE_MAP (code-friendly names like 'cloutLevel')
    // instead of the VALUES (Google Sheets names like 'CloutLevel')
    const dataMap = new Map<string, unknown>();
    valueRanges.forEach((range, index) => {
      const sheetRangeName = availableRanges[index]; // e.g., 'CloutLevel'
      // Find the key that maps to this sheet range name
      const mapKey = Object.keys(NAMED_RANGE_MAP).find(
        key => NAMED_RANGE_MAP[key as keyof typeof NAMED_RANGE_MAP] === sheetRangeName
      );
      if (mapKey) {
        const value = range.values?.[0]?.[0];
        if (value !== undefined && value !== null && value !== '') {
          dataMap.set(mapKey, value); // FIX: Use the map key (e.g., 'cloutLevel')
          // Debug logging for critical attributes
          if (sheetRangeName.includes('Clout') || sheetRangeName.includes('Celerity')) {
            console.log(`📝 DEBUG: ${sheetRangeName} -> ${mapKey} = ${value}`);
          }
        }
      }
    });

    // Debug: Show what we have for clout
    console.log(`🔍 DEBUG clout data:`, {
      cloutLevel: dataMap.get('cloutLevel'),
      currentClout: dataMap.get('currentClout'),
      cloutAugmentPositive: dataMap.get('cloutAugmentPositive'),
      cloutAugmentNegative: dataMap.get('cloutAugmentNegative'),
    });

    // Helper function to get numeric value with default
    const getNumeric = (rangeName: string, defaultValue: number = 0): number => {
      const value = dataMap.get(rangeName);
      if (typeof value === 'number') return value;
      if (typeof value === 'string') {
        const parsed = parseInt(value, 10);
        return isNaN(parsed) ? defaultValue : parsed;
      }
      return defaultValue;
    };

    // Helper function to get string value with default
    const getString = (rangeName: string, defaultValue: string = ''): string => {
      const value = dataMap.get(rangeName);
      return typeof value === 'string' ? value : String(value || defaultValue);
    };

    // Helper function to get array from comma-separated string
    const getArray = (rangeName: string): string[] => {
      const value = getString(rangeName);
      return value ? value.split(',').map(s => s.trim()).filter(s => s.length > 0) : [];
    };

    // Helper function to calculate modifier from level
    const calculateModifier = (level: number): number => {
      return Math.floor((level - 10) / 2);
    };

    // Build GROWTH attribute from sheet data
    const buildAttribute = (attrName: string): GROWTHAttribute => {
      const current = getNumeric(`current${attrName.charAt(0).toUpperCase() + attrName.slice(1)}`);
      const level = getNumeric(`${attrName}Level`, 10);
      const augmentPositive = getNumeric(`${attrName}AugmentPositive`);
      const augmentNegative = getNumeric(`${attrName}AugmentNegative`);

      return {
        current,
        level,
        modifier: calculateModifier(level),
        augmentPositive,
        augmentNegative,
      };
    };

    // Build Frequency attribute (special case - no level/augments, just raw value)
    const buildFrequencyAttribute = (): GROWTHAttribute => {
      const frequencyValue = getNumeric('frequency', 0); // Fixed: use lowercase key
      const current = getNumeric('currentFrequency', frequencyValue);

      return {
        current,
        level: frequencyValue, // Frequency itself is the "level"
        modifier: 0, // No modifier for Frequency
        augmentPositive: 0,
        augmentNegative: 0,
      };
    };

    // Parse skills from sheet data
    const parseSkills = (): Array<{ name: string; level: number; pillar: string }> => {
      const skillsData = getString('Skills');
      if (!skillsData) return [];

      // Expected format: "Skill1:Level1:Pillar1,Skill2:Level2:Pillar2"
      return skillsData.split(',').map(skillEntry => {
        const [name, levelStr, pillar] = skillEntry.split(':').map(s => s.trim());
        return {
          name: name || 'Unknown Skill',
          level: parseInt(levelStr, 10) || 0,
          pillar: pillar || 'Unknown'
        };
      }).filter(skill => skill.name !== 'Unknown Skill');
    };

    // Build the character object
    const character: GROWTHCharacterFromSheet = {
      id: characterId,
      name: getString('CharacterName', 'Unnamed Character'),
      image: getString('CharacterImage'),

      attributes: {
        clout: buildAttribute('clout'),
        celerity: buildAttribute('celerity'),
        constitution: buildAttribute('constitution'),
        focus: buildAttribute('focus'),
        frequency: buildFrequencyAttribute(), // Special handling
        flow: buildAttribute('flow'),
        willpower: buildAttribute('willpower'),
        wisdom: buildAttribute('wisdom'),
        wit: buildAttribute('wit'),
      },

      creation: {
        seed: {
          name: getString('SeedName', 'Unknown Seed'),
          baseFateDie: getString('SeedBaseFateDie', 'd6'),
          frequencyBudget: getNumeric('SeedFrequencyBudget', 20),
        },
        root: {
          name: getString('RootName', 'Unknown Root'),
          primaryPillar: getString('RootPrimaryPillar', 'Balance'),
          flavorText: getString('RootFlavorText'),
        },
        branch: {
          name: getString('BranchName', 'Unknown Branch'),
          associatedPillar: getString('BranchAssociatedPillar', 'Balance'),
          flavorText: getString('BranchFlavorText'),
        },
      },

      magicPillars: {
        mercy: {
          schools: getArray('MercySchools'),
          nectars: getArray('MercyNectars'),
        },
        severity: {
          schools: getArray('SeveritySchools'),
          nectars: getArray('SeverityNectars'),
        },
        balance: {
          schools: getArray('BalanceSchools'),
          nectars: getArray('BalanceNectars'),
        },
      },

      levels: {
        overall: getNumeric('OverallLevel', 1),
        body: getNumeric('BodyLevel', 1),
        soul: getNumeric('SoulLevel', 1),
        spirit: getNumeric('SpiritLevel', 1),
      },

      conditions: getArray('Conditions'),
      skills: parseSkills(),
    };

    console.log(`✅ Successfully read character "${character.name}" from sheet`);
    console.log(`📊 Character level ${character.levels.overall}, ${character.skills.length} skills, ${character.conditions.length} conditions`);

    return character;

  } catch (error) {
    console.error(`❌ Failed to read character data from sheet ${spreadsheetId}:`, error);
    throw error;
  }
}

export async function validateCharacterSheet(spreadsheetId: string): Promise<{
  isValid: boolean;
  missingRanges: string[];
  availableRanges: string[];
}> {
  console.log(`🔍 Validating character sheet ${spreadsheetId}`);

  try {
    const namedRanges = await getNamedRanges(spreadsheetId);
    const availableRangeNames = namedRanges.map(nr => nr.name || '').filter(name => name);
    const requiredRanges = Object.values(NAMED_RANGE_MAP);

    const missingRanges = requiredRanges.filter(rangeName =>
      !availableRangeNames.includes(rangeName)
    );

    const isValid = missingRanges.length === 0;

    console.log(`📋 Sheet validation: ${isValid ? '✅ Valid' : '❌ Invalid'}`);
    if (!isValid) {
      console.log(`❌ Missing ranges: ${missingRanges.join(', ')}`);
    }

    return {
      isValid,
      missingRanges,
      availableRanges: availableRangeNames,
    };

  } catch (error) {
    console.error(`❌ Failed to validate character sheet ${spreadsheetId}:`, error);
    return {
      isValid: false,
      missingRanges: Object.values(NAMED_RANGE_MAP),
      availableRanges: [],
    };
  }
}

export async function listCharacterSheetsInFolder(folderId: string): Promise<Array<{
  id: string;
  name: string;
  modifiedTime: string;
  isValidCharacterSheet?: boolean;
}>> {
  console.log(`📁 Listing character sheets in folder ${folderId}`);

  try {
    const { listFolderContents } = await import('./google');
    const files = await listFolderContents(folderId);

    // Filter for spreadsheets
    const spreadsheets = files.filter(file =>
      file.mimeType === 'application/vnd.google-apps.spreadsheet'
    );

    console.log(`📊 Found ${spreadsheets.length} spreadsheets in folder`);

    // For each spreadsheet, check if it's a valid character sheet
    const characterSheets = await Promise.all(
      spreadsheets.map(async (file) => {
        try {
          const validation = await validateCharacterSheet(file.id!);
          return {
            id: file.id!,
            name: file.name!,
            modifiedTime: file.modifiedTime!,
            isValidCharacterSheet: validation.isValid,
          };
        } catch (error) {
          console.warn(`⚠️ Could not validate sheet ${file.name}:`, error);
          return {
            id: file.id!,
            name: file.name!,
            modifiedTime: file.modifiedTime!,
            isValidCharacterSheet: false,
          };
        }
      })
    );

    const validCharacterSheets = characterSheets.filter(sheet => sheet.isValidCharacterSheet);
    console.log(`✅ Found ${validCharacterSheets.length} valid character sheets`);

    return characterSheets;

  } catch (error) {
    console.error(`❌ Failed to list character sheets in folder ${folderId}:`, error);
    throw error;
  }
}