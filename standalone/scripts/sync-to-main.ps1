# Push sync-managed paths FROM standalone INTO ../app (main).
# Run from standalone/ root: npm run sync:to-main

$ErrorActionPreference = 'Stop'
$ROOT = Resolve-Path ..
$MAIN = Join-Path $ROOT 'app'
$SELF = $PSScriptRoot | Split-Path -Parent   # = standalone/

if (-not (Test-Path $MAIN)) {
  Write-Error "Main app not found at $MAIN"
  exit 1
}

$paths = @(
  'src\components\character',
  'src\components\tapestry\EntitiesPanel.tsx',
  'src\ai',
  'src\services\character.ts',
  'src\services\entity.ts',
  'src\services\campaign.ts',
  'src\lib',
  'src\types',
  'src\app\api\characters',
  'src\app\api\portraits',
  'src\app\api\references',
  'src\app\api\auth',
  'src\app\api\profile',
  'src\app\api\campaigns',
  'prisma\schema.prisma'
)

Write-Host "Syncing from $SELF -> $MAIN (main app)" -ForegroundColor Cyan
Write-Host "WARNING: this OVERWRITES the main app's sync-managed files." -ForegroundColor Yellow
Write-Host "Commit main app before running if you want a clean rollback point." -ForegroundColor Yellow
Write-Host ""

foreach ($p in $paths) {
  $src = Join-Path $SELF $p
  $dst = Join-Path $MAIN $p
  if (-not (Test-Path $src)) {
    Write-Host "  SKIP (missing in standalone): $p" -ForegroundColor Yellow
    continue
  }
  $dstParent = Split-Path $dst -Parent
  if (-not (Test-Path $dstParent)) { New-Item -ItemType Directory -Path $dstParent -Force | Out-Null }

  if ((Get-Item $src).PSIsContainer) {
    robocopy $src $dst /MIR /NJH /NJS /NDL /NC /NS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) {
      Write-Host "  FAIL: $p (robocopy exit $LASTEXITCODE)" -ForegroundColor Red
    } else {
      Write-Host "  OK dir: $p" -ForegroundColor Green
    }
  } else {
    Copy-Item -Path $src -Destination $dst -Force
    Write-Host "  OK file: $p" -ForegroundColor Green
  }
}

Write-Host "Done. Run 'npm run build' in main app to catch type errors from sync." -ForegroundColor Cyan
