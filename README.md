# GROWTH Prototype

> Campaign management web application for GROWTH tabletop RPG with integrated character system, world building, and KRMA tokenomics.

## 🚀 Quick Start

```bash
# Install dependencies
pnpm install

# Start development server (with automatic port cleanup)
pnpm dev:clean
```

Then open http://localhost:3000

## ✨ Features

### Campaign Management
- Create and manage multiple campaigns
- Set genre, themes, and descriptions
- Track sessions and campaign progress
- Organize players and characters

### Character System
- Full character lifecycle from backstory to stats
- Backstory submission and GM review workflow
- GROWTH attribute system (9 core attributes)
- Character KRMA allocation and tracking

### World Building
- Create interconnected worlds and planes
- Define regions, factions, and NPCs
- KRMA investment for world lushness
- World assets with crystallized KRMA

### KRMA Tokenomics
- Personal wallets for all users
- Transaction history and balance tracking
- Crystallization of liquid KRMA into assets
- Reserve pools (Terminal, Mercy, Balance, Severity)

### User Roles
- **ADMIN** - System administrator (restricted)
- **WATCHER** - Game Master with campaign and world management
- **TRAILBLAZER** - Player with character creation and backstory tools
- **GODHEAD** - Reserved for future AI agent functionality

## 📁 Project Structure

```
src/
├── app/
│   ├── campaigns/           # Campaign listing and creation
│   ├── campaign/[id]/       # Individual campaign pages
│   │   ├── characters/      # Campaign character management
│   │   └── character/[id]/  # Character detail pages
│   ├── trailblazer/         # Player interface
│   │   ├── create-character/ # Character creation
│   │   └── backstory/[id]/  # Backstory submission
│   ├── admin/               # Admin dashboard
│   │   ├── users/           # User management
│   │   ├── krma/            # KRMA management
│   │   └── invite-codes/    # GM invite code management
│   ├── watchers/            # Watcher (GM) listing
│   ├── trailblazers/        # Trailblazer (player) listing
│   └── api/                 # API routes
├── components/              # React components
│   ├── ui/                  # Reusable UI components
│   └── character/           # Character-specific components
├── lib/                     # Utilities and database
│   ├── db.ts                # Prisma client
│   ├── auth.ts              # Authentication utilities
│   └── krmaTokenomics.ts    # KRMA system logic
└── services/                # Business logic
    └── googleSheetsClient.ts # Google Sheets integration (optional)

prisma/
├── schema.prisma            # Database schema
├── migrations/              # Database migrations
└── seed.ts                  # Database seeding

apps/GROWTH_Vault/           # Decision logs and backlog
├── .growth/                 # Machine-readable logs
└── docs/                    # Human-readable clarifications

tests/                       # Playwright E2E tests
├── authentication.spec.ts
├── campaign-management.spec.ts
├── character-management.spec.ts
└── ...
```

## 🔧 Technical Stack

- **Frontend**: Next.js 15 + React 19 + TypeScript
- **Styling**: Tailwind CSS 4
- **Database**: SQLite + Prisma ORM
- **Authentication**: bcryptjs password hashing with session management
- **Testing**: Playwright for E2E tests
- **Icons**: Heroicons for UI icons

## 💻 Development Commands

```bash
# Start development server (RECOMMENDED - includes port cleanup)
pnpm dev:clean

# Start without cleanup (may fail if port 3000 is busy)
pnpm dev

# Clean up port 3000 only
pnpm cleanup

# Build for production
pnpm build

# Start production server
pnpm start

# Lint code
pnpm lint

# Run E2E tests
pnpm test

# Run tests with UI
pnpm test:ui

# View test report
pnpm test:report
```

## 🗄️ Database Management

```bash
# Generate Prisma client (run after schema changes)
npx prisma generate

# Create migration for schema changes
npx prisma migrate dev --name description_of_change

# Reset database (WARNING: deletes all data)
npx prisma migrate reset

# Open database GUI
npx prisma studio

# Seed database with test data
pnpm seed
```

## 🎮 User Workflow

### Game Master (Watcher) Workflow
1. Register account (automatically becomes Watcher)
2. Receive 10,000 KRMA from reserve pools
3. Create campaign with genre and themes
4. Build worlds and invest KRMA for lushness
5. Create regions, factions, NPCs
6. Invite players (up to 5 per campaign)
7. Review player backstories
8. Convert backstories to mechanical stats
9. Run game sessions

### Player (Trailblazer) Workflow
1. Receive invitation from Watcher
2. Register account (becomes Trailblazer)
3. Create character with backstory
4. Submit backstory for GM review
5. Revise based on GM feedback
6. Receive approved character with stats
7. Play in campaign

## 🔐 Authentication

Authentication is handled with bcryptjs and session-based auth:
- Passwords are hashed using bcrypt
- Sessions stored in SQLite database
- Session tokens verified on protected routes
- Middleware enforces authentication on protected pages

No external OAuth providers required for basic functionality.

## 📊 Database Schema Highlights

### Core Models
- **User** - All users with role (ADMIN, WATCHER, TRAILBLAZER, GODHEAD)
- **Campaign** - Campaigns with GM, worlds, characters, sessions
- **Character** - Characters with JSON data, KRMA allocation
- **CharacterBackstory** - Backstory submission and review workflow
- **World** - Worlds with KRMA investment and lushness factor
- **Wallet** - KRMA wallets for users and entities
- **KrmaTransaction** - Complete transaction history

### Key Relationships
- Campaign → User (GM)
- Campaign → Character (many)
- Campaign → World (many)
- Character → CharacterBackstory
- User → Campaign (GMs can have multiple campaigns)
- User → Wallet (personal KRMA wallet)

## 🧪 Testing

Comprehensive E2E test suite with Playwright covering:
- Authentication and registration
- Campaign CRUD operations
- Character creation and management
- Backstory submission workflow
- API endpoint validation
- Database integrity
- UI component behavior
- Performance monitoring

Run tests with `pnpm test` or `pnpm test:ui` for interactive mode.

## 🚨 Troubleshooting

### Port 3000 Already in Use
Always use `pnpm dev:clean` which automatically handles port cleanup.

### Database Not Found
```bash
npx prisma migrate dev  # Apply migrations
npx prisma generate     # Regenerate client
```

### Session Issues
Sessions are stored in database. If login fails:
```bash
npx prisma studio  # Check Session table
# Delete stale sessions if needed
```

### KRMA Balance Issues
Check reserve wallet balances in admin dashboard at `/admin/krma`

## 📝 Development Notes

### Port 3000 Requirement
The app MUST run on port 3000 as authentication is configured for this port. Always use `pnpm dev:clean` to ensure port availability.

### KRMA Reserve Pools
Four reserve pools exist:
- **Terminal**: 50,000,000 KRMA
- **Mercy**: 20,000,000 KRMA
- **Balance**: 20,000,000 KRMA
- **Severity**: 10,000,000 KRMA

New GMs receive 10,000 KRMA from these pools automatically.

### Character Attributes
GROWTH uses 9 core attributes tracked in character JSON:
- Strength, Dexterity, Constitution
- Intelligence, Wisdom, Charisma
- Perception, Willpower, Luck

## 🔗 Related Documentation

- **[SETUP_GUIDE.md](./SETUP_GUIDE.md)** - Detailed setup instructions
- **[DEV_GUIDE.md](./DEV_GUIDE.md)** - Development workflow guide
- **[../CLAUDE.md](../CLAUDE.md)** - AI assistant session history

## 🛣️ Roadmap

Current features:
- ✅ User authentication and roles
- ✅ Campaign CRUD operations
- ✅ Character creation with backstories
- ✅ World building with KRMA investment
- ✅ GM review workflow for backstories
- ✅ KRMA wallet and transaction system

Upcoming features:
- [ ] Real-time session play tools
- [ ] Combat encounter management
- [ ] Dice rolling integration
- [ ] NPC conversation tools
- [ ] Mobile responsive design
- [ ] Advanced KRMA distribution mechanics

---

**Happy Gaming!** 🎲
