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
        'idea_prompt': '同步主题',
        'audience': '产品团队',
        'goal': '同步成稿',
    })
    project.workspaces.extend(create_workspace_set(project.id))
    db.session.flush()
    spine = project.content_spine
    document = json.loads(spine.document_json)
    for kind in ('ppt', 'video', 'podcast'):
        initialize_workspace_from_snapshot(
            project.id,
            kind,
            spine.revision,
            spine.content_hash,
            document,
            {},
        )
    db.session.commit()
    return project


def _diff(*items):
    return {'schema_version': 1, 'items': list(items)}


def _replace(item_id, path, before, after):
    return {
        'item_id': item_id,
        'path': path,
        'operation': 'replace',
        'change_type': 'content',
        'before': before,
        'after': after,
    }


def test_partial_apply_changes_only_selected_items_and_keeps_audit(app):
    from models import WorkspaceVersion, db
    from services.content_sync_service import (
        apply_sync_proposal,
        create_sync_proposal,
        reject_sync_proposal,
    )

    with app.app_context():
        project = _project_with_workspaces()
        video = next(item for item in project.workspaces if item.kind == 'video')
        original = json.loads(video.document_json)
        proposal = create_sync_proposal(
            project,
            source_kind='spine',
            target_kind='video',
            source_revision=1,
            target_base_revision=1,
            diff=_diff(
                _replace('title', '/title', original['title'], '审查后的标题'),
                _replace('ratio', '/aspect_ratio', '16:9', '9:16'),
            ),
        )
        db.session.flush()
        assert json.loads(video.document_json) == original

        result = apply_sync_proposal(
            proposal,
            selected_item_ids=['title'],
            base_revision=1,
        )
        db.session.commit()

        current = json.loads(video.document_json)
        assert current['title'] == '审查后的标题'
        assert current['aspect_ratio'] == '16:9'
        assert video.revision == 2
        assert result['proposal']['status'] == 'partially_applied'
        assert result['proposal']['resolution']['applied_item_ids'] == ['title']
        assert WorkspaceVersion.query.filter_by(workspace_id=video.id).count() == 2

        reject_sync_proposal(proposal, selected_item_ids=['ratio'])
        db.session.commit()
        assert proposal.status == 'applied'
        assert json.loads(proposal.resolution_json)['rejected_item_ids'] == ['ratio']


def test_stale_and_repeated_proposals_never_overwrite(app):
    from models import db
    from services.content_sync_service import (
        SyncProposalStateError,
        SyncRevisionConflict,
        apply_sync_proposal,
        create_sync_proposal,
    )
    from services.project_workspace_service import save_workspace_revision

    with app.app_context():
        project = _project_with_workspaces()
        video = next(item for item in project.workspaces if item.kind == 'video')
        document = json.loads(video.document_json)
        proposal = create_sync_proposal(
            project,
            source_kind='spine',
            target_kind='video',
            source_revision=1,
            target_base_revision=1,
            diff=_diff(_replace('title', '/title', document['title'], '候选标题')),
        )
        save_workspace_revision(
            video,
            {**document, 'title': '并发人工修改'},
            {},
            expected_revision=1,
            source_type='manual',
        )

        with pytest.raises(SyncRevisionConflict, match='stale'):
            apply_sync_proposal(proposal, selected_item_ids=['title'], base_revision=1)
        db.session.commit()
        assert proposal.status == 'stale'
        assert json.loads(video.document_json)['title'] == '并发人工修改'

        with pytest.raises(SyncProposalStateError):
            apply_sync_proposal(proposal, selected_item_ids=['title'], base_revision=2)


def test_deleted_target_blocks_apply_without_partial_write(app):
    from models import db
    from services.content_sync_service import apply_sync_proposal, create_sync_proposal

    with app.app_context():
        project = _project_with_workspaces()
        podcast = next(item for item in project.workspaces if item.kind == 'podcast')
        title = json.loads(podcast.document_json)['title']
        proposal = create_sync_proposal(
            project,
            source_kind='spine',
            target_kind='podcast',
            source_revision=1,
            target_base_revision=1,
            diff=_diff(_replace('title', '/title', title, '不会落地')),
        )
        db.session.flush()
        db.session.delete(podcast)
        db.session.flush()

        with pytest.raises(ValueError, match='not initialized'):
            apply_sync_proposal(proposal, selected_item_ids=['title'], base_revision=1)
        assert proposal.status == 'pending'


@pytest.mark.parametrize(
    ('source_kind', 'target_kind', 'path', 'before', 'after'),
    [
        ('video', 'spine', '/topic/value', '同步主题', '主线新主题'),
        ('spine', 'ppt', '/page_refs', [], ['page.1']),
        ('spine', 'video', '/title', '同步主题', '视频新标题'),
        ('spine', 'podcast', '/title', '同步主题', '播客新标题'),
    ],
)
def test_stable_diff_items_apply_to_every_content_target(
    app, source_kind, target_kind, path, before, after,
):
    from models import db
    from services.content_sync_service import apply_sync_proposal, create_sync_proposal

    with app.app_context():
        project = _project_with_workspaces()
        if target_kind == 'ppt':
            # PPT 工作区初始化会按内容主线预填页面，page_refs 不再恒为空列表
            ppt = next(item for item in project.workspaces if item.kind == 'ppt')
            document = json.loads(ppt.document_json)
            before = document.get('page_refs', [])
        proposal = create_sync_proposal(
            project,
            source_kind=source_kind,
            target_kind=target_kind,
            source_revision=1,
            target_base_revision=1,
            diff=_diff(_replace(f'{target_kind}.content', path, before, after)),
        )
        db.session.flush()
        result = apply_sync_proposal(
            proposal,
            selected_item_ids=[f'{target_kind}.content'],
            base_revision=1,
        )
        db.session.commit()

        assert result['proposal']['status'] == 'applied'
        assert result['proposal']['resolution']['target_revision'] == 2


def test_stable_object_id_path_survives_list_position_changes(app):
    from models import db
    from services.content_spine_service import revise_spine
    from services.content_sync_service import apply_sync_proposal, create_sync_proposal

    with app.app_context():
        project = _project_with_workspaces()
        document = json.loads(project.content_spine.document_json)
        document['sections'] = [
            {
                'section_id': 'section.0',
                'title': '插入章节',
                'summary': '',
                'key_points': [],
                'fact_refs': [],
                'source_refs': [],
            },
            {
                'section_id': 'section.1',
                'title': '目标章节',
                'summary': '',
                'key_points': [],
                'fact_refs': [],
                'source_refs': [],
            },
        ]
        revise_spine(project.content_spine, document, expected_revision=1)
        proposal = create_sync_proposal(
            project,
            source_kind='video',
            target_kind='spine',
            source_revision=1,
            target_base_revision=2,
            diff=_diff(_replace(
                'section.1.title',
                '/sections/section.1/title',
                '目标章节',
                '稳定定位后的标题',
            )),
        )
        apply_sync_proposal(
            proposal,
            selected_item_ids=['section.1.title'],
            base_revision=2,
        )
        db.session.commit()

        sections = json.loads(project.content_spine.document_json)['sections']
        assert sections[0]['title'] == '插入章节'
        assert sections[1]['title'] == '稳定定位后的标题'
