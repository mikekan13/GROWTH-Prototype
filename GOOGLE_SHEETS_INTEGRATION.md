# Google Sheets Integration - Future Implementation Guide

## Current Status: NON-FUNCTIONAL (Awaiting Refactor)

After migrating from Google OAuth/NextAuth to custom username/password authentication, the Google Sheets integration is **temporarily disabled** but **code preserved** for future implementation.

---

## What Was Cleaned Up

### Removed Files
- ✅ `src/lib/auth.ts` - Old NextAuth configuration
- ✅ `src/app/api/auth/[...nextauth]/route.ts` - NextAuth OAuth routes
- ✅ `src/types/next-auth.d.ts` - NextAuth TypeScript definitions

### Removed Packages
- ✅ `next-auth` - OAuth provider
- ✅ `@next-auth/prisma-adapter` - Database adapter

### Updated Database Schema
- ✅ Removed `Account` model (OAuth provider accounts)
- ✅ Removed `VerificationToken` model (email verification)
- ✅ Added custom auth: `GMInviteCode`, `Session` models
- ✅ User now has `username` + `password` fields

---

## What Was Preserved

### Google Sheets Service (`src/services/google.ts`)
**Status:** Code intact but needs OAuth refactor

**Preserved Functions:**
- `getGoogleAuth()` - Get authenticated Google API client
- `getGoogleDrive()` - Get Google Drive API instance
- `getGoogleSheets()` - Get Google Sheets API instance
- `createFolder()` - Create folder in Google Drive
- `createCampaignFolder()` - Create campaign-specific folder
- `copyTemplate()` - Copy character sheet template
- `getAllNamedRanges()` - Get named ranges from spreadsheet
- `checkSheetAccess()` - Verify sheet accessibility
- `createBlankSheet()` - Create new blank spreadsheet
- `copyTemplateAsNew()` - Copy template with ownership transfer

**What Needs Updating:**
- Remove dependency on old `Account` model
- Implement new Google OAuth token storage (see below)
- Update token refresh logic

### Gmail Service (`src/lib/gmailAuthService.ts`)
**Status:** Commented out, not actively used

**Note:** Gmail functionality was replaced with manual invite links. This service can be removed or refactored if email functionality is needed in the future.

### API Endpoints (Updated to Custom Auth)
All Google Sheets-related API endpoints have been updated to use custom authentication but will need OAuth tokens when Sheets functionality is re-enabled:

- `src/app/api/sheets/[id]/route.ts` - Get sheet data
- `src/app/api/sheets/[id]/named-ranges/route.ts` - Get named ranges
- `src/app/api/sheets/create-blank/route.ts` - Create blank sheet
- `src/app/api/sheets/create-template/route.ts` - Create from template
- `src/app/api/sheets/copy/route.ts` - Copy sheet
- `src/app/api/sheets/test-template/route.ts` - Test template access
- `src/app/api/sheets/template-named-ranges/route.ts` - Template ranges
- `src/app/api/characters/[id]/sync-from-sheets/route.ts` - Sync character from sheet
- `src/app/api/characters/[id]/restore-sheet/route.ts` - Restore sheet access

---

## Future Implementation Plan

### Step 1: Create Google Connection Model

Add to `prisma/schema.prisma`:

```prisma
model GoogleConnection {
  id           String   @id @default(cuid())
  userId       String   @unique
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  accessToken  String
  refreshToken String?
  expiresAt    DateTime?
  scope        String?

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([userId])
}

// Add to User model:
model User {
  // ... existing fields
  googleConnection GoogleConnection?
}
```

### Step 2: Implement Google OAuth Flow

Create new endpoints:

**`/api/google/connect`** - Initiate OAuth flow
```typescript
// Generate OAuth URL with only necessary scopes
const scopes = ['https://www.googleapis.com/auth/drive.file'];
// Redirect user to Google consent screen
```

**`/api/google/callback`** - Handle OAuth callback
```typescript
// Exchange code for tokens
// Store in GoogleConnection model
// Redirect back to settings with success message
```

**`/api/google/disconnect`** - Remove Google connection
```typescript
// Delete GoogleConnection record
// Revoke tokens with Google
```

### Step 3: Update Settings Page

Add "Google Sheets" section in `/settings`:

```typescript
// Show connection status
if (googleConnection) {
  // Show: "Connected as user@gmail.com"
  // Button: "Disconnect Google Account"
  // Info: "You can export/import character sheets to Google Sheets"
} else {
  // Show: "Not connected"
  // Button: "Connect Google Account"
  // Info: "Connect to enable character sheet export/import"
}
```

### Step 4: Update Google Service

Refactor `src/services/google.ts`:

```typescript
export async function getGoogleAuth() {
  const user = await getSessionUser();
  if (!user) throw new Error("Not authenticated");

  // Get Google connection from database
  const connection = await prisma.googleConnection.findUnique({
    where: { userId: user.id }
  });

  if (!connection) {
    throw new Error("Google account not connected. Please connect in Settings.");
  }

  // Check if token expired
  if (connection.expiresAt && connection.expiresAt < new Date()) {
    // Refresh token logic
  }

  // Create OAuth client with stored tokens
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.NEXTAUTH_URL + '/api/google/callback'
  );

  oauth2Client.setCredentials({
    access_token: connection.accessToken,
    refresh_token: connection.refreshToken,
  });

  return oauth2Client;
}
```

### Step 5: Add Export/Import Buttons

In character sheet UI:

```typescript
// Export button
<button onClick={handleExportToSheets}>
  Export to Google Sheets
</button>

// Import button (if sheet exists)
<button onClick={handleImportFromSheets}>
  Sync from Google Sheets
</button>

// Handle not connected
if (!googleConnection) {
  alert("Please connect your Google account in Settings first");
  router.push('/settings');
}
```

---

## OAuth Scopes Required

**Minimal permissions for character sheet export/import:**

```javascript
const REQUIRED_SCOPES = [
  'https://www.googleapis.com/auth/drive.file' // Only files created by this app
];
```

**DO NOT request:**
- ❌ `gmail.send` - Not needed (using manual invite links)
- ❌ `drive` - Too broad (we only need specific files)
- ❌ `spreadsheets` - Included in `drive.file`

---

## Environment Variables

Already configured in `.env.local`:

```bash
# Google OAuth (for Sheets API only)
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret

# Callback URL
NEXTAUTH_URL=http://localhost:3000
```

**Google Cloud Console Setup:**
1. Go to Google Cloud Console
2. Enable Google Drive API
3. Enable Google Sheets API
4. OAuth consent screen: Add scopes for `drive.file`
5. Add redirect URI: `http://localhost:3000/api/google/callback`

---

## Migration Database Command

After adding GoogleConnection model:

```bash
npx prisma migrate dev --name add_google_connection
pnpm prisma generate
```

---

## Testing Checklist

When implementing Google Sheets:

- [ ] Google OAuth consent flow works
- [ ] Tokens stored correctly in database
- [ ] Token refresh works when expired
- [ ] Settings page shows connection status
- [ ] Disconnect button works and revokes tokens
- [ ] Export character sheet creates Google Sheet
- [ ] Import syncs data from Google Sheet back to database
- [ ] Error handling when user not connected
- [ ] Multiple users can each have separate Google connections

---

## Key Architectural Decisions

### ✅ Database is Primary Source of Truth
- All character data lives in database
- Google Sheets is optional backup/export
- Users can use app 100% without Google integration

### ✅ Per-User Google Connections
- Each user connects their own Google account
- Tokens stored per-user in database
- GM's sheets ≠ Player's sheets

### ✅ Manual Export/Import Only
- No automatic sync (prevents conflicts)
- User explicitly chooses when to export/import
- Clear ownership and control

### ✅ Minimal Permissions
- Only request `drive.file` scope
- Users feel safe about data access
- No Google verification process needed

---

## Summary

**Status:** Google Sheets integration is temporarily disabled but fully preservable for future use.

**Next Steps:**
1. Implement `GoogleConnection` database model
2. Create `/api/google/*` OAuth endpoints
3. Add Google connection UI to Settings
4. Update `src/services/google.ts` to use new token storage
5. Add Export/Import buttons to character sheets

**Timeline:** Implement when character sheet export/import features are prioritized.

---

**Related Documentation:**
- `AUTHENTICATION_SYSTEM.md` - Custom auth implementation details
- `prisma/schema.prisma` - Database models
- `src/services/google.ts` - Google API service code
