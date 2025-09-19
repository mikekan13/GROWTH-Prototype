import { getNamedRanges, batchGetSheetData, getSheetsService } from "./google";

// Known named ranges from the v0.5 sheet specification
const KNOWN_NAMED_RANGES: Record<string, string> = {
  // Identity
  CharacterName: "identity.name",
  CharacterImage: "identity.image",
  
  // Attributes - current values
  currentClout: "attributes.clout.current",
  currentCelerity: "attributes.celerity.current", 
  currentConstitution: "attributes.constitution.current",
  currentFocus: "attributes.focus.current",
  currentFlow: "attributes.flow.current",
  currentFrequency: "attributes.frequency.current",
  currentWillpower: "attributes.willpower.current",
  currentWisdom: "attributes.wisdom.current",
  currentWit: "attributes.wit.current",
  
  // Attributes - levels
  CloutLevel: "attributes.clout.level",
  CelerityLevel: "attributes.celerity.level",
  ConstitutionLevel: "attributes.constitution.level", 
  FocusLevel: "attributes.focus.level",
  FlowLevel: "attributes.flow.level",
  FrequencyLevel: "attributes.frequency.level",
  WillpowerLevel: "attributes.willpower.level",
  WisdomLevel: "attributes.wisdom.level",
  WitLevel: "attributes.wit.level",
  
  // Attributes - augments (combined for backwards compatibility)
  CloutAugment: "attributes.clout.augment",
  CelerityAugment: "attributes.celerity.augment",
  ConstitutionAugment: "attributes.constitution.augment",
  FocusAugment: "attributes.focus.augment",
  FlowAugment: "attributes.flow.augment",
  FrequencyAugment: "attributes.frequency.augment",
  WillpowerAugment: "attributes.willpower.augment",
  WisdomAugment: "attributes.wisdom.augment",
  WitAugment: "attributes.wit.augment",
  
  // Attributes - separate positive/negative augments
  CloutAugmentPositive: "attributes.clout.augmentPositive",
  CelerityAugmentPositive: "attributes.celerity.augmentPositive",
  ConstitutionAugmentPositive: "attributes.constitution.augmentPositive",
  FocusAugmentPositive: "attributes.focus.augmentPositive",
  FlowAugmentPositive: "attributes.flow.augmentPositive",
  FrequencyAugmentPositive: "attributes.frequency.augmentPositive",
  WillpowerAugmentPositive: "attributes.willpower.augmentPositive",
  WisdomAugmentPositive: "attributes.wisdom.augmentPositive",
  WitAugmentPositive: "attributes.wit.augmentPositive",
  
  CloutAugmentNegative: "attributes.clout.augmentNegative",
  CelerityAugmentNegative: "attributes.celerity.augmentNegative", 
  ConstitutionAugmentNegative: "attributes.constitution.augmentNegative",
  FocusAugmentNegative: "attributes.focus.augmentNegative",
  FlowAugmentNegative: "attributes.flow.augmentNegative",
  FrequencyAugmentNegative: "attributes.frequency.augmentNegative",
  WillpowerAugmentNegative: "attributes.willpower.augmentNegative",
  WisdomAugmentNegative: "attributes.wisdom.augmentNegative",
  WitAugmentNegative: "attributes.wit.augmentNegative",
  
  // Vitals/Body parts (uppercase)
  HEAD: "vitals.bodyParts.HEAD",
  NECK: "vitals.bodyParts.NECK", 
  RIGHTUPPERLEG: "vitals.bodyParts.RIGHTUPPERLEG",
  LEFTUPPERLEG: "vitals.bodyParts.LEFTUPPERLEG",
  RIGHTLOWERLEG: "vitals.bodyParts.RIGHTLOWERLEG",
  LEFTLOWERLEG: "vitals.bodyParts.LEFTLOWERLEG",
  RIGHTARM: "vitals.bodyParts.RIGHTARM",
  LEFTARM: "vitals.bodyParts.LEFTARM",
  TORSO: "vitals.bodyParts.TORSO",
  
  // Nectars by category
  CombatNectars: "rulesData.nectars.combat",
  LearningNectars: "rulesData.nectars.learning",
  MagicNectars: "rulesData.nectars.magic",
  SocialNectars: "rulesData.nectars.social", 
  UtilityNectars: "rulesData.nectars.utility",
  SupernaturalNectars: "rulesData.nectars.supernatural",
  SuperTechNectars: "rulesData.nectars.supertech",
  NegativeNectars: "rulesData.nectars.negative",
  NaturalNectars: "rulesData.nectars.natural",
  
  // Inventory
  WEIGHT: "inventory.weight",
  
  // Read-only dice roller fields (FYI)
  DiceRollInput: "_dice.rollInput",
  rollingSkill: "_dice.rollingSkill", 
  Effort: "_dice.effort",
  rollMana: "_dice.rollMana",
  rollFrequency: "_dice.rollFrequency",
};

export interface ParsedCharacterData {
  identity: {
    name?: string;
    player?: string;
    image?: string;
  };
  attributes: {
    [key: string]: {
      current?: number;
      level?: number; 
      augment?: number;
      augmentPositive?: number;
      augmentNegative?: number;
    };
  };
  vitals: {
    bodyParts: {
      [key: string]: number | string | boolean | null;
    };
  };
  rulesData: {
    nectars: {
      [category: string]: unknown[];
    };
  };
  inventory: {
    weight?: number;
    items?: unknown[];
  };
  _dice?: {
    [key: string]: unknown;
  };
  _sources: {
    [path: string]: {
      spreadsheetId: string;
      sheetTitle?: string;
      a1Range?: string;
      namedRange?: string;
    };
  };
}

export interface ParsingIssue {
  severity: "info" | "warn" | "error";
  source: {
    spreadsheetId: string;
    sheetTitle?: string; 
    a1Range?: string;
    namedRange?: string;
  };
  sample: unknown;
  proposed: unknown;
  message: string;
}

export interface ParsingResult {
  data: ParsedCharacterData;
  issues: ParsingIssue[];
  needsDecision: {
    key: string;
    description: string;
    sample: unknown;
    proposedPath: string;
    proposedType: string;
  }[];
}

export async function parseCharacterSheet(
  spreadsheetId: string,
  existingDecisions: Record<string, unknown> = {}
): Promise<ParsingResult> {
  const result: ParsingResult = {
    data: {
      identity: {},
      attributes: {},
      vitals: { bodyParts: {} },
      rulesData: { nectars: {} },
      inventory: {},
      _sources: {},
    },
    issues: [],
    needsDecision: [],
  };

  try {
    // Get named ranges
    const namedRanges = await getNamedRanges(spreadsheetId);
    
    if (!namedRanges || namedRanges.length === 0) {
      console.log(`⚠️ No named ranges found in ${spreadsheetId}, trying fallback cell parsing...`);
      
      // Try to parse using known cell positions from template
      const fallbackResult = await parseCharacterSheetFallback(spreadsheetId);
      if (fallbackResult) {
        return fallbackResult;
      }
      
      result.issues.push({
        severity: "warn",
        source: { spreadsheetId },
        sample: null,
        proposed: null,
        message: "No named ranges found in spreadsheet and fallback parsing failed",
      });
      return result;
    }

    // Collect ranges to fetch
    const rangesToFetch: string[] = [];
    const rangeMapping: Record<string, { name: string; jsonPath?: string }> = {};

    for (const range of namedRanges) {
      if (!range.name || !range.range) continue;
      
      const rangeName = range.name;
      let rangeAddress = "";
      
      // Convert range to A1 notation
      if (range.range.sheetId !== undefined) {
        const sheet = range.range;
        if (sheet.startRowIndex !== undefined && sheet.startColumnIndex !== undefined) {
          const startCol = columnIndexToA1(sheet.startColumnIndex ?? 0);
          const startRow = (sheet.startRowIndex ?? 0) + 1;
          const endCol = sheet.endColumnIndex ? columnIndexToA1(sheet.endColumnIndex - 1) : startCol;
          const endRow = sheet.endRowIndex ? sheet.endRowIndex : startRow;
          
          rangeAddress = `${startCol}${startRow}:${endCol}${endRow}`;
        }
      }
      
      if (!rangeAddress) continue;
      
      rangesToFetch.push(rangeAddress);
      
      // Determine JSON path based on precedence
      let jsonPath: string | undefined;
      
      // 1. Check known named ranges first
      if (KNOWN_NAMED_RANGES[rangeName]) {
        jsonPath = KNOWN_NAMED_RANGES[rangeName];
      }
      // 2. Check GROWTH__ prefix  
      else if (rangeName.startsWith("GROWTH__")) {
        jsonPath = convertGrowthPrefixToPath(rangeName);
      }
      // 3. Check existing decisions
      else if (existingDecisions[`map.namedRange.${rangeName}`]) {
        jsonPath = existingDecisions[`map.namedRange.${rangeName}`] as string;
      }
      // 4. Use heuristics or queue for decision
      else {
        const proposed = proposePathFromName(rangeName);
        result.needsDecision.push({
          key: `map.namedRange.${rangeName}`,
          description: `Unknown named range "${rangeName}"`, 
          sample: rangeName,
          proposedPath: proposed.path,
          proposedType: proposed.type,
        });
      }
      
      rangeMapping[rangeAddress] = { name: rangeName, jsonPath };
    }

    // Batch fetch all ranges
    if (rangesToFetch.length > 0) {
      const rangeData = await batchGetSheetData(spreadsheetId, rangesToFetch);
      
      for (let i = 0; i < rangeData.length; i++) {
        const data = rangeData[i];
        const rangeAddress = rangesToFetch[i];
        const mapping = rangeMapping[rangeAddress];
        
        if (!mapping.jsonPath) continue; // Skip undecided ranges
        
        const values = data.values || [];
        const source = {
          spreadsheetId,
          a1Range: rangeAddress,
          namedRange: mapping.name,
        };
        
        try {
          // Parse the values based on the range structure
          let parsedValue: unknown;
          
          if (values.length === 0) {
            continue; // Skip empty ranges
          } else if (values.length === 1 && values[0].length === 1) {
            // Single cell
            parsedValue = parseCell(values[0][0]);
          } else if (mapping.name.toLowerCase().includes("nectar") || 
                     mapping.name.toLowerCase().includes("inventory")) {
            // Table with headers
            parsedValue = parseTable(values);
          } else {
            // Multi-cell range, store as array
            parsedValue = values.flat();
          }
          
          // Set the value in the result data
          setNestedValue((result.data as unknown) as Record<string, unknown>, mapping.jsonPath, parsedValue);
          
          // Record source traceability  
          result.data._sources[mapping.jsonPath] = source;
          
        } catch (error) {
          result.issues.push({
            severity: "error",
            source,
            sample: values,
            proposed: null,
            message: `Failed to parse range ${mapping.name}: ${error}`,
          });
        }
      }
    }

    // Handle known gotchas
    handleKnownIssues(result, spreadsheetId);
    
    return result;
    
  } catch (error) {
    result.issues.push({
      severity: "error", 
      source: { spreadsheetId },
      sample: null,
      proposed: null,
      message: `Failed to parse spreadsheet: ${error}`,
    });
    return result;
  }
}

function convertGrowthPrefixToPath(rangeName: string): string {
  // Convert GROWTH__ prefixed names to JSON paths
  const cleanName = rangeName.replace(/^GROWTH__/, "");
  
  // Simple conversion - in practice this might need more sophisticated mapping
  if (cleanName.startsWith("character_")) {
    return `identity.${cleanName.replace("character_", "")}`;
  } else if (cleanName.startsWith("attr_")) {
    return `attributes.${cleanName.replace("attr_", "")}`;
  } else if (cleanName.startsWith("inventory_")) {
    return `inventory.${cleanName.replace("inventory_", "")}`;
  } else {
    return cleanName.replace(/_/g, ".");
  }
}

function proposePathFromName(name: string): { path: string; type: string } {
  const lowerName = name.toLowerCase();
  
  // Heuristics for common patterns
  if (lowerName.includes("name")) {
    return { path: "identity.name", type: "string" };
  } else if (lowerName.includes("health") || lowerName.includes("hp")) {
    return { path: "vitals.health", type: "number" };
  } else if (lowerName.includes("weight")) {
    return { path: "inventory.weight", type: "number" };
  } else if (["str", "dex", "con", "int", "wis", "cha"].some(attr => lowerName.includes(attr))) {
    const attr = ["str", "dex", "con", "int", "wis", "cha"].find(a => lowerName.includes(a));
    return { path: `attributes.${attr}`, type: "number" };
  } else {
    // Generic mapping
    return { path: `custom.${name}`, type: "any" };
  }
}

function parseCell(value: unknown): unknown {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  
  // Try to parse as number
  if (typeof value === "string" && !isNaN(Number(value))) {
    return Number(value);
  }
  
  // Handle #REF! errors
  if (value === "#REF!") {
    return null;
  }
  
  return value;
}

function parseTable(values: unknown[][]): unknown[] {
  if (values.length < 2) return []; // Need at least header and one data row
  
  const headers = values[0];
  const rows = values.slice(1);
  
  return rows.map(row => {
    const item: Record<string, unknown> = {};
    for (let i = 0; i < headers.length && i < row.length; i++) {
      const header = headers[i];
      const value = parseCell(row[i]);
      if (header && typeof header === 'string' && value !== null) {
        item[header] = value;
      }
    }
    return item;
  }).filter(item => Object.keys(item).length > 0);
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split(".");
  let current = obj;
  
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current) || typeof current[key] !== "object") {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  
  current[keys[keys.length - 1]] = value;
}

function columnIndexToA1(index: number): string {
  let result = "";
  while (index >= 0) {
    result = String.fromCharCode(65 + (index % 26)) + result;
    index = Math.floor(index / 26) - 1;
  }
  return result;
}

function handleKnownIssues(result: ParsingResult, _spreadsheetId: string) {
  // Handle PORTRAITURL appearing twice
  const portraitSources = Object.entries(result.data._sources)
    .filter(([path]) => path.includes("PORTRAITURL"));
    
  if (portraitSources.length > 1) {
    result.needsDecision.push({
      key: "dedupe.PORTRAITURL",
      description: "Multiple PORTRAITURL ranges found",
      sample: portraitSources.map(([path, source]) => ({ path, source })),
      proposedPath: "identity.portraitUrl",
      proposedType: "string",
    });
  }
  
  // Handle #REF! values
  Object.entries(result.data._sources).forEach(([path, source]) => {
    const value = getNestedValue((result.data as unknown) as Record<string, unknown>, path);
    if (value === null && path.includes("BEAUTY")) {
      result.issues.push({
        severity: "warn",
        source,
        sample: "#REF!",
        proposed: null,
        message: "BEAUTY field resolves to #REF! - likely broken formula",
      });
    }
  });
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce((current, key) => {
    if (current && typeof current === 'object' && !Array.isArray(current)) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj as unknown);
}

// Fallback parser for sheets without named ranges
async function parseCharacterSheetFallback(spreadsheetId: string): Promise<ParsingResult | null> {
  try {
    console.log(`🔄 Attempting fallback parsing for ${spreadsheetId}`);
    
    const sheets = await getSheetsService();
    
    // Get the raw data from the sheet - using same range as template
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'A1:AH50', // Wide range to capture all data
      valueRenderOption: "UNFORMATTED_VALUE",
      dateTimeRenderOption: "FORMATTED_STRING",
    });
    
    const values = response.data.values || [];
    if (values.length === 0) {
      console.log("❌ No data found in sheet");
      return null;
    }
    
    const result: ParsingResult = {
      data: {
        identity: {},
        attributes: {},
        vitals: { bodyParts: {} },
        rulesData: { nectars: {} },
        inventory: {},
        _sources: {},
      },
      issues: [],
      needsDecision: [],
    };
    
    // Based on template analysis, extract data from known positions
    // CharacterName is at B1 (row 0, col 1)  
    if (values[0] && values[0][1]) {
      result.data.identity.name = values[0][1];
      result.data._sources['identity.name'] = {
        spreadsheetId,
        a1Range: 'B1'
      };
      console.log(`📝 Found character name: ${values[0][1]}`);
    }
    
    // Try to extract attribute data based on template positions
    // From the debug data, attributes seem to be around rows 4-28, columns 29-34
    const attributeMap = [
      { name: 'clout', levelRow: 4, currentRow: 5, levelCol: 29, currentCol: 33, augmentPosCol: 30, augmentNegCol: 31 },
      { name: 'celerity', levelRow: 6, currentRow: 7, levelCol: 29, currentCol: 33, augmentPosCol: 30, augmentNegCol: 31 },  
      { name: 'constitution', levelRow: 8, currentRow: 9, levelCol: 29, currentCol: 33, augmentPosCol: 30, augmentNegCol: 31 },
      { name: 'focus', levelRow: 13, currentRow: 14, levelCol: 29, currentCol: 33, augmentPosCol: 30, augmentNegCol: 31 },
      { name: 'frequency', levelRow: 15, currentRow: 16, levelCol: 29, currentCol: 33, augmentPosCol: 30, augmentNegCol: 31 },
      { name: 'flow', levelRow: 17, currentRow: 18, levelCol: 29, currentCol: 33, augmentPosCol: 30, augmentNegCol: 31 },
      { name: 'willpower', levelRow: 22, currentRow: 23, levelCol: 29, currentCol: 33, augmentPosCol: 30, augmentNegCol: 31 },
      { name: 'wisdom', levelRow: 24, currentRow: 25, levelCol: 29, currentCol: 33, augmentPosCol: 30, augmentNegCol: 31 },
      { name: 'wit', levelRow: 26, currentRow: 27, levelCol: 29, currentCol: 33, augmentPosCol: 30, augmentNegCol: 31 }
    ];
    
    for (const attr of attributeMap) {
      const attrData: Record<string, number> = {};
      
      // Extract level
      if (values[attr.levelRow] && values[attr.levelRow][attr.levelCol] !== undefined) {
        const level = parseInt(String(values[attr.levelRow][attr.levelCol]));
        if (!isNaN(level)) {
          attrData.level = level;
        }
      }
      
      // Extract current value  
      if (values[attr.currentRow] && values[attr.currentRow][attr.currentCol] !== undefined) {
        const current = parseInt(String(values[attr.currentRow][attr.currentCol]));
        if (!isNaN(current)) {
          attrData.current = current;
        }
      }
      
      // Extract positive augment
      if (values[attr.levelRow] && values[attr.levelRow][attr.augmentPosCol] !== undefined) {
        const augmentPos = parseInt(String(values[attr.levelRow][attr.augmentPosCol]));
        if (!isNaN(augmentPos)) {
          attrData.augmentPositive = augmentPos;
        }
      }
      
      // Extract negative augment  
      if (values[attr.levelRow] && values[attr.levelRow][attr.augmentNegCol] !== undefined) {
        const augmentNeg = parseInt(String(values[attr.levelRow][attr.augmentNegCol]));
        if (!isNaN(augmentNeg)) {
          attrData.augmentNegative = augmentNeg;
        }
      }
      
      // Only add attribute if we found some data
      if (Object.keys(attrData).length > 0) {
        result.data.attributes[attr.name] = attrData;
        console.log(`📊 Found ${attr.name}:`, attrData);
      }
    }
    
    console.log(`✅ Fallback parsing successful for ${spreadsheetId}`);
    console.log(`   - Character: ${result.data.identity.name || 'Unknown'}`);
    console.log(`   - Attributes: ${Object.keys(result.data.attributes).length} found`);
    
    return result;
    
  } catch (error) {
    console.error(`❌ Fallback parsing failed for ${spreadsheetId}:`, error);
    return null;
  }
}