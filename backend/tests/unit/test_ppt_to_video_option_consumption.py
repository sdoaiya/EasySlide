"""PPT→video wizard option consumption (plan §7.1/阶段0).

阶段 0 冻结契约：向导的 script_source / visual_strategy / voice_profile_id /
expressiveness_id 必须真实进入候选场景；场景保留源页 id+revision+hash+visual ref。
当前候选构建器只消费 aspect_ratio，本套测试必须失败。
"""

import json

import pytest

from backend.tests.content_project_factory import add_content_project


@pytest.fixture()
def enabled(monkeypatch):
    monkeypatch.setenv('WORKSPACE_GENERATION_RUNS_ENABLED', 'true')


def _ppt_run_with_pages(client, app, topic='选项消费'):
    """创建带 3 页的 PPT 项目，并生成 PPT→视频运行到 REVIEW_READY。"""
    from controllers import workspace_generation_controller as controller
    from models import Page, Project, WorkspaceGenerationRun, db
    from services.task_manager import generate_workspace_candidate_task

    controller.task_manager.submit_task = lambda *a, **k: None
    try:
        project_id = client.post('/api/projects', json={
            'creation_type': 'idea',
            'idea_prompt': '第一页：背景\n\n第二页：方案\n\n第三页：行动',
            'initial_workspace': 'ppt',
        }).get_json()['data']['project_id']
        # 物化 3 页（含确认旁白与页面正文）
        with app.app_context():
            project = db.session.get(Project, project_id)
            for index, title in enumerate(['背景页', '方案页', '行动页']):
                page = Page(project_id=project.id, order_index=index, status='COMPLETED')
                page.set_outline_content({'title': title, 'points': [f'{title}要点']})
                page.set_description_content({'text': f'{title}的描述内容', 'extra_fields': {}})
                page.narration_text = f'{title}的确认旁白'
                db.session.add(page)
            db.session.commit()
            page_ids = [page.id for page in sorted(project.pages, key=lambda p: p.order_index)]
        response = client.post(f'/api/projects/{project_id}/workspace-generation-runs', json={
            'target_workspace_kind': 'video',
            'source_kind': 'ppt',
            'mode': 'ai_adapt',
            'operation': 'generate',
            'options': {
                'page_ids': page_ids,
                'script_source': 'confirmed_narration_or_page',
                'visual_strategy': 'reuse_ppt',
                'aspect_ratio': '16:9',
                'voice_profile_id': 'edge:zh-CN-XiaoxiaoNeural',
                'expressiveness_id': 'expression.warm.v1',
            },
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
    return project_id, run_id, page_ids


class TestPptToVideoOptionConsumption:
    def test_only_selected_pages_keep_relative_order(self, client, app, enabled):
        from models import WorkspaceGenerationRun, db

        project_id, run_id, page_ids = _ppt_run_with_pages(client, app)
        selected = [page_ids[2], page_ids[0]]  # 逆序选择
        from controllers import workspace_generation_controller as controller
        from services.task_manager import generate_workspace_candidate_task

        controller.task_manager.submit_task = lambda *a, **k: None
        try:
            response = client.post(f'/api/projects/{project_id}/workspace-generation-runs', json={
                'target_workspace_kind': 'video',
                'source_kind': 'ppt',
                'mode': 'preserve',
                'options': {'page_ids': selected},
            })
            run_id2 = response.get_json()['data']['run_id']
        finally:
            del controller.task_manager.submit_task
        with app.app_context():
            run = db.session.get(WorkspaceGenerationRun, run_id2)
            task_id2 = run.task_id
        generate_workspace_candidate_task(task_id2, run_id=run_id2, app=app)
        with app.app_context():
            run = db.session.get(WorkspaceGenerationRun, run_id2)
            candidate = json.loads(run.candidate_document_json)
            # 契约：只冻结选中页并按相对顺序（当前构建器忽略 page_ids，测试失败）
            assert [scene['visual']['source_ref'] for scene in candidate['scenes']] == selected

    def test_script_source_prefers_confirmed_narration(self, client, app, enabled):
        from models import WorkspaceGenerationRun, db

        project_id, run_id, page_ids = _ppt_run_with_pages(client, app)
        with app.app_context():
            run = db.session.get(WorkspaceGenerationRun, run_id)
            candidate = json.loads(run.candidate_document_json)
            first = candidate['scenes'][0]
            # 契约：script_source=confirmed_narration_or_page 时场景脚本取确认旁白
            assert first['narration']['text'] == '背景页的确认旁白'
            # 场景保留源页 id + revision + hash + visual ref
            assert first['visual']['source_ref'] == page_ids[0]
            assert first['visual'].get('source_revision') is not None
            # 契约：声音与表现力进入每个场景（当前候选无 voice 字段，测试失败）
            assert first.get('voice', {}).get('voice_profile_id') == 'edge:zh-CN-XiaoxiaoNeural'
            assert first.get('voice', {}).get('expressiveness_id') == 'expression.warm.v1'
