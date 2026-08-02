"""Project catalog read-only + summary contract (plan §7.5/阶段0).

阶段 0 冻结契约：
- GET /api/projects 正常请求前后 SQLite total_changes 不变（只读）。
- 列表响应为轻量 ProjectSummary，不含页面正文/描述/版本文档。
- 列表在 SQL 层筛选分页（不先 .all() 再 Python 切片）。
当前列表会 calibrate 写库并返回 include_pages=True，本套测试必须失败。
"""

import pytest

from backend.tests.content_project_factory import add_content_project


def _seed_projects(client, count=3):
    ids = []
    for index in range(count):
        response = client.post('/api/projects', json={
            'creation_type': 'idea',
            'idea_prompt': f'项目 {index}',
            'initial_workspace': 'ppt',
        })
        ids.append(response.get_json()['data']['project_id'])
    return ids


class TestCatalogReadOnly:
    def test_list_get_does_not_write_database(self, client):
        # 抑制后台初始化线程，只测量列表 GET 自身是否写库
        from controllers import workspace_generation_controller as controller
        controller.task_manager.submit_task = lambda *a, **k: None
        try:
            _seed_projects(client, 2)
        finally:
            del controller.task_manager.submit_task

        # 精确捕获 GET 请求自身发出的写语句：SQLAlchemy 事件在请求线程
        # （has_request_context）内记录非 SELECT 语句；其他测试残留的
        # 后台线程没有 request context，不会造成假阳性。
        from flask import has_request_context
        from sqlalchemy import event

        from models import db

        request_writes: list[str] = []

        @event.listens_for(db.engine, 'before_cursor_execute')
        def _capture_request_writes(conn, cursor, statement, parameters, context, executemany):
            if has_request_context():
                head = statement.lstrip().upper()
                if head.startswith(('INSERT', 'UPDATE', 'DELETE')):
                    request_writes.append(statement)

        try:
            client.get('/api/projects')
        finally:
            event.remove(db.engine, 'before_cursor_execute', _capture_request_writes)

        # 契约：列表 GET 不得产生数据库写入
        assert request_writes == [], '列表 GET 发出了写语句: %s' % request_writes

    def test_list_returns_summary_without_page_bodies(self, client):
        project_id = _seed_projects(client, 1)[0]
        # 给项目一页写入可识别的描述正文
        with client.application.app_context():
            from models import Page, Project, db
            project = db.session.get(Project, project_id)
            page = Page(project_id=project.id, order_index=0, status='COMPLETED')
            page.set_outline_content({'title': '摘要契约页', 'points': ['要点']})
            page.set_description_content({'text': '这是页面正文不应出现在列表响应中', 'extra_fields': {}})
            db.session.add(page)
            db.session.commit()

        response = client.get('/api/projects')
        assert response.status_code == 200
        data = response.get_json()['data']
        item = data['projects'][0]
        # 契约：摘要列表不含页面对象与正文（当前 include_pages=True，测试失败）
        assert 'pages' not in item
        assert '这是页面正文不应出现在列表响应中' not in response.get_data(as_text=True)

    def test_list_summary_has_catalog_fields(self, client):
        _seed_projects(client, 1)
        response = client.get('/api/projects')
        data = response.get_json()['data']
        item = data['projects'][0]
        for field in ('project_id', 'title', 'updated_at', 'workspace_states', 'dashboard_status', 'page_count', 'active_task_count'):
            assert field in item, f'ProjectSummary 缺少字段 {field}'

    def test_mixes_current_version_and_legacy_covers_without_losing_completion(self, client):
        current_id, legacy_id, draft_id = _seed_projects(client, 3)
        with client.application.app_context():
            from models import Page, PageImageVersion, ProjectWorkspace, Task, db

            project_ids = (current_id, legacy_id, draft_id)
            Task.query.filter(Task.project_id.in_(project_ids)).delete(synchronize_session=False)
            Page.query.filter(Page.project_id.in_(project_ids)).delete(synchronize_session=False)
            ProjectWorkspace.query.filter(ProjectWorkspace.project_id.in_(project_ids)).update(
                {'stage': 'DRAFT', 'state': 'draft'},
                synchronize_session=False,
            )

            current_page = Page(project_id=current_id, order_index=0, status='DESCRIPTION_GENERATED')
            legacy_page = Page(
                project_id=legacy_id,
                order_index=0,
                status='COMPLETED',
                generated_image_path='legacy/cover.png',
            )
            db.session.add_all([current_page, legacy_page])
            db.session.flush()
            db.session.add(PageImageVersion(
                page_id=current_page.id,
                image_path='current/cover.webp',
                version_number=1,
                is_current=True,
            ))
            db.session.commit()

        response = client.get('/api/projects?limit=10')
        items = {item['project_id']: item for item in response.get_json()['data']['projects']}

        assert items[current_id]['cover_url'].endswith('/cover.webp')
        assert items[current_id]['dashboard_status'] == 'completed'
        assert items[legacy_id]['cover_url'].endswith('/cover.png')
        assert items[legacy_id]['dashboard_status'] == 'completed'

        current_detail = client.get(f'/api/projects/{current_id}').get_json()['data']
        assert current_detail['pages'][0]['generated_image_url'].endswith('/cover.webp')

        completed = client.get('/api/projects?limit=10&status=completed').get_json()['data']['projects']
        in_progress = client.get('/api/projects?limit=10&status=in_progress').get_json()['data']['projects']
        assert {item['project_id'] for item in completed} == {current_id, legacy_id}
        assert {item['project_id'] for item in in_progress} == {draft_id}
