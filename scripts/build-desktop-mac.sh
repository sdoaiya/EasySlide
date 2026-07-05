#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

desktop_output="${TMPDIR:-/tmp}/easyslide-desktop-dist"
rm -rf "$desktop_output"
export ELECTRON_BUILDER_OUT_DIR="$desktop_output"

npm --prefix frontend run build
uv run pyinstaller backend/desktop.spec --noconfirm --distpath backend/dist --workpath backend/build

desktop_root="desktop"
staging_root="$desktop_root/resources"
frontend_stage="$staging_root/frontend"
backend_stage="$staging_root/backend"

rm -rf "$staging_root"
mkdir -p "$frontend_stage" "$backend_stage"

cp -R frontend/dist/. "$frontend_stage/"
cp -R backend/dist/easyslide-backend/. "$backend_stage/"
chmod +x "$backend_stage/easyslide-backend" || true

uv run python - <<'PY'
from pathlib import Path
from PIL import Image, ImageDraw

source = Path("frontend/public/logo.png")
png_target = Path("desktop/resources/icon.png")
image = Image.open(source).convert("RGBA")
image.thumbnail((1024, 1024), Image.LANCZOS)
canvas = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
canvas.paste(image, ((1024 - image.width) // 2, (1024 - image.height) // 2), image)
mask = Image.new("L", (1024, 1024), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, 1024, 1024), radius=192, fill=255)
canvas.putalpha(mask)
canvas.save(png_target)

iconset = Path("desktop/resources/icon.iconset")
iconset.mkdir(exist_ok=True)
for size in [16, 32, 64, 128, 256, 512]:
    canvas.resize((size, size), Image.LANCZOS).save(iconset / f"icon_{size}x{size}.png")
    canvas.resize((size * 2, size * 2), Image.LANCZOS).save(iconset / f"icon_{size}x{size}@2x.png")
PY

iconutil -c icns "$staging_root/icon.iconset" -o "$staging_root/icon.icns"
rm -rf "$staging_root/icon.iconset"

npm --prefix desktop ci
npm --prefix desktop install --no-save dmg-license@^1.0.11
npm --prefix desktop run dist:mac

rm -rf desktop/dist
cp -R "$desktop_output" desktop/dist
