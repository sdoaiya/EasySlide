import hashlib
import json
import os
from datetime import datetime
from pathlib import Path


def _utc_timestamp():
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def _manifest_relative_path(project_id, task_id):
    return Path(project_id) / "image-generation" / task_id / "manifest.json"


def build_image_generation_manifest(
    task_id,
    project_id,
    pages,
    image_options,
    style_snapshot,
    existing=None,
):
    existing = existing or {}
    existing_pages = {
        item.get("page_id"): dict(item)
        for item in existing.get("pages", [])
        if item.get("page_id")
    }
    for page in pages:
        page_id = page["page_id"]
        previous = existing_pages.get(page_id, {})
        existing_pages[page_id] = {
            "page_id": page_id,
            "page_index": page["page_index"],
            "status": "queued",
            "attempt": int(previous.get("attempt", 0)) + 1,
            "current_version": page.get("current_version", previous.get("current_version", 0)),
            "protected": bool(page.get("protected", False)),
        }

    ordered_pages = sorted(
        existing_pages.values(),
        key=lambda item: (item.get("page_index", 0), item.get("page_id", "")),
    )
    created_at = existing.get("created_at") or _utc_timestamp()
    return {
        "manifest_version": 1,
        "generation_id": existing.get("generation_id") or task_id,
        "project_id": project_id,
        "created_at": created_at,
        "updated_at": _utc_timestamp(),
        "status": "pending",
        "image_options": dict(image_options or {}),
        "style_snapshot": dict(style_snapshot or {}),
        "page_ids": [page["page_id"] for page in pages],
        "requested_page_ids": existing.get("requested_page_ids") or [page["page_id"] for page in pages],
        "pages": ordered_pages,
        "manifest_path": _manifest_relative_path(project_id, task_id).as_posix(),
    }


def update_manifest_page(manifest, page_id, **changes):
    for page in manifest.get("pages", []):
        if page.get("page_id") == page_id:
            page.update(changes)
            manifest["updated_at"] = _utc_timestamp()
            return page
    raise KeyError(f"Page {page_id} is not part of generation {manifest.get('generation_id')}")


def persist_image_generation_manifest(upload_root, manifest):
    relative_path = _manifest_relative_path(manifest["project_id"], manifest["generation_id"])
    target = Path(upload_root) / relative_path
    target.parent.mkdir(parents=True, exist_ok=True)
    manifest["manifest_path"] = relative_path.as_posix()
    manifest["updated_at"] = _utc_timestamp()
    temporary = target.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temporary, target)
    return relative_path.as_posix()


def write_prompt_snapshot(upload_root, project_id, task_id, page_id, attempt, prompt):
    relative_path = (
        Path(project_id)
        / "image-generation"
        / task_id
        / "prompts"
        / f"{page_id}_attempt-{attempt}.txt"
    )
    target = Path(upload_root) / relative_path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(prompt, encoding="utf-8")
    return {
        "path": relative_path.as_posix(),
        "sha256": hashlib.sha256(prompt.encode("utf-8")).hexdigest(),
    }
