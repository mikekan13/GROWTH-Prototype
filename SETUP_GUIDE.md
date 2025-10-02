# GROWTH Prototype Setup Guide

Complete step-by-step instructions for setting up the GROWTH Prototype application.

## 📋 What You're Setting Up

GROWTH Prototype is a campaign management web application for the GROWTH tabletop RPG system that runs entirely on your local machine. It provides:

- Campaign creation and management
- Character system with backstories
- World building with KRMA investment
- Player invitation and management
- GM tools and dashboards
- KRMA tokenomics system

## 🎯 Prerequisites

### Required Software
- **Node.js 20 or higher** - [Download here](https://nodejs.org/)
- **pnpm** - Fast package manager (installed via npm)
- **Git** (optional) - For version control

### System Requirements
- **OS**: Windows, macOS, or Linux
- **RAM**: 4GB minimum
- **Disk**: 500MB free space

## 🚀 Installation Steps

### Step 1: Install Node.js

1. Go to https://nodejs.org/
2. Download the LTS (Long Term Support) version
3. Run the installer and follow the prompts
4. Verify installation by opening a terminal/command prompt and running:
   ```bash
   node --version
   ```
   You should see something like `v20.x.x`

### Step 2: Install pnpm

pnpm is a faster alternative to npm. Install it globally:

```bash
npm install -g pnpm
```

Verify installation:
```bash
pnpm --version
```

### Step 3: Navigate to the Project

Open a terminal/command prompt and navigate to the growth-prototype folder:

**Windows:**
```bash
cd "C:\Users\YourUsername\Desktop\GROWTH\GROWTH Prototype\growth-prototype"
```

**Mac/Linux:**
```bash
cd ~/Desktop/GROWTH/GROWTH\ Prototype/growth-prototype
```

### Step 4: Install Dependencies

```bash
pnpm install
```

This will download and install all required packages. It may take 2-5 minutes.

### Step 5: Set Up the Database

The app uses SQLite, which requires no separate installation. Initialize the database:

```bash
npx prisma generate
npx prisma migrate dev
```

This creates the database file at `prisma/dev.db`.

### Step 6: (Optional) Seed Test Data

To populate the database with test data:

```bash
pnpm seed
```

This creates:
- Test admin user
- Sample campaigns
- Example characters
- Reserve KRMA wallets

### Step 7: Start the Application

```bash
pnpm dev:clean
```

You should see output like:
```
✓ Ready in 2.8s
- Local: http://localhost:3000
```

**Important**: Keep this terminal window open while using the app!

### Step 8: Access the Application

1. Open your web browser
2. Go to: http://localhost:3000
3. You should see the GROWTH Prototype welcome page

## 👤 Creating Your First Account

### Register as a Game Master

1. Click **"Register"** on the welcome page
2. Fill in the registration form:
   - **Username**: Choose a unique username
   - **Email**: Your email address
   - **Password**: Choose a secure password
   - **Display Name**: Your preferred name
3. Click **"Register"**
4. You'll be automatically logged in and redirected to the campaigns page

**Note**: New users are automatically assigned the WATCHER (Game Master) role and receive 10,000 KRMA from reserve pools.

## 🎮 Using the Application

### Creating Your First Campaign

1. On the **Campaigns** page, click **"New Campaign"**
2. Fill in campaign details:
   - **Name**: Campaign name
   - **Genre**: Fantasy, Sci-Fi, Horror, etc.
   - **Themes**: Optional campaign themes (comma-separated)
   - **Description**: Campaign description
3. Click **"Create Campaign"**

### Building Worlds

1. Navigate to your campaign page
2. Click **"Worlds"** tab
3. Click **"Create World"**
4. Enter world details:
   - **Name**: World/plane name
   - **Description**: World description
   - **KRMA Investment**: Liquid KRMA to invest (affects lushness)
5. Click **"Create World"**

### Inviting Players

1. On your campaign page, click **"Players"** tab
2. Click **"Invite Player"**
3. Enter player's email address
4. Share the generated invite link with your player
5. Player registers using the invite link

### Managing Characters

As a GM, you can:
- View all characters in your campaigns
- Review submitted backstories
- Approve or request revisions
- Convert backstories to mechanical stats
- Allocate KRMA to characters

## 🔐 Admin Access (Optional)

If you need admin access (restricted to system administrator):

1. Manually update the database to set role to ADMIN
2. Access admin dashboard at http://localhost:3000/admin
3. View users, manage KRMA, and create GM invite codes

**Note**: Only mikekan13@gmail.com should have ADMIN role in production.

## 🚨 Troubleshooting

### Port 3000 Already in Use

If you see an error about port 3000 being busy, the `dev:clean` command should handle it automatically. If not:

```bash
# Just cleanup
pnpm cleanup

# Then start again
pnpm dev
```

### Database Errors

If you see database-related errors:

```bash
# Regenerate Prisma client
npx prisma generate

# Reset database (WARNING: deletes all data)
npx prisma migrate reset

# Apply migrations
npx prisma migrate dev
```

### "Module not found" Errors

If you see missing module errors:

```bash
# Clean install
rm -rf node_modules
pnpm install
npx prisma generate
```

### Application Won't Start

1. Make sure Node.js 20+ is installed: `node --version`
2. Make sure pnpm is installed: `pnpm --version`
3. Try deleting `node_modules` and reinstalling:
   ```bash
   rm -rf node_modules
   pnpm install
   ```

### Can't Register or Login

1. Check that the database exists: `ls prisma/dev.db`
2. If not, run: `npx prisma migrate dev`
3. Clear browser cache and try again
4. Check terminal for error messages

## 💡 Tips for Development

### Viewing the Database

Use Prisma Studio to view and edit database records:

```bash
npx prisma studio
```

This opens a web interface at http://localhost:5555

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests with UI
pnpm test:ui

# View test report
pnpm test:report
```

### Stopping the Server

Press `Ctrl+C` in the terminal where the server is running.

### Restarting After Changes

Most code changes auto-reload. For database schema changes:

```bash
# Stop server (Ctrl+C)
npx prisma generate
npx prisma migrate dev
pnpm dev:clean
```

## 📁 Important Files

### Configuration
- `prisma/schema.prisma` - Database schema
- `package.json` - Dependencies and scripts
- `.env` - Environment variables (auto-generated)

### Database
- `prisma/dev.db` - SQLite database file
- `prisma/migrations/` - Database migration history

### Source Code
- `src/app/` - Next.js pages and routes
- `src/components/` - React components
- `src/lib/` - Utilities and database client

## 🔄 Updating the Application

When new features are added:

```bash
# Pull latest changes (if using git)
git pull

# Install new dependencies
pnpm install

# Apply database migrations
npx prisma migrate dev

# Regenerate Prisma client
npx prisma generate

# Restart server
pnpm dev:clean
```

## 🆘 Getting Help

If you encounter issues:

1. Check the terminal output for error messages
2. Look for errors in browser console (F12 → Console tab)
3. Review troubleshooting section above
4. Check [DEV_GUIDE.md](./DEV_GUIDE.md) for development tips

## 🎉 You're Ready!

Once setup is complete, you can:

- ✅ Create and manage campaigns
- ✅ Build worlds with KRMA investment
- ✅ Invite players to your campaigns
- ✅ Review character backstories
- ✅ Track sessions and campaign progress
- ✅ Manage KRMA wallets and transactions

**Enjoy running your GROWTH campaigns!** 🎲

---

## Advanced Topics

### Using MCP Servers (Optional)

The project includes optional MCP (Model Context Protocol) servers for AI assistance. See the main README for setup instructions.

### Custom Port Configuration

If you need to run on a different port:

1. Edit `package.json` scripts
2. Update any hardcoded port references
3. Note: Authentication is configured for port 3000 by default

### Production Deployment

For production use:

```bash
pnpm build
pnpm start
```

This runs an optimized production build.
