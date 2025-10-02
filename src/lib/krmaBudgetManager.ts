import { prisma } from "./prisma";
import { TemplateManager } from "./templateManager";
import { KrmaController } from "./krmaController";

/**
 * KRMA Budget Manager - Validates character sheets and world assets against GM budget
 * Ensures: Sum(Characters + World Assets) ≤ GM Total KRMA
 */

export interface BudgetValidation {
  isValid: boolean;
  gmTotalKrma: bigint;
  allocatedKrma: bigint;
  liquidKrma: bigint;
  overBudget: bigint;
  breakdown: {
    characters: CharacterKrmaCost[];
    worldAssets: bigint;
    liquidRemaining: bigint;
  };
  violations: string[];
}

export interface CharacterKrmaCost {
  characterId: string;
  name: string;
  krmaValue: bigint;
  breakdown: Record<string, bigint>;
  templateVersion?: string;
  lastValidated?: Date;
}

export class KrmaBudgetManager {
  /**
   * Validate entire campaign budget for a GM
   */
  static async validateCampaignBudget(
    campaignId: string, 
    gmUserId: string
  ): Promise<BudgetValidation> {
    // Get GM's total KRMA (liquid + soulbound)
    const gmWallet = await prisma.wallet.findUnique({
      where: {
        ownerType_ownerRef: {
          ownerType: "WATCHER",
          ownerRef: gmUserId
        }
      }
    });

    const gmTotalKrma = gmWallet ? (gmWallet.liquid + gmWallet.crystalized) : BigInt(0);

    // Calculate character KRMA costs
    const characters = await this.calculateCharacterCosts(campaignId);
    const totalCharacterKrma = characters.reduce((sum, char) => sum + char.krmaValue, BigInt(0));

    // Calculate world asset KRMA costs
    const totalWorldAssetKrma = await KrmaController.getCampaignKrmaValue(campaignId);

    // Calculate totals
    const allocatedKrma = totalCharacterKrma + totalWorldAssetKrma;
    const liquidKrma = gmTotalKrma - allocatedKrma;
    const overBudget = allocatedKrma > gmTotalKrma ? allocatedKrma - gmTotalKrma : BigInt(0);

    // Generate violations
    const violations: string[] = [];
    if (overBudget > 0) {
      violations.push(`Campaign exceeds GM budget by ${overBudget} KRMA`);
    }

    // Check for characters without KRMA validation
    characters.forEach(char => {
      if (!char.lastValidated) {
        violations.push(`Character "${char.name}" has not been KRMA validated`);
      }
    });

    return {
      isValid: overBudget === BigInt(0) && violations.length === 0,
      gmTotalKrma,
      allocatedKrma,
      liquidKrma,
      overBudget,
      breakdown: {
        characters,
        worldAssets: totalWorldAssetKrma,
        liquidRemaining: liquidKrma
      },
      violations
    };
  }

  /**
   * Calculate KRMA costs for all characters in a campaign
   */
  static async calculateCharacterCosts(campaignId: string): Promise<CharacterKrmaCost[]> {
    const characters = await prisma.character.findMany({
      where: { campaignId },
      select: {
        id: true,
        name: true,
        json: true,
        spreadsheetId: true,
        updatedAt: true
      }
    });

    const characterCosts: CharacterKrmaCost[] = [];

    for (const character of characters) {
      try {
        // Get or detect template version for this character's sheet
        const templateId = process.env.CHARACTER_TEMPLATE_ID || "1-ScgF6hJPAUUONUFRM70IGcqH6kZ6GK_0a6jj2PHZzo";
        let templateVersion = await TemplateManager.getTemplateVersion(templateId);
        
        if (!templateVersion) {
          // Auto-detect template if not found
          templateVersion = await TemplateManager.detectTemplate(templateId);
        }

        // Calculate KRMA value for this character
        const { totalKrma, breakdown } = await TemplateManager.calculateCharacterKrmaValue(
          character.json as Record<string, unknown> || {},
          templateVersion
        );

        characterCosts.push({
          characterId: character.id,
          name: character.name,
          krmaValue: totalKrma,
          breakdown,
          templateVersion: templateVersion.version,
          lastValidated: new Date()
        });

        // Store KRMA validation in database
        await this.updateCharacterKrmaValidation(character.id, totalKrma, breakdown);

      } catch (error) {
        console.error(`Failed to calculate KRMA for character ${character.name}:`, error);
        
        characterCosts.push({
          characterId: character.id,
          name: character.name,
          krmaValue: BigInt(0),
          breakdown: { error: BigInt(0) },
          lastValidated: undefined
        });
      }
    }

    return characterCosts;
  }

  /**
   * Store character KRMA validation results
   */
  private static async updateCharacterKrmaValidation(
    characterId: string,
    totalKrma: bigint,
    breakdown: Record<string, bigint>
  ): Promise<void> {
    // Create or update character KRMA record
    await prisma.characterKrma.upsert({
      where: { characterId },
      create: {
        characterId,
        totalKrmaValue: totalKrma,
        krmaBreakdown: Object.fromEntries(
          Object.entries(breakdown).map(([k, v]) => [k, v.toString()])
        ),
        lastCalculated: new Date()
      },
      update: {
        totalKrmaValue: totalKrma,
        krmaBreakdown: Object.fromEntries(
          Object.entries(breakdown).map(([k, v]) => [k, v.toString()])
        ),
        lastCalculated: new Date()
      }
    });
  }

  /**
   * Validate single character against available KRMA budget
   */
  static async validateCharacterCreation(
    campaignId: string,
    characterData: Record<string, unknown>,
    gmUserId: string
  ): Promise<{ canCreate: boolean; requiredKrma: bigint; availableKrma: bigint; error?: string }> {
    try {
      // Get current budget status
      const budgetValidation = await this.validateCampaignBudget(campaignId, gmUserId);
      
      // Calculate KRMA required for new character
      const templateId = process.env.CHARACTER_TEMPLATE_ID || "1-ScgF6hJPAUUONUFRM70IGcqH6kZ6GK_0a6jj2PHZzo";
      let templateVersion = await TemplateManager.getTemplateVersion(templateId);
      
      if (!templateVersion) {
        templateVersion = await TemplateManager.detectTemplate(templateId);
      }

      const { totalKrma: requiredKrma } = await TemplateManager.calculateCharacterKrmaValue(
        characterData,
        templateVersion
      );

      const availableKrma = budgetValidation.liquidKrma;
      const canCreate = requiredKrma <= availableKrma;

      return {
        canCreate,
        requiredKrma,
        availableKrma,
        error: canCreate ? undefined : `Character requires ${requiredKrma} KRMA, but only ${availableKrma} available`
      };

    } catch (error) {
      return {
        canCreate: false,
        requiredKrma: BigInt(0),
        availableKrma: BigInt(0),
        error: `Failed to validate character: ${error}`
      };
    }
  }

  /**
   * Handle character updates and re-validate budget
   */
  static async validateCharacterUpdate(
    characterId: string,
    newCharacterData: Record<string, unknown>,
    campaignId: string,
    gmUserId: string
  ): Promise<{ isValid: boolean; oldKrma: bigint; newKrma: bigint; available: bigint; error?: string }> {
    try {
      // Get current character KRMA cost
      const currentKrma = await prisma.characterKrma.findUnique({
        where: { characterId }
      });

      const oldKrma = currentKrma?.totalKrmaValue || BigInt(0);

      // Calculate new KRMA cost
      const templateId = process.env.CHARACTER_TEMPLATE_ID || "1-ScgF6hJPAUUONUFRM70IGcqH6kZ6GK_0a6jj2PHZzo";
      let templateVersion = await TemplateManager.getTemplateVersion(templateId);
      
      if (!templateVersion) {
        templateVersion = await TemplateManager.detectTemplate(templateId);
      }

      const { totalKrma: newKrma } = await TemplateManager.calculateCharacterKrmaValue(
        newCharacterData,
        templateVersion
      );

      // Calculate budget impact
      const _krmaDifference = newKrma - oldKrma;
      
      // Get available KRMA (including what this character currently uses)
      const budgetValidation = await this.validateCampaignBudget(campaignId, gmUserId);
      const availableKrma = budgetValidation.liquidKrma + oldKrma;

      const isValid = newKrma <= availableKrma;

      return {
        isValid,
        oldKrma,
        newKrma,
        available: availableKrma,
        error: isValid ? undefined : `Update requires ${newKrma} KRMA, but only ${availableKrma} available`
      };

    } catch (error) {
      return {
        isValid: false,
        oldKrma: BigInt(0),
        newKrma: BigInt(0),
        available: BigInt(0),
        error: `Failed to validate character update: ${error}`
      };
    }
  }

  /**
   * Get campaign budget summary for UI display
   */
  static async getCampaignBudgetSummary(
    campaignId: string,
    gmUserId: string
  ): Promise<{
    totalBudget: string;
    allocated: string;
    liquid: string;
    utilizationPercent: number;
    characterCount: number;
    worldAssetCount: number;
    isOverBudget: boolean;
  }> {
    const validation = await this.validateCampaignBudget(campaignId, gmUserId);
    const worldAssets = await prisma.worldAsset.count({
      where: { campaignId, isActive: true }
    });

    const utilizationPercent = validation.gmTotalKrma > 0 
      ? Number(validation.allocatedKrma * BigInt(100) / validation.gmTotalKrma)
      : 0;

    return {
      totalBudget: validation.gmTotalKrma.toString(),
      allocated: validation.allocatedKrma.toString(),
      liquid: validation.liquidKrma.toString(),
      utilizationPercent,
      characterCount: validation.breakdown.characters.length,
      worldAssetCount: worldAssets,
      isOverBudget: !validation.isValid
    };
  }

  /**
   * Auto-heal budget violations (reduce character KRMA to fit budget)
   */
  static async autoHealBudgetViolations(
    campaignId: string,
    gmUserId: string,
    _strategy: 'proportional' | 'oldest_first' = 'proportional'
  ): Promise<{ healed: boolean; adjustments: Array<{ characterId: string; oldKrma: bigint; newKrma: bigint }> }> {
    const validation = await this.validateCampaignBudget(campaignId, gmUserId);
    
    if (validation.isValid) {
      return { healed: true, adjustments: [] };
    }

    // Implementation would depend on strategy
    // For now, just return that healing is not implemented
    return {
      healed: false,
      adjustments: []
    };
  }
}