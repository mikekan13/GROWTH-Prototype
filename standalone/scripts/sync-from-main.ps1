# Pull sync-managed paths FROM ../app INTO standalone.
# Run from standalone/ root: npm run sync:from-main

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

Write-Host "Syncing from $MAIN -> $SELF" -ForegroundColor Cyan

foreach ($p in $paths) {
  $src = Join-Path $MAIN $p
  $dst = Join-Path $SELF $p
  if (-not (Test-Path $src)) {
    Write-Host "  SKIP (missing in main): $p" -ForegroundColor Yellow
    continue
  }
  $dstParent = Split-Path $dst -Parent
  if (-not (Test-Path $dstParent)) { New-Item -ItemType Directory -Path $dstParent -Force | Out-Null }

  if ((Get-Item $src).PSIsContainer) {
    # Directory — mirror with robocopy
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

Write-Host "Done. Commit the standalone changes if desired." -ForegroundColor Cyan
