"""Project task projection contract (reconstruction plan §5.2/阶段0).

阶段 0 冻结契约：生成运行创建后，任务必须能从服务端任务列表发现，
且投影包含 category/workspace_kind/operation/capabilities/result。
当前实现没有服务端任务列表，本套测试必须失败。
"""

import pytest


def _project_id(client, *, topic='任务投影'):
    return client.post('/api/projects', json={
        'creation_type': 'idea',
        'idea_prompt': topic,
        'initial_workspace': 'ppt',
    }).get_json()['data']['project_id']


@pytest.fixture()
def enabled(monkeypatch):
    monkeypatch.setenv('WORKSPACE_GENERATION_RUNS_ENABLED', 'true')


class TestServerTaskList:
    def test_generation_run_task_discoverable_from_server_task_list(self, client, app, enabled):
        from controllers import workspace_generation_controller as controller

        controller.task_manager.submit_task = lambda *a, **k: None
        try:
            project_id = _project_id(client)
            response = client.post(
                f'/api/projects/{project_id}/workspace-generation-runs',
                json={'target_workspace_kind': 'video', 'source_kind': 'brief', 'mode': 'direct'},
            )
            assert response.status_code == 202
            run = response.get_json()['data']
            task_id = run['task_id']
            assert task_id
        finally:
            del controller.task_manager.submit_task

        # 服务端任务列表必须能发现该任务（当前没有 GET /api/tasks，测试失败）
        response = client.get('/api/tasks')
        assert response.status_code == 200
        data = response.get_json()['data']
        assert any(item['task_id'] == task_id for item in data['tasks'])

    def test_task_projection_exposes_workflow_fields(self, client, app, enabled):
        from controllers import workspace_generation_controller as controller

        controller.task_manager.submit_task = lambda *a, **k: None
        try:
            project_id = _project_id(client)
            response = client.post(
                f'/api/projects/{project_id}/workspace-generation-runs',
                json={
                    'target_workspace_kind': 'video',
                    'source_kind': 'ppt',
                    'mode': 'ai_adapt',
                    'operation': 'generate',
                    'options': {'page_ids': []},
                },
            )
            task_id = response.get_json()['data']['task_id']
        finally:
            del controller.task_manager.submit_task

        # 驱动到 REVIEW_READY：完成任务时 result.route 必须指向候选审查页
        from services.task_manager import generate_workspace_candidate_task
        from models import WorkspaceGenerationRun, db

        with app.app_context():
            run = db.session.get(WorkspaceGenerationRun, task_id and None or None)
        # task_id 是任务 ID，run 通过 task_id 反查
        with app.app_context():
            run = WorkspaceGenerationRun.query.filter_by(task_id=task_id).first()
            run_task_id = run.task_id
        generate_workspace_candidate_task(run_task_id, run_id=run.id, app=app)

        response = client.get('/api/tasks')
        assert response.status_code == 200
        items = {item['task_id']: item for item in response.get_json()['data']['tasks']}
        item = items[task_id]
        assert item['workspace_kind'] == 'video'
        assert item['category'] in {'generate', 'optimize', 'preview', 'export', 'initialize'}
        assert item['operation'] == 'generate'
        # 契约：控制能力由服务端按状态计算（REVIEW_READY 任务已 COMPLETED：
        # 不可暂停/恢复/取消，可重试）
        assert item['capabilities'] == {'pause': False, 'resume': False, 'cancel': False, 'retry': True}
        # 生成运行完成等待审查时，结果路由必须指向候选审查页
        assert item['result']['run_id'] == response.get_json()['data']['tasks'][0]['result'].get('run_id')
        assert 'route' in item['result']

    def test_project_filtered_task_list(self, client, app, enabled):
        from controllers import workspace_generation_controller as controller

        controller.task_manager.submit_task = lambda *a, **k: None
        try:
            project_id = _project_id(client)
            client.post(
                f'/api/projects/{project_id}/workspace-generation-runs',
                json={'target_workspace_kind': 'video', 'source_kind': 'brief', 'mode': 'direct'},
            )
        finally:
            del controller.task_manager.submit_task

        response = client.get(f'/api/tasks?project_id={project_id}')
        assert response.status_code == 200
        data = response.get_json()['data']
        assert all(item['project_id'] == project_id for item in data['tasks'])
