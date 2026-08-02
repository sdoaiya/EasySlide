"""Workspace candidate generation pipeline (reconstruction plan §16.1).

Focused suite for stage 2: task input carries only the run id, the frozen
snapshot drives candidate building, pause/resume/cancel/retry and restart
recovery behave, and cancelled/failed tasks never touch the formal
workspace.
"""

import json

import pytest

from backend.tests.content_project_factory import add_content_project


def _project_id(client, *, topic='流水线测试'):
    return client.post('/api/projects', json={
        'creation_type': 'idea',
        'idea_prompt': topic,
        'initial_workspace': 'ppt',
    }).get_json()['data']['project_id']


def _create_run(client, project_id, **overrides):
    payload = {
        'target_workspace_kind': 'video',
        'source_kind': 'brief',
        'mode': 'direct',
        'options': {'target_duration_seconds': 60},
    }
    payload.update(overrides)
    response = client.post(
        f'/api/projects/{project_id}/workspace-generation-runs', json=payload,
    )
    return response


@pytest.fixture()
def enabled(monkeypatch):
    monkeypatch.setenv('WORKSPACE_GENERATION_RUNS_ENABLED', 'true')


class TestPipelineTask:
    def test_create_run_submits_task_with_only_run_id(self, client, app, enabled):
        from controllers import workspace_generation_controller as controller

        calls = []
        controller.task_manager.submit_task = lambda task_id, func, **kwargs: calls.append(
            (task_id, kwargs)
        )
        try:
            project_id = _project_id(client)
            response = _create_run(client, project_id)
            assert response.status_code == 202
            data = response.get_json()['data']
            run_id = data['run_id']

            # 任务输入只保存运行 ID（过滤项目创建时的工作区初始化任务）
            candidate_calls = [item for item in calls if 'run_id' in item[1]]
            assert len(candidate_calls) == 1
            task_id, kwargs = candidate_calls[0]
            assert kwargs['run_id'] == run_id
            assert 'app' in kwargs

            from models import Task, WorkspaceGenerationRun, db
            with app.app_context():
                task = db.session.get(Task, task_id)
                run = db.session.get(WorkspaceGenerationRun, run_id)
                assert run.task_id == task_id
                resume = task.get_progress()['_resume']
                assert resume['kind'] == 'workspace-candidate'
                assert resume['kwargs'] == {'run_id': run_id}
        finally:
            del controller.task_manager.submit_task

    def test_task_generates_real_candidate_and_progress_contract(self, client, app, enabled):
        from models import Task, WorkspaceGenerationRun, db
        from services.task_manager import generate_workspace_candidate_task
        from controllers import workspace_generation_controller as controller

        controller.task_manager.submit_task = lambda *a, **k: None
        try:
            project_id = _project_id(client, topic='第一步：背景\n\n第二步：方案\n\n第三步：行动')
            run_response = _create_run(client, project_id)
            run_id = run_response.get_json()['data']['run_id']
        finally:
            del controller.task_manager.submit_task

        with app.app_context():
            run = db.session.get(WorkspaceGenerationRun, run_id)
            task_id = run.task_id
        generate_workspace_candidate_task(task_id, run_id=run_id, app=app)

        with app.app_context():
            run = db.session.get(WorkspaceGenerationRun, run_id)
            task = db.session.get(Task, task_id)
            assert run.status == 'REVIEW_READY'
            assert run.candidate_document_json
            assert run.candidate_hash
            candidate = json.loads(run.candidate_document_json)
            assert candidate['schema_version'] == 1
            assert [scene['title'] for scene in candidate['scenes']] == [
                '第一步：背景', '第二步：方案', '第三步：行动',
            ]
            assert task.status == 'COMPLETED'
            progress = task.get_progress()
            assert {'stage', 'total', 'completed', 'failed', 'item_ids'} <= set(progress)
            assert progress['total'] == 1 and progress['completed'] == 1
            assert len(progress['item_ids']) == 3

        published = client.post(
            f'/api/projects/{project_id}/workspace-generation-runs/{run_id}/publish',
        )
        assert published.status_code == 200
        assert published.get_json()['data']['status'] == 'PUBLISHED'

    def test_ppt_run_reads_frozen_snapshot_not_live_pages(self, client, app, enabled):
        from models import Page, Project, db
        from services.task_manager import generate_workspace_candidate_task
        from controllers import workspace_generation_controller as controller

        controller.task_manager.submit_task = lambda *a, **k: None
        try:
            with app.app_context():
                project = Project(
                    project_title='快照冻结', creation_type='idea', status='active',
                )
                db.session.add(project)
                db.session.flush()
                add_content_project(project)
                Page.query.filter_by(project_id=project.id).delete(synchronize_session=False)
                for index in range(2):
                    page = Page(project_id=project.id, order_index=index, status='COMPLETED')
                    page.set_outline_content({'title': f'页面 {index + 1}', 'points': []})
                    page.set_description_content({'text': f'冻结内容 {index + 1}'})
                    db.session.add(page)
                db.session.commit()
                project_id = project.id
            run_response = _create_run(client, project_id, source_kind='ppt', mode='ai_adapt', options={})
            run_id = run_response.get_json()['data']['run_id']
        finally:
            del controller.task_manager.submit_task

        with app.app_context():
            run = db.session.get(__import__('models', fromlist=['WorkspaceGenerationRun']).WorkspaceGenerationRun, run_id)
            task_id = run.task_id
        generate_workspace_candidate_task(task_id, run_id=run_id, app=app)

        with app.app_context():
            run = db.session.get(__import__('models', fromlist=['WorkspaceGenerationRun']).WorkspaceGenerationRun, run_id)
            candidate = json.loads(run.candidate_document_json)
            scene_ids = [scene['visual']['source_ref'] for scene in candidate['scenes']]
            assert run.status == 'REVIEW_READY'
            assert len(scene_ids) == 2

            # 冻结后修改源页面，候选保持不变（快照不可变）
            from services.workspace_generation_service import mark_stale_if_source_changed
            project = db.session.get(Project, project_id)
            page = Page.query.filter_by(project_id=project_id).first()
            page.set_outline_content({'title': '已修改', 'points': []})
            db.session.commit()
            assert mark_stale_if_source_changed(run, project) is True
            assert run.status == 'STALE'
            after = json.loads(run.candidate_document_json)
            assert [scene['title'] for scene in after['scenes']] == [c['title'] for c in candidate['scenes']]

    def test_cancelled_run_aborts_task_without_version(self, client, app, enabled):
        from models import Task, WorkspaceVersion, db
        from services.task_manager import generate_workspace_candidate_task

        from controllers import workspace_generation_controller as controller
        controller.task_manager.submit_task = lambda *a, **k: None
        try:
            project_id = _project_id(client)
            run_response = _create_run(client, project_id)
            run_id = run_response.get_json()['data']['run_id']
        finally:
            del controller.task_manager.submit_task

        cancelled = client.post(
            f'/api/projects/{project_id}/workspace-generation-runs/{run_id}/cancel',
        )
        assert cancelled.status_code == 200
        with app.app_context():
            from models import WorkspaceGenerationRun
            run = db.session.get(WorkspaceGenerationRun, run_id)
            task_id = run.task_id
        generate_workspace_candidate_task(task_id, run_id=run_id, app=app)

        with app.app_context():
            from models import WorkspaceGenerationRun
            run = db.session.get(WorkspaceGenerationRun, run_id)
            task = db.session.get(Task, task_id)
            assert run.status == 'CANCELLED'
            assert task.status == 'CANCELLED'
            assert WorkspaceVersion.query.count() == 0

    def test_failed_task_maps_429_then_retry_recovers(self, client, app, enabled, monkeypatch):
        from types import SimpleNamespace

        from models import Task, WorkspaceGenerationRun, db
        from services.task_manager import generate_workspace_candidate_task

        from controllers import workspace_generation_controller as controller
        controller.task_manager.submit_task = lambda *a, **k: None
        try:
            project_id = _project_id(client)
            run_response = _create_run(client, project_id)
            run_id = run_response.get_json()['data']['run_id']
        finally:
            del controller.task_manager.submit_task
        with app.app_context():
            run = db.session.get(WorkspaceGenerationRun, run_id)
            task_id = run.task_id

        error = RuntimeError('429 Client Error')
        error.response = SimpleNamespace(status_code=429)
        monkeypatch.setattr(
            'services.video_workspace_service.build_video_document_from_brief',
            lambda *a, **k: (_ for _ in ()).throw(error),
        )
        with pytest.raises(RuntimeError):
            generate_workspace_candidate_task(task_id, run_id=run_id, app=app)

        with app.app_context():
            run = db.session.get(WorkspaceGenerationRun, run_id)
            task = db.session.get(Task, task_id)
            assert run.status == 'FAILED'
            assert run.error_code == 'RATE_LIMIT_EXCEEDED'
            assert '稍后重试' in run.error_message
            assert task.status == 'FAILED'

        # retry 会重新提交后台任务；抑制提交，让下方手动调用保持唯一执行路径
        controller.task_manager.submit_task = lambda *a, **k: None
        try:
            retried = client.post(
                f'/api/projects/{project_id}/workspace-generation-runs/{run_id}/retry',
            )
        finally:
            del controller.task_manager.submit_task
        assert retried.status_code == 200
        assert retried.get_json()['data']['status'] == 'PENDING'

        monkeypatch.undo()
        generate_workspace_candidate_task(task_id, run_id=run_id, app=app)
        with app.app_context():
            run = db.session.get(WorkspaceGenerationRun, run_id)
            assert run.status == 'REVIEW_READY'
            assert run.candidate_hash

class TestRecovery:
    def test_startup_recovery_marks_dead_runs_paused(self, client, app, enabled):
        from models import Task, WorkspaceGenerationRun, db
        from app import _recover_interrupted_generation_runs

        from controllers import workspace_generation_controller as controller
        controller.task_manager.submit_task = lambda *a, **k: None
        try:
            project_id = _project_id(client)
            run_response = _create_run(client, project_id)
            run_id = run_response.get_json()['data']['run_id']
        finally:
            del controller.task_manager.submit_task

        with app.app_context():
            run = db.session.get(WorkspaceGenerationRun, run_id)
            task = db.session.get(Task, run.task_id)
            # 模拟进程中断：任务已消失（COMPLETED 但线程死了），运行卡在 RUNNING
            run.status = 'RUNNING'
            task.status = 'COMPLETED'
            db.session.commit()

            _recover_interrupted_generation_runs()

            db.session.expire_all()
            run = db.session.get(WorkspaceGenerationRun, run_id)
            assert run.status == 'PAUSED'

    def test_resume_endpoint_restarts_interrupted_task(self, client, app, enabled):
        from models import Task, WorkspaceGenerationRun, db

        project_id = _project_id(client)
        from controllers import workspace_generation_controller as controller
        controller.task_manager.submit_task = lambda *a, **k: None
        try:
            run_response = _create_run(client, project_id)
            run_id = run_response.get_json()['data']['run_id']
        finally:
            del controller.task_manager.submit_task
        with app.app_context():
            run = db.session.get(WorkspaceGenerationRun, run_id)
            task_id = run.task_id

        paused = client.post(f'/api/projects/{project_id}/tasks/{task_id}/pause')
        assert paused.status_code == 200
        assert paused.get_json()['data']['status'] == 'PAUSED'

        restarted = []

        def fake_submit(task_id, func, **kwargs):
            restarted.append(kwargs)
            func(task_id, **kwargs)

        from services import task_manager as task_manager_module
        monkeypatch_submit = pytest.MonkeyPatch()
        monkeypatch_submit.setattr(task_manager_module.task_manager, 'submit_task', fake_submit)
        try:
            resumed = client.post(f'/api/projects/{project_id}/tasks/{task_id}/resume')
            assert resumed.status_code == 200
            assert restarted[0]['run_id'] == run_id
        finally:
            monkeypatch_submit.undo()

        with app.app_context():
            run = db.session.get(WorkspaceGenerationRun, run_id)
            assert run.status == 'REVIEW_READY'


class TestBriefBuilders:
    def test_video_brief_builder_is_deterministic_and_schema_valid(self):
        from jsonschema import Draft202012Validator

        from services.video_workspace_service import build_video_document_from_brief
        from services.project_workspace_service import _WORKSPACE_VALIDATORS

        brief = {
            'schema_version': 1,
            'title': '季度复盘',
            'topic': '季度复盘',
            'source_text': '第一页：业绩回顾\n- 收入增长\n\n第二页：问题分析\n- 增长放缓',
            'revision': 1,
            'content_hash': 'hash' * 8,
        }
        document = build_video_document_from_brief(brief, {'aspect_ratio': '16:9'})
        assert not list(_WORKSPACE_VALIDATORS['video'].iter_errors(document))
        assert document['title'] == '季度复盘'
        assert len(document['scenes']) == 2
        assert document['scenes'][0]['title'] == '业绩回顾'
        assert document['scenes'][0]['duration_ms'] >= 3000
        assert document['scenes'][1]['narration']['text'].startswith('第二页')
        assert build_video_document_from_brief(brief) == document

    def test_podcast_brief_builder_single_and_dialogue(self):
        from services.podcast_service import build_podcast_document_from_brief
        from services.project_workspace_service import _WORKSPACE_VALIDATORS

        brief = {
            'title': '科技播客',
            'topic': '科技播客',
            'source_text': '开场\n\n主体讨论\n\n结尾',
            'revision': 1,
            'content_hash': 'hash' * 8,
        }
        single = build_podcast_document_from_brief(brief, {'format': 'single'})
        assert len(single['speakers']) == 1
        assert not list(_WORKSPACE_VALIDATORS['podcast'].iter_errors(single))
        assert [segment['text'] for segment in single['segments']] == ['开场', '主体讨论', '结尾']

        dialogue = build_podcast_document_from_brief(brief, {
            'format': 'dialogue',
            'voice_profile_ids': ['edge:zh-CN-XiaoxiaoNeural', 'edge:zh-CN-YunxiNeural'],
        })
        assert len(dialogue['speakers']) == 2
        assert dialogue['speakers'][0]['voice_ref'] == 'edge:zh-CN-XiaoxiaoNeural'
        assert not list(_WORKSPACE_VALIDATORS['podcast'].iter_errors(dialogue))

    def test_ppt_snapshot_builder_preserves_source_refs(self):
        from services.video_workspace_service import build_video_document_from_ppt_snapshot

        snapshot = {
            'schema_version': 1,
            'source_kind': 'ppt',
            'workspace_revision': 3,
            'project_title': '来源项目',
            'pages': [
                {
                    'page_id': 'page-1', 'order_index': 0, 'page_revision': 5,
                    'title': '关键结论', 'narration': [{'speaker_id': 'host', 'text': '结论旁白'}],
                    'visual_kind': 'image', 'visual_ref': 'generated/1.png',
                },
            ],
            'content_hash': 'hash' * 8,
        }
        document = build_video_document_from_ppt_snapshot(snapshot)
        scene = document['scenes'][0]
        assert scene['visual']['source_ref'] == 'page-1'
        assert scene['visual']['source_revision'] == 5
        assert scene['narration']['segments'][0]['text'] == '结论旁白'
        assert scene['title'] == '关键结论'
