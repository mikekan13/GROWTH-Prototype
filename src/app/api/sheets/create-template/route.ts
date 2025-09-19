import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get template ID to copy from request body (optional)
    const body = await request.json().catch(() => ({}));
    const { sourceTemplateId } = body;

    // Use service account to create template
    const { google } = await import("googleapis");
    
    const auth = new google.auth.GoogleAuth({
      credentials: process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS ? 
        JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS) : undefined,
      scopes: [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/spreadsheets',
      ],
    });
    
    const sheets = google.sheets({ version: "v4", auth });
    const drive = google.drive({ version: "v3", auth });

    let response;
    
    if (sourceTemplateId) {
      // Copy your existing template using service account
      console.log(`🔄 Service account copying template: ${sourceTemplateId}`);
      
      response = await drive.files.copy({
        fileId: sourceTemplateId,
        requestBody: {
          name: "GROWTH Character Sheet Template (Service Account Copy)",
        },
      });
      
      console.log(`✅ Template copied by service account: ${response.data.id}`);
    } else {
      // Create a new basic template using service account
      console.log(`📋 Service account creating basic template`);
      
      response = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title: "GROWTH Character Sheet Template",
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
                      { userEnteredValue: { stringValue: "" } },
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
      
      console.log(`✅ Basic template created by service account: ${response.data.spreadsheetId}`);
    }

    const spreadsheetId = (response.data as { id?: string; spreadsheetId?: string }).id || (response.data as { id?: string; spreadsheetId?: string }).spreadsheetId;
    
    if (!spreadsheetId) {
      throw new Error("Failed to create/copy template spreadsheet");
    }

    return NextResponse.json({
      id: spreadsheetId,
      name: (response.data as { name?: string; properties?: { title?: string } }).name || (response.data as { name?: string; properties?: { title?: string } }).properties?.title,
      url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      message: sourceTemplateId ? 
        "Template copied successfully by service account!" : 
        "Basic template created successfully by service account!",
      instructions: sourceTemplateId ? 
        "Update your .env file with this new template ID" : 
        "You can now edit this template to add your intricate formulas, then update your .env file"
    });
  } catch (error) {
    console.error("Create template API error:", error);
    return NextResponse.json(
      { error: `Failed to create template: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}