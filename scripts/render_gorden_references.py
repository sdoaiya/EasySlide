#!/usr/bin/env python3
"""Render Gorden PPTX templates into role-aware image references.

This is intentionally an offline asset-preparation tool. It keeps existing
references when a source PPTX cannot be opened, so one bad source does not
invalidate the whole template catalog.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

import fitz
from PIL import Image


ROLE_KEYS = {
    "cover": "cover",
    "agenda": "agenda",
    "section": "section_divider",
    "content": "content",
    "ending": "ending",
}


def first_page(values: object) -> int | None:
    if not isinstance(values, list) or not values:
        return None
    try:
        return int(values[0])
    except (TypeError, ValueError):
        return None


def select_pages(detail: dict) -> dict[str, int | None]:
    roles = detail.get("page_roles") or {}
    content = first_page(roles.get("content")) or 1
    chart_pages = detail.get("data_charts") or []
    if isinstance(chart_pages, dict):
        chart_pages = list(chart_pages)
    data = None
    if isinstance(chart_pages, list) and chart_pages:
        candidate = chart_pages[0]
        candidate = candidate.get("slide_number") or candidate.get("page") if isinstance(candidate, dict) else candidate
        try:
            data = int(candidate)
        except (TypeError, ValueError):
            data = None
    return {
        role: first_page(roles.get(source_role)) if role != "content" else content
        for role, source_role in ROLE_KEYS.items()
    } | {"data": data or content}


def render_template(soffice: Path, source: Path, output: Path) -> dict[str, str]:
    detail = json.loads((source / "detail.json").read_text(encoding="utf-8"))
    selected = select_pages(detail)
    references: dict[str, str] = {}

    with tempfile.TemporaryDirectory(prefix=f"gorden_{source.name}_") as raw_dir:
        raw_root = Path(raw_dir)
        pdf_dir = raw_root / "pdf"
        pdf_dir.mkdir()
        profile = (raw_root / "lo-profile").resolve().as_uri()
        result = subprocess.run(
            [
                str(soffice),
                "--headless",
                "--nologo",
                "--nofirststartwizard",
                "--norestore",
                f"-env:UserInstallation={profile}",
                "--convert-to",
                "pdf:impress_pdf_Export",
                "--outdir",
                str(pdf_dir),
                str(source / "template.pptx"),
            ],
            capture_output=True,
            text=True,
            timeout=240,
        )
        pdfs = list(pdf_dir.glob("*.pdf"))
        if result.returncode or not pdfs:
            detail = (result.stderr or result.stdout or "conversion failed").strip()
            raise RuntimeError(detail[-500:])

        document = fitz.open(pdfs[0])
        try:
            output.mkdir(parents=True, exist_ok=True)
            for role, page_number in selected.items():
                if not page_number or page_number > len(document):
                    continue
                pixmap = document.load_page(page_number - 1).get_pixmap(
                    matrix=fitz.Matrix(2, 2), alpha=False
                )
                png = raw_root / f"{role}.png"
                pixmap.save(str(png))
                target = output / f"{role}.webp"
                Image.open(png).convert("RGB").save(target, "WEBP", quality=92, method=6)
                references[role] = f"/template-packs/gorden/{source.name}/{role}.webp"
        finally:
            document.close()

    if references:
        generic = "content" if "content" in references else next(iter(references))
        shutil.copyfile(output / f"{generic}.webp", output / "reference.webp")
    return references


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skill-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--soffice", type=Path, required=True)
    parser.add_argument("--slug", action="append", dest="slugs")
    args = parser.parse_args()

    manifest_path = args.output_root / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    wanted = set(args.slugs or [])
    failures: dict[str, str] = {}

    for source in sorted(path for path in args.skill_root.iterdir() if path.is_dir()):
        if wanted and source.name not in wanted:
            continue
        try:
            references = render_template(
                args.soffice,
                source,
                args.output_root / source.name,
            )
            entry = next(item for item in manifest["templates"] if item["slug"] == source.name)
            if references:
                entry["referenceMode"] = "rendered-role-slides"
                entry["reference"] = f"/template-packs/gorden/{source.name}/reference.webp"
                entry["roleReferences"] = references
            print(f"OK {source.name}: {', '.join(references) or 'no references'}")
        except Exception as exc:  # Keep the previous reference on source failure.
            failures[source.name] = str(exc)
            print(f"SKIP {source.name}: {exc}")

    manifest["referenceMode"] = "rendered-role-slides"
    manifest["renderedWith"] = "LibreOffice + PyMuPDF"
    manifest["renderingFailures"] = failures
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
