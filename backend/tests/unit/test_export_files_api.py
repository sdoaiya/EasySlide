import os

from conftest import assert_error_response, assert_success_response


def _create_project_with_export(app, filename="deck.pptx", project_id="export-delete-project"):
    from models import db, Project

    with app.app_context():
        project = Project(
            id=project_id,
            creation_type="idea",
            idea_prompt="test",
            template_style="default",
            status="DRAFT",
        )
        db.session.add(project)
        db.session.commit()

        exports_dir = os.path.join(app.config["UPLOAD_FOLDER"], project.id, "exports")
        os.makedirs(exports_dir, exist_ok=True)
        export_path = os.path.join(exports_dir, filename)
        with open(export_path, "wb") as f:
            f.write(b"export file")

        return project.id, export_path


def test_delete_export_removes_file_from_disk(client, app):
    project_id, export_path = _create_project_with_export(app)

    response = client.delete(f"/api/projects/{project_id}/exports/deck.pptx")

    data = assert_success_response(response)
    assert data["data"]["filename"] == "deck.pptx"
    assert not os.path.exists(export_path)

    response = client.get(f"/api/projects/{project_id}/exports")
    data = assert_success_response(response)
    assert data["data"]["files"] == []


def test_delete_export_allows_project_theme_chinese_filename(client, app):
    project_id, export_path = _create_project_with_export(app, "年度经营复盘.pptx")

    response = client.delete(f"/api/projects/{project_id}/exports/年度经营复盘.pptx")

    data = assert_success_response(response)
    assert data["data"]["filename"] == "年度经营复盘.pptx"
    assert not os.path.exists(export_path)


def test_delete_export_rejects_path_traversal(client, app):
    project_id, export_path = _create_project_with_export(app)

    response = client.delete(f"/api/projects/{project_id}/exports/..%2Fdeck.pptx")

    assert response.status_code in {400, 404}
    assert os.path.exists(export_path)


def test_delete_export_missing_file_returns_404(client, app):
    project_id, _ = _create_project_with_export(app)

    response = client.delete(f"/api/projects/{project_id}/exports/missing.pptx")

    assert_error_response(response, 404)


def test_export_root_rejects_project_id_escape(app):
    from controllers.export_controller import _resolve_exports_root

    with app.app_context():
        assert _resolve_exports_root("..") is None


def test_clear_export_cache_removes_only_internal_project_exports(client, app):
    project_id, export_path = _create_project_with_export(app)
    project_dir = os.path.join(app.config["UPLOAD_FOLDER"], project_id)
    source_path = os.path.join(project_dir, "source.png")
    user_export_path = os.path.join(app.config["UPLOAD_FOLDER"], "user-exports", "deck.pptx")
    os.makedirs(os.path.dirname(user_export_path), exist_ok=True)
    with open(source_path, "wb") as f:
        f.write(b"source")
    with open(user_export_path, "wb") as f:
        f.write(b"downloaded copy")

    response = client.delete("/api/projects/export-cache")

    data = assert_success_response(response)["data"]
    assert data == {
        "deleted_files": 1,
        "freed_bytes": len(b"export file"),
        "cleared_projects": 1,
        "skipped_active_projects": 0,
    }
    assert not os.path.exists(export_path)
    assert os.path.exists(source_path)
    assert os.path.exists(user_export_path)


def test_clear_export_cache_skips_projects_with_active_export_tasks(client, app):
    project_id, export_path = _create_project_with_export(app, project_id="active-export-project")
    from models import db, Task

    task = Task(project_id=project_id, task_type="EXPORT_VIDEO", status="PROCESSING")
    db.session.add(task)
    db.session.commit()

    response = client.delete("/api/projects/export-cache")

    data = assert_success_response(response)["data"]
    assert data["deleted_files"] == 0
    assert data["skipped_active_projects"] == 1
    assert os.path.exists(export_path)
