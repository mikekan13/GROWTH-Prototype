import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 50 * 1024 * 1024; // 50MB raw upload limit (we resize)
const MAX_STORED_DIMENSION = 2048; // Resize to max 2048px on longest side
const UPLOAD_DIR = 'uploads/references';

/**
 * POST /api/references
 * Upload a reference photo for character identity.
 * Body: multipart/form-data with 'file' field
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Only JPEG, PNG, and WebP images are allowed' }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File must be under 50MB' }, { status: 400 });
    }

    // Create user-specific directory
    const userDir = path.join('public', UPLOAD_DIR, session.user.id);
    await fs.mkdir(userDir, { recursive: true });

    // Resize and convert to JPEG for consistency and size
    const rawBuffer = Buffer.from(await file.arrayBuffer());
    const buffer = Buffer.from(await sharp(rawBuffer)
      .resize(MAX_STORED_DIMENSION, MAX_STORED_DIMENSION, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer());

    const filename = `${crypto.randomUUID()}.jpg`;
    const filePath = path.join(userDir, filename);

    await fs.writeFile(filePath, buffer);

    // Return the public URL path
    const publicPath = `/${UPLOAD_DIR}/${session.user.id}/${filename}`;

    return NextResponse.json({
      path: publicPath,
      filename,
      size: buffer.length,
      type: 'image/jpeg',
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * DELETE /api/references?path=/uploads/references/userId/filename.jpg
 * Delete a reference photo.
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await requireAuth();
    const refPath = request.nextUrl.searchParams.get('path');

    if (!refPath) {
      return NextResponse.json({ error: 'path query param required' }, { status: 400 });
    }

    // Security: ensure the path belongs to the current user
    const expectedPrefix = `/${UPLOAD_DIR}/${session.user.id}/`;
    if (!refPath.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const fullPath = path.join('public', refPath.slice(1)); // remove leading /
    await fs.unlink(fullPath).catch(() => {}); // silent if already gone

    return NextResponse.json({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
