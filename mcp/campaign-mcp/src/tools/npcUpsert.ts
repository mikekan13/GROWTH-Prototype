import { promises as fs } from 'fs';
import { join } from 'path';
import { atomicWrite, fileExists, slug } from 'growth-shared';

export interface NPCCard {
  id?: string;
  name: string;
  firstSeen: string;
  summary: string;
  tags: string[];
  stats: Record<string, unknown>;
  notes: string;
  __dir?: string;
}

export interface NPCUpsertOutput {
  ok: boolean;
  path: string;
  created: boolean;
  error?: string;
}

export async function npcUpsert(card: NPCCard, campaignRepo: string): Promise<NPCUpsertOutput> {
  try {
    const npcDir = card.__dir || 'npcs/';
    const npcSlug = slug(card.id || card.name);
    const fileName = `${npcSlug}.json`;
    const relativePath = join(npcDir, fileName);
    const fullPath = join(campaignRepo, relativePath);
    
    const existed = await fileExists(fullPath);
    
    let finalCard = { ...card };
    delete finalCard.__dir;
    
    if (existed) {
      try {
        const existingContent = await fs.readFile(fullPath, 'utf8');
        const existingCard = JSON.parse(existingContent);
        
        finalCard = {
          ...existingCard,
          ...finalCard,
          tags: [...new Set([...(existingCard.tags || []), ...(finalCard.tags || [])])],
          stats: { ...existingCard.stats, ...finalCard.stats }
        };
      } catch {
        // If we can't read/parse existing, just use new card
      }
    }
    
    const content = JSON.stringify(finalCard, null, 2);
    await atomicWrite(fullPath, content);
    
    return {
      ok: true,
      path: relativePath,
      created: !existed
    };
  } catch (error) {
    return {
      ok: false,
      path: '',
      created: false,
      error: String(error)
    };
  }
}