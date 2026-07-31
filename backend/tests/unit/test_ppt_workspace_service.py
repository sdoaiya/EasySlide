import json

import pytest


def test_ppt_adapter_records_lightweight_manifest_and_workspace_settings(app):
    from models import Page, Project, WorkspaceVersion, db
    from services.content_spine_service import create_spine
    from services.ppt_workspace_service import (
        get_ppt_settings,
        get_ppt_status,
        record_ppt_revision,
        set_ppt_status,
    )
    from services.project_workspace_service import (
        create_workspace_set,
        initialize_workspace_from_snapshot,
    )

    with app.app_context():
        project = Project(creation_type='idea', status='active')
        db.session.add(project)
        db.session.flush()
        project.content_spine = create_spine(project.id, {'idea_prompt': 'PPT adapter'})
        project.workspaces.extend(create_workspace_set(project.id))
        db.session.flush()
        spine = project.content_spine
        initialize_workspace_from_snapshot(
            project.id,
            'ppt',
            spine.revision,
            spine.content_hash,
            json.loads(spine.document_json),
            {'render_mode': 'native', 'native_theme': 'theme03'},
        )
        page = Page(project_id=project.id, order_index=0, status='DRAFT')
        page.set_outline_content({'title': '第一页', 'points': []})
        db.session.add(page)
        db.session.flush()

        version = record_ppt_revision(
            project,
            'page.create',
            changed_page_ids=[page.id],
        )
        db.session.commit()

        assert version.revision == 2
        assert version.source_type == 'manual'
        assert version.parent_version_id is not None
        manifest = json.loads(version.document_json)
        assert manifest['operation'] == 'page.create'
        assert manifest['page_refs'] == [page.id]
        assert manifest['changed_page_ids'] == [page.id]
        assert get_ppt_settings(project)['render_mode'] == 'native'
        assert get_ppt_settings(project)['native_theme'] == 'theme03'
        assert get_ppt_status(project) == 'DRAFT'
        set_ppt_status(project, 'NATIVE_DECK_GENERATED')
        assert get_ppt_status(project) == 'NATIVE_DECK_GENERATED'
        assert version.workspace.state == 'ready'
        assert WorkspaceVersion.query.filter_by(
            workspace_id=version.workspace_id,
        ).count() == 2


def test_project_without_workspace_is_rejected(app):
    from models import Project, db
    from services.ppt_workspace_service import get_ppt_settings, record_ppt_revision

    with app.app_context():
        project = Project(creation_type='idea', status='active')
        db.session.add(project)
        db.session.flush()

        with pytest.raises(ValueError, match='ppt workspace is missing'):
            get_ppt_settings(project)
        with pytest.raises(ValueError, match='ppt workspace is not initialized'):
            record_ppt_revision(project, 'page.update')
