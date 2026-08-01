"""Workspace candidate optimize child runs (reconstruction plan §11.3).

The optimize endpoint creates a child run that inherits the parent's frozen
snapshot and candidate base; requested items are rewritten by the text
provider and never touch the parent candidate or the formal workspace.
"""

import json
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from backend.tests.content_project_factory import add_content_project


def _project_id(client, *, topic='优化测试'):
    return client.post('/api/projects', json={
        'creation_type': 'idea',
        'idea_prompt': topic,
        'initial_workspace': 'ppt',
    }).get_json()['data']['project_id']


@pytest.fixture()
def enabled(monkeypatch):
    monkeypatch.setenv('WORKSPACE_GENERATION_RUNS_ENABLED', 'true')


def _review_ready_run(client, app, topic='优化测试', submit=None):
    """Create a brief->video run and drive it to REVIEW_READY synchronously."""
    from controllers import workspace_generation_controller as controller
    from models import Task, WorkspaceGenerationRun, db
    from services.task_manager import generate_workspace_candidate_task

    controller.task_manager.submit_task = submit or (lambda *a, **k: None)
    try:
        project_id = _project_id(client, topic=topic)
        response = client.post(f'/api/projects/{project_id}/workspace-generation-runs', json={
            'target_workspace_kind': 'video',
            'source_kind': 'brief',
            'mode': 'direct',
            'options': {'target_duration_seconds': 60},
        })
        run_id = response.get_json()['data']['run_id']
    finally:
        del controller.task_manager.submit_task

    with app.app_context():
        run = db.session.get(WorkspaceGenerationRun, run_id)
        task_id = run.task_id
    generate_workspace_candidate_task(task_id, run_id=run_id, app=app)
    with app.app_context():
        run = db.session.get(WorkspaceGenerationRun, run_id)
        assert run.status == 'REVIEW_READY'
        candidate = json.loads(run.candidate_document_json)
        scene_ids = [scene['scene_id'] for scene in candidate['scenes']]
    return project_id, run_id, scene_ids


class TestOptimizeEndpoint:
    def test_optimize_creates_child_run_with_parent_snapshot_and_task(self, client, app, enabled):
        from controllers import workspace_generation_controller as controller
        from models import WorkspaceGenerationRun, db

        project_id, parent_id, scene_ids = _review_ready_run(client, app, topic='第一章：背景\n\n第二章：方案')
        calls = []
        controller.task_manager.submit_task = lambda task_id, func, **kwargs: calls.append(
            (task_id, kwargs)
        )
        try:
            response = client.post(
                f'/api/projects/{project_id}/workspace-generation-runs/{parent_id}/optimize',
                json={'item_ids': [scene_ids[0]], 'operation': 'polish', 'instruction': '更口语化'},
            )
            assert response.status_code == 202
            data = response.get_json()['data']
            assert data['parent_run_id'] == parent_id
            assert data['operation'] == 'polish'
            assert data['status'] == 'PENDING'
            assert data['options']['item_ids'] == [scene_ids[0]]
            assert data['options']['instruction'] == '更口语化'

            with app.app_context():
                parent = db.session.get(WorkspaceGenerationRun, parent_id)
                child = db.session.get(WorkspaceGenerationRun, data['run_id'])
                # 子运行继承父运行冻结快照（含 hash），保证候选可复现
                assert child.source_snapshot_json == parent.source_snapshot_json
                assert child.source_snapshot_hash == parent.source_snapshot_hash
                assert child.source_revision == parent.source_revision
                assert child.mode == 'preserve'
                # 父候选未被动过
                assert parent.candidate_hash == data['options']['base_candidate_hash']
        finally:
            del controller.task_manager.submit_task

    def test_optimize_child_rewrites_only_requested_items(self, client, app, enabled):
        from controllers import workspace_generation_controller as controller
        from models import WorkspaceGenerationRun, db
        from services.task_manager import generate_workspace_candidate_task

        project_id, parent_id, scene_ids = _review_ready_run(client, app, topic='第一章：背景\n\n第二章：方案\n\n第三章：行动')
        controller.task_manager.submit_task = lambda *a, **k: None
        try:
            response = client.post(
                f'/api/projects/{project_id}/workspace-generation-runs/{parent_id}/optimize',
                json={'item_ids': [scene_ids[1]], 'operation': 'shorten', 'instruction': '精简到一半'},
            )
            child_id = response.get_json()['data']['run_id']
        finally:
            del controller.task_manager.submit_task

        provider = SimpleNamespace(
            generate_text=lambda _prompt: '{"text":"精简后的第二章旁白"}',
            model='upstream-model-9',
        )
        with app.app_context():
            run = db.session.get(WorkspaceGenerationRun, child_id)
            task_id = run.task_id
        with patch(
            'services.ai_service_manager.get_ai_service',
            return_value=SimpleNamespace(text_provider=provider),
        ):
            generate_workspace_candidate_task(task_id, run_id=child_id, app=app)

        with app.app_context():
            run = db.session.get(WorkspaceGenerationRun, child_id)
            parent = db.session.get(WorkspaceGenerationRun, parent_id)
            assert run.status == 'REVIEW_READY'
            candidate = json.loads(run.candidate_document_json)
            texts = {scene['title']: scene['narration']['text'] for scene in candidate['scenes']}
            assert texts['第一章：背景'] != '精简后的第二章旁白'
            assert texts['第二章：方案'] == '精简后的第二章旁白'
            assert texts['第三章：行动'] != '精简后的第二章旁白'
            # 子候选哈希与父候选不同，父候选原样保留
            assert run.candidate_hash != parent.candidate_hash
            parent_candidate = json.loads(parent.candidate_document_json)
            assert all(
                scene['narration']['text'] != '精简后的第二章旁白'
                for scene in parent_candidate['scenes']
            )

    def test_optimize_keeps_original_when_provider_returns_empty(self, client, app, enabled):
        from controllers import workspace_generation_controller as controller
        from models import WorkspaceGenerationRun, db
        from services.task_manager import generate_workspace_candidate_task

        project_id, parent_id, scene_ids = _review_ready_run(client, app, topic='第一章：背景')
        controller.task_manager.submit_task = lambda *a, **k: None
        try:
            response = client.post(
                f'/api/projects/{project_id}/workspace-generation-runs/{parent_id}/optimize',
                json={'item_ids': [scene_ids[0]], 'operation': 'polish'},
            )
            child_id = response.get_json()['data']['run_id']
        finally:
            del controller.task_manager.submit_task

        provider = SimpleNamespace(
            generate_text=lambda _prompt: 'not json at all',
            model='upstream-model-9',
        )
        with app.app_context():
            run = db.session.get(WorkspaceGenerationRun, child_id)
            task_id = run.task_id
        with patch(
            'services.ai_service_manager.get_ai_service',
            return_value=SimpleNamespace(text_provider=provider),
        ):
            generate_workspace_candidate_task(task_id, run_id=child_id, app=app)

        with app.app_context():
            run = db.session.get(WorkspaceGenerationRun, child_id)
            assert run.status == 'REVIEW_READY'
            candidate = json.loads(run.candidate_document_json)
            assert candidate['scenes'][0]['narration']['text']

    def test_optimize_rejects_invalid_states_and_inputs(self, client, app, enabled):
        from controllers import workspace_generation_controller as controller

        project_id, parent_id, _scene_ids = _review_ready_run(client, app)
        controller.task_manager.submit_task = lambda *a, **k: None
        try:
            # 空 item_ids
            response = client.post(
                f'/api/projects/{project_id}/workspace-generation-runs/{parent_id}/optimize',
                json={'item_ids': []},
            )
            assert response.status_code == 400

            # 非法操作
            response = client.post(
                f'/api/projects/{project_id}/workspace-generation-runs/{parent_id}/optimize',
                json={'item_ids': [_scene_ids[0]], 'operation': 'generate'},
            )
            assert response.status_code == 400

            # 非审查态父运行
            response = client.post(f'/api/projects/{project_id}/workspace-generation-runs', json={
                'target_workspace_kind': 'video',
                'source_kind': 'brief',
                'mode': 'direct',
            })
            pending_id = response.get_json()['data']['run_id']
            response = client.post(
                f'/api/projects/{project_id}/workspace-generation-runs/{pending_id}/optimize',
                json={'item_ids': [_scene_ids[0]]},
            )
            assert response.status_code == 409
        finally:
            del controller.task_manager.submit_task

        # 功能开关关闭
        import os
        os.environ['WORKSPACE_GENERATION_RUNS_ENABLED'] = 'false'
        try:
            response = client.post(
                f'/api/projects/{project_id}/workspace-generation-runs/{parent_id}/optimize',
                json={'item_ids': [_scene_ids[0]]},
            )
            assert response.status_code == 403
        finally:
            os.environ['WORKSPACE_GENERATION_RUNS_ENABLED'] = 'true'

    def test_optimized_child_can_publish(self, client, app, enabled):
        from controllers import workspace_generation_controller as controller
        from models import WorkspaceGenerationRun, db
        from services.task_manager import generate_workspace_candidate_task

        project_id, parent_id, scene_ids = _review_ready_run(client, app, topic='第一章：背景')
        controller.task_manager.submit_task = lambda *a, **k: None
        try:
            response = client.post(
                f'/api/projects/{project_id}/workspace-generation-runs/{parent_id}/optimize',
                json={'item_ids': [scene_ids[0]], 'operation': 'polish'},
            )
            child_id = response.get_json()['data']['run_id']
        finally:
            del controller.task_manager.submit_task

        provider = SimpleNamespace(
            generate_text=lambda _prompt: '{"text":"发布用的最终旁白"}',
            model='upstream-model-9',
        )
        with app.app_context():
            run = db.session.get(WorkspaceGenerationRun, child_id)
            task_id = run.task_id
        with patch(
            'services.ai_service_manager.get_ai_service',
            return_value=SimpleNamespace(text_provider=provider),
        ):
            generate_workspace_candidate_task(task_id, run_id=child_id, app=app)

        response = client.post(
            f'/api/projects/{project_id}/workspace-generation-runs/{child_id}/publish'
        )
        assert response.status_code == 200
        data = response.get_json()['data']
        assert data['status'] == 'PUBLISHED'
        assert data['published_version_id']

        with app.app_context():
            from models import WorkspaceVersion
            version = db.session.get(WorkspaceVersion, data['published_version_id'])
            assert version is not None
            document = json.loads(version.document_json)
            assert document['scenes'][0]['narration']['text'] == '发布用的最终旁白'
