import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeFile } from 'fs/promises';
import path from 'path';

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('avatar') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Invalid file type. Use JPEG, PNG, WebP, or GIF.' }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large. Max 5MB.' }, { status: 400 });
  }

  const ext = file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1];
  const filename = `${session.user.id}.${ext}`;
  const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'avatars');
  const filePath = path.join(uploadDir, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  const avatarUrl = `/uploads/avatars/${filename}?t=${Date.now()}`;

  // Update profile JSON with avatarUrl
  const existing = session.user.profile ? JSON.parse(session.user.profile) : {};
  existing.avatarUrl = avatarUrl;

  await prisma.user.update({
    where: { id: session.user.id },
    data: { profile: JSON.stringify(existing) },
  });

  return NextResponse.json({ avatarUrl });
}
