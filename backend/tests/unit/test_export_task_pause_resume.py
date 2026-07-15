from unittest.mock import patch

import pytest

from conftest import assert_success_response
from models import db, Page, Project, Task
from services.task_manager import _set_export_task_progress


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


def test_resume_interrupted_image_generation_resubmits_only_missing_pages(client):
    project = Project(
        id="resume-image-project",
        creation_type="idea",
        template_style="clean",
        image_aspect_ratio="16:9",
    )
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
    db.session.add_all([project, completed, pending])
    db.session.commit()
    task = Task(project_id=project.id, task_type="GENERATE_IMAGES", status="PAUSED")
    task.set_progress({
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
    assert task.get_progress()["page_ids"] == [pending.id]
    assert submit_task.call_args.args[-2] == [pending.id]


def test_desktop_startup_pauses_interrupted_image_generation(app):
    from app import _pause_interrupted_export_tasks

    with app.app_context():
        project = Project(id="startup-image-project", creation_type="idea")
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
        assert project.status == "DESCRIPTIONS_GENERATED"


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


@pytest.mark.parametrize("task_type", ["EXPORT_NATIVE_PPTX", "EXPORT_NATIVE_PDF", "EXPORT_NATIVE_HTML"])
def test_resume_native_export_restarts_browser_generation(client, task_type):
    project = Project(id="resume-native-project", creation_type="idea", render_mode="native")
    db.session.add(project)
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


def test_pause_active_exports_only_pauses_async_export_tasks(client):
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
    assert data["data"]["paused_count"] == 3
    assert editable.status == "PAUSED"
    assert video.status == "PAUSED"
    assert native.status == "PAUSED"
    assert generation.status == "PROCESSING"
