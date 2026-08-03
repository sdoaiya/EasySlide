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
  # 打包后端在 _internal 之外按 resources/backend 解析离线 GSAP 运行时，
  # 需要把 experiments/hyperframes-m0 放到 resources\backend\experiments
  Copy-Item -Recurse -Force experiments\hyperframes-m0 (Join-Path $backendStage 'experiments\hyperframes-m0')
  $credentialSource = if ($env:EASLIDE_CREDENTIALS_DB) {
    $env:EASLIDE_CREDENTIALS_DB
  } else {
    Join-Path $env:APPDATA 'easyslide-desktop\data\database.db'
  }
  & $python scripts\prepare_desktop_credentials.py --source $credentialSource --output (Join-Path $stagingRoot 'bootstrap-settings.json')
  @"
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw

source = Path(r"frontend\public\logo.png")
if not source.exists():
    raise FileNotFoundError(f"应用图标不存在: {source}")
png_target = Path(r"desktop\resources\icon.png")
ico_target = Path(r"desktop\resources\icon.ico")
image = Image.open(source).convert("RGBA")
pixels = image.load()
edge = max(4, image.width // 5)
for y in range(image.height):
    for x in range(image.width):
        red, green, blue, alpha_value = pixels[x, y]
        near_edge = x < edge or y < edge or x >= image.width - edge or y >= image.height - edge
        if near_edge and alpha_value and min(red, green, blue) > 180 and max(red, green, blue) - min(red, green, blue) < 40:
            pixels[x, y] = (0, 0, 0, 0)

# Resize premultiplied channels so transparent white source pixels cannot create a halo.
alpha = image.getchannel("A").resize((256, 256), Image.LANCZOS)
premultiplied = [
    ImageChops.multiply(image.getchannel(channel), image.getchannel("A")).resize((256, 256), Image.LANCZOS)
    for channel in ("R", "G", "B")
]
canvas = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
canvas.putdata([
    (0, 0, 0, 0) if a == 0 else tuple(min(255, round(value * 255 / a)) for value in rgb) + (a,)
    for rgb, a in zip(zip(*(channel.getdata() for channel in premultiplied)), alpha.getdata())
])
mask = Image.new("L", (256, 256), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, 255, 255), radius=48, fill=255)
canvas.putalpha(ImageChops.multiply(canvas.getchannel("A"), mask))
pixels = canvas.load()
for y in range(256):
    for x in range(256):
        red, green, blue, alpha_value = pixels[x, y]
        near_edge = x < 24 or y < 24 or x >= 232 or y >= 232
        if near_edge and alpha_value and min(red, green, blue) > 180 and max(red, green, blue) - min(red, green, blue) < 40:
            pixels[x, y] = (0, 0, 0, 0)
canvas.putdata([(0, 0, 0, 0) if a == 0 else (r, g, b, a) for r, g, b, a in canvas.getdata()])
assert not any(
    a and min(r, g, b) > 220
    for y in range(256)
    for x in range(256)
    if x < 24 or y < 24 or x >= 232 or y >= 232
    for r, g, b, a in [canvas.getpixel((x, y))]
)
canvas.save(png_target)
canvas.save(ico_target, sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
"@ | & $python -

  npm --prefix desktop install
  node scripts\stage-hyperframes-browser.mjs desktop\resources\hyperframes-browser
  npm --prefix desktop pkg delete dependencies.easyslide
  $desktopPackageLink = Join-Path $desktopRoot 'node_modules\easyslide'
  if (Test-Path $desktopPackageLink) {
    [System.IO.Directory]::Delete($desktopPackageLink, $false)
  }
  npm --prefix desktop run dist:win

  $installerPath = Join-Path $desktopOutput 'EasySlide-0.3.0-Setup.exe'
  $blockmapPath = "$installerPath.blockmap"
  $builderDeadline = (Get-Date).AddMinutes(10)
  while ((-not (Test-Path $installerPath) -or -not (Test-Path $blockmapPath)) -and (Get-Date) -lt $builderDeadline) {
    Start-Sleep -Seconds 2
  }
  if (-not (Test-Path $installerPath) -or -not (Test-Path $blockmapPath)) {
    throw "Desktop installer did not finish within 10 minutes: $installerPath"
  }

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
  # Publish to the stable release folder by default; override when needed.
  # Set EASLIDE_RELEASE_DIR explicitly when publishing to an exact location.
  $releaseRoot = Join-Path (Join-Path $PSScriptRoot '..') 'release'
  $finalDesktopDist = if ($env:EASLIDE_RELEASE_DIR) {
    $env:EASLIDE_RELEASE_DIR
  } else {
    $releaseRoot
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
