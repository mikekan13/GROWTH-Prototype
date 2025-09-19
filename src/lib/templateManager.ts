import { prisma } from "./prisma";
import { getSpreadsheetInfo, getNamedRanges } from "@/services/google";

/**
 * Template Version Manager - Handles dynamic character sheet templates
 * Automatically adapts to template changes while maintaining KRMA validation
 */

export interface TemplateVersion {
  id: string;
  templateId: string;
  version: string;
  namedRanges: Record<string, string>;
  krmaMapping: KrmaFieldMapping;
  isActive: boolean;
  detectedAt: Date;
}

export interface KrmaFieldMapping {
  // Core KRMA/Frequency fields that must exist for budget validation
  frequency: {
    current?: string;    // Named range for current frequency
    level?: string;      // Named range for frequency level/max
    total?: string;      // Calculated or direct total frequency
  };
  
  // Ability/Skill costs (KRMA expenditure tracking)
  abilities: {
    pattern?: string;    // Pattern to detect ability ranges (e.g., "Ability_*")
    costField?: string;  // Field that contains KRMA cost per ability
  };
  
  governors: {
    pattern?: string;    // Pattern for governor ranges
    costField?: string;  // KRMA cost per governor
  };
  
  skills: {
    pattern?: string;    // Pattern for skill ranges  
    costField?: string;  // KRMA cost per skill level
  };
  
  // Custom KRMA fields (extensible)
  customKrmaFields: Record<string, {
    range: string;
    costMultiplier?: number;
    isOptional?: boolean;
  }>;
}

export class TemplateManager {
  /**
   * Detect and register a new template version
   */
  static async detectTemplate(templateId: string): Promise<TemplateVersion> {
    // Get sheet metadata and named ranges
    const [_metadata, namedRanges] = await Promise.all([
      getSpreadsheetInfo(templateId),
      getNamedRanges(templateId)
    ]);

    // Auto-detect KRMA mapping from named ranges
    const namedRangeMap = Object.fromEntries(
      namedRanges.map(range => [
        range.name || '', 
        typeof range.range === 'string' ? range.range : JSON.stringify(range.range) || ''
      ])
    );
    const krmaMapping = this.autoDetectKrmaMapping(namedRangeMap);
    
    // Generate version string from template structure
    const version = this.generateVersionHash(namedRangeMap, krmaMapping);

    // Check if this version already exists
    const existing = await prisma.templateVersion.findUnique({
      where: { templateId_version: { templateId, version } }
    });

    if (existing) {
      return {
        ...existing,
        namedRanges: existing.namedRanges as Record<string, string> || {},
        krmaMapping: (existing.krmaMapping as unknown) as KrmaFieldMapping
      };
    }

    // Create new template version
    const templateVersion = await prisma.templateVersion.create({
      data: {
        templateId,
        version,
        namedRanges: namedRangeMap,
        krmaMapping: JSON.parse(JSON.stringify(krmaMapping)),
        isActive: true,
        detectedAt: new Date()
      }
    });

    console.log(`📋 New template version detected: ${templateId} v${version}`);
    console.log(`🔍 KRMA fields detected:`, krmaMapping);

    return {
      ...templateVersion,
      namedRanges: namedRangeMap,
      krmaMapping: krmaMapping
    };
  }

  /**
   * Auto-detect KRMA field mappings from named ranges
   */
  private static autoDetectKrmaMapping(namedRanges: Record<string, string>): KrmaFieldMapping {
    const mapping: KrmaFieldMapping = {
      frequency: {},
      abilities: {},
      governors: {},
      skills: {},
      customKrmaFields: {}
    };

    // Detect frequency-related fields
    Object.keys(namedRanges).forEach(range => {
      const rangeLower = range.toLowerCase();
      
      // Frequency mapping
      if (rangeLower.includes('frequency')) {
        if (rangeLower.includes('current')) {
          mapping.frequency.current = range;
        } else if (rangeLower.includes('level') || rangeLower.includes('max')) {
          mapping.frequency.level = range;
        } else if (rangeLower === 'frequency') {
          mapping.frequency.total = range;
        }
      }
      
      // Ability pattern detection
      if (rangeLower.includes('ability') || rangeLower.includes('skill')) {
        if (!mapping.abilities.pattern) {
          mapping.abilities.pattern = this.extractPattern(range, 'ability');
        }
        if (rangeLower.includes('cost') || rangeLower.includes('krma')) {
          mapping.abilities.costField = range;
        }
      }
      
      // Governor pattern detection  
      if (rangeLower.includes('governor')) {
        if (!mapping.governors.pattern) {
          mapping.governors.pattern = this.extractPattern(range, 'governor');
        }
        if (rangeLower.includes('cost') || rangeLower.includes('krma')) {
          mapping.governors.costField = range;
        }
      }
      
      // Custom KRMA fields (anything with "krma" or "cost" in the name)
      if ((rangeLower.includes('krma') || rangeLower.includes('cost')) && 
          !rangeLower.includes('frequency')) {
        mapping.customKrmaFields[range] = {
          range: range,
          costMultiplier: 1,
          isOptional: true
        };
      }
    });

    return mapping;
  }

  /**
   * Extract naming pattern from a field (e.g., "Ability_FireBall" → "Ability_*")
   */
  private static extractPattern(fieldName: string, baseType: string): string {
    const parts = fieldName.split('_');
    if (parts.length > 1) {
      return `${parts[0]}_*`;
    }
    return `${baseType}_*`;
  }

  /**
   * Generate version hash from template structure
   */
  private static generateVersionHash(namedRanges: Record<string, string>, krmaMapping: KrmaFieldMapping): string {
    const structure = {
      ranges: Object.keys(namedRanges).sort(),
      krmaFields: Object.keys(krmaMapping.customKrmaFields).sort()
    };
    
    // Simple hash based on field count and key structure
    const hash = JSON.stringify(structure);
    const version = hash.slice(-8); // Last 8 characters as version
    
    return `auto_${version}`;
  }

  /**
   * Get active template version for a sheet
   */
  static async getTemplateVersion(templateId: string): Promise<TemplateVersion | null> {
    const result = await prisma.templateVersion.findFirst({
      where: { templateId, isActive: true },
      orderBy: { detectedAt: 'desc' }
    });
    
    if (!result) return null;
    
    return {
      ...result,
      namedRanges: result.namedRanges as Record<string, string> || {},
      krmaMapping: (result.krmaMapping as unknown) as KrmaFieldMapping
    };
  }

  /**
   * Calculate total KRMA value for a character using TKV calculator
   */
  static async calculateCharacterKrmaValue(
    characterData: Record<string, unknown>, 
    _templateVersion: TemplateVersion
  ): Promise<{ totalKrma: bigint; breakdown: Record<string, bigint> }> {
    const { TKVCalculator } = await import('./tkvCalculator');
    
    // Use the comprehensive TKV calculator
    const tkvBreakdown = TKVCalculator.calculateTKV(characterData);
    
    // Convert TKV breakdown to simple breakdown format
    const breakdown: Record<string, bigint> = {
      attributes: tkvBreakdown.attributes,
      skills: tkvBreakdown.skills,
      frequency: tkvBreakdown.frequency,
      wealthLevel: tkvBreakdown.wealthLevel,
      techLevel: tkvBreakdown.techLevel,
      healthLevel: tkvBreakdown.healthLevel,
      fateDie: tkvBreakdown.fateDie,
      items: tkvBreakdown.items,
      nectars: tkvBreakdown.nectars,
      thorns: tkvBreakdown.thorns,
      seeds: tkvBreakdown.seeds,
      roots: tkvBreakdown.roots,
      branches: tkvBreakdown.branches
    };

    return { 
      totalKrma: tkvBreakdown.total, 
      breakdown 
    };
  }

  /**
   * Get field value from character data using flexible path resolution
   */
  private static getFieldValue(characterData: Record<string, unknown>, fieldPath: string): number | null {
    // Handle nested paths (e.g., "attributes.frequency.current")
    const pathParts = fieldPath.split('.');
    let value: unknown = characterData;
    
    for (const part of pathParts) {
      if (value && typeof value === 'object' && !Array.isArray(value) && part in value) {
        value = (value as Record<string, unknown>)[part];
      } else {
        return null;
      }
    }
    
    return typeof value === 'number' ? value : null;
  }

  /**
   * Calculate KRMA for pattern-based fields (abilities, governors, skills)
   */
  private static calculatePatternKrma(
    _characterData: Record<string, unknown>, 
    _config: { pattern?: string; costField?: string }
  ): bigint {
    // This would implement pattern matching logic
    // For now, return 0 - would need to implement pattern-based field discovery
    return BigInt(0);
  }

  /**
   * Validate that template has required KRMA fields
   */
  static validateTemplateForKrma(templateVersion: TemplateVersion): {
    isValid: boolean;
    missingFields: string[];
    warnings: string[];
  } {
    const missing: string[] = [];
    const warnings: string[] = [];

    // Frequency is required for KRMA validation
    if (!templateVersion.krmaMapping.frequency.current && !templateVersion.krmaMapping.frequency.total) {
      missing.push('frequency (current or total)');
    }

    // Warn about missing cost tracking
    if (!templateVersion.krmaMapping.abilities.costField) {
      warnings.push('No ability cost field detected');
    }
    
    if (!templateVersion.krmaMapping.governors.costField) {
      warnings.push('No governor cost field detected');
    }

    return {
      isValid: missing.length === 0,
      missingFields: missing,
      warnings
    };
  }

  /**
   * Update template mapping (manual override)
   */
  static async updateTemplateMapping(
    templateId: string,
    version: string,
    krmaMapping: Partial<KrmaFieldMapping>
  ): Promise<void> {
    await prisma.templateVersion.update({
      where: { templateId_version: { templateId, version } },
      data: {
        krmaMapping: JSON.parse(JSON.stringify(krmaMapping))
      }
    });

    console.log(`📋 Updated KRMA mapping for template ${templateId} v${version}`);
  }
}