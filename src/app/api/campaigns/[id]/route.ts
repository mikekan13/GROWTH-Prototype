import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth, validateRequired, createApiError, API_ERRORS } from "@/lib/apiHelpers";

export const GET = withAuth(async (
  session,
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          characters: true,
          sheets: true,
          sessions: true,
        },
      },
    },
  });

  if (!campaign) {
    throw createApiError("Campaign not found", API_ERRORS.NOT_FOUND.status);
  }

  return NextResponse.json({ campaign });
});

export const PUT = withAuth(async (
  session,
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { name, folderId } = await request.json();
  const { id } = await params;

  const validation = validateRequired({ name }, ['name']);
  if (!validation.isValid) {
    throw createApiError("Campaign name is required", API_ERRORS.BAD_REQUEST.status);
  }

  const updateData: { name: string; folderId?: string } = { name: name.trim() };
  if (folderId !== undefined) {
    updateData.folderId = folderId;
  }

  const campaign = await prisma.campaign.update({
    where: { id },
    data: updateData,
    include: {
      _count: {
        select: {
          characters: true,
          sheets: true,
          sessions: true,
        },
      },
    },
  });

  return NextResponse.json({ campaign });
});

export const PATCH = withAuth(async (
  session,
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const body = await request.json();
  const { id } = await params;

  // Allow partial updates for name, genre, themes, description
  const updateData: Partial<{
    name: string;
    genre: string;
    themes: string;
    description: string;
  }> = {};

  if (body.name !== undefined) {
    if (!body.name.trim()) {
      throw createApiError("Campaign name cannot be empty", API_ERRORS.BAD_REQUEST.status);
    }
    updateData.name = body.name.trim();
  }

  if (body.genre !== undefined) {
    updateData.genre = body.genre.trim();
  }

  if (body.themes !== undefined) {
    updateData.themes = body.themes.trim();
  }

  if (body.description !== undefined) {
    updateData.description = body.description.trim();
  }

  const campaign = await prisma.campaign.update({
    where: { id },
    data: updateData,
    include: {
      _count: {
        select: {
          characters: true,
          sheets: true,
          sessions: true,
          worlds: true,
        },
      },
    },
  });

  return NextResponse.json({ campaign });
});

export const DELETE = withAuth(async (
  session,
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  await prisma.campaign.delete({
    where: { id },
  });

  return NextResponse.json({ success: true });
});