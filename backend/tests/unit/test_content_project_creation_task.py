import json
from unittest.mock import Mock

import pytest


def _build_content_project(db, Project, create_spine, create_workspace_set):
    project = Project(creation_type='idea', status='active')
    db.session.add(project)
    db.session.flush()
    project.content_spine = create_spine(project.id, {
        'idea_prompt': '冻结主题',
        'audience': '团队',
        'goal': '生成初稿',
    })
    project.workspaces.extend(create_workspace_set(project.id))
    db.session.flush()
    return project


def test_workspace_task_uses_frozen_spine_and_leaves_other_modes_uninitialized(
    client, app, monkeypatch,
):
    from models import Project, ProjectWorkspace, Task, WorkspaceVersion, db
    from services.content_spine_service import create_spine, revise_spine
    from services.project_workspace_service import (
        create_workspace_set,
        queue_workspace_initialization,
    )
    from services.task_manager import initialize_content_workspace_task

    ai_probe = Mock()
    monkeypatch.setattr('services.task_manager.get_ai_service', ai_probe)
    with app.app_context():
        project = _build_content_project(db, Project, create_spine, create_workspace_set)
        task = queue_workspace_initialization(
            project, 'video', require_confirmed=False,
        )
        assert next(item for item in project.workspaces if item.kind == 'video').stage == 'QUEUED'
        db.session.add(task)
        db.session.commit()
        frozen = task.get_progress()['_resume']['kwargs']

        changed = json.loads(project.content_spine.document_json)
        changed['topic']['value'] = '当前主题已改变'
        revise_spine(project.content_spine, changed, expected_revision=1)
        db.session.commit()

        initialize_content_workspace_task(task.id, **frozen)
        db.session.expire_all()
        video = ProjectWorkspace.query.filter_by(project_id=project.id, kind='video').one()
        untouched = ProjectWorkspace.query.filter(
            ProjectWorkspace.project_id == project.id,
            ProjectWorkspace.kind.in_(['ppt', 'podcast']),
        ).all()

        assert json.loads(video.document_json)['title'] == '冻结主题'
        assert video.state == 'draft'
        assert video.stage == 'DRAFT'
        assert video.revision == 1
        assert all(workspace.state == 'uninitialized' for workspace in untouched)
        assert WorkspaceVersion.query.count() == 1
        assert db.session.get(Task, task.id).status == 'COMPLETED'
        ai_probe.assert_not_called()


def test_workspace_task_hash_failure_writes_no_partial_version(client, app):
    from models import Project, Task, WorkspaceVersion, db
    from services.content_spine_service import create_spine
    from services.project_workspace_service import (
        create_workspace_set,
        queue_workspace_initialization,
    )
    from services.task_manager import initialize_content_workspace_task

    with app.app_context():
        project = _build_content_project(db, Project, create_spine, create_workspace_set)
        task = queue_workspace_initialization(
            project, 'podcast', require_confirmed=False,
        )
        assert next(item for item in project.workspaces if item.kind == 'podcast').stage == 'QUEUED'
        db.session.add(task)
        db.session.commit()
        frozen = task.get_progress()['_resume']['kwargs']
        frozen['spine_hash'] = '0' * 64

        with pytest.raises(ValueError, match='Frozen Content Spine hash'):
            initialize_content_workspace_task(task.id, **frozen)

        assert WorkspaceVersion.query.count() == 0
        assert db.session.get(Task, task.id).status == 'FAILED'
        assert next(item for item in project.workspaces if item.kind == 'podcast').stage == 'FAILED'
