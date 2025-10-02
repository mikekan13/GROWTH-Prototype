import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/sessionManager";
import { getSpreadsheetMetadata } from "@/services/google";

export async function GET(_request: NextRequest) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const templateId = process.env.CHARACTER_TEMPLATE_ID;
    
    if (!templateId) {
      return NextResponse.json({ error: "No template ID configured" }, { status: 500 });
    }

    console.log(`🔍 Testing template access for ID: ${templateId}`);
    console.log(`🔍 Using service account auth approach...`);
    
    // Test with both user auth and service account approach
    try {
      const metadata = await getSpreadsheetMetadata(templateId);
      console.log(`✅ Template accessible via user auth: ${metadata.name}`);
      
      return NextResponse.json({
        accessible: true,
        method: "user_auth",
        templateId,
        name: metadata.name,
        url: `https://docs.google.com/spreadsheets/d/${templateId}/edit`,
      });
    } catch (userAuthError) {
      console.log(`❌ User auth failed: ${userAuthError}`);
      
      // Try service account approach
      try {
        const { google } = await import("googleapis");
        const auth = new google.auth.GoogleAuth({
          keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
          scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets'],
        });
        
        const drive = google.drive({ version: "v3", auth });
        const response = await drive.files.get({
          fileId: templateId,
          fields: "id,name,modifiedTime",
        });
        
        console.log(`✅ Template accessible via service account: ${response.data.name}`);
        
        return NextResponse.json({
          accessible: true,
          method: "service_account",
          templateId,
          name: response.data.name,
          url: `https://docs.google.com/spreadsheets/d/${templateId}/edit`,
        });
      } catch (serviceAccountError) {
        console.error(`❌ Service account auth also failed: ${serviceAccountError}`);
        throw new Error(`Both user auth and service account failed. User: ${userAuthError}. Service: ${serviceAccountError}`);
      }
    }
  } catch (error) {
    console.error("❌ Template access test failed:", error);
    return NextResponse.json(
      { 
        accessible: false,
        templateId: process.env.CHARACTER_TEMPLATE_ID,
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}