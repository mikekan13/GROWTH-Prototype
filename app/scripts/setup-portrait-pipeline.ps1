# GRO.WTH Portrait Pipeline — Setup Script
# Run from PowerShell as Administrator
#
# This script installs ComfyUI and downloads the required models
# for local AI portrait generation.

param(
    [string]$InstallDir = "C:\AI\ComfyUI",
    [switch]$SkipModels,
    [switch]$StartAfterInstall
)

$ErrorActionPreference = "Stop"

Write-Host "=== GRO.WTH Portrait Pipeline Setup ===" -ForegroundColor Cyan
Write-Host ""

# ============================================================
# 1. Prerequisites Check
# ============================================================

Write-Host "[1/6] Checking prerequisites..." -ForegroundColor Yellow

# Python
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    Write-Host "  ERROR: Python not found. Install Python 3.10+ first." -ForegroundColor Red
    exit 1
}
$pythonVersion = python --version 2>&1
Write-Host "  Python: $pythonVersion" -ForegroundColor Green

# pip
$pip = Get-Command pip -ErrorAction SilentlyContinue
if (-not $pip) {
    Write-Host "  ERROR: pip not found." -ForegroundColor Red
    exit 1
}
Write-Host "  pip: OK" -ForegroundColor Green

# NVIDIA GPU
$nvidia = Get-Command nvidia-smi -ErrorAction SilentlyContinue
if ($nvidia) {
    Write-Host "  NVIDIA GPU: detected" -ForegroundColor Green
} else {
    Write-Host "  WARNING: nvidia-smi not found. GPU generation may not work." -ForegroundColor Yellow
}

# Git
$git = Get-Command git -ErrorAction SilentlyContinue
if (-not $git) {
    Write-Host "  ERROR: git not found." -ForegroundColor Red
    exit 1
}
Write-Host "  git: OK" -ForegroundColor Green

# huggingface-cli
$hf = Get-Command huggingface-cli -ErrorAction SilentlyContinue
if (-not $hf) {
    Write-Host "  Installing huggingface_hub CLI..." -ForegroundColor Yellow
    pip install huggingface_hub[cli]
}
Write-Host "  huggingface-cli: OK" -ForegroundColor Green

Write-Host ""

# ============================================================
# 2. Install ComfyUI
# ============================================================

Write-Host "[2/6] Installing ComfyUI to $InstallDir..." -ForegroundColor Yellow

if (Test-Path "$InstallDir\main.py") {
    Write-Host "  ComfyUI already installed. Pulling latest..." -ForegroundColor Green
    Push-Location $InstallDir
    git pull
    Pop-Location
} else {
    git clone https://github.com/comfyanonymous/ComfyUI.git $InstallDir
}

Push-Location $InstallDir
pip install -r requirements.txt
Pop-Location

Write-Host "  ComfyUI installed." -ForegroundColor Green
Write-Host ""

# ============================================================
# 3. Install Custom Nodes
# ============================================================

Write-Host "[3/6] Installing custom nodes..." -ForegroundColor Yellow

$customNodes = "$InstallDir\custom_nodes"

# ComfyUI-GGUF (for quantized FLUX models)
if (-not (Test-Path "$customNodes\ComfyUI-GGUF")) {
    git clone https://github.com/city96/ComfyUI-GGUF.git "$customNodes\ComfyUI-GGUF"
} else {
    Push-Location "$customNodes\ComfyUI-GGUF"; git pull; Pop-Location
}
Write-Host "  ComfyUI-GGUF: OK" -ForegroundColor Green

# ComfyUI-PuLID-Flux (identity preservation)
if (-not (Test-Path "$customNodes\ComfyUI-PuLID-Flux")) {
    git clone https://github.com/balazik/ComfyUI-PuLID-Flux.git "$customNodes\ComfyUI-PuLID-Flux"
    pip install -r "$customNodes\ComfyUI-PuLID-Flux\requirements.txt"
} else {
    Push-Location "$customNodes\ComfyUI-PuLID-Flux"; git pull; Pop-Location
}
Write-Host "  ComfyUI-PuLID-Flux: OK" -ForegroundColor Green

Write-Host ""

# ============================================================
# 4. Download Models
# ============================================================

if (-not $SkipModels) {
    Write-Host "[4/6] Downloading models (this may take a while)..." -ForegroundColor Yellow

    $modelsDir = "$InstallDir\models"

    # FLUX.1 Dev Q4_0 GGUF (~6.8 GB)
    Write-Host "  Downloading FLUX.1 Dev Q4_0 GGUF..." -ForegroundColor Yellow
    huggingface-cli download city96/FLUX.1-dev-gguf flux1-dev-Q4_0.gguf --local-dir "$modelsDir\unet"

    # T5-XXL GGUF (quantized text encoder)
    Write-Host "  Downloading T5-XXL encoder (quantized)..." -ForegroundColor Yellow
    huggingface-cli download city96/t5-v1_1-xxl-encoder-gguf t5-v1_1-xxl-encoder-Q4_K_M.gguf --local-dir "$modelsDir\clip"

    # CLIP-L
    Write-Host "  Downloading CLIP-L..." -ForegroundColor Yellow
    huggingface-cli download comfyanonymous/flux_text_encoders clip_l.safetensors --local-dir "$modelsDir\clip"

    # VAE
    Write-Host "  Downloading FLUX VAE..." -ForegroundColor Yellow
    huggingface-cli download black-forest-labs/FLUX.1-dev ae.safetensors --local-dir "$modelsDir\vae"

    # PuLID model
    Write-Host "  Downloading PuLID model..." -ForegroundColor Yellow
    if (-not (Test-Path "$modelsDir\pulid")) { New-Item -ItemType Directory -Path "$modelsDir\pulid" -Force }
    huggingface-cli download guozinan/PuLID pulid_flux_v0.9.1.safetensors --local-dir "$modelsDir\pulid"

    Write-Host "  All models downloaded." -ForegroundColor Green
} else {
    Write-Host "[4/6] Skipping model downloads (--SkipModels)" -ForegroundColor Yellow
}

Write-Host ""

# ============================================================
# 5. Environment Setup
# ============================================================

Write-Host "[5/6] Setting up environment..." -ForegroundColor Yellow

# Create portraits output directory
$portraitsDir = "C:\Projects\GRO.WTH\app\public\portraits"
if (-not (Test-Path $portraitsDir)) {
    New-Item -ItemType Directory -Path $portraitsDir -Force | Out-Null
}
Write-Host "  Portrait output dir: $portraitsDir" -ForegroundColor Green

# Add COMFYUI_URL to .env if not present
$envFile = "C:\Projects\GRO.WTH\app\.env"
if (Test-Path $envFile) {
    $envContent = Get-Content $envFile -Raw
    if ($envContent -notmatch "COMFYUI_URL") {
        Add-Content $envFile "`nCOMFYUI_URL=http://127.0.0.1:8188"
        Write-Host "  Added COMFYUI_URL to .env" -ForegroundColor Green
    } else {
        Write-Host "  COMFYUI_URL already in .env" -ForegroundColor Green
    }
} else {
    Write-Host "  WARNING: .env file not found at $envFile" -ForegroundColor Yellow
}

Write-Host ""

# ============================================================
# 6. Summary
# ============================================================

Write-Host "[6/6] Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Installation summary:" -ForegroundColor Cyan
Write-Host "  ComfyUI:    $InstallDir"
Write-Host "  Models:     $InstallDir\models"
Write-Host "  Portraits:  $portraitsDir"
Write-Host ""
Write-Host "To start ComfyUI:" -ForegroundColor Cyan
Write-Host "  cd $InstallDir"
Write-Host "  python main.py --lowvram --listen 127.0.0.1 --port 8188"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Start ComfyUI with the command above"
Write-Host "  2. Open http://127.0.0.1:8188 in your browser"
Write-Host "  3. Build a character portrait workflow using the GGUF loader"
Write-Host "  4. Export workflow as 'Save (API Format)'"
Write-Host "  5. Save to: app\src\ai\portraits\workflows\character-portrait.json"
Write-Host "  6. Run Prisma migration: cd app && npx prisma migrate dev --name add-portraits"
Write-Host ""

if ($StartAfterInstall) {
    Write-Host "Starting ComfyUI..." -ForegroundColor Yellow
    Push-Location $InstallDir
    python main.py --lowvram --listen 127.0.0.1 --port 8188
    Pop-Location
}
