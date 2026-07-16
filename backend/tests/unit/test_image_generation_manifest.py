import json
from pathlib import Path


def test_manifest_tracks_style_and_page_lifecycle(tmp_path):
    from services.image_generation_manifest import (
        build_image_generation_manifest,
        persist_image_generation_manifest,
        update_manifest_page,
    )

    manifest = build_image_generation_manifest(
        task_id="task-1",
        project_id="project-1",
        pages=[
            {
                "page_id": "page-1",
                "page_index": 1,
                "current_version": 0,
                "protected": False,
            },
            {
                "page_id": "page-2",
                "page_index": 2,
                "current_version": 3,
                "protected": True,
            },
        ],
        image_options={"use_template": True, "max_workers": 4},
        style_snapshot={"template_pack_id": "gorden-data-viz-deck"},
    )

    assert manifest["manifest_version"] == 1
    assert manifest["generation_id"] == "task-1"
    assert manifest["style_snapshot"]["template_pack_id"] == "gorden-data-viz-deck"
    assert manifest["pages"][0]["status"] == "queued"
    assert manifest["pages"][1]["protected"] is True

    update_manifest_page(
        manifest,
        "page-1",
        status="completed",
        version_number=1,
        output_path="project-1/pages/page-1_v1.png",
        prompt_hash="abc123",
        qa={"status": "passed", "width": 1920, "height": 1080},
    )
    relative_path = persist_image_generation_manifest(tmp_path, manifest)

    assert relative_path == "project-1/image-generation/task-1/manifest.json"
    persisted = json.loads((tmp_path / Path(relative_path)).read_text(encoding="utf-8"))
    completed = persisted["pages"][0]
    assert completed["status"] == "completed"
    assert completed["version_number"] == 1
    assert completed["qa"]["status"] == "passed"


def test_prompt_snapshot_is_versioned_and_hashed(tmp_path):
    from services.image_generation_manifest import write_prompt_snapshot

    result = write_prompt_snapshot(
        tmp_path,
        project_id="project-1",
        task_id="task-1",
        page_id="page-1",
        attempt=2,
        prompt="完整页面提示词",
    )

    assert result["path"] == "project-1/image-generation/task-1/prompts/page-1_attempt-2.txt"
    assert len(result["sha256"]) == 64
    assert (tmp_path / Path(result["path"])).read_text(encoding="utf-8") == "完整页面提示词"
