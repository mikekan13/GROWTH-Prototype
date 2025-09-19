/**
 * Total Karmic Value (TKV) Calculator
 * Calculates exact KRMA values for GROWTH characters based on all components
 * 1 Frequency = 1 KRMA, 1 Attribute Level = 1 KRMA, 1 Skill Level = 1 KRMA
 */

export interface TKVBreakdown {
  attributes: bigint;        // Sum of all attribute levels
  skills: bigint;           // Sum of all skill levels  
  frequency: bigint;        // Current frequency pool
  wealthLevel: bigint;      // Wealth level cost (curved)
  techLevel: bigint;        // Tech level cost (curved)
  healthLevel: bigint;      // Health level cost (curved)
  fateDie: bigint;          // Fate die value
  items: bigint;            // Items/equipment KRMA (from LLM)
  nectars: bigint;          // Nectar abilities KRMA (from LLM)
  thorns: bigint;           // Thorn disadvantages KRMA (from LLM)
  seeds: bigint;            // Character creation seeds KRMA
  roots: bigint;            // Character creation roots KRMA
  branches: bigint;         // Character creation branches KRMA
  total: bigint;            // Total KRMA Value
}

export class TKVCalculator {
  /**
   * Calculate Total Karmic Value for a character
   */
  static calculateTKV(characterData: Record<string, unknown>): TKVBreakdown {
    const breakdown: TKVBreakdown = {
      attributes: BigInt(0),
      skills: BigInt(0),
      frequency: BigInt(0),
      wealthLevel: BigInt(0),
      techLevel: BigInt(0),
      healthLevel: BigInt(0),
      fateDie: BigInt(0),
      items: BigInt(0),
      nectars: BigInt(0),
      thorns: BigInt(0),
      seeds: BigInt(0),
      roots: BigInt(0),
      branches: BigInt(0),
      total: BigInt(0)
    };

    // Calculate attribute levels (each level = 1 KRMA)
    if (characterData.attributes) {
      const attributeNames = ['clout', 'celerity', 'constitution', 'focus', 'frequency', 'flow', 'willpower', 'wisdom', 'wit'];
      attributeNames.forEach(attr => {
        const level = (characterData.attributes as Record<string, { level?: number }>)?.[attr]?.level || 0;
        breakdown.attributes += BigInt(level);
      });
    }

    // Calculate current frequency pool (1 frequency = 1 KRMA)
    const attributes = characterData.attributes as Record<string, { current?: number }>;
    if (attributes?.frequency?.current) {
      breakdown.frequency = BigInt(attributes.frequency.current);
    }

    // Calculate skill levels (each level = 1 KRMA)
    if (characterData.skills) {
      Object.values(characterData.skills).forEach((skill: Record<string, unknown>) => {
        const level = (skill?.level as number) || 0;
        breakdown.skills += BigInt(level);
      });
    }

    // Calculate curved level costs
    breakdown.wealthLevel = this.calculateWealthLevelCost((characterData.wealthLevel as number) || 0);
    breakdown.techLevel = this.calculateTechLevelCost((characterData.techLevel as number) || 0);
    breakdown.healthLevel = this.calculateHealthLevelCost((characterData.healthLevel as number) || 0);

    // Calculate fate die value
    breakdown.fateDie = this.calculateFateDieCost((characterData.fateDie as number) || 0);

    // Items/Nectars/Thorns would be calculated by LLM system
    // For now, extract from metadata if present
    breakdown.items = this.extractKrmaValue(characterData, 'items');
    breakdown.nectars = this.extractKrmaValue(characterData, 'nectars');
    breakdown.thorns = this.extractKrmaValue(characterData, 'thorns');

    // Seeds/Roots/Branches from character creation
    breakdown.seeds = this.extractKrmaValue(characterData, 'seeds');
    breakdown.roots = this.extractKrmaValue(characterData, 'roots');
    breakdown.branches = this.extractKrmaValue(characterData, 'branches');

    // Calculate total
    breakdown.total = 
      breakdown.attributes +
      breakdown.skills +
      breakdown.frequency +
      breakdown.wealthLevel +
      breakdown.techLevel +
      breakdown.healthLevel +
      breakdown.fateDie +
      breakdown.items +
      breakdown.nectars +
      breakdown.thorns +
      breakdown.seeds +
      breakdown.roots +
      breakdown.branches;

    return breakdown;
  }

  /**
   * Calculate wealth level cost (curved pricing)
   * Higher wealth levels cost exponentially more
   */
  private static calculateWealthLevelCost(level: number): bigint {
    if (level <= 0) return BigInt(0);
    
    // Curved pricing: Level^2 * 10
    // Level 1 = 10, Level 2 = 40, Level 3 = 90, Level 5 = 250, Level 10 = 1000
    const cost = level * level * 10;
    return BigInt(cost);
  }

  /**
   * Calculate tech level cost (curved pricing)
   */
  private static calculateTechLevelCost(level: number): bigint {
    if (level <= 0) return BigInt(0);
    
    // Similar curve to wealth
    const cost = level * level * 10;
    return BigInt(cost);
  }

  /**
   * Calculate health level cost (curved pricing)
   */
  private static calculateHealthLevelCost(level: number): bigint {
    if (level <= 0) return BigInt(0);
    
    // Health might be less expensive than wealth/tech
    const cost = level * level * 5;
    return BigInt(cost);
  }

  /**
   * Calculate fate die cost
   */
  private static calculateFateDieCost(dieSize: number): bigint {
    if (dieSize <= 0) return BigInt(0);
    
    // Simple linear cost for fate die
    // d4=10, d6=15, d8=20, d10=25, d12=30, d20=50
    const costs: Record<number, number> = {
      4: 10,
      6: 15,
      8: 20,
      10: 25,
      12: 30,
      20: 50
    };
    
    return BigInt(costs[dieSize] || dieSize);
  }

  /**
   * Extract KRMA value from character data for LLM-valued components
   */
  private static extractKrmaValue(characterData: Record<string, unknown>, component: string): bigint {
    // Look for KRMA values in metadata
    const krmaValues = characterData.krmaValues as Record<string, number>;
    if (krmaValues?.[component]) {
      return BigInt(krmaValues[component]);
    }
    
    // Look for _tkv suffixed fields
    const tkvValue = characterData[`${component}_tkv`];
    if (tkvValue) {
      return BigInt(tkvValue as number);
    }
    
    return BigInt(0);
  }

  /**
   * Validate TKV calculation against character sheet
   */
  static validateTKV(characterData: Record<string, unknown>, calculatedTKV: TKVBreakdown): {
    isValid: boolean;
    sheetTKV?: bigint;
    difference?: bigint;
    errors: string[];
  } {
    const errors: string[] = [];
    
    // Check if sheet has its own TKV calculation
    const sheetTKV = characterData.totalKarmicValue || characterData.tkv || characterData.TKV;
    
    if (sheetTKV) {
      const sheetValue = BigInt(sheetTKV as number);
      const difference = calculatedTKV.total - sheetValue;
      
      if (difference !== BigInt(0)) {
        errors.push(`TKV mismatch: calculated ${calculatedTKV.total}, sheet shows ${sheetValue}`);
      }
      
      return {
        isValid: difference === BigInt(0),
        sheetTKV: sheetValue,
        difference,
        errors
      };
    }
    
    // Basic validation checks
    if (calculatedTKV.total < BigInt(0)) {
      errors.push("Negative TKV calculated");
    }
    
    if (calculatedTKV.attributes === BigInt(0) && calculatedTKV.skills === BigInt(0)) {
      errors.push("No attributes or skills found - character may be empty");
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Calculate campaign total TKV
   */
  static async calculateCampaignTKV(
    characters: Array<{ id: string; name: string; json: Record<string, unknown> }>,
    worldAssets: Array<{ krmaValue: bigint }>
  ): Promise<{
    totalTKV: bigint;
    characterTKV: bigint;
    worldAssetTKV: bigint;
    characterBreakdowns: Array<{ characterId: string; name: string; tkv: TKVBreakdown }>;
  }> {
    const characterBreakdowns: Array<{ characterId: string; name: string; tkv: TKVBreakdown }> = [];
    let characterTKV = BigInt(0);
    
    // Calculate TKV for each character
    for (const character of characters) {
      const tkv = this.calculateTKV(character.json);
      characterBreakdowns.push({
        characterId: character.id,
        name: character.name,
        tkv
      });
      characterTKV += tkv.total;
    }
    
    // Calculate total world asset TKV
    const worldAssetTKV = worldAssets.reduce((sum, asset) => sum + asset.krmaValue, BigInt(0));
    
    const totalTKV = characterTKV + worldAssetTKV;
    
    return {
      totalTKV,
      characterTKV,
      worldAssetTKV,
      characterBreakdowns
    };
  }

  /**
   * Format TKV for display
   */
  static formatTKV(value: bigint): string {
    return value.toLocaleString() + " KRMA";
  }

  /**
   * Create TKV summary for UI
   */
  static createTKVSummary(breakdown: TKVBreakdown): Array<{ category: string; value: string; percentage: number }> {
    const total = Number(breakdown.total);
    if (total === 0) return [];
    
    const categories = [
      { category: "Attributes", value: breakdown.attributes.toString(), percentage: Number(breakdown.attributes * BigInt(100) / breakdown.total) },
      { category: "Skills", value: breakdown.skills.toString(), percentage: Number(breakdown.skills * BigInt(100) / breakdown.total) },
      { category: "Frequency", value: breakdown.frequency.toString(), percentage: Number(breakdown.frequency * BigInt(100) / breakdown.total) },
      { category: "Wealth Level", value: breakdown.wealthLevel.toString(), percentage: Number(breakdown.wealthLevel * BigInt(100) / breakdown.total) },
      { category: "Tech Level", value: breakdown.techLevel.toString(), percentage: Number(breakdown.techLevel * BigInt(100) / breakdown.total) },
      { category: "Health Level", value: breakdown.healthLevel.toString(), percentage: Number(breakdown.healthLevel * BigInt(100) / breakdown.total) },
      { category: "Items", value: breakdown.items.toString(), percentage: Number(breakdown.items * BigInt(100) / breakdown.total) },
      { category: "Nectars", value: breakdown.nectars.toString(), percentage: Number(breakdown.nectars * BigInt(100) / breakdown.total) }
    ].filter(item => item.value !== "0");
    
    return categories;
  }
}