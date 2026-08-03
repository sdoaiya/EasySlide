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


def test_confirm_materializes_source_sections_without_changing_revision(client, app):
    from models import Project, db
    from services.content_spine_service import confirm_spine, create_spine

    with app.app_context():
        project = Project(creation_type='idea', status='active')
        db.session.add(project)
        db.session.flush()
        spine = create_spine(project.id, {
            'idea_prompt': '第一部分：背景\n现状说明。\n\n第二部分：方案\n落地路径。',
        })
        assert json.loads(spine.document_json)['sections'] == []

        confirm_spine(spine, expected_revision=1)

        document = json.loads(spine.document_json)
        assert spine.revision == 1
        assert spine.status == 'confirmed'
        assert [item['title'] for item in document['sections']] == ['背景', '方案']


def test_workspace_adapters_do_not_materialize_raw_source_fallback():
    """raw-source 回退只用于预览/确认提升；工作区物化必须等待结构化章节，
    否则创建后会把整段简报误切成伪大纲页/场景。"""
    from services.content_spine_service import get_spine_sections
    from services.podcast_service import build_podcast_document_from_spine
    from services.video_workspace_service import build_video_document_from_spine

    spine = {
        'topic': {'value': '视频播客首版'},
        'sections': [],
        'sources': [{
            'source_id': 'input.idea_prompt',
            'kind': 'prompt',
            'content': '第一部分：背景\n- 现状\n第二部分：方案\n说明落地路径。',
        }],
    }

    sections = get_spine_sections(spine)
    assert [item['title'] for item in sections] == ['背景', '方案']
    assert sections[0]['key_points'] == ['现状']
    assert build_video_document_from_spine(spine)['scenes'] == []
    assert build_podcast_document_from_spine(spine)['segments'] == []

    spine['sections'] = [{
        'section_id': 'section.1',
        'title': '结构化章节',
        'summary': '摘要',
        'key_points': [],
        'fact_refs': [],
        'source_refs': [],
    }]
    assert len(build_video_document_from_spine(spine)['scenes']) == 1
    assert len(build_podcast_document_from_spine(spine)['segments']) == 1
