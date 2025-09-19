# GROWTH Prototype

> A local GM web app for GROWTH tabletop RPG campaigns that connects to Google Sheets character data.

## 🚀 Quick Start

**New to this?** → Read the [**SETUP_GUIDE.md**](./SETUP_GUIDE.md) for complete step-by-step instructions.

**Already set up?** → Just run:
```bash
pnpm dev
```
Then open http://localhost:3000

## ✨ Features

- 🔗 **Google Sheets Integration** - Connect to your existing GROWTH character sheets
- 🎲 **Smart Parsing** - Automatically understands GROWTH attributes, vitals, nectars, and inventory
- 🤖 **Never Blocks Play** - Unknown fields go to a decision queue, gameplay continues
- 📊 **Campaign Management** - Organize multiple campaigns and characters
- 🎯 **GM Dashboard** - Session tracking and campaign overview
- 🔄 **Decision Caching** - User confirmations are saved and reused globally
- 📝 **Full Traceability** - Every parsed field tracks its spreadsheet source

## 🎯 What Makes This Special

### Rules Authority Gate
- **Sheet data is always the source of truth** during gameplay
- **No hallucinated rules** - the app only uses what's in your sheets
- **Conflicts get queued** for user decision, never assumed

### Smart Sheet Contract
1. **Known Named Ranges** (9 GROWTH attributes + vitals + nectars + inventory)
2. **`GROWTH__` prefixed ranges** for custom fields
3. **Heuristic mapping** with user confirmation
4. **Decision caching** across campaigns

## 📁 Project Structure

```
growth-prototype/
├── SETUP_GUIDE.md           # Complete setup instructions
├── src/
│   ├── app/                 # Next.js App Router pages
│   ├── components/          # React components
│   ├── lib/                 # Utilities & database
│   ├── services/            # Business logic & APIs
│   └── middleware.ts        # Authentication middleware
├── prisma/                  # Database schema & migrations
├── apps/GROWTH_Vault/       # Decision logs & backlog
│   ├── .growth/             # Machine-readable logs
│   └── docs/                # Human-readable clarifications
└── .env                     # Configuration (see SETUP_GUIDE.md)
```

## 🔧 Technical Stack

- **Frontend**: Next.js 15 + React 19 + TypeScript + Tailwind CSS
- **Backend**: Next.js API Routes + Prisma ORM
- **Database**: SQLite (local, portable)
- **Authentication**: NextAuth.js with Google OAuth2
- **APIs**: Google Drive API + Google Sheets API

## 📋 Requirements

- Node.js & pnpm
- Google account with Drive/Sheets access
- Windows (this setup guide)

## 🆘 Need Help?

1. **First time setup?** → [SETUP_GUIDE.md](./SETUP_GUIDE.md)
2. **App won't start?** → Check that pnpm is installed: `npm install -g pnpm`
3. **Can't connect to Google?** → Verify your `.env` configuration
4. **Sheets not parsing?** → Check sheet permissions and Decision Queue

## 🎮 Ready to Play!

The GROWTH Prototype is designed to be **table-ready** - it enhances your gameplay without getting in the way. Your Google Sheets remain the master data, while the app provides smart parsing, campaign management, and GM tools.

**Happy Gaming!** 🎲