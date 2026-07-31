import json
import threading
import time
from unittest.mock import patch

import pytest

from conftest import assert_success_response
from models import db, Page, Project, Task
from services.ai_service import AIService
from services.task_manager import _set_export_task_progress


def test_html_image_references_are_extracted_and_removed_from_prompt_text():
    html = '<div><img src="/files/mineru/extract/imgs/chart.jpg" alt="Image" /></div>'

    assert AIService.extract_image_urls_from_markdown(html) == ["/files/mineru/extract/imgs/chart.jpg"]
    assert AIService.remove_markdown_images(html).strip() == ""


def _create_export_task(project_id, task_type="EXPORT_EDITABLE_PPTX", status="PROCESSING"):
    task = Task(project_id=project_id, task_type=task_type, status=status)
    task.set_progress({
        "percent": 50,
        "_resume": {
            "kind": "editable-pptx",
            "kwargs": {"project_id": project_id, "filename": "editable.pptx"},
        },
    })
    db.session.add(task)
    db.session.commit()
    return task


def _attach_ppt_workspace(project, *, render_mode="image", image_aspect_ratio="16:9", stage=None):
    from models import ProjectWorkspace
    from services.content_spine_service import create_spine
    from services.project_workspace_service import save_workspace_revision

    settings = {
        "render_mode": render_mode,
        "image_aspect_ratio": image_aspect_ratio,
        "native_theme": "core01" if render_mode == "native" else None,
    }
    db.session.add(project)
    db.session.flush()
    if not project.content_spine:
        db.session.add(create_spine(project.id, {"idea_prompt": project.project_title or project.id}))
    workspace = ProjectWorkspace(
        project_id=project.id,
        kind="ppt",
        state="draft",
        stage=stage or project.status or "DRAFT",
        revision=0,
        source_kind="manual",
        settings_json=json.dumps(settings, ensure_ascii=False),
    )
    db.session.add(workspace)
    db.session.flush()
    save_workspace_revision(
        workspace,
        {"schema_version": 1, "page_refs": [page.id for page in project.pages]},
        settings,
        expected_revision=0,
        source_type="manual",
    )
    workspace.stage = stage or project.status or "DRAFT"
    return workspace


def test_pause_export_task_preserves_resume_data(client):
    project = Project(id="pause-export-project", creation_type="idea")
    db.session.add(project)
    db.session.commit()
    task = _create_export_task(project.id)

    response = client.post(f"/api/projects/{project.id}/tasks/{task.id}/pause")

    data = assert_success_response(response)
    db.session.refresh(task)
    assert data["data"]["status"] == "PAUSED"
    assert task.status == "PAUSED"
    assert task.get_progress()["_resume"]["kwargs"]["filename"] == "editable.pptx"


def test_progress_updates_keep_restart_arguments(client):
    project = Project(id="preserve-resume-project", creation_type="idea")
    db.session.add(project)
    db.session.commit()
    task = _create_export_task(project.id)

    _set_export_task_progress(task, {"percent": 75})
    db.session.commit()

    assert task.get_progress()["percent"] == 75
    assert task.get_progress()["_resume"]["kwargs"]["filename"] == "editable.pptx"


def test_resume_active_export_task_wakes_existing_worker(client):
    project = Project(id="resume-active-project", creation_type="idea")
    db.session.add(project)
    db.session.commit()
    task = _create_export_task(project.id, status="PAUSED")

    with patch("controllers.project_controller.task_manager.is_task_active", return_value=True), \
         patch("controllers.project_controller.task_manager.submit_task") as submit_task:
        response = client.post(f"/api/projects/{project.id}/tasks/{task.id}/resume")

    data = assert_success_response(response)
    db.session.refresh(task)
    assert data["data"]["status"] == "PROCESSING"
    assert task.status == "PROCESSING"
    submit_task.assert_not_called()


def test_pause_and_resume_active_image_generation_task(client):
    project = Project(id="pause-image-project", creation_type="idea")
    db.session.add(project)
    db.session.commit()
    task = Task(project_id=project.id, task_type="GENERATE_IMAGES", status="PROCESSING")
    task.set_progress({"total": 2, "completed": 0, "failed": 0, "page_ids": ["p1", "p2"]})
    db.session.add(task)
    db.session.commit()

    paused = client.post(f"/api/projects/{project.id}/tasks/{task.id}/pause")
    assert assert_success_response(paused)["data"]["status"] == "PAUSED"

    with patch("controllers.project_controller.task_manager.is_task_active", return_value=True):
        resumed = client.post(f"/api/projects/{project.id}/tasks/{task.id}/resume")

    assert assert_success_response(resumed)["data"]["status"] == "PROCESSING"


def test_resume_interrupted_image_generation_resubmits_only_missing_pages(app, client):
    from pathlib import Path
    from PIL import Image

    project = Project(
        id="resume-image-project",
        creation_type="idea",
        template_style="clean",
    )
    _attach_ppt_workspace(project)
    completed = Page(
        id="resume-image-completed",
        project_id=project.id,
        order_index=0,
        status="COMPLETED",
        generated_image_path="generated/existing.png",
    )
    pending = Page(
        id="resume-image-pending",
        project_id=project.id,
        order_index=1,
        status="QUEUED",
    )
    for page in (completed, pending):
        page.set_outline_content({"title": page.id, "points": []})
        page.set_description_content({"text": page.id})
    existing_path = Path(app.config['UPLOAD_FOLDER']) / completed.generated_image_path
    existing_path.parent.mkdir(parents=True, exist_ok=True)
    Image.new('RGB', (16, 9), 'white').save(existing_path)
    db.session.add_all([project, completed, pending])
    db.session.commit()
    task = Task(project_id=project.id, task_type="GENERATE_IMAGES", status="PAUSED")
    task.set_progress({
        "generation_id": task.id,
        "manifest_version": 1,
        "total": 2,
        "completed": 1,
        "failed": 0,
        "page_ids": [completed.id, pending.id],
        "image_options": {"use_template": True, "language": "zh"},
    })
    db.session.add(task)
    db.session.commit()

    with (
        patch("controllers.project_controller.task_manager.is_task_active", return_value=False),
        patch("controllers.project_controller.get_ai_service", return_value=object()),
        patch("controllers.project_controller.task_manager.submit_task") as submit_task,
    ):
        response = client.post(f"/api/projects/{project.id}/tasks/{task.id}/resume")

    data = assert_success_response(response)["data"]
    db.session.refresh(task)
    assert data["status"] == "PENDING"
    assert task.get_progress()["generation_id"] == task.id
    assert task.get_progress()["manifest_version"] == 1
    assert task.get_progress()["page_ids"] == [pending.id]
    assert submit_task.call_args.args[-2] == [pending.id]


def test_desktop_startup_pauses_interrupted_image_generation(app):
    from app import _pause_interrupted_export_tasks

    with app.app_context():
        project = Project(id="startup-image-project", creation_type="idea")
        _attach_ppt_workspace(project)
        page = Page(
            id="startup-image-page",
            project_id=project.id,
            order_index=0,
            status="GENERATING",
        )
        task = Task(project_id=project.id, task_type="GENERATE_IMAGES", status="PROCESSING")
        task.set_progress({"total": 1, "completed": 0, "page_ids": [page.id]})
        db.session.add_all([project, page, task])
        db.session.commit()

        _pause_interrupted_export_tasks()

        db.session.refresh(task)
        db.session.refresh(page)
        assert task.status == "PAUSED"
        assert page.status == "QUEUED"
        active_tasks = project.to_dict(include_pages=True)["active_image_tasks"]
        assert active_tasks[0]["task_id"] == task.id
        assert active_tasks[0]["status"] == "PAUSED"


def test_image_task_failure_clears_stale_generating_page_state(app):
    from services.task_manager import generate_images_task

    class BrokenImageService:
        def flatten_outline(self, _outline):
            raise RuntimeError("provider disconnected")

    with app.app_context():
        project = Project(
            id="failed-image-project",
            creation_type="idea",
            status="GENERATING_IMAGES",
        )
        _attach_ppt_workspace(project)
        page = Page(
            id="failed-image-page",
            project_id=project.id,
            order_index=0,
            status="GENERATING",
        )
        task = Task(project_id=project.id, task_type="GENERATE_IMAGES", status="PROCESSING")
        task.set_progress({"total": 1, "completed": 0, "failed": 0, "page_ids": [page.id]})
        db.session.add_all([project, page, task])
        db.session.commit()

        generate_images_task(
            task.id,
            project.id,
            BrokenImageService(),
            object(),
            [],
            app=app,
            page_ids=[page.id],
        )

        db.session.refresh(task)
        db.session.refresh(page)
        db.session.refresh(project)
        assert task.status == "FAILED"
        assert page.status == "FAILED"
        from services.ppt_workspace_service import get_ppt_status
        assert get_ppt_status(project) == "DESCRIPTIONS_GENERATED"


def test_paused_image_generation_stops_before_submitting_more_pages(app, tmp_path):
    from PIL import Image
    from services.file_service import FileService
    from services.task_manager import generate_images_task

    class PausingImageService:
        def flatten_outline(self, outline):
            return outline

        def extract_image_urls_from_markdown(self, _text):
            return []

        def generate_image_prompt(self, *_args, **_kwargs):
            return "prompt"

        def generate_image(self, *_args, **_kwargs):
            task = Task.query.get("pause-after-first-task")
            task.status = "PAUSED"
            db.session.commit()
            return Image.new("RGB", (640, 360), "white")

    with app.app_context():
        project = Project(
            id="pause-before-more-pages-project",
            creation_type="idea",
            status="GENERATING_IMAGES",
        )
        first = Page(id="pause-page-1", project_id=project.id, order_index=0, status="QUEUED")
        second = Page(id="pause-page-2", project_id=project.id, order_index=1, status="QUEUED")
        for page in (first, second):
            page.set_outline_content({"title": page.id, "points": []})
            page.set_description_content({"text": page.id})
        task = Task(id="pause-after-first-task", project_id=project.id, task_type="GENERATE_IMAGES", status="PENDING")
        task.set_progress({
            "generation_id": task.id,
            "manifest_version": 1,
            "project_id": project.id,
            "total": 2,
            "completed": 0,
            "failed": 0,
            "page_ids": [first.id, second.id],
            "pages": [
                {"page_id": first.id, "status": "queued", "attempt": 1},
                {"page_id": second.id, "status": "queued", "attempt": 1},
            ],
        })
        db.session.add_all([project, first, second, task])
        db.session.commit()

        generate_images_task(
            task.id,
            project.id,
            PausingImageService(),
            FileService(str(tmp_path)),
            [
                {"title": first.id, "points": []},
                {"title": second.id, "points": []},
            ],
            use_template=False,
            max_workers=1,
            app=app,
            page_ids=[first.id, second.id],
        )

        db.session.refresh(task)
        db.session.refresh(first)
        db.session.refresh(second)
        assert task.status == "PAUSED"
        assert first.generated_image_path
        assert second.generated_image_path is None
        assert second.status == "QUEUED"


def test_image_generation_task_skips_page_that_already_has_image(app, tmp_path):
    from PIL import Image
    from services.file_service import FileService
    from services.task_manager import generate_images_task

    class ShouldNotGenerateImageService:
        def flatten_outline(self, outline):
            return outline

        def extract_image_urls_from_markdown(self, _text):
            return []

        def generate_image_prompt(self, *_args, **_kwargs):
            raise AssertionError("prompt should not be generated for protected pages")

        def generate_image(self, *_args, **_kwargs):
            raise AssertionError("image should not be regenerated for protected pages")

    with app.app_context():
        project = Project(
            id="skip-existing-during-worker-project",
            creation_type="idea",
            status="GENERATING_IMAGES",
        )
        _attach_ppt_workspace(project)
        page = Page(
            id="skip-existing-during-worker-page",
            project_id=project.id,
            order_index=0,
            status="QUEUED",
            generated_image_path="generated/user-uploaded.png",
        )
        page.set_outline_content({"title": page.id, "points": []})
        page.set_description_content({"text": page.id})
        existing_path = tmp_path / page.generated_image_path
        existing_path.parent.mkdir(parents=True, exist_ok=True)
        Image.new('RGB', (16, 9), 'white').save(existing_path)
        task = Task(id="skip-existing-during-worker-task", project_id=project.id, task_type="GENERATE_IMAGES", status="PENDING")
        task.set_progress({
            "generation_id": task.id,
            "manifest_version": 1,
            "project_id": project.id,
            "total": 1,
            "completed": 0,
            "failed": 0,
            "page_ids": [page.id],
            "pages": [
                {"page_id": page.id, "status": "queued", "attempt": 1},
            ],
        })
        db.session.add_all([project, page, task])
        db.session.commit()

        generate_images_task(
            task.id,
            project.id,
            ShouldNotGenerateImageService(),
            FileService(str(tmp_path)),
            [{"title": page.id, "points": []}],
            use_template=False,
            max_workers=1,
            app=app,
            page_ids=[page.id],
        )

        db.session.refresh(task)
        db.session.refresh(page)
        assert task.status == "COMPLETED"
        assert page.generated_image_path == "generated/user-uploaded.png"
        assert task.get_progress()["pages"][0]["status"] == "skipped_existing"


def test_renovation_generation_uses_original_pdf_page_as_reference(app, tmp_path):
    from PIL import Image
    from services.file_service import FileService
    from services.task_manager import generate_images_task

    seen = {}

    class RenovationImageService:
        def flatten_outline(self, outline):
            return outline

        def extract_image_urls_from_markdown(self, _text):
            return []

        def generate_image_prompt(self, *_args, **_kwargs):
            return "renovate"

        def generate_image(self, _prompt, ref_image_path, *_args, **_kwargs):
            seen["ref"] = ref_image_path
            return Image.new("RGB", (640, 360), "white")

    with app.app_context():
        project = Project(id="renovation-reference-project", creation_type="ppt_renovation")
        _attach_ppt_workspace(project)
        page = Page(id="renovation-reference-page", project_id=project.id, order_index=0, status="QUEUED")
        page.set_outline_content({"title": "source", "points": []})
        page.set_description_content({"text": "source"})
        source_path = tmp_path / project.id / "pages" / "page_1_original.png"
        source_path.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (640, 360), "blue").save(source_path)
        page.generated_image_path = f"{project.id}/pages/source_v1.png"
        Image.new("RGB", (640, 360), "blue").save(tmp_path / page.generated_image_path)
        task = Task(id="renovation-reference-task", project_id=project.id, task_type="GENERATE_IMAGES", status="PENDING")
        task.set_progress({"page_ids": [page.id], "pages": [{"page_id": page.id, "status": "queued", "attempt": 1}]})
        db.session.add_all([project, page, task])
        db.session.commit()

        generate_images_task(
            task.id, project.id, RenovationImageService(), FileService(str(tmp_path)),
            [{"title": "source", "points": []}], use_template=False, max_workers=1,
            app=app, page_ids=[page.id],
        )

        assert seen["ref"] == str(source_path)
        db.session.expire_all()
        assert Task.query.get(task.id).status == "COMPLETED"


def test_paused_image_generation_records_already_running_pages(app, tmp_path):
    from PIL import Image
    from services.file_service import FileService
    from services.task_manager import generate_images_task

    page2_started = threading.Event()
    pause_seen = threading.Event()

    class TwoWorkerImageService:
        def flatten_outline(self, outline):
            return outline

        def extract_image_urls_from_markdown(self, _text):
            return []

        def generate_image_prompt(self, _outline, page_data, *_args, **_kwargs):
            return page_data["title"]

        def generate_image(self, prompt, *_args, **_kwargs):
            if prompt == "page-1":
                assert page2_started.wait(2)
                task = Task.query.get("pause-two-workers-task")
                task.status = "PAUSED"
                db.session.commit()
                pause_seen.set()
                return Image.new("RGB", (640, 360), "white")
            page2_started.set()
            assert pause_seen.wait(2)
            time.sleep(0.05)
            return Image.new("RGB", (640, 360), "white")

    with app.app_context():
        project = Project(
            id="pause-two-workers-project",
            creation_type="idea",
            status="GENERATING_IMAGES",
        )
        first = Page(id="pause-two-workers-page-1", project_id=project.id, order_index=0, status="QUEUED")
        second = Page(id="pause-two-workers-page-2", project_id=project.id, order_index=1, status="QUEUED")
        third = Page(id="pause-two-workers-page-3", project_id=project.id, order_index=2, status="QUEUED")
        for page, title in ((first, "page-1"), (second, "page-2"), (third, "page-3")):
            page.set_outline_content({"title": title, "points": []})
            page.set_description_content({"text": title})
        task = Task(id="pause-two-workers-task", project_id=project.id, task_type="GENERATE_IMAGES", status="PENDING")
        task.set_progress({
            "generation_id": task.id,
            "manifest_version": 1,
            "project_id": project.id,
            "total": 3,
            "completed": 0,
            "failed": 0,
            "page_ids": [first.id, second.id, third.id],
            "pages": [
                {"page_id": first.id, "status": "queued", "attempt": 1},
                {"page_id": second.id, "status": "queued", "attempt": 1},
                {"page_id": third.id, "status": "queued", "attempt": 1},
            ],
        })
        db.session.add_all([project, first, second, third, task])
        db.session.commit()

        generate_images_task(
            task.id,
            project.id,
            TwoWorkerImageService(),
            FileService(str(tmp_path)),
            [
                {"title": "page-1", "points": []},
                {"title": "page-2", "points": []},
                {"title": "page-3", "points": []},
            ],
            use_template=False,
            max_workers=2,
            app=app,
            page_ids=[first.id, second.id, third.id],
        )

        db.session.refresh(task)
        db.session.refresh(first)
        db.session.refresh(second)
        db.session.refresh(third)
        assert task.status == "PAUSED"
        assert task.get_progress()["completed"] == 2
        assert first.generated_image_path
        assert second.generated_image_path
        assert third.generated_image_path is None


def test_resume_interrupted_export_task_resubmits_saved_arguments(client):
    project = Project(id="resume-interrupted-project", creation_type="idea")
    db.session.add(project)
    db.session.commit()
    task = _create_export_task(project.id, status="PAUSED")

    with patch("controllers.project_controller.task_manager.is_task_active", return_value=False), \
         patch("controllers.project_controller.task_manager.submit_task") as submit_task:
        response = client.post(f"/api/projects/{project.id}/tasks/{task.id}/resume")

    data = assert_success_response(response)
    db.session.refresh(task)
    assert data["data"]["status"] == "PENDING"
    assert task.status == "PENDING"
    assert submit_task.call_args.kwargs["project_id"] == project.id
    assert submit_task.call_args.kwargs["filename"] == "editable.pptx"


def test_resume_interrupted_video_stays_paused_when_resubmission_fails(client):
    project = Project(id="resume-video-failure", creation_type="idea")
    db.session.add(project)
    db.session.commit()
    task = _create_export_task(project.id, task_type="EXPORT_VIDEO", status="PAUSED")
    task.set_progress({
        "_resume": {
            "kind": "video",
            "kwargs": {
                "project_id": project.id,
                "filename": "video.mp4",
                "frame_paths": ["retained-frame.png"],
            },
        },
    })
    db.session.commit()

    with patch("controllers.project_controller.task_manager.is_task_active", return_value=False), \
         patch("controllers.project_controller.task_manager.submit_task", side_effect=RuntimeError("queue unavailable")):
        response = client.post(f"/api/projects/{project.id}/tasks/{task.id}/resume")

    db.session.refresh(task)
    assert response.status_code == 500
    assert task.status == "PAUSED"
    assert task.get_progress()["_resume"]["kwargs"]["frame_paths"] == ["retained-frame.png"]


@pytest.mark.parametrize(
    ("task_type", "resume_kind", "task_func"),
    [
        ("EXPORT_VIDEO_WORKSPACE", "video_workspace", "export_video_workspace_task"),
        ("EXPORT_PODCAST_WORKSPACE", "podcast_workspace", "export_podcast_workspace_task"),
    ],
)
def test_resume_content_workspace_export_resubmits_workspace_worker(client, task_type, resume_kind, task_func):
    project = Project(id=f"resume-{resume_kind}-project", creation_type="idea")
    db.session.add(project)
    db.session.commit()
    task = _create_export_task(project.id, task_type=task_type, status="PAUSED")
    task.set_progress({
        "_resume": {
            "kind": resume_kind,
            "kwargs": {
                "project_id": project.id,
                "filename": f"{resume_kind}.artifact",
                "snapshot_path": f"{resume_kind}.json",
                "snapshot_hash": "snapshot-hash",
            },
        },
    })
    db.session.commit()

    with patch("controllers.project_controller.task_manager.is_task_active", return_value=False), \
         patch("controllers.project_controller.task_manager.submit_task") as submit_task:
        response = client.post(f"/api/projects/{project.id}/tasks/{task.id}/resume")

    data = assert_success_response(response)
    db.session.refresh(task)
    assert data["data"]["status"] == "PENDING"
    assert task.status == "PENDING"
    assert submit_task.call_args.args[0] == task.id
    assert submit_task.call_args.args[1].__name__ == task_func
    assert submit_task.call_args.kwargs["project_id"] == project.id
    assert "file_service" not in submit_task.call_args.kwargs
    assert submit_task.call_args.kwargs["app"] is not None


@pytest.mark.parametrize("task_type", ["EXPORT_NATIVE_PPTX", "EXPORT_NATIVE_PDF", "EXPORT_NATIVE_HTML"])
def test_resume_native_export_restarts_browser_generation(client, task_type):
    project = Project(id="resume-native-project", creation_type="idea")
    _attach_ppt_workspace(project, render_mode="native")
    db.session.commit()
    task = _create_export_task(project.id, task_type=task_type, status="PAUSED")
    task.set_progress({
        "total": 3,
        "completed": 2,
        "percent": 66,
        "_resume": {"kind": "native-pptx", "kwargs": {}},
    })
    db.session.commit()

    with patch("controllers.project_controller.task_manager.submit_task") as submit_task:
        response = client.post(f"/api/projects/{project.id}/tasks/{task.id}/resume")

    data = assert_success_response(response)
    db.session.refresh(task)
    assert data["data"]["status"] == "PENDING"
    assert task.get_progress()["completed"] == 0
    assert task.get_progress()["percent"] == 0
    assert task.get_progress()["current_step"] == "等待重新开始导出"
    submit_task.assert_not_called()


def test_pause_active_exports_pauses_async_exports_and_image_generation(client):
    project = Project(id="pause-all-project", creation_type="idea")
    db.session.add(project)
    db.session.commit()
    editable = _create_export_task(project.id)
    video = _create_export_task(project.id, task_type="EXPORT_VIDEO")
    native = _create_export_task(project.id, task_type="EXPORT_NATIVE_PPTX")
    generation = _create_export_task(project.id, task_type="GENERATE_IMAGES")

    response = client.post("/api/projects/tasks/pause-active-exports")

    data = assert_success_response(response)
    db.session.refresh(editable)
    db.session.refresh(video)
    db.session.refresh(generation)
    assert data["data"]["paused_count"] == 4
    assert editable.status == "PAUSED"
    assert video.status == "PAUSED"
    assert native.status == "PAUSED"
    assert generation.status == "PAUSED"
