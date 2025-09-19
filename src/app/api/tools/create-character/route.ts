import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { google } from "googleapis";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { characterName, campaignId } = await request.json();

    if (!characterName?.trim()) {
      return NextResponse.json(
        { error: "Character name is required" },
        { status: 400 }
      );
    }

    // If no campaignId provided, find a default campaign for the user
    let targetCampaignId = campaignId;

    if (!targetCampaignId) {
      // Find user's most recent campaign or create a default one
      const recentCampaign = await prisma.campaign.findFirst({
        where: {
          gmUserId: session.user.id,
        },
        orderBy: {
          updatedAt: 'desc'
        }
      });

      if (recentCampaign) {
        targetCampaignId = recentCampaign.id;
      } else {
        // Create a default campaign for character creation
        const newCampaign = await prisma.campaign.create({
          data: {
            name: "My Campaign",
            description: "Default campaign for character creation",
            gmUserId: session.user.id,
          }
        });
        targetCampaignId = newCampaign.id;
      }
    }

    // Verify the campaign exists and user has access
    const campaign = await prisma.campaign.findUnique({
      where: { id: targetCampaignId },
    });

    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    if (campaign.gmUserId !== session.user.id) {
      return NextResponse.json(
        { error: "Access denied to campaign" },
        { status: 403 }
      );
    }

    // Create Google Sheet from template using the working copySpreadsheet function
    const templateId = process.env.CHARACTER_TEMPLATE_ID;

    if (!templateId) {
      throw new Error("CHARACTER_TEMPLATE_ID environment variable is required");
    }

    console.log(`🔄 Copying template: ${templateId}`);

    // Get or create campaign folder and characters subfolder
    let parentFolderId = null;
    try {
      const { getOrCreateCampaignFolder, createFolder, listFolderContents } = await import("@/services/google");
      const campaignFolder = await getOrCreateCampaignFolder(targetCampaignId, campaign.name);
      console.log(`📁 Found campaign folder: ${campaignFolder.id}`);

      // Check if "characters" subfolder exists
      console.log(`📁 Looking for characters subfolder in campaign folder: ${campaignFolder.id}`);
      const folderContents = await listFolderContents(campaignFolder.id);
      console.log(`📁 Found ${folderContents.length} items in campaign folder:`, folderContents.map(f => `${f.name} (${f.mimeType})`));

      const existingCharactersFolder = folderContents.find(
        file => file.name === "characters" && file.mimeType === "application/vnd.google-apps.folder"
      );

      if (existingCharactersFolder) {
        console.log(`📁 Found existing characters folder: ${existingCharactersFolder.id}`);
        parentFolderId = existingCharactersFolder.id;
      } else {
        // Create characters subfolder
        console.log(`📁 No existing characters folder found, creating new one...`);
        const charactersFolder = await createFolder("characters", campaignFolder.id);
        console.log(`📁 Created characters folder: ${charactersFolder.id}`);
        parentFolderId = charactersFolder.id;
      }
    } catch (folderError) {
      console.log(`⚠️ Could not create characters folder:`, folderError);
    }

    // Use the working copySpreadsheet function from services/google.ts
    const { copySpreadsheet } = await import("@/services/google");
    const copiedSheet = await copySpreadsheet(
      templateId,
      `${characterName.trim()} - Character Sheet`,
      parentFolderId || undefined
    );

    console.log(`✅ Template copied successfully: ${copiedSheet.id}`);

    if (!copiedSheet.id) {
      throw new Error("Failed to copy template spreadsheet");
    }

    const spreadsheetId = copiedSheet.id;
    console.log(`✅ Successfully copied template to: ${spreadsheetId}`);

    // Create the character in the database
    const character = await prisma.character.create({
      data: {
        name: characterName.trim(),
        campaignId: targetCampaignId,
        spreadsheetId,
        playerEmail: session.user.email || null,
        json: {}, // Empty JSON object for character data
        revId: null, // Will be set when sheet is first synced
      },
    });

    console.log(`✅ Created character "${character.name}" in campaign "${campaign.name}"`);

    return NextResponse.json({
      success: true,
      character: {
        id: character.id,
        name: character.name,
        campaignId: character.campaignId,
        spreadsheetId: character.spreadsheetId,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${character.spreadsheetId}/edit`,
      },
      campaign: {
        id: campaign.id,
        name: campaign.name,
      }
    });
  } catch (error) {
    console.error("Tools create character API error:", error);
    return NextResponse.json(
      { error: `Failed to create character: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}