from unittest.mock import patch

from conftest import assert_success_response
from models import db, Project, Task
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


def test_pause_active_exports_only_pauses_async_export_tasks(client):
    project = Project(id="pause-all-project", creation_type="idea")
    db.session.add(project)
    db.session.commit()
    editable = _create_export_task(project.id)
    video = _create_export_task(project.id, task_type="EXPORT_VIDEO")
    generation = _create_export_task(project.id, task_type="GENERATE_IMAGES")

    response = client.post("/api/projects/tasks/pause-active-exports")

    data = assert_success_response(response)
    db.session.refresh(editable)
    db.session.refresh(video)
    db.session.refresh(generation)
    assert data["data"]["paused_count"] == 2
    assert editable.status == "PAUSED"
    assert video.status == "PAUSED"
    assert generation.status == "PROCESSING"
