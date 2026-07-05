$ErrorActionPreference = 'Stop'

Push-Location $PSScriptRoot\..
try {
  $desktopOutput = Join-Path $env:TEMP 'easyslide-desktop-dist'
  if (Test-Path $desktopOutput) {
    Remove-Item -Recurse -Force $desktopOutput
  }
  $env:ELECTRON_BUILDER_OUT_DIR = $desktopOutput

  npm --prefix frontend run build
  uv run pyinstaller backend\desktop.spec --noconfirm --distpath backend\dist --workpath backend\build

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
  @"
from pathlib import Path
from PIL import Image, ImageDraw

source = Path(r"D:\Personal\Desktop\favicon.ico")
if not source.exists():
    source = Path(r"frontend\public\logo.png")
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
"@ | uv run python -

  npm --prefix desktop install
  npm --prefix desktop pkg delete dependencies.easyslide
  $desktopPackageLink = Join-Path $desktopRoot 'node_modules\easyslide'
  if (Test-Path $desktopPackageLink) {
    [System.IO.Directory]::Delete($desktopPackageLink, $false)
  }
  npm --prefix desktop run dist:win

  $finalDesktopDist = Join-Path $PSScriptRoot '..\desktop\dist'
  if (Test-Path $finalDesktopDist) {
    Remove-Item -Recurse -Force $finalDesktopDist
  }
  Copy-Item -Recurse -Force $desktopOutput $finalDesktopDist

  $portableDir = Join-Path $finalDesktopDist 'EasySlide-0.3.0-Portable'
  if (Test-Path $portableDir) {
    Remove-Item -Recurse -Force $portableDir
  }
  Copy-Item -Recurse -Force (Join-Path $finalDesktopDist 'win-unpacked') $portableDir
  New-Item -ItemType File -Force -Path (Join-Path $portableDir 'portable.flag') | Out-Null
}
finally {
  Pop-Location
}
