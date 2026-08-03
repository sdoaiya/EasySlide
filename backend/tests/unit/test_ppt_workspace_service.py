import json

import pytest


def test_ppt_adapter_records_lightweight_manifest_and_workspace_settings(app):
    from models import Page, Project, WorkspaceVersion, db
    from services.content_spine_service import canonical_json, create_spine, document_hash
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
        document = json.loads(project.content_spine.document_json)
        document['sections'] = [{
            'section_id': 'section.1',
            'title': '概述',
            'summary': '适配器摘要',
            'key_points': [],
            'fact_refs': [],
            'source_refs': [],
        }]
        project.content_spine.document_json = canonical_json(document)
        project.content_spine.content_hash = document_hash(document)
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
        assert manifest['page_refs'][-1] == page.id
        assert len(manifest['page_refs']) == 2
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


def test_ppt_initialization_without_sections_materializes_no_pages(app):
    """创建（AI 优化简报→下一步）时大纲未生成，不得把简报误切成伪大纲页。"""
    from models import Page, Project, WorkspaceVersion, db
    from services.content_spine_service import create_spine
    from services.project_workspace_service import create_workspace_set, initialize_workspace_from_snapshot

    with app.app_context():
        project = Project(creation_type='idea', status='active')
        db.session.add(project)
        db.session.flush()
        project.content_spine = create_spine(
            project.id,
            {'idea_prompt': '企业数字化转型方案：背景、痛点、方案、路径'},
        )
        project.workspaces.extend(create_workspace_set(project.id))
        db.session.flush()
        spine = project.content_spine

        workspace = initialize_workspace_from_snapshot(
            project.id,
            'ppt',
            spine.revision,
            spine.content_hash,
            json.loads(spine.document_json),
            {},
        )
        db.session.commit()

        assert Page.query.filter_by(project_id=project.id).count() == 0
        document = json.loads(workspace.document_json)
        assert document == {'schema_version': 1, 'page_refs': []}
        assert WorkspaceVersion.query.filter_by(workspace_id=workspace.id).count() == 1


def test_ppt_initialization_maps_confirmed_spine_sections_to_pages(app):
    from models import Page, Project, db
    from services.content_spine_service import canonical_json, create_spine, document_hash
    from services.project_workspace_service import create_workspace_set, initialize_workspace_from_snapshot

    with app.app_context():
        project = Project(creation_type='idea', status='active')
        db.session.add(project)
        db.session.flush()
        project.content_spine = create_spine(project.id, {'idea_prompt': '内容主线 PPT'})
        spine = project.content_spine
        document = json.loads(spine.document_json)
        document['sections'] = [{
            'section_id': 'section.1',
            'title': '核心观点',
            'summary': '这一页的摘要',
            'key_points': ['第一条'],
            'fact_refs': [],
            'source_refs': [],
        }]
        spine.document_json = canonical_json(document)
        spine.content_hash = document_hash(document)
        project.workspaces.extend(create_workspace_set(project.id))
        db.session.flush()

        workspace = initialize_workspace_from_snapshot(
            project.id,
            'ppt',
            spine.revision,
            spine.content_hash,
            document,
            {},
        )
        db.session.commit()

        page = Page.query.filter_by(project_id=project.id).one()
        assert page.get_outline_content() == {'title': '核心观点', 'points': ['第一条']}
        assert page.get_description_content() == {'text': '这一页的摘要'}
        assert json.loads(workspace.document_json)['page_refs'] == [page.id]


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
