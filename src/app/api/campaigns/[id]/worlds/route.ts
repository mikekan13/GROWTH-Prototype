import { NextRequest, NextResponse } from "next/server";
import { withAuth, validateRequired, createApiError, API_ERRORS } from "@/lib/apiHelpers";
import { prisma } from "@/lib/prisma";

// Get all worlds for a campaign
export const GET = withAuth(async (session, request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { id: campaignId } = await params;

    const worlds = await prisma.world.findMany({
      where: {
        campaignId,
        isActive: true
      },
      include: {
        _count: {
          select: {
            regions: true,
            factions: true,
            npcs: true,
            characterBackstories: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ worlds });
  } catch (error) {
    console.error("Failed to fetch campaign worlds:", error);
    return NextResponse.json(
      { error: "Failed to fetch worlds" },
      { status: 500 }
    );
  }
});

// Create a new world/plane
export const POST = withAuth(async (session, request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { id: campaignId } = await params;
    const { name, description, liquidKrmaInvested, worldType } = await request.json();

    const validation = validateRequired({ name }, ['name']);
    if (!validation.isValid) {
      throw createApiError("World name is required", API_ERRORS.BAD_REQUEST.status);
    }

    // Verify campaign exists and user has access
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId }
    });

    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    // Check user has sufficient KRMA balance if investing
    const krmaAmount = BigInt(liquidKrmaInvested || 0);
    if (krmaAmount > 0) {
      const user = await prisma.user.findUnique({
        where: { id: (session as { user: { id: string } }).user.id }
      });

      if (!user || user.krmaBalance < krmaAmount) {
        return NextResponse.json(
          { error: "Insufficient KRMA balance" },
          { status: 400 }
        );
      }

      // Deduct KRMA from user balance
      await prisma.user.update({
        where: { id: (session as { user: { id: string } }).user.id },
        data: { krmaBalance: { decrement: krmaAmount } }
      });

      // Record KRMA transaction
      await prisma.krmaTransaction.create({
        data: {
          userId: (session as { user: { id: string } }).user.id,
          type: "PAYMENT",
          amount: krmaAmount,
          balance: user.krmaBalance - krmaAmount,
          description: `World creation: ${name.trim()}`,
          metadata: {
            campaignId,
            worldName: name.trim(),
            type: "world_creation"
          }
        }
      });
    }

    // Calculate lushness factor (starts at 1.0 for pure liquid KRMA)
    const lushnessFactor = krmaAmount > 0 ? 1.0 : 0.1;

    const world = await prisma.world.create({
      data: {
        campaignId,
        name: name.trim(),
        description: description?.trim() || null,
        liquidKrmaInvested: krmaAmount,
        totalKrmaInvested: krmaAmount,
        lushnessFactor,
        worldType: worldType || "MATERIAL",
      },
      include: {
        _count: {
          select: {
            regions: true,
            factions: true,
            npcs: true,
            characterBackstories: true,
          },
        },
      },
    });

    return NextResponse.json({ world });
  } catch (error) {
    console.error("Failed to create world:", error);
    return NextResponse.json(
      { error: "Failed to create world" },
      { status: 500 }
    );
  }
});