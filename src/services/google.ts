/**
 * Google Sheets Integration Service
 *
 * STATUS: NEEDS REFACTORING FOR CUSTOM AUTH
 *
 * This service handles Google Sheets API integration for character sheet
 * import/export functionality. It is currently NON-FUNCTIONAL after removing
 * Google OAuth/NextAuth in favor of custom username/password authentication.
 *
 * WHEN TO USE:
 * - Manual "Export to Google Sheets" button for character sheets
 * - Manual "Import from Google Sheets" button to sync character data
 *
 * TODO FOR FUTURE IMPLEMENTATION:
 * 1. Remove dependency on old `Account` model (NextAuth OAuth tokens)
 * 2. Implement new OAuth flow specifically for Google Sheets API:
 *    - Create a separate "Connect Google Account" button in settings
 *    - Store Google OAuth tokens in User model or new GoogleConnection model
 *    - Only request `https://www.googleapis.com/auth/drive.file` scope
 * 3. Update all functions to use new token storage method
 * 4. Add per-user Google connection status tracking
 *
 * PRESERVED FUNCTIONS (need OAuth token updates):
 * - getGoogleAuth() - Get authenticated Google API client
 * - getGoogleDrive() - Get Google Drive API
 * - getGoogleSheets() - Get Google Sheets API
 * - createFolder() - Create folder in Google Drive
 * - copyTemplate() - Copy sheet template
 * - getAllNamedRanges() - Get named ranges from sheet
 *
 * NOTE: Database is primary source of truth. Google Sheets is OPTIONAL backup/export.
 */

import { google, Auth } from "googleapis";
import { getSessionUser } from "@/lib/sessionManager";
import { prisma } from "@/lib/prisma";

export async function getGoogleAuth() {
  const user = await getSessionUser();

  if (!user) {
    throw new Error("No authenticated user");
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    `${process.env.NEXTAUTH_URL}/api/auth/callback/google`
  );

  // Set credentials from session
  const account = await prisma.account.findFirst({
    where: {
      userId: user.id,
      provider: "google",
    },
  });

  if (!account?.access_token) {
    throw new Error("No access token found");
  }

  // Check if the account has the required Gmail scope
  console.log("🔍 Checking OAuth scopes. Account scope field:", account.scope);
  
  const accountScopes = account.scope ? account.scope.split(' ') : [];
  const hasGmailScope = accountScopes.includes("https://www.googleapis.com/auth/gmail.send");
  
  console.log("📋 Current OAuth scopes:", accountScopes);
  console.log("✉️ Gmail scope present:", hasGmailScope);
  
  if (!hasGmailScope) {
    console.log("❌ Missing Gmail send scope. Please ensure you granted Gmail permissions during authentication.");
    // Don't throw an error, let's try anyway and see what happens
    console.log("🔄 Attempting Gmail API call despite missing scope...");
  } else {
    console.log("✅ Gmail scope verified, proceeding with email send");
  }

  oauth2Client.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
  });

  // Handle token refresh automatically
  oauth2Client.on('tokens', async (tokens) => {
    console.log('🔄 Refreshing Google OAuth tokens');
    
    // CRITICAL: Preserve the original scope during token refresh
    const preservedScope = account.scope || "openid email profile https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/gmail.send";
    
    // Update the database with new tokens
    await prisma.account.update({
      where: { id: account.id },
      data: {
        access_token: tokens.access_token || account.access_token,
        expires_at: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : account.expires_at,
        refresh_token: tokens.refresh_token || account.refresh_token,
        scope: preservedScope, // PRESERVE THE SCOPE!
      },
    });
    
    console.log('✅ Updated Google OAuth tokens in database with preserved scope');
  });

  // Check if token is expired and refresh if needed
  const now = Math.floor(Date.now() / 1000);
  if (account.expires_at && account.expires_at < now) {
    console.log('⚠️ Access token expired, attempting refresh...');
    
    if (!account.refresh_token) {
      throw new Error("Access token expired and no refresh token available. Please sign in again.");
    }

    try {
      // Force refresh the token
      await oauth2Client.refreshAccessToken();
      console.log('✅ Successfully refreshed access token');
    } catch (error) {
      console.error('❌ Failed to refresh access token:', error);
      throw new Error("Failed to refresh access token. Please sign in again.");
    }
  }

  return oauth2Client;
}

// Service account auth for reading sheets when user auth fails
export async function getServiceAccountAuth() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS) {
    throw new Error("Service account credentials not configured");
  }

  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/spreadsheets.readonly',
    ],
  });

  return auth.getClient();
}

export async function getDriveService() {
  const auth = await getGoogleAuth();
  return google.drive({ version: "v3", auth });
}

export async function getSheetsService() {
  try {
    const auth = await getGoogleAuth();
    return google.sheets({ version: "v4", auth });
  } catch (error) {
    console.log("User auth failed for sheets, trying service account:", error);
    const serviceAuth = await getServiceAccountAuth();
    return google.sheets({ version: "v4", auth: serviceAuth as unknown as Auth.GoogleAuth });
  }
}

// Drive API helpers
export async function getSpreadsheetMetadata(spreadsheetId: string) {
  const drive = await getDriveService();
  
  try {
    const response = await drive.files.get({
      fileId: spreadsheetId,
      fields: "id,name,modifiedTime,version,permissions,parents",
    });
    return response.data;
  } catch (error) {
    console.error("Error fetching spreadsheet metadata:", error);
    throw error;
  }
}

export async function copySpreadsheet(
  spreadsheetId: string,
  newName: string,
  parentFolderId?: string
) {
  // Try user auth first
  const drive = await getDriveService();
  
  try {
    const response = await drive.files.copy({
      fileId: spreadsheetId,
      requestBody: {
        name: newName,
        parents: parentFolderId ? [parentFolderId] : undefined,
      },
    });
    return response.data;
  } catch (userError) {
    console.log("User auth failed, trying service account to read + user to copy:", userError);
    
    // If user auth fails, try hybrid approach:
    // Use service account to read template, user auth to create copy
    if (process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS) {
      try {
        console.log("🔧 Hybrid approach: Service account read, user write...");
        const { google } = await import("googleapis");
        
        // Service account for reading template
        const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS);
        const serviceAuth = new google.auth.GoogleAuth({
          credentials,
          scopes: [
            'https://www.googleapis.com/auth/drive.readonly',
            'https://www.googleapis.com/auth/spreadsheets.readonly',
          ],
        });
        
        const serviceAuthClient = await serviceAuth.getClient();
        const serviceAccountDrive = google.drive({ version: "v3", auth: serviceAuthClient as unknown as Auth.GoogleAuth });
        const serviceAccountSheets = google.sheets({ version: "v4", auth: serviceAuthClient as unknown as Auth.GoogleAuth });
        
        // First, verify we can access the template
        console.log("🔧 Verifying service account can access template...");
        await serviceAccountDrive.files.get({
          fileId: spreadsheetId,
          fields: "id,name",
        });
        
        // Get template data using service account
        console.log("🔧 Reading template data with service account...");
        const templateData = await serviceAccountSheets.spreadsheets.get({
          spreadsheetId,
          includeGridData: true,
        });

        // Also get named ranges from template
        console.log("🔧 Reading named ranges from template...");
        const templateNamedRanges = await serviceAccountSheets.spreadsheets.get({
          spreadsheetId,
          fields: "namedRanges",
        });

        interface TemplateNamedRange {
          name?: string;
          range?: {
            sheetId?: number;
            startRowIndex?: number;
            startColumnIndex?: number;
            endRowIndex?: number;
            endColumnIndex?: number;
          };
        }

        // Filter out invalid named ranges with detailed logging
        const validNamedRanges = ((templateNamedRanges.data.namedRanges || []) as TemplateNamedRange[]).filter((namedRange, index: number) => {
          // Named range names must be valid according to Google Sheets rules
          const name = namedRange.name;

          // Check if name exists and is string
          if (!name || typeof name !== 'string') {
            console.log(`🔧 Filtering out named range ${index}: No name or not string`);
            return false;
          }

          // Check if empty or starts with number
          if (name.trim() === '' || /^\d/.test(name)) {
            console.log(`🔧 Filtering out named range ${index}: "${name}" - Empty or starts with number`);
            return false;
          }

          // More lenient validation - allow dots, hyphens, spaces (Google Sheets is more flexible)
          // Only filter out truly problematic characters
          if (/[<>{}[\]\\\/\|:;"'`~!@#$%^&*()+=?]/.test(name)) {
            console.log(`🔧 Filtering out named range ${index}: "${name}" - Contains invalid characters`);
            return false;
          }

          // Additional check for length (Google Sheets has limits)
          if (name.length > 100) {
            console.log(`🔧 Filtering out named range ${index}: "${name}" - Too long (${name.length} chars)`);
            return false;
          }

          console.log(`🔧 Keeping named range ${index}: "${name}"`);
          return true;
        });

        console.log(`🔧 Filtered named ranges: ${(templateNamedRanges.data.namedRanges || []).length} -> ${validNamedRanges.length}`);

        // Create new spreadsheet using user auth
        console.log("🔧 Creating new spreadsheet with user auth...");
        const userSheets = await getSheetsService();
        const response = await userSheets.spreadsheets.create({
          requestBody: {
            properties: {
              title: newName,
            },
            sheets: templateData.data.sheets,
            namedRanges: validNamedRanges,
          },
        });

        console.log("✓ Successfully created copy using hybrid approach");

        // Verify named ranges were preserved
        if (response.data.spreadsheetId) {
          try {
            const copiedNamedRanges = await getNamedRanges(response.data.spreadsheetId);
            const templateNamedRangesCount = templateNamedRanges.data.namedRanges?.length || 0;
            console.log(`🔍 Template had ${templateNamedRangesCount} named ranges, copy has ${copiedNamedRanges.length}`);
            if (copiedNamedRanges.length === templateNamedRangesCount) {
              console.log("✓ All named ranges preserved successfully");
            } else {
              console.warn("⚠️ Named range count mismatch - some may not have been preserved");
            }
          } catch (checkError) {
            console.warn("Could not verify named ranges in hybrid copy:", checkError);
          }
        }

        // Move to folder if specified (using user auth)
        if (parentFolderId && response.data.spreadsheetId) {
          try {
            const userDrive = await getDriveService();
            await userDrive.files.update({
              fileId: response.data.spreadsheetId,
              addParents: parentFolderId,
            });
            console.log("✓ Moved to folder successfully");
          } catch (moveError) {
            console.warn("Could not move to folder:", moveError);
          }
        }

        return {
          id: response.data.spreadsheetId,
          name: response.data.properties?.title,
        };
      } catch (serviceError) {
        console.error("Hybrid approach also failed:", serviceError);
        throw serviceError;
      }
    }

    throw userError;
  }
}

export async function shareSpreadsheet(
  spreadsheetId: string,
  email: string,
  role: "reader" | "writer" = "writer"
) {
  const drive = await getDriveService();
  
  try {
    const response = await drive.permissions.create({
      fileId: spreadsheetId,
      requestBody: {
        role,
        type: "user",
        emailAddress: email,
      },
      sendNotificationEmail: true,
    });
    return response.data;
  } catch (error) {
    console.error("Error sharing spreadsheet:", error);
    throw error;
  }
}

// Sheets API helpers
export async function getSpreadsheetInfo(spreadsheetId: string) {
  const sheets = await getSheetsService();
  
  try {
    const response = await sheets.spreadsheets.get({
      spreadsheetId,
      includeGridData: false,
    });
    return response.data;
  } catch (error) {
    console.error("Error fetching spreadsheet info:", error);
    throw error;
  }
}

export async function getNamedRanges(spreadsheetId: string) {
  const sheets = await getSheetsService();
  
  try {
    const response = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "namedRanges",
    });
    return response.data.namedRanges || [];
  } catch (error) {
    console.error("Error fetching named ranges:", error);
    throw error;
  }
}

export async function getSheetData(
  spreadsheetId: string,
  range: string
) {
  const sheets = await getSheetsService();
  
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
      valueRenderOption: "UNFORMATTED_VALUE",
      dateTimeRenderOption: "FORMATTED_STRING",
    });
    return response.data.values || [];
  } catch (error) {
    console.error("Error fetching sheet data:", error);
    throw error;
  }
}

export async function batchGetSheetData(
  spreadsheetId: string,
  ranges: string[]
) {
  const sheets = await getSheetsService();
  
  try {
    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges,
      valueRenderOption: "UNFORMATTED_VALUE",
      dateTimeRenderOption: "FORMATTED_STRING",
    });
    return response.data.valueRanges || [];
  } catch (error) {
    console.error("Error batch fetching sheet data:", error);
    throw error;
  }
}

export async function watchSpreadsheetChanges(spreadsheetId: string) {
  const drive = await getDriveService();
  
  try {
    // Set up a watch for changes to the spreadsheet
    const response = await drive.changes.watch({
      pageToken: "1", // Start token - in production, track this
      requestBody: {
        id: `growth-${spreadsheetId}-${Date.now()}`,
        type: "web_hook",
        address: `${process.env.NEXTAUTH_URL}/api/drive-changes`,
        resourceId: spreadsheetId,
      },
    });
    return response.data;
  } catch (error) {
    console.error("Error setting up drive watch:", error);
    throw error;
  }
}

// Folder management functions
export async function createFolder(name: string, parentFolderId?: string) {
  const drive = await getDriveService();
  
  try {
    const response = await drive.files.create({
      requestBody: {
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: parentFolderId ? [parentFolderId] : undefined,
      },
    });
    return response.data;
  } catch (error) {
    console.error("Error creating folder:", error);
    throw error;
  }
}

export async function listAccessibleFolders() {
  const drive = await getDriveService();
  
  try {
    const response = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
      fields: "files(id,name,modifiedTime,shared,parents)",
      orderBy: "name",
      pageSize: 100,
    });
    return response.data.files || [];
  } catch (error) {
    console.error("Error listing folders:", error);
    throw error;
  }
}

export async function getFolderInfo(folderId: string) {
  const drive = await getDriveService();
  
  try {
    const response = await drive.files.get({
      fileId: folderId,
      fields: "id,name,modifiedTime,shared,parents,permissions",
    });
    return response.data;
  } catch (error) {
    console.error("Error fetching folder info:", error);
    throw error;
  }
}

export async function listFolderContents(folderId: string) {
  const drive = await getDriveService();
  
  try {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: "files(id,name,mimeType,modifiedTime)",
    });
    return response.data.files || [];
  } catch (error) {
    console.error("Error listing folder contents:", error);
    throw error;
  }
}

export async function shareFolder(folderId: string, email: string, role: "reader" | "writer" = "writer") {
  const drive = await getDriveService();
  
  try {
    const response = await drive.permissions.create({
      fileId: folderId,
      requestBody: {
        role,
        type: "user",
        emailAddress: email,
      },
      sendNotificationEmail: false,
    });
    return response.data;
  } catch (error) {
    console.error("Error sharing folder:", error);
    throw error;
  }
}


export async function createCampaignFolder(campaignName: string) {
  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  
  if (!rootFolderId) {
    throw new Error("GOOGLE_DRIVE_ROOT_FOLDER_ID not configured");
  }

  // Create subfolder for campaign
  const folder = await createFolder(campaignName, rootFolderId);
  return folder;
}

export async function getOrCreateCampaignFolder(campaignId: string, campaignName: string) {
  // This function ensures a campaign has its folder, creating if needed
  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

  if (!rootFolderId) {
    throw new Error("GOOGLE_DRIVE_ROOT_FOLDER_ID not configured");
  }

  // Use a transaction to prevent race conditions
  return await prisma.$transaction(async (tx) => {
    // Check if campaign already has a folder in database
    const campaign = await tx.campaign.findUnique({
      where: { id: campaignId },
      select: { folderId: true, name: true }
    });

    if (campaign?.folderId) {
      // Campaign already has a folder
      console.log(`📁 Using existing folder for campaign "${campaignName}": ${campaign.folderId}`);
      return { id: campaign.folderId };
    }

    console.log(`📁 Creating new folder for campaign "${campaignName}"`);

    // Create folder and update database atomically
    const folder = await createFolder(campaignName, rootFolderId);

    // Update campaign with folder ID within the transaction
    await tx.campaign.update({
      where: { id: campaignId },
      data: { folderId: folder.id }
    });

    console.log(`✅ Created and linked folder for campaign "${campaignName}": ${folder.id}`);
    return folder;
  });
}