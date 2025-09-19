# GROWTH Prototype Setup Guide
*Complete step-by-step instructions for non-technical users*

## 📋 What You're Setting Up

The GROWTH Prototype is a local web application that connects to your Google Sheets character data and provides:
- Character management and viewing
- Campaign organization
- Dice rolling and session tracking
- Smart parsing of your existing GROWTH sheets
- GM dashboard for running games

## 🎯 Before You Start

**What you'll need:**
- A computer with Windows (this guide is for Windows)
- A Google account with access to your GROWTH character sheets
- About 30-45 minutes
- The GROWTH Prototype files (already created)

**What this guide will help you do:**
1. Set up Google account permissions
2. Configure the application settings
3. Start using the GROWTH Prototype

---

## Step 1: Set Up Google Developer Account & Permissions

### 1.1 Create a Google Cloud Project

1. **Open your web browser** and go to: https://console.cloud.google.com/
2. **Sign in** with your Google account (the same one you use for your GROWTH sheets)
3. **Click "Select a project"** at the top of the page
4. **Click "NEW PROJECT"** button
5. **Name your project** something like "GROWTH Prototype" or "My GROWTH App"
6. **Click "CREATE"**
7. **Wait** for the project to be created (this takes about 30 seconds)

### 1.2 Enable Required APIs

1. **Make sure your new project is selected** (check the project name at the top)
2. **Click the hamburger menu** (☰) in the top-left corner
3. **Go to "APIs & Services" > "Library"**
4. **Search for "Google Drive API"** and click on it
5. **Click "ENABLE"** button
6. **Go back** to the API Library (use your browser's back button)
7. **Search for "Google Sheets API"** and click on it  
8. **Click "ENABLE"** button

### 1.3 Create OAuth2 Credentials

1. **Click the hamburger menu** (☰) and go to **"APIs & Services" > "Credentials"**
2. **Click "CREATE CREDENTIALS"** at the top
3. **Select "OAuth client ID"**
4. If you see a message about configuring OAuth consent:
   - **Click "CONFIGURE CONSENT SCREEN"**
   - **Choose "External"** and click **"CREATE"**
   - **Fill in required fields:**
     - App name: `GROWTH Prototype`
     - User support email: `your email address`
     - Developer contact: `your email address`
   - **Click "SAVE AND CONTINUE"** through all steps
   - **Go back to Credentials page**
5. **Click "CREATE CREDENTIALS" > "OAuth client ID"** again
6. **Choose "Desktop application"**
7. **Name it** "GROWTH Desktop Client"
8. **Click "CREATE"**

### 1.4 Download Your Credentials

1. **A popup will appear** with your Client ID and Client Secret
2. **IMPORTANT: Copy these values** - you'll need them in Step 2
   - **Client ID**: looks like `123456789-abcdef.apps.googleusercontent.com`
   - **Client Secret**: looks like `GOCSPX-abcd1234efgh5678`
3. **Click "OK"** to close the popup
4. **Optional:** Click the download button (📥) to save a backup copy

---

## Step 2: Configure the GROWTH Prototype

### 2.1 Open the Configuration File

1. **Open File Explorer** (Windows key + E)
2. **Navigate to:** `C:\Users\[YourName]\Desktop\GROWTH\GROWTH Prototype\growth-prototype`
3. **Find the file** named `.env`
4. **Right-click** on `.env` and select **"Open with" > "Notepad"**

### 2.2 Update the Configuration

You'll see a file that looks like this:
```
# Database
DATABASE_URL="file:./dev.db"

# Google OAuth (fill in your values)
GOOGLE_CLIENT_ID=__FILL_ME__
GOOGLE_CLIENT_SECRET=__FILL_ME__

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=__make_something_random__

# Session
SESSION_SECRET=__make_something_random__

# GROWTH Repository Path
GROWTH_REPO_PATH=C:\Users\Mikek\Desktop\GROWTH\GROWTH_Repository

# Obsidian Vault Path  
OBSIDIAN_VAULT_PATH=./apps/GROWTH_Vault
```

**Make these changes:**

1. **Replace** `__FILL_ME__` next to `GOOGLE_CLIENT_ID=` with your Client ID from Step 1.4
   ```
   GOOGLE_CLIENT_ID=123456789-abcdef.apps.googleusercontent.com
   ```

2. **Replace** `__FILL_ME__` next to `GOOGLE_CLIENT_SECRET=` with your Client Secret from Step 1.4
   ```
   GOOGLE_CLIENT_SECRET=GOCSPX-abcd1234efgh5678
   ```

3. **Replace** both `__make_something_random__` entries with random passwords you create:
   ```
   NEXTAUTH_SECRET=MyRandomPassword123!
   SESSION_SECRET=AnotherRandomPassword456@
   ```
   *Note: These can be any passwords you want - they're just for security*

4. **Update the GROWTH_REPO_PATH** if needed. Change `Mikek` to your Windows username:
   ```
   GROWTH_REPO_PATH=C:\Users\[YourUsername]\Desktop\GROWTH\GROWTH_Repository
   ```

5. **Save the file** (Ctrl+S) and close Notepad

### 2.3 Example of Completed Configuration

Your `.env` file should look something like this:
```
# Database
DATABASE_URL="file:./dev.db"

# Google OAuth (fill in your values)
GOOGLE_CLIENT_ID=123456789-abcdefghijklmnop.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abcd1234efgh5678ijklmnop

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=MyRandomPassword123!

# Session
SESSION_SECRET=AnotherRandomPassword456@

# GROWTH Repository Path
GROWTH_REPO_PATH=C:\Users\YourUsername\Desktop\GROWTH\GROWTH_Repository

# Obsidian Vault Path  
OBSIDIAN_VAULT_PATH=./apps/GROWTH_Vault
```

---

## Step 3: Start the GROWTH Prototype

### 3.1 Open Command Prompt

1. **Press** Windows key + R
2. **Type** `cmd` and press Enter
3. **A black window will open** (this is the Command Prompt)

### 3.2 Navigate to the Project

In the black Command Prompt window, **type exactly** (replace `YourUsername` with your Windows username):
```
cd "C:\Users\YourUsername\Desktop\GROWTH\GROWTH Prototype\growth-prototype"
```
**Press Enter**

### 3.3 Start the Application

**Type exactly:**
```
pnpm dev
```
**Press Enter**

You should see something like:
```
✓ Ready in 2.8s
- Local:        http://localhost:3000
- Network:      http://192.168.1.10:3000
```

### 3.4 Open the Application

1. **Open your web browser** (Chrome, Firefox, Edge, etc.)
2. **Go to:** http://localhost:3000
3. **You should see** the GROWTH Prototype welcome screen!

---

## Step 4: First-Time Setup & Testing

### 4.1 Sign In to the Application

1. **Click "Sign in with Google"** on the welcome screen
2. **Choose your Google account** (the same one from Step 1)
3. **You may see a warning** about "Google hasn't verified this app"
   - **Click "Advanced"**
   - **Click "Go to GROWTH Prototype (unsafe)"**
   - *This is safe - it's your own app!*
4. **Review the permissions** and click **"Continue"**
5. **You should be redirected** to the Campaigns page

### 4.2 Create Your First Campaign

1. **Click "New Campaign"**
2. **Enter a name** like "Test Campaign" or your actual campaign name
3. **Click "Create"**
4. **You'll be taken** to your campaign dashboard

### 4.3 Add Your First Character Sheet

1. **In your campaign dashboard**, click **"Characters"**
2. **Click "Add Character Sheet"**
3. **Go to your Google Drive** in another browser tab/window
4. **Find your GROWTH character sheet**
5. **Copy the URL** from your browser's address bar (it should look like: `https://docs.google.com/spreadsheets/d/1ABC123...`)
6. **Go back to the GROWTH Prototype**
7. **Paste the URL** in the text box
8. **Click "Add Sheet"**

### 4.4 Test the Parsing

1. **The app will try to parse your sheet**
2. **If it finds unknown fields**, you'll see them in the Decision Queue
3. **You can approve or modify** the suggestions
4. **Your decisions will be saved** for future use

---

## 🚨 Troubleshooting

### Problem: "Command not found" when typing `pnpm dev`

**Solution:** You need to install pnpm first
1. **In Command Prompt, type:** `npm install -g pnpm`
2. **Press Enter** and wait for it to install
3. **Try `pnpm dev` again**

### Problem: Browser shows "This site can't be reached"

**Solutions:**
1. **Make sure the Command Prompt** is still running (you should see it running in the background)
2. **Check the URL** - it should be exactly `http://localhost:3000`
3. **Try** `http://127.0.0.1:3000` instead

### Problem: Google OAuth errors

**Solutions:**
1. **Double-check your `.env` file** - make sure there are no extra spaces
2. **Make sure your Google Cloud project** has both APIs enabled (Drive + Sheets)
3. **Try creating new OAuth credentials** and updating your `.env` file

### Problem: "Can't access your sheets"

**Solutions:**
1. **Make sure your sheets are shared** with your Google account
2. **Try copying the sheet ID** instead of the full URL (the part between `/d/` and `/edit`)
3. **Check that your Google account** has permission to view the sheets

---

## 📞 Getting Help

If you run into problems:

1. **Check the Command Prompt window** for error messages
2. **Make sure all steps were followed exactly**
3. **Try refreshing your browser** at http://localhost:3000
4. **Restart the application** by pressing Ctrl+C in Command Prompt, then typing `pnpm dev` again

---

## 🎉 You're Ready to Play!

Once everything is set up, you can:

- ✅ **Manage multiple campaigns**
- ✅ **Import character sheets from Google Sheets**
- ✅ **View parsed character data**
- ✅ **Handle unknown fields through the Decision Queue**
- ✅ **Track game sessions**
- ✅ **Use the GM dashboard**

**Keep the Command Prompt window open** while using the app - closing it will stop the GROWTH Prototype!

---

## 🔧 Advanced Users

If you're comfortable with technical details:

- The app runs on **Next.js with TypeScript**
- Database is **SQLite with Prisma**
- All data is stored **locally on your computer**
- Logs are kept in `apps/GROWTH_Vault/.growth/`
- Decision history is in `apps/GROWTH_Vault/docs/clarifications.md`

Enjoy your GROWTH sessions! 🎲