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
    def test_delete_task_persists_dismissal_and_cancels_generation_run(self, client, app, enabled):
        from controllers import workspace_generation_controller as controller

        controller.task_manager.submit_task = lambda *a, **k: None
        try:
            project_id = _project_id(client, topic='删除任务')
            created = client.post(
                f'/api/projects/{project_id}/workspace-generation-runs',
                json={'target_workspace_kind': 'video', 'source_kind': 'brief', 'mode': 'direct'},
            ).get_json()['data']
        finally:
            del controller.task_manager.submit_task

        task_id = created['task_id']
        response = client.delete(f'/api/projects/{project_id}/tasks/{task_id}')
        assert response.status_code == 200
        assert response.get_json()['data'] == {'task_id': task_id, 'deleted': True}

        listed = client.get('/api/tasks').get_json()['data']['tasks']
        assert all(item['task_id'] != task_id for item in listed)

        from models import Task, WorkspaceGenerationRun, db
        with app.app_context():
            task = db.session.get(Task, task_id)
            run = WorkspaceGenerationRun.query.filter_by(task_id=task_id).first()
            assert task.status == 'CANCELLED'
            assert task.dismissed_at is not None
            assert run.status == 'CANCELLED'

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


def test_material_generation_projection_keeps_image_url(client, app):
    """批量生成素材链路：GENERATE_MATERIAL 任务完成时 progress.image_url
    必须出现在投影里，前端轮询才能拿到结果图（回归：白名单过滤丢字段）。"""
    from models import Task, db

    with app.app_context():
        project_id = _project_id(client)
        task = Task(
            project_id=project_id,
            task_type='GENERATE_MATERIAL',
            status='COMPLETED',
        )
        task.set_progress({
            'total': 1,
            'completed': 1,
            'failed': 0,
            'material_id': 'mat-1',
            'image_url': '/files/project/materials/img.webp',
        })
        db.session.add(task)
        db.session.commit()
        task_id = task.id

    response = client.get(f'/api/projects/{project_id}/tasks/{task_id}')
    assert response.status_code == 200
    item = response.get_json()['data']
    assert item['status'] == 'COMPLETED'
    assert item['progress']['image_url'] == '/files/project/materials/img.webp'


def test_native_deck_generation_projection_keeps_failed_page_ids(client, app):
    """原生批量生成页面：失败页清单必须穿透投影，前端才能重试失败页。"""
    from models import Task, db

    with app.app_context():
        project_id = _project_id(client)
        task = Task(
            project_id=project_id,
            task_type='GENERATE_NATIVE_DECK',
            status='COMPLETED',
        )
        task.set_progress({
            'total': 3,
            'completed': 2,
            'failed': 1,
            'failed_page_ids': ['page-broken'],
        })
        db.session.add(task)
        db.session.commit()
        task_id = task.id

    response = client.get(f'/api/projects/{project_id}/tasks/{task_id}')
    assert response.status_code == 200
    item = response.get_json()['data']
    assert item['status'] == 'COMPLETED'
    assert item['progress']['completed'] == 2
    assert item['progress']['failed'] == 1
    assert item['progress']['failed_page_ids'] == ['page-broken']


def test_native_deck_generation_is_pausable_and_retryable(client, app):
    """批量生成页面：GENERATE_NATIVE_DECK 任务可暂停/恢复，失败后可重试，
    且面板能力标记与之匹配。"""
    from models import Task, db
    from services.task_control_service import task_capabilities

    with app.app_context():
        project_id = _project_id(client)
        task = Task(
            project_id=project_id,
            task_type='GENERATE_NATIVE_DECK',
            status='PENDING',
        )
        task.set_progress({
            'total': 2,
            'completed': 0,
            'failed': 0,
            'page_ids': ['page-a', 'page-b'],
            '_resume': {
                'kind': 'native-deck',
                'kwargs': {'project_id': project_id, 'page_ids': ['page-a', 'page-b']},
            },
        })
        db.session.add(task)
        db.session.commit()
        task_id = task.id

    # 暂停能力：PENDING 阶段可暂停
    response = client.post(f'/api/projects/{project_id}/tasks/{task_id}/pause')
    assert response.status_code == 200
    assert response.get_json()['data']['status'] == 'PAUSED'

    with app.app_context():
        task = db.session.get(Task, task_id)
        assert task.status == 'PAUSED'
        assert task_capabilities(task)['resume'] is True

    # 失败后重试：_resubmit 重新提交原生生成任务
    from controllers import native_deck_controller as controller
    from services.task_manager import generate_native_deck_task, task_manager

    submitted = []
    original = task_manager.submit_task

    def fake_submit(task_id_arg, fn, *args, **kwargs):
        submitted.append((fn, args, kwargs))
        return None

    task_manager.submit_task = fake_submit
    try:
        with app.app_context():
            task = db.session.get(Task, task_id)
            task.status = 'FAILED'
            task.error_message = 'images[0] 必须使用项目素材路径'
            db.session.commit()
        from services.task_control_service import retry_task
        retry_task(db.session.get(Task, task_id))
        assert len(submitted) == 1
        fn, args, kwargs = submitted[0]
        assert fn is generate_native_deck_task
        assert kwargs.get('page_ids') == ['page-a', 'page-b']
        assert args[0] == project_id
    finally:
        task_manager.submit_task = original
