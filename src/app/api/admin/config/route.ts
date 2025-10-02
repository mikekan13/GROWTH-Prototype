import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/sessionManager";
// import { prisma } from "@/lib/prisma";
// import { createCampaignFolder } from "@/services/google";
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const config = {
      rootFolderId: process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || null,
      templateId: process.env.CHARACTER_TEMPLATE_ID || "15GvXfaqiM8PfAjNBNAir7YxCwMnp0Qvnu_4HDNgY_wU",
    };

    return NextResponse.json({ config });
  } catch (error) {
    console.error("Get admin config error:", error);
    return NextResponse.json(
      { error: "Failed to fetch config" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { rootFolderId } = await request.json();

    if (!rootFolderId?.trim()) {
      return NextResponse.json(
        { error: "Root folder ID is required" },
        { status: 400 }
      );
    }

    // Update the .env file
    const envPath = path.join(process.cwd(), '.env');
    let envContent = '';
    
    try {
      envContent = fs.readFileSync(envPath, 'utf8');
    } catch {
      // If .env doesn't exist, create it with basic content
      envContent = `# Database
DATABASE_URL="file:./dev.db"

# Google OAuth - REPLACE WITH YOUR ACTUAL VALUES
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here

# NextAuth - REPLACE WITH YOUR ACTUAL VALUES
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_nextauth_secret_here

# Session - REPLACE WITH YOUR ACTUAL VALUES
SESSION_SECRET=your_session_secret_here

# Character Sheet Template (Fixed)
CHARACTER_TEMPLATE_ID=15GvXfaqiM8PfAjNBNAir7YxCwMnp0Qvnu_4HDNgY_wU

`;
    }

    // Update or add the GOOGLE_DRIVE_ROOT_FOLDER_ID
    const rootFolderRegex = /^GOOGLE_DRIVE_ROOT_FOLDER_ID=.*$/m;
    const commentedRootFolderRegex = /^# GOOGLE_DRIVE_ROOT_FOLDER_ID=.*$/m;
    
    const newRootFolderLine = `GOOGLE_DRIVE_ROOT_FOLDER_ID=${rootFolderId.trim()}`;

    if (rootFolderRegex.test(envContent)) {
      // Replace existing line
      envContent = envContent.replace(rootFolderRegex, newRootFolderLine);
    } else if (commentedRootFolderRegex.test(envContent)) {
      // Replace commented line
      envContent = envContent.replace(commentedRootFolderRegex, newRootFolderLine);
    } else {
      // Add new line
      envContent += `\n# Google Drive Root Folder\n${newRootFolderLine}\n`;
    }

    // Write the updated .env file
    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log("✅ Updated .env file with new root folder ID:", rootFolderId);

    // IMPORTANT: Update process.env so the folder creation can use the new value
    process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID = rootFolderId.trim();
    console.log("✅ Updated process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID");

    // Note: Campaign folders will be created automatically when users first access campaigns
    // This ensures proper authentication context is available
    console.log("📝 Note: Existing campaign folders will be created automatically when accessed");

    // Trigger a restart by touching a file that Next.js watches
    // This will cause the development server to restart automatically
    const restartTriggerPath = path.join(process.cwd(), 'next.config.ts');
    fs.statSync(restartTriggerPath); // Check file exists
    fs.utimesSync(restartTriggerPath, new Date(), new Date());

    return NextResponse.json({ 
      success: true, 
      message: "Configuration updated and server restarting..." 
    });
  } catch (error) {
    console.error("Update admin config error:", error);
    return NextResponse.json(
      { error: "Failed to update configuration" },
      { status: 500 }
    );
  }
}