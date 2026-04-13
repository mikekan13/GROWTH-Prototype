import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

/**
 * GET /api/portraits/existing?characterId=xxx
 *
 * Lists existing generated portrait images for a character (or creation-preview).
 * Returns paths to .webp files sorted by newest first.
 */
export async function GET(request: NextRequest) {
  const characterId = request.nextUrl.searchParams.get('characterId') || 'creation-preview';
  const dir = path.join(process.cwd(), 'public', 'portraits', characterId);

  try {
    const files = await fs.readdir(dir);
    const webpFiles = files
      .filter(f => f.endsWith('.webp') && !f.includes('_thumb'))
      .sort()
      .reverse(); // newest first (UUIDs sort lexically, reverse for newest)

    // Get file stats for proper date sorting
    const withStats = await Promise.all(
      webpFiles.map(async (f) => {
        const stat = await fs.stat(path.join(dir, f));
        return { path: `/portraits/${characterId}/${f}`, mtime: stat.mtimeMs };
      })
    );

    withStats.sort((a, b) => b.mtime - a.mtime);

    return NextResponse.json({
      images: withStats.map(f => f.path),
    });
  } catch {
    return NextResponse.json({ images: [] });
  }
}
