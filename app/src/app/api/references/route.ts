import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { REFERENCE_UPLOAD_DIR, deleteReferencePhoto, storeReferencePhoto } from '@/services/reference-photo';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 50 * 1024 * 1024; // 50MB raw upload limit (we resize)
const UPLOAD_DIR = REFERENCE_UPLOAD_DIR;

/**
 * POST /api/references
 * Upload a reference photo for character identity. Stores the normalised original and (services/reference-photo)
 * PREPARES it: a face-tight passport crop beside it for the base lock, plus a quality check returned as `prep`.
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

    const stored = await storeReferencePhoto(session.user.id, Buffer.from(await file.arrayBuffer()));
    return NextResponse.json(stored);
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

    await deleteReferencePhoto(refPath); // original + prepared siblings; silent if already gone

    return NextResponse.json({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
