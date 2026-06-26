# guard-app-logs.ps1 — PreToolUse guard for Bash
# Blocks writing/redirecting *.log files into the webpack-watched app/ directory.
# Root cause of the 2026-06-20 "page reloads to loading screen in silence" bug:
# a log file under app/ triggers Fast Refresh on every write. Logs belong in the
# project-root logs/ dir (see boot.ps1). Exit 2 = block + show stderr to Claude.

$ErrorActionPreference = 'SilentlyContinue'
$raw = [Console]::In.ReadToEnd()
if (-not $raw) { exit 0 }
try { $j = $raw | ConvertFrom-Json } catch { exit 0 }

$cmd = ''
if ($j.tool_input -and $j.tool_input.command) { $cmd = [string]$j.tool_input.command }
if (-not $cmd) { exit 0 }

# Only block when a redirect/write TARGET is a log under app/ (reads like `ls app/tmp`
# and unrelated `2>/dev/null` are fine — the target token after `>` must itself be the
# app path). Covers `> app/x.log`, `>> app/tmp/...`, tee/Out-File/Set-Content/Add-Content.
$target = '"?[^"\s|&;>]*app[\\/](?:tmp[\\/]|[^"\s|&;>]*\.log)'
$redirect    = $cmd -match ('(?i)\d*>>?\s*' + $target)
$writeCmdlet = $cmd -match ('(?i)(\btee\b|Out-File|Set-Content|Add-Content|RedirectStandard\w+)\s+\S*' + $target)
if ($redirect -or $writeCmdlet) {
    [Console]::Error.WriteLine(
        "[guard] Refusing to write logs inside app/. Webpack watches app/, so a log " +
        "write there triggers Fast Refresh and reloads the page mid-session (the " +
        "2026-06-20 bug). Write to the project-root logs/ dir instead, or use boot.ps1.")
    exit 2
}

exit 0
