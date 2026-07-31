import json

import pytest
from flask import Flask
from sqlalchemy.exc import IntegrityError


@pytest.fixture
def content_db_session(tmp_path):
    from models import db

    app = Flask(__name__)
    app.config.update(
        TESTING=True,
        SQLALCHEMY_DATABASE_URI=f"sqlite:///{tmp_path / 'content-models.db'}",
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
    )
    db.init_app(app)
    with app.app_context():
        db.create_all()
        yield db.session
        db.session.remove()


def test_content_project_models_enforce_one_spine_and_workspace_kind(content_db_session):
    from models import ContentSpine, Project, ProjectWorkspace

    db_session = content_db_session
    project = Project(project_title="统一项目", creation_type="idea", status="DRAFT")
    db_session.add(project)
    db_session.flush()
    db_session.add(ContentSpine(
        project_id=project.id,
        revision=1,
        confirmed_revision=0,
        status="draft",
        document_json=json.dumps({"schema_version": 1}),
        content_hash="a" * 64,
    ))
    db_session.add(ProjectWorkspace(
        project_id=project.id,
        kind="ppt",
        state="draft",
        revision=1,
        source_kind="manual",
        settings_json="{}",
        document_json="{}",
    ))
    db_session.commit()

    db_session.add(ProjectWorkspace(
        project_id=project.id,
        kind="ppt",
        state="draft",
        revision=1,
        source_kind="manual",
        settings_json="{}",
        document_json="{}",
    ))
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_workspace_version_current_pointer_keeps_immutable_history(content_db_session):
    from models import Project, ProjectWorkspace, WorkspaceVersion

    db_session = content_db_session
    project = Project(project_title="版本项目", creation_type="idea", status="DRAFT")
    workspace = ProjectWorkspace(
        project=project,
        kind="video",
        state="draft",
        revision=1,
        source_kind="spine",
        source_revision=1,
        settings_json="{}",
        document_json='{"schema_version": 1}',
    )
    version = WorkspaceVersion(
        workspace=workspace,
        revision=1,
        document_json=workspace.document_json,
        settings_json=workspace.settings_json,
        content_hash="b" * 64,
        source_type="ai",
    )
    db_session.add(project)
    db_session.flush()
    workspace.current_version = version
    db_session.commit()

    assert workspace.current_version_id == version.id
    assert workspace.versions == [version]
    assert version.parent_version_id is None


def test_desktop_schema_helper_backfills_content_project_columns(content_db_session):
    from flask import current_app
    from app import _ensure_desktop_sqlite_schema
    from models import db

    content_db_session.execute(db.text('ALTER TABLE projects DROP COLUMN schema_version'))
    content_db_session.execute(db.text('ALTER TABLE materials DROP COLUMN media_kind'))
    content_db_session.commit()

    _ensure_desktop_sqlite_schema(current_app)

    project_columns = {
        row[1] for row in content_db_session.execute(db.text('PRAGMA table_info(projects)'))
    }
    material_columns = {
        row[1] for row in content_db_session.execute(db.text('PRAGMA table_info(materials)'))
    }
    assert 'schema_version' in project_columns
    assert 'media_kind' in material_columns


def test_desktop_schema_helper_does_not_reintroduce_cutover_removed_columns(
    content_db_session, monkeypatch,
):
    from flask import current_app
    from app import _ensure_desktop_sqlite_schema
    from models import db

    removed = (
        'render_mode', 'native_theme', 'native_image_settings',
        'pronunciation_lexicon', 'narration_preferences', 'image_aspect_ratio',
    )
    existing = {
        row[1] for row in content_db_session.execute(db.text('PRAGMA table_info(projects)'))
    }
    for name in set(removed) & existing:
        content_db_session.execute(db.text(f'ALTER TABLE projects DROP COLUMN {name}'))
    content_db_session.commit()
    monkeypatch.setenv('CONTENT_PROJECT_CUTOVER', 'true')

    _ensure_desktop_sqlite_schema(current_app)

    project_columns = {
        row[1] for row in content_db_session.execute(db.text('PRAGMA table_info(projects)'))
    }
    assert not set(removed) & project_columns
