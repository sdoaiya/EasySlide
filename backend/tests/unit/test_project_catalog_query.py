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
        _seed_projects(client, 2)

        from sqlalchemy import text

        with client.application.app_context():
            from models import db
            with db.engine.connect() as conn:
                changes_before = conn.execute(text("PRAGMA total_changes")).scalar()

        client.get('/api/projects')

        with client.application.app_context():
            from models import db
            with db.engine.connect() as conn:
                changes_after = conn.execute(text("PRAGMA total_changes")).scalar()

        # 契约：列表 GET 不得产生数据库写入（当前 calibrate 会 commit，测试失败）
        assert changes_before == changes_after

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
