import json

import pytest


def _project_with_workspaces():
    from models import Project, db
    from services.content_spine_service import create_spine
    from services.project_workspace_service import (
        create_workspace_set,
        initialize_workspace_from_snapshot,
    )

    project = Project(creation_type='idea', status='active')
    db.session.add(project)
    db.session.flush()
    project.content_spine = create_spine(project.id, {
        'idea_prompt': '版本主题',
        'audience': '产品团队',
        'goal': '恢复版本',
    })
    project.workspaces.extend(create_workspace_set(project.id))
    db.session.flush()
    spine = project.content_spine
    document = json.loads(spine.document_json)
    for kind in ('ppt', 'video', 'podcast'):
        initialize_workspace_from_snapshot(
            project.id, kind, spine.revision, spine.content_hash, document, {},
        )
    db.session.commit()
    return project


@pytest.mark.parametrize('kind', ['ppt', 'video', 'podcast'])
def test_restore_always_creates_a_new_revision(app, kind):
    from models import WorkspaceVersion, db
    from services.content_sync_service import restore_workspace
    from services.project_workspace_service import save_workspace_revision

    with app.app_context():
        project = _project_with_workspaces()
        workspace = next(item for item in project.workspaces if item.kind == kind)
        first = db.session.get(WorkspaceVersion, workspace.current_version_id)
        changed = json.loads(workspace.document_json)
        if kind == 'ppt':
            changed['page_refs'] = ['page.newer']
        else:
            changed['title'] = 'newer'
        second = save_workspace_revision(
            workspace,
            changed,
            {},
            expected_revision=1,
            source_type='manual',
        )
        result = restore_workspace(project, kind, first.id, base_revision=2)
        db.session.commit()

        assert workspace.revision == 3
        assert result['version']['revision'] == 3
        assert result['version']['source_type'] == 'restore'
        assert result['version']['parent_version_id'] == first.id
        assert result['version']['document'] == json.loads(first.document_json)
        assert second.id != workspace.current_version_id
        assert WorkspaceVersion.query.filter_by(workspace_id=workspace.id).count() == 3
