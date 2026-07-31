import json

import pytest


def test_content_spine_revision_confirmation_and_workspace_gate(client, app):
    from models import Project, db
    from services.content_spine_service import (
        SpineRevisionConflict,
        confirm_spine,
        create_spine,
        revise_spine,
    )
    from services.project_workspace_service import (
        SpineNotConfirmed,
        create_workspace_set,
        queue_workspace_initialization,
    )

    with app.app_context():
        project = Project(creation_type='idea', status='active')
        db.session.add(project)
        db.session.flush()
        project.content_spine = create_spine(project.id, {
            'idea_prompt': '统一内容项目',
            'audience': '产品团队',
            'goal': '说明升级路径',
        })
        project.workspaces.extend(create_workspace_set(project.id))
        db.session.flush()

        with pytest.raises(SpineNotConfirmed):
            queue_workspace_initialization(
                project, 'video', require_confirmed=True,
            )

        document = json.loads(project.content_spine.document_json)
        document['goal']['value'] = '交付统一工作区'
        revise_spine(project.content_spine, document, expected_revision=1)
        with pytest.raises(SpineRevisionConflict):
            confirm_spine(project.content_spine, expected_revision=1)
        confirm_spine(project.content_spine, expected_revision=2)
        task = queue_workspace_initialization(
            project, 'video', require_confirmed=True,
        )

        assert project.content_spine.status == 'confirmed'
        assert project.content_spine.confirmed_revision == 2
        assert len(project.workspaces) == 3
        assert task.get_progress()['_resume']['kwargs']['spine_revision'] == 2


def test_content_spine_rejects_invalid_document_before_mutating(client, app):
    from models import Project, db
    from services.content_spine_service import create_spine, revise_spine

    with app.app_context():
        project = Project(creation_type='idea', status='active')
        db.session.add(project)
        db.session.flush()
        spine = create_spine(project.id, {'idea_prompt': '主题'})
        original_hash = spine.content_hash
        invalid = json.loads(spine.document_json)
        del invalid['topic']

        with pytest.raises(ValueError, match='Invalid Content Spine'):
            revise_spine(spine, invalid, expected_revision=1)

        assert spine.revision == 1
        assert spine.content_hash == original_hash


def test_content_spine_source_fields_preserve_legacy_api_values(client, app):
    from models import Project, db
    from services.content_spine_service import (
        create_spine,
        get_spine_source_fields,
        update_spine_source_fields,
    )

    with app.app_context():
        project = Project(creation_type='outline', status='DRAFT')
        db.session.add(project)
        db.session.flush()
        project.content_spine = create_spine(project.id, {
            'idea_prompt': '初始主题',
            'outline_text': '第一章',
        })

        update_spine_source_fields(project.content_spine, {
            'idea_prompt': '更新主题',
            'description_text': '完整描述',
        })

        assert get_spine_source_fields(project) == {
            'idea_prompt': '更新主题',
            'outline_text': '第一章',
            'description_text': '完整描述',
        }
        assert project.content_spine.revision == 2
