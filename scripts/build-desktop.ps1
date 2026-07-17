$ErrorActionPreference = 'Stop'

Push-Location $PSScriptRoot\..
try {
  $desktopOutput = Join-Path $env:TEMP 'easyslide-desktop-dist'
  if (Test-Path $desktopOutput) {
    Remove-Item -Recurse -Force $desktopOutput
  }
  $env:ELECTRON_BUILDER_OUT_DIR = $desktopOutput
  $python = Join-Path (Get-Location) '.venv\Scripts\python.exe'
  $pyinstaller = Join-Path (Get-Location) '.venv\Scripts\pyinstaller.exe'

  npm --prefix frontend run build
  node scripts\validate-native-layout-manifest.mjs
  & $pyinstaller backend\desktop.spec --noconfirm --distpath backend\dist --workpath backend\build

  $desktopRoot = Join-Path $PSScriptRoot '..\desktop'
  $stagingRoot = Join-Path $desktopRoot 'resources'
  $frontendStage = Join-Path $stagingRoot 'frontend'
  $backendStage = Join-Path $stagingRoot 'backend'
  $iconPngStage = Join-Path $stagingRoot 'icon.png'
  $iconIcoStage = Join-Path $stagingRoot 'icon.ico'

  if (Test-Path $stagingRoot) {
    Remove-Item -Recurse -Force $stagingRoot
  }
  New-Item -ItemType Directory -Force -Path $frontendStage | Out-Null
  New-Item -ItemType Directory -Force -Path $backendStage | Out-Null

  Copy-Item -Recurse -Force frontend\dist\* $frontendStage
  Copy-Item -Recurse -Force backend\dist\easyslide-backend\* $backendStage
  $credentialSource = if ($env:EASLIDE_CREDENTIALS_DB) {
    $env:EASLIDE_CREDENTIALS_DB
  } else {
    Join-Path $env:APPDATA 'easyslide-desktop\data\database.db'
  }
  & $python scripts\prepare_desktop_credentials.py --source $credentialSource --output (Join-Path $stagingRoot 'bootstrap-settings.json')
  @"
from pathlib import Path
from PIL import Image, ImageDraw

source = Path(r"frontend\public\logo.png")
if not source.exists():
    raise FileNotFoundError(f"应用图标不存在: {source}")
png_target = Path(r"desktop\resources\icon.png")
ico_target = Path(r"desktop\resources\icon.ico")
image = Image.open(source).convert("RGBA")
image.thumbnail((256, 256), Image.LANCZOS)
canvas = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
canvas.paste(image, ((256 - image.width) // 2, (256 - image.height) // 2), image)
mask = Image.new("L", (256, 256), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, 256, 256), radius=48, fill=255)
canvas.putalpha(mask)
canvas.save(png_target)
canvas.save(ico_target, sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
"@ | & $python -

  npm --prefix desktop install
  npm --prefix desktop pkg delete dependencies.easyslide
  $desktopPackageLink = Join-Path $desktopRoot 'node_modules\easyslide'
  if (Test-Path $desktopPackageLink) {
    [System.IO.Directory]::Delete($desktopPackageLink, $false)
  }
  npm --prefix desktop run dist:win

  function Publish-DesktopDelivery {
    param(
      [string]$Source,
      [string]$Target
    )

    $unpackedSource = Join-Path $Source 'win-unpacked'
    if (-not (Test-Path $unpackedSource)) {
      throw "Desktop build output is missing: $unpackedSource"
    }

    New-Item -ItemType Directory -Force -Path $Target | Out-Null
    Copy-Item -Recurse -Force (Join-Path $Source '*') $Target

    # Do not expose Electron's unpacked/debug intermediates as delivery artifacts.
    Remove-Item -Recurse -Force (Join-Path $Target 'win-unpacked') -ErrorAction SilentlyContinue
    Remove-Item -Force (Join-Path $Target 'builder-debug.yml') -ErrorAction SilentlyContinue

    $portableDir = Join-Path $Target 'EasySlide-0.3.0-Portable'
    if (Test-Path $portableDir) {
      Remove-Item -Recurse -Force $portableDir
    }
    Copy-Item -Recurse -Force $unpackedSource $portableDir
    New-Item -ItemType File -Force -Path (Join-Path $portableDir 'portable.flag') | Out-Null
    Write-Host "Desktop release: $Target"
  }

  # Keep the Electron builder cache separate from the user-facing delivery folder.
  # Default to a timestamped folder under the current checkout so Codex worktree
  # builds are easy to find and never mix with stale artifacts.
  # Set EASLIDE_RELEASE_DIR explicitly when publishing to an exact location.
  $releaseRoot = Join-Path (Join-Path $PSScriptRoot '..') 'release'
  $finalDesktopDist = if ($env:EASLIDE_RELEASE_DIR) {
    $env:EASLIDE_RELEASE_DIR
  } else {
    Join-Path $releaseRoot ("codex-build-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  }
  try {
    if (Test-Path $finalDesktopDist) {
      Remove-Item -Recurse -Force $finalDesktopDist
    }
    Publish-DesktopDelivery -Source $desktopOutput -Target $finalDesktopDist
  } catch {
    $fallbackDist = Join-Path $finalDesktopDist ("codex-build-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    Write-Warning "Cannot replace release folder. Publishing to fallback path: $fallbackDist"
    Publish-DesktopDelivery -Source $desktopOutput -Target $fallbackDist
  }
}
finally {
  Pop-Location
}
