import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/apiHelpers";
import { TKVCalculator } from "@/lib/tkvCalculator";
import { prisma } from "@/lib/prisma";

// Get character TKV
export const GET = withAuth(async (session, request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { id: characterId } = await params;
    
    // Get character data
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: {
        krmaData: true,
        Campaign: true
      }
    });

    if (!character) {
      return NextResponse.json(
        { error: "Character not found" },
        { status: 404 }
      );
    }

    // Calculate TKV
    const characterData = character.json && typeof character.json === 'object' && !Array.isArray(character.json) ? character.json as Record<string, unknown> : {};
    const tkvBreakdown = TKVCalculator.calculateTKV(characterData);
    
    // Validate TKV
    const validation = TKVCalculator.validateTKV(characterData, tkvBreakdown);
    
    // Create summary
    const summary = TKVCalculator.createTKVSummary(tkvBreakdown);
    
    // Update stored KRMA data
    await prisma.characterKrma.upsert({
      where: { characterId },
      create: {
        characterId,
        totalKrmaValue: tkvBreakdown.total,
        krmaBreakdown: {
          attributes: tkvBreakdown.attributes.toString(),
          skills: tkvBreakdown.skills.toString(),
          frequency: tkvBreakdown.frequency.toString(),
          wealthLevel: tkvBreakdown.wealthLevel.toString(),
          techLevel: tkvBreakdown.techLevel.toString(),
          healthLevel: tkvBreakdown.healthLevel.toString(),
          fateDie: tkvBreakdown.fateDie.toString(),
          items: tkvBreakdown.items.toString(),
          nectars: tkvBreakdown.nectars.toString(),
          thorns: tkvBreakdown.thorns.toString(),
          seeds: tkvBreakdown.seeds.toString(),
          roots: tkvBreakdown.roots.toString(),
          branches: tkvBreakdown.branches.toString()
        } as Record<string, string>,
        lastCalculated: new Date()
      },
      update: {
        totalKrmaValue: tkvBreakdown.total,
        krmaBreakdown: {
          attributes: tkvBreakdown.attributes.toString(),
          skills: tkvBreakdown.skills.toString(),
          frequency: tkvBreakdown.frequency.toString(),
          wealthLevel: tkvBreakdown.wealthLevel.toString(),
          techLevel: tkvBreakdown.techLevel.toString(),
          healthLevel: tkvBreakdown.healthLevel.toString(),
          fateDie: tkvBreakdown.fateDie.toString(),
          items: tkvBreakdown.items.toString(),
          nectars: tkvBreakdown.nectars.toString(),
          thorns: tkvBreakdown.thorns.toString(),
          seeds: tkvBreakdown.seeds.toString(),
          roots: tkvBreakdown.roots.toString(),
          branches: tkvBreakdown.branches.toString()
        } as Record<string, string>,
        lastCalculated: new Date()
      }
    });

    return NextResponse.json({
      characterId,
      characterName: character.name,
      campaignId: character.campaignId,
      campaignName: character.Campaign.name,
      tkv: {
        total: tkvBreakdown.total.toString(),
        formatted: TKVCalculator.formatTKV(tkvBreakdown.total),
        breakdown: {
          attributes: tkvBreakdown.attributes.toString(),
          skills: tkvBreakdown.skills.toString(),
          frequency: tkvBreakdown.frequency.toString(),
          wealthLevel: tkvBreakdown.wealthLevel.toString(),
          techLevel: tkvBreakdown.techLevel.toString(),
          healthLevel: tkvBreakdown.healthLevel.toString(),
          fateDie: tkvBreakdown.fateDie.toString(),
          items: tkvBreakdown.items.toString(),
          nectars: tkvBreakdown.nectars.toString(),
          thorns: tkvBreakdown.thorns.toString(),
          seeds: tkvBreakdown.seeds.toString(),
          roots: tkvBreakdown.roots.toString(),
          branches: tkvBreakdown.branches.toString()
        }
      },
      validation: {
        isValid: validation.isValid,
        errors: validation.errors,
        sheetTKV: validation.sheetTKV?.toString(),
        difference: validation.difference?.toString()
      },
      summary,
      lastCalculated: new Date().toISOString()
    });
  } catch (error) {
    console.error("Failed to calculate character TKV:", error);
    return NextResponse.json(
      { error: "Failed to calculate TKV" },
      { status: 500 }
    );
  }
});

// Recalculate character TKV
export const POST = withAuth(async (session, request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { id: _characterId } = await params;
    
    // This would trigger a fresh calculation and sync from Google Sheets
    // For now, just return the current calculation by calling the GET handler
    return await GET(request, { params });
  } catch (error) {
    console.error("Failed to recalculate character TKV:", error);
    return NextResponse.json(
      { error: "Failed to recalculate TKV" },
      { status: 500 }
    );
  }
});