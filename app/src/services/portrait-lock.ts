import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { prisma } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { lockPersona } from '@/ai/portraits/portrait-service';

/**
 * Lock request. Designer (creation-mode) generations write no PortraitGeneration
 * row, so the client may identify the locked image by `imagePath` instead of
 * (or alongside) `generationId`.
 */
export const lockPortraitSchema = z.object({
  characterId: z.string().min(1),
  generationId: z.string().min(1).optional(),
  imagePath: z.string().min(1).max(512).optional(),
}).refine(v => v.generationId || v.imagePath, {
  message: 'generationId or imagePath is required',
});

export type LockPortraitInput = z.infer<typeof lockPortraitSchema>;

const IMAGE_EXT = /\.(png|webp|jpe?g)$/i;

/**
 * Accept only a stored portrait owned by this server for this character:
 * `[/]portraits/<characterId>/...` (under public/), no traversal, no URLs.
 * Returns the canonical web path with a leading slash and forward slashes.
 */
export function normalizeOwnedPortraitPath(characterId: string, raw: string): string {
  const p = raw.trim().replace(/\\/g, '/');
  if (/^[a-z][a-z0-9+.-]*:/i.test(p) || p.startsWith('//')) {
    throw new ValidationError('imagePath must be a stored portrait path, not a URL');
  }
  const rel = p.replace(/^\/+/, '');
  const parts = rel.split('/');
  if (parts.some(s => s === '..' || s === '.' || s === '')) {
    throw new ValidationError('imagePath is not a valid portrait path');
  }
  if (parts[0] !== 'portraits' || parts[1] !== characterId || parts.length < 3) {
    throw new ValidationError('imagePath must live under this character\'s portraits folder');
  }
  if (!IMAGE_EXT.test(rel)) throw new ValidationError('imagePath must be an image file');
  return `/${rel}`;
}

/**
 * Lock a portrait: with a PortraitGeneration row, run the full persona lock;
 * otherwise (designer flow) validate the stored image and set Character.portrait,
 * which is what canvas cards read. Character has no separate token/full-body
 * field - only `portrait`.
 */
export async function lockPortrait(input: LockPortraitInput): Promise<{ via: 'generation' | 'image'; portrait: string }> {
  const { characterId, generationId, imagePath } = lockPortraitSchema.parse(input);

  const character = await prisma.character.findUnique({ where: { id: characterId }, select: { id: true } });
  if (!character) throw new NotFoundError('Character not found');

  if (generationId) {
    const gen = await prisma.portraitGeneration.findUnique({ where: { id: generationId } });
    if (gen && gen.characterId === characterId) {
      await lockPersona(generationId, characterId);
      return { via: 'generation', portrait: gen.imagePath };
    }
    if (!imagePath) throw new NotFoundError(`Generation ${generationId} not found for this character`);
  }

  const webPath = normalizeOwnedPortraitPath(characterId, imagePath!);
  try {
    await fs.access(path.join(process.cwd(), 'public', webPath));
  } catch {
    throw new NotFoundError('That portrait image does not exist on the server');
  }
  await prisma.character.update({ where: { id: characterId }, data: { portrait: webPath } });
  // A genesis waiting at the PORTRAIT gate (2026-10-16) goes back to work.
  void import('./genesis-gates').then(m => m.reopenGenesisGates(characterId)).catch(() => undefined);
  return { via: 'image', portrait: webPath };
}
