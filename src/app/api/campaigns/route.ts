import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth, validateRequired, createApiError, API_ERRORS } from "@/lib/apiHelpers";

export const GET = withAuth(async (_session) => {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { updatedAt: "desc" },
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

  return NextResponse.json({ campaigns });
});

export const POST = withAuth(async (session, request: NextRequest) => {
  const { name, genre, themes, description } = await request.json();

  const validation = validateRequired({ name }, ['name']);
  if (!validation.isValid) {
    throw createApiError("Campaign name is required", API_ERRORS.BAD_REQUEST.status);
  }

  // Create campaign folder if root folder is configured
  // Note: We defer folder creation to when it's actually needed (e.g., during sheet creation)
  // This prevents duplicate folder creation and ensures proper coordination
  let folderId = null;

  const campaign = await prisma.campaign.create({
    data: {
      name: name.trim(),
      genre: genre?.trim() || null,
      themes: themes ? (Array.isArray(themes) ? themes : [themes]) : undefined,
      description: description?.trim() || null,
      folderId,
      gmUserId: session.user.id
    },
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