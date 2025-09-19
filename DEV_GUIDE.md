# GROWTH Development Guide

## Quick Start Commands

**To start development (recommended):**
```bash
pnpm dev:clean
```
This automatically cleans up port 3000 and starts the server.

**Alternative commands:**
```bash
pnpm cleanup    # Just clean up port 3000
pnpm dev        # Start server (may fail if port occupied)
pnpm reset      # Cleanup + start (alternative to dev:clean)
```

## Port 3000 Management

The application **MUST** run on port 3000 for authentication to work properly.

### If You Get Port Issues:

1. **Use the cleanup script:**
   ```bash
   pnpm cleanup
   ```

2. **Or use the all-in-one command:**
   ```bash
   pnpm dev:clean
   ```

### Manual Port Cleanup (if scripts fail):

**Windows:**
```cmd
# Find processes using port 3000
netstat -ano | findstr :3000

# Kill specific process (replace XXXX with PID)
taskkill /F /PID XXXX
```

**Manual batch script:**
```cmd
scripts\cleanup-port.bat
```

## Environment Setup

**Required environment variables in `.env`:**
```
NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
DATABASE_URL="file:./dev.db"
```

## Troubleshooting

### Server won't start on port 3000:
1. Run `pnpm cleanup`
2. Wait 5 seconds
3. Run `pnpm dev`

### Authentication not working:
1. Verify `NEXTAUTH_URL=http://localhost:3000` in `.env`
2. Restart server with `pnpm dev:clean`

### Database issues:
```bash
pnpm prisma generate
pnpm prisma migrate dev
```

## Development Workflow

1. **Start development:** `pnpm dev:clean`
2. **Make changes to code**
3. **Server auto-reloads**
4. **Stop server:** Ctrl+C
5. **Restart if needed:** `pnpm dev:clean`

## Never Do This:
- Don't manually change ports in package.json
- Don't modify NEXTAUTH_URL unless you know what you're doing
- Don't run multiple dev servers simultaneously