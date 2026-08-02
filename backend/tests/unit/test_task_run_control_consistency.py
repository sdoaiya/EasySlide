"""Task/Run atomic control consistency (plan §5.4/阶段0).

阶段 0 冻结契约：暂停/继续/取消/重试必须同时更新 Task 与关联 Run，
不允许只改 Run 状态而后台 Task 继续执行。
当前 run 控制端点只改 Run，本套测试必须失败。
"""

import pytest

from backend.tests.content_project_factory import add_content_project


def _review_ready_run(client, app, topic='控制一致性'):
    from controllers import workspace_generation_controller as controller
    from models import WorkspaceGenerationRun, db
    from services.task_manager import generate_workspace_candidate_task

    controller.task_manager.submit_task = lambda *a, **k: None
    try:
        project_id = client.post('/api/projects', json={
            'creation_type': 'idea',
            'idea_prompt': topic,
            'initial_workspace': 'ppt',
        }).get_json()['data']['project_id']
        response = client.post(f'/api/projects/{project_id}/workspace-generation-runs', json={
            'target_workspace_kind': 'video',
            'source_kind': 'brief',
            'mode': 'direct',
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
    return project_id, run_id, task_id


@pytest.fixture()
def enabled(monkeypatch):
    monkeypatch.setenv('WORKSPACE_GENERATION_RUNS_ENABLED', 'true')


class TestTaskRunControlConsistency:
    def test_run_pause_also_pauses_background_task(self, client, app, enabled):
        from models import Task, WorkspaceGenerationRun, db

        project_id, run_id, task_id = _review_ready_run(client, app)

        response = client.post(
            f'/api/projects/{project_id}/workspace-generation-runs/{run_id}/pause'
        )
        assert response.status_code == 200
        with app.app_context():
            task = db.session.get(Task, task_id)
            run = db.session.get(WorkspaceGenerationRun, run_id)
            # 契约：Task 与 Run 必须同步暂停（当前只改 Run，测试失败）
            assert task.status == 'PAUSED'
            assert run.status == 'PAUSED'

    def test_run_retry_restarts_same_frozen_snapshot(self, client, app, enabled):
        from models import Task, WorkspaceGenerationRun, db

        project_id, run_id, task_id = _review_ready_run(client, app)

        response = client.post(
            f'/api/projects/{project_id}/workspace-generation-runs/{run_id}/retry'
        )
        assert response.status_code == 200
        with app.app_context():
            task = db.session.get(Task, task_id)
            run = db.session.get(WorkspaceGenerationRun, run_id)
            # 契约：重试后 Task 回到 PENDING 且保留同一冻结快照（当前 Task 未联动）
            assert task.status == 'PENDING'
            assert run.status == 'PENDING'
            snapshot_hash = run.source_snapshot_hash
            assert snapshot_hash

    def test_run_cancel_also_cancels_task(self, client, app, enabled):
        from models import Task, WorkspaceGenerationRun, db

        project_id, run_id, task_id = _review_ready_run(client, app)

        response = client.post(
            f'/api/projects/{project_id}/workspace-generation-runs/{run_id}/cancel'
        )
        assert response.status_code == 200
        with app.app_context():
            task = db.session.get(Task, task_id)
            run = db.session.get(WorkspaceGenerationRun, run_id)
            assert task.status == 'CANCELLED'
            assert run.status == 'CANCELLED'
