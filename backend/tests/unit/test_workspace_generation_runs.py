"""Workspace generation runs: brief/PPT snapshots, state machine, publish.

Reconstruction plan §16.1 focused suite: brief snapshot adapter, PPT source
freezing, legal/illegal transitions, idempotent publish, rollback safety,
staleness detection, V1→V2 adapters and the API shells.
"""

import json
from pathlib import Path

import pytest

from backend.tests.content_project_factory import add_content_project

_SHARED_DIR = Path(__file__).resolve().parents[3] / 'shared' / 'content'


@pytest.fixture(autouse=True)
def _clean_tables(app):
    """本套件直接使用 app 会话级 fixture，测试间手动清表保持隔离。"""
    from models import db

    with app.app_context():
        db.session.rollback()
        for table in reversed(db.metadata.sorted_tables):
            db.session.execute(table.delete())
        db.session.commit()


def _project_with_ppt(app, *, title='生成运行项目', pages=2):
    from models import Page, Project, db

    with app.app_context():
        project = Project(
            id=f'gen-{title}-{pages}',
            project_title=title,
            creation_type='idea',
            status='active',
        )
        add_content_project(project)
        # 工作区初始化会按内容主线预填 1 页；本用例构造自己的页面，先移除预填页
        Page.query.filter_by(project_id=project.id).delete(synchronize_session=False)
        for index in range(pages):
            page = Page(
                project_id=project.id,
                order_index=index,
                status='COMPLETED',
            )
            page.set_outline_content({'title': f'页面 {index + 1}', 'points': ['要点']})
            page.set_description_content({'text': f'第 {index + 1} 页的描述内容。'})
            page.set_narration_segments([{'speaker_id': 'host', 'text': f'旁白 {index + 1}'}])
            db.session.add(page)
        db.session.commit()
        return project.id


def _video_candidate(document):
    from services.video_workspace_service import build_video_document_from_spine

    return build_video_document_from_spine(document, {})


def _review_ready(run):
    """Advance a PENDING run to REVIEW_READY through the legal path."""
    from services.workspace_generation_service import transition_run

    transition_run(run, 'RUNNING')
    transition_run(run, 'REVIEW_READY')
    return run


def _podcast_candidate(document):
    from services.podcast_service import build_podcast_document_from_spine

    return build_podcast_document_from_spine(document, {
        'format': 'dialogue',
        'speakers': [
            {'speaker_id': 'host', 'name': '主持人', 'voice_ref': 'edge:zh-CN-XiaoxiaoNeural'},
            {'speaker_id': 'guest', 'name': '嘉宾', 'voice_ref': 'edge:zh-CN-YunxiNeural'},
        ],
    })


@pytest.fixture()
def enabled(monkeypatch):
    monkeypatch.setenv('WORKSPACE_GENERATION_RUNS_ENABLED', 'true')


class TestBriefSnapshot:
    def test_brief_snapshot_adapts_legacy_spine_data_and_is_stable(self, app):
        from models import Project, db
        from services.content_spine_service import revise_spine
        from services.project_brief_service import get_project_brief_snapshot

        with app.app_context():
            project = Project(
                project_title='季度复盘',
                creation_type='idea',
                status='active',
            )
            db.session.add(project)
            db.session.flush()
            project.content_spine = __import__(
                'services.content_spine_service', fromlist=['create_spine'],
            ).create_spine(project.id, {
                'idea_prompt': '复盘本季度业务进展',
                'audience': '管理层',
                'goal': '形成下一步行动共识',
            })
            db.session.commit()

            first = get_project_brief_snapshot(project)
            second = get_project_brief_snapshot(project)

            assert first['schema_version'] == 1
            assert first['topic'] == '复盘本季度业务进展'
            assert first['audience'] == '管理层'
            assert first['goal'] == '形成下一步行动共识'
            assert first['title'] == '季度复盘'
            assert first['source_text'] == '复盘本季度业务进展'
            assert first['revision'] == 1
            assert len(first['content_hash']) == 64
            assert first['content_hash'] == second['content_hash']

            revise_spine(
                project.content_spine,
                json.loads(project.content_spine.document_json),
                expected_revision=1,
            )
            db.session.commit()
            changed = get_project_brief_snapshot(project)
            assert changed['revision'] == 2
            assert changed['content_hash'] != first['content_hash']


class TestPptSourceSnapshot:
    def test_freezes_selected_pages_with_hashes(self, app):
        from models import db
        from services.workspace_generation_service import build_ppt_source_snapshot

        with app.app_context():
            project_id = _project_with_ppt(app, pages=3)
            project = db.session.get(__import__('models', fromlist=['Project']).Project, project_id)
            snapshot = build_ppt_source_snapshot(project)

            assert snapshot['source_kind'] == 'ppt'
            assert snapshot['workspace_revision'] == 1
            assert snapshot['workspace_version_id']
            assert len(snapshot['pages']) == 3
            first = snapshot['pages'][0]
            assert first['title'] == '页面 1'
            assert first['narration'] == [{'speaker_id': 'host', 'text': '旁白 1'}]
            assert first['source_hash'] and len(first['source_hash']) == 64
            assert snapshot['content_hash'] and len(snapshot['content_hash']) == 64
            assert build_ppt_source_snapshot(project)['content_hash'] == snapshot['content_hash']

            partial = build_ppt_source_snapshot(project, page_ids=[snapshot['pages'][1]['page_id']])
            assert len(partial['pages']) == 1
            assert partial['content_hash'] != snapshot['content_hash']

    def test_rejects_unknown_page_ids(self, app):
        from models import db
        from services.workspace_generation_service import (
            GenerationRunError,
            build_ppt_source_snapshot,
        )

        with app.app_context():
            project = db.session.get(__import__('models', fromlist=['Project']).Project, _project_with_ppt(app))
            with pytest.raises(GenerationRunError):
                build_ppt_source_snapshot(project, page_ids=['page-missing'])


class TestStateMachine:
    def test_legal_and_illegal_transitions(self, app):
        from models import Project, WorkspaceGenerationRun, db
        from services.workspace_generation_service import (
            GenerationRunStateError,
            create_generation_run,
            transition_run,
        )

        with app.app_context():
            project = db.session.get(Project, _project_with_ppt(app))
            run = create_generation_run(
                project, target_workspace_kind='video', source_kind='brief',
                mode='direct',
            )
            assert run.status == 'PENDING'
            for status in ('RUNNING', 'REVIEW_READY', 'PUBLISHING', 'PUBLISHED'):
                transition_run(run, status)
            assert run.status == 'PUBLISHED'

            with pytest.raises(GenerationRunStateError):
                transition_run(run, 'CANCELLED')

            fresh = create_generation_run(
                db.session.get(Project, project.id), target_workspace_kind='podcast',
                source_kind='brief', mode='direct',
            )
            with pytest.raises(GenerationRunStateError):
                transition_run(fresh, 'REVIEW_READY')  # PENDING → REVIEW_READY 非法
            transition_run(fresh, 'CANCELLED')

    def test_duplicate_active_run_rejected(self, app):
        from models import Project, db
        from services.workspace_generation_service import (
            GenerationAlreadyActive,
            create_generation_run,
        )

        with app.app_context():
            project = db.session.get(Project, _project_with_ppt(app))
            create_generation_run(
                project, target_workspace_kind='video', source_kind='brief', mode='direct',
            )
            with pytest.raises(GenerationAlreadyActive):
                create_generation_run(
                    project, target_workspace_kind='video', source_kind='brief', mode='direct',
                )

    def test_ppt_run_freezes_selected_pages(self, app):
        from models import Project, WorkspaceGenerationRun, db
        from services.workspace_generation_service import create_generation_run

        with app.app_context():
            project = db.session.get(Project, _project_with_ppt(app))
            run = create_generation_run(
                project, target_workspace_kind='video', source_kind='ppt',
                mode='ai_adapt', options={'page_ids': []},
                page_ids=[],
            )
            snapshot = json.loads(run.source_snapshot_json)
            assert snapshot['source_kind'] == 'ppt'
            assert len(snapshot['pages']) == 2
            assert run.source_workspace_id
            assert run.source_version_id
            assert run.target_workspace_kind == 'video'
            assert WorkspaceGenerationRun.query.count() >= 1


class TestPublish:
    def test_publish_is_idempotent_and_updates_workspace_once(self, app):
        from models import Project, ProjectWorkspace, WorkspaceVersion, db
        from services.workspace_generation_service import (
            create_generation_run,
            publish_run,
            set_candidate,
            transition_run,
        )

        with app.app_context():
            project = db.session.get(Project, _project_with_ppt(app))
            run = create_generation_run(
                project, target_workspace_kind='podcast', source_kind='brief', mode='direct',
            )
            candidate = _podcast_candidate(json.loads(project.content_spine.document_json))
            set_candidate(run, candidate)
            _review_ready(run)
            db.session.commit()

            first = publish_run(run, project)
            workspace = db.session.get(ProjectWorkspace, run.target_workspace_id)

            assert first.status == 'PUBLISHED'
            assert first.published_version_id
            assert workspace.current_version_id == first.published_version_id
            assert workspace.revision == 1
            assert workspace.state == 'ready'
            assert workspace.source_kind == 'manual'
            assert workspace.source_ref == f'generation-run:{run.id}'
            assert WorkspaceVersion.query.filter_by(workspace_id=workspace.id).count() == 1

            second = publish_run(run, project)
            assert second.published_version_id == first.published_version_id
            assert WorkspaceVersion.query.filter_by(workspace_id=workspace.id).count() == 1

    def test_publish_without_candidate_rejected(self, app):
        from models import Project, db
        from services.workspace_generation_service import (
            GenerationRunError,
            create_generation_run,
            publish_run,
            transition_run,
        )

        with app.app_context():
            project = db.session.get(Project, _project_with_ppt(app))
            run = create_generation_run(
                project, target_workspace_kind='video', source_kind='brief', mode='direct',
            )
            _review_ready(run)
            db.session.commit()
            with pytest.raises(GenerationRunError):
                publish_run(run, project)

    def test_publish_failure_keeps_workspace_untouched(self, app, monkeypatch):
        from models import Project, ProjectWorkspace, WorkspaceVersion, db
        from services.workspace_generation_service import (
            create_generation_run,
            publish_run,
            set_candidate,
            transition_run,
        )

        with app.app_context():
            project = db.session.get(Project, _project_with_ppt(app))
            run = create_generation_run(
                project, target_workspace_kind='podcast', source_kind='brief', mode='direct',
            )
            candidate = _podcast_candidate(json.loads(project.content_spine.document_json))
            set_candidate(run, candidate)
            _review_ready(run)
            db.session.commit()
            workspace = db.session.get(ProjectWorkspace, run.target_workspace_id)

            def boom(*_args, **_kwargs):
                raise RuntimeError('磁盘写入失败')

            monkeypatch.setattr(
                'services.workspace_generation_service.WorkspaceVersion',
                type('BrokenVersion', (), {'__init__': boom}),
            )
            with pytest.raises(RuntimeError):
                publish_run(run, project)

            db.session.expire_all()
            workspace = db.session.get(ProjectWorkspace, run.target_workspace_id)
            run = db.session.get(type(run), run.id)
            assert workspace.current_version_id is None
            assert workspace.revision == 0
            assert run.status == 'FAILED'
            assert run.error_code == 'PUBLISH_FAILED'

    def test_stale_detection_marks_review_ready_run(self, app):
        from models import Page, Project, db
        from services.workspace_generation_service import (
            create_generation_run,
            mark_stale_if_source_changed,
            set_candidate,
            transition_run,
        )

        with app.app_context():
            project = db.session.get(Project, _project_with_ppt(app))
            run = create_generation_run(
                project, target_workspace_kind='video', source_kind='ppt', mode='ai_adapt',
                page_ids=[],
            )
            snapshot = json.loads(run.source_snapshot_json)
            candidate = _video_candidate(json.loads(project.content_spine.document_json))
            set_candidate(run, candidate)
            _review_ready(run)
            db.session.commit()

            # 源 PPT 发生变化：旧候选标记 STALE，但候选内容不被覆盖
            page = Page.query.filter_by(project_id=project.id).first()
            page.set_outline_content({'title': '标题已修改', 'points': []})
            db.session.commit()

            assert mark_stale_if_source_changed(run, project) is True
            assert run.status == 'STALE'
            assert run.candidate_document_json == json.dumps(
                candidate, ensure_ascii=False, sort_keys=True, separators=(',', ':'),
            )


class TestV1V2Adapters:
    def test_video_v1_to_v2_adapter_and_schema(self):
        from jsonschema import Draft202012Validator
        from services.video_workspace_service import upgrade_video_document_v1_to_v2

        v1 = {
            'schema_version': 1,
            'title': '旧视频',
            'aspect_ratio': '16:9',
            'scenes': [{
                'scene_id': 'scene.1',
                'title': '开场',
                'visual': {'kind': 'page', 'source_ref': 'page-1', 'source_revision': 3},
                'narration': {
                    'mode': 'single',
                    'text': '开场旁白',
                    'segments': [{'segment_id': 'seg.1', 'speaker_id': 'host', 'text': '开场旁白'}],
                },
                'subtitles': {'enabled': True, 'text': '开场字幕'},
                'duration_ms': 5000,
                'transition': 'fade',
                'animation': {'intensity': 'subtle', 'cues': [{'t': 1}]},
                'audio_cues': [],
            }],
        }
        v2 = upgrade_video_document_v1_to_v2(v1)

        assert v2['schema_version'] == 2
        scene = v2['scenes'][0]
        assert scene['source'] == {
            'kind': 'ppt_page', 'ref': 'page-1', 'revision': 3, 'content_hash': None,
        }
        assert scene['script']['text'] == '开场旁白'
        assert scene['visual'] == {
            'kind': 'ppt_page', 'asset_ref': 'page-1', 'prompt': '', 'fit': 'contain',
        }
        assert scene['transition'] == {'type': 'fade', 'duration_ms': 400}
        assert scene['motion']['intensity'] == 'subtle'
        assert scene['voice'] == {
            'voice_profile_id': None, 'expressiveness_id': 'expression.standard.v1',
        }
        schema = Draft202012Validator(json.loads(
            (_SHARED_DIR / 'video-workspace-v2.schema.json').read_text(encoding='utf-8'),
        ))
        assert not list(schema.iter_errors(v2)), 'V2 文档必须通过 V2 schema'

    def test_podcast_v1_to_v2_adapter_and_schema(self):
        from jsonschema import Draft202012Validator
        from services.podcast_service import upgrade_podcast_document_v1_to_v2

        v1 = {
            'schema_version': 1,
            'title': '旧播客',
            'format': 'dialogue',
            'language': 'zh-CN',
            'speakers': [
                {'speaker_id': 'host', 'name': '主持人', 'voice_ref': 'edge:zh-CN-XiaoxiaoNeural'},
                {'speaker_id': 'guest', 'name': '嘉宾', 'voice_ref': 'edge:zh-CN-YunxiNeural'},
            ],
            'segments': [{
                'segment_id': 'segment.1',
                'speaker_id': 'host',
                'text': '开场白',
                'locked': False,
                'source_kind': 'transcript',
                'source_ref': '/files/materials/script.md',
                'audio_cues': [],
            }],
            'mixing': {'bgm_asset_ref': None, 'ducking': True, 'fade_in_ms': 500, 'fade_out_ms': 500},
            'cover': {'asset_ref': None, 'title': '封面', 'subtitle': '第一期'},
        }
        v2 = upgrade_podcast_document_v1_to_v2(v1)

        assert v2['schema_version'] == 2
        assert v2['speakers'][0]['voice_profile_id'] == 'edge:zh-CN-XiaoxiaoNeural'
        assert v2['speakers'][0]['expressiveness_id'] == 'expression.standard.v1'
        segment = v2['segments'][0]
        assert segment['source'] == {
            'kind': 'transcript', 'ref': '/files/materials/script.md', 'content_hash': None,
        }
        schema = Draft202012Validator(json.loads(
            (_SHARED_DIR / 'podcast-workspace-v2.schema.json').read_text(encoding='utf-8'),
        ))
        assert not list(schema.iter_errors(v2)), 'V2 文档必须通过 V2 schema'


class TestGenerationRunApi:
    def test_feature_switch_gates_run_creation(self, client, app, monkeypatch):
        monkeypatch.setenv('WORKSPACE_GENERATION_RUNS_ENABLED', 'false')
        project_id = client.post('/api/projects', json={
            'creation_type': 'idea',
            'idea_prompt': '开关测试',
            'initial_workspace': 'ppt',
        }).get_json()['data']['project_id']

        response = client.post(
            f'/api/projects/{project_id}/workspace-generation-runs',
            json={'target_workspace_kind': 'video', 'source_kind': 'brief', 'mode': 'direct'},
        )
        assert response.status_code == 403
        assert response.get_json()['error']['code'] == 'FEATURE_DISABLED'

    def test_create_list_control_and_publish_flow(self, client, app, enabled):
        from models import WorkspaceGenerationRun, db
        from services.workspace_generation_service import set_candidate, transition_run

        # 任务由本用例自行驱动，拦截后台线程提交
        from controllers import workspace_generation_controller as controller
        controller.task_manager.submit_task = lambda *a, **k: None
        try:
            project_id = client.post('/api/projects', json={
                'creation_type': 'idea',
                'idea_prompt': '完整流程',
                'initial_workspace': 'ppt',
            }).get_json()['data']['project_id']

            created = client.post(
                f'/api/projects/{project_id}/workspace-generation-runs',
                json={
                    'target_workspace_kind': 'video',
                    'source_kind': 'brief',
                    'mode': 'direct',
                    'options': {'aspect_ratio': '16:9'},
                },
            )
        finally:
            del controller.task_manager.submit_task
        assert created.status_code == 202
        data = created.get_json()['data']
        assert data['status'] == 'PENDING'
        assert data['result_route'].startswith(f'/project/{project_id}/video/review/')
        run_id = data['run_id']

        listing = client.get(
            f'/api/projects/{project_id}/workspace-generation-runs?target_kind=video',
        )
        assert listing.status_code == 200
        assert listing.get_json()['data']['total'] == 1

        detail = client.get(f'/api/projects/{project_id}/workspace-generation-runs/{run_id}')
        assert detail.status_code == 200
        assert detail.get_json()['data']['source_summary']['topic'] == '完整流程'

        # 无候选时发布被拒绝
        with app.app_context():
            run = db.session.get(WorkspaceGenerationRun, run_id)
            _review_ready(run)
            db.session.commit()
        rejected = client.post(
            f'/api/projects/{project_id}/workspace-generation-runs/{run_id}/publish',
        )
        assert rejected.status_code == 400

        with app.app_context():
            run = db.session.get(WorkspaceGenerationRun, run_id)
            from services.video_workspace_service import build_video_document_from_spine
            from models import Project
            project = db.session.get(Project, project_id)
            set_candidate(
                run, build_video_document_from_spine(
                    json.loads(project.content_spine.document_json), {},
                ),
            )
            db.session.commit()

        published = client.post(
            f'/api/projects/{project_id}/workspace-generation-runs/{run_id}/publish',
        )
        assert published.status_code == 200
        assert published.get_json()['data']['status'] == 'PUBLISHED'
        assert published.get_json()['data']['published_version_id']

        # 已发布运行不能再取消
        cancelled = client.post(
            f'/api/projects/{project_id}/workspace-generation-runs/{run_id}/cancel',
        )
        assert cancelled.status_code == 409

        invalid = client.post(
            f'/api/projects/{project_id}/workspace-generation-runs',
            json={'target_workspace_kind': 'ppt', 'source_kind': 'brief', 'mode': 'direct'},
        )
        assert invalid.status_code == 400
