---
description: Launch the GRO.WTH dev stack (whisper-server + Next.js dev) with logs outside app/, then smoke-check both services.
---

Boot the GRO.WTH development stack for the user.

Run the unified launcher from the project root:

```
powershell -ExecutionPolicy Bypass -File .\boot.ps1
```

The launcher (`boot.ps1`):
- Starts the local **Whisper STT server** on port 9000 (skip with `-NoWhisper`).
- Starts the **Next.js dev server** on port 3000.
- Writes all logs to `logs/` at the project root — **outside** the webpack-watched
  `app/` directory, which is what prevents the Fast-Refresh page-reload bug from
  2026-06-20. Never redirect dev logs into `app/`.
- Is idempotent: if a port is already listening, that service is left running.
- Use `-Restart` to kill existing node/python first.

After it runs, report the smoke-check result to the user: dev `:3000` up/down,
whisper `:9000` up/down, and the `/health` response. If either is DOWN, read the
relevant log under `logs/` (`dev-server.err.log` or `whisper.err.log`) and surface the
error — do not just say "it failed."

$ARGUMENTS may contain extra flags (e.g. `-NoWhisper` or `-Restart`) — pass them through
to `boot.ps1`.
