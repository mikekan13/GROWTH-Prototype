import type { Character } from "@prisma/client";
import type { ParsedCharacterData } from "@/services/sheetParser";

export interface CharacterWithSources extends ParsedCharacterData {
  id: string;
  campaignId: string;
  name: string;
  playerEmail?: string;
  spreadsheetId: string;
  revId?: string;
  updatedAt: Date;
}

export function transformCharacterData(character: Character): CharacterWithSources {
  return {
    ...(validateAndCastCharacterData(character.json)),
    id: character.id,
    campaignId: character.campaignId,
    name: character.name,
    playerEmail: character.playerEmail || undefined,
    spreadsheetId: character.spreadsheetId || '',
    revId: character.revId || undefined,
    updatedAt: character.updatedAt,
  };
}

export function validateAndCastCharacterData(jsonData: unknown): ParsedCharacterData {
  if (!jsonData || typeof jsonData !== 'object') {
    throw new Error('Invalid character JSON data');
  }

  const data = jsonData as ParsedCharacterData;
  
  // Basic validation - ensure required structure exists
  if (!data.identity || !data.attributes || !data.vitals || !data.rulesData) {
    throw new Error('Character data missing required structure');
  }

  return data;
}

export const CHARACTER_INCLUDE_CONFIG = {
  _count: {
    select: {
      characters: true,
      sheets: true,
      sessions: true,
    },
  },
} as const;