import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/sessionManager";
import { copySpreadsheet, shareSpreadsheet, getOrCreateCampaignFolder } from "@/services/google";
// import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { playerName, playerEmail, templateId, folderId, campaignId, campaignName } = await request.json();

    if (!playerName?.trim()) {
      return NextResponse.json(
        { error: "Player name is required" },
        { status: 400 }
      );
    }

    // Use provided template ID or fall back to environment variable
    const sourceSpreadsheetId = templateId || process.env.CHARACTER_TEMPLATE_ID;
    
    if (!sourceSpreadsheetId) {
      return NextResponse.json(
        { error: "No character template configured" },
        { status: 500 }
      );
    }

    // Ensure campaign has a folder if campaignId provided
    let targetFolderId = folderId;
    if (campaignId && campaignName && !folderId && process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID) {
      try {
        console.log(`📁 Creating/getting folder for campaign "${campaignName}"`);
        const campaignFolder = await getOrCreateCampaignFolder(campaignId, campaignName);
        targetFolderId = campaignFolder.id;
        console.log(`✅ Using campaign folder ID: ${targetFolderId}`);
      } catch (error) {
        console.warn("Failed to create campaign folder, continuing without folder:", error);
        // Continue without folder - don't fail the sheet creation
      }
    }

    let newSpreadsheet;
    
    try {
      // Try to copy the template spreadsheet
      newSpreadsheet = await copySpreadsheet(
        sourceSpreadsheetId,
        `${playerName} - Character Sheet`,
        targetFolderId // Optional: place in campaign folder
      );
    } catch (_templateError) {
      console.warn(`⚠️ Template ${sourceSpreadsheetId} not accessible, creating new template...`);
      
      // If template fails, create a new character sheet from scratch
      const { getSheetsService } = await import("@/services/google");
      const sheets = await getSheetsService();
      
      const response = await sheets.spreadsheets.create({
        requestBody: {
          properties: {
            title: `${playerName} - Character Sheet`,
          },
          sheets: [
            {
              properties: {
                title: "Character",
                gridProperties: {
                  rowCount: 50,
                  columnCount: 10,
                },
              },
              data: [
                {
                  rowData: [
                    {
                      values: [
                        { userEnteredValue: { stringValue: "Character Name:" }, userEnteredFormat: { textFormat: { bold: true } } },
                        { userEnteredValue: { stringValue: playerName } },
                      ],
                    },
                    {
                      values: [
                        { userEnteredValue: { stringValue: "Level:" }, userEnteredFormat: { textFormat: { bold: true } } },
                        { userEnteredValue: { stringValue: "1" } },
                      ],
                    },
                    {
                      values: [
                        { userEnteredValue: { stringValue: "Class:" }, userEnteredFormat: { textFormat: { bold: true } } },
                        { userEnteredValue: { stringValue: "" } },
                      ],
                    },
                    {
                      values: [
                        { userEnteredValue: { stringValue: "Race:" }, userEnteredFormat: { textFormat: { bold: true } } },
                        { userEnteredValue: { stringValue: "" } },
                      ],
                    },
                    {
                      values: [
                        { userEnteredValue: { stringValue: "" } },
                      ],
                    },
                    {
                      values: [
                        { userEnteredValue: { stringValue: "ABILITY SCORES" }, userEnteredFormat: { textFormat: { bold: true, fontSize: 12 } } },
                      ],
                    },
                    {
                      values: [
                        { userEnteredValue: { stringValue: "Strength:" }, userEnteredFormat: { textFormat: { bold: true } } },
                        { userEnteredValue: { stringValue: "10" } },
                      ],
                    },
                    {
                      values: [
                        { userEnteredValue: { stringValue: "Dexterity:" }, userEnteredFormat: { textFormat: { bold: true } } },
                        { userEnteredValue: { stringValue: "10" } },
                      ],
                    },
                    {
                      values: [
                        { userEnteredValue: { stringValue: "Constitution:" }, userEnteredFormat: { textFormat: { bold: true } } },
                        { userEnteredValue: { stringValue: "10" } },
                      ],
                    },
                    {
                      values: [
                        { userEnteredValue: { stringValue: "Intelligence:" }, userEnteredFormat: { textFormat: { bold: true } } },
                        { userEnteredValue: { stringValue: "10" } },
                      ],
                    },
                    {
                      values: [
                        { userEnteredValue: { stringValue: "Wisdom:" }, userEnteredFormat: { textFormat: { bold: true } } },
                        { userEnteredValue: { stringValue: "10" } },
                      ],
                    },
                    {
                      values: [
                        { userEnteredValue: { stringValue: "Charisma:" }, userEnteredFormat: { textFormat: { bold: true } } },
                        { userEnteredValue: { stringValue: "10" } },
                      ],
                    },
                    {
                      values: [
                        { userEnteredValue: { stringValue: "" } },
                      ],
                    },
                    {
                      values: [
                        { userEnteredValue: { stringValue: "SKILLS & ABILITIES" }, userEnteredFormat: { textFormat: { bold: true, fontSize: 12 } } },
                      ],
                    },
                    {
                      values: [
                        { userEnteredValue: { stringValue: "HP:" }, userEnteredFormat: { textFormat: { bold: true } } },
                        { userEnteredValue: { stringValue: "10" } },
                      ],
                    },
                    {
                      values: [
                        { userEnteredValue: { stringValue: "AC:" }, userEnteredFormat: { textFormat: { bold: true } } },
                        { userEnteredValue: { stringValue: "10" } },
                      ],
                    },
                    {
                      values: [
                        { userEnteredValue: { stringValue: "Speed:" }, userEnteredFormat: { textFormat: { bold: true } } },
                        { userEnteredValue: { stringValue: "30 ft" } },
                      ],
                    },
                    {
                      values: [
                        { userEnteredValue: { stringValue: "" } },
                      ],
                    },
                    {
                      values: [
                        { userEnteredValue: { stringValue: "EQUIPMENT" }, userEnteredFormat: { textFormat: { bold: true, fontSize: 12 } } },
                      ],
                    },
                    {
                      values: [
                        { userEnteredValue: { stringValue: "Weapon:" }, userEnteredFormat: { textFormat: { bold: true } } },
                        { userEnteredValue: { stringValue: "" } },
                      ],
                    },
                    {
                      values: [
                        { userEnteredValue: { stringValue: "Armor:" }, userEnteredFormat: { textFormat: { bold: true } } },
                        { userEnteredValue: { stringValue: "" } },
                      ],
                    },
                    {
                      values: [
                        { userEnteredValue: { stringValue: "Items:" }, userEnteredFormat: { textFormat: { bold: true } } },
                        { userEnteredValue: { stringValue: "" } },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      });

      newSpreadsheet = {
        id: response.data.spreadsheetId,
        name: response.data.properties?.title,
      };

      // Move to folder if specified
      if (targetFolderId && newSpreadsheet.id) {
        try {
          const { getDriveService } = await import("@/services/google");
          const drive = await getDriveService();
          await drive.files.update({
            fileId: newSpreadsheet.id,
            addParents: targetFolderId,
          });
        } catch (moveError) {
          console.warn("Failed to move sheet to folder:", moveError);
        }
      }
    }

    if (!newSpreadsheet.id) {
      throw new Error("Failed to get new spreadsheet ID");
    }

    // Share with the player if email provided
    if (playerEmail?.trim()) {
      await shareSpreadsheet(newSpreadsheet.id, playerEmail, "writer");
    }

    return NextResponse.json({
      id: newSpreadsheet.id,
      name: newSpreadsheet.name,
      url: `https://docs.google.com/spreadsheets/d/${newSpreadsheet.id}/edit`,
      templateId: sourceSpreadsheetId,
    });
  } catch (error) {
    console.error("Create blank character sheet API error:", error);
    return NextResponse.json(
      { error: "Failed to create character sheet" },
      { status: 500 }
    );
  }
}