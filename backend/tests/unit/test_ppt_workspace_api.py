import json


def _run_workspace_task_now(task, _app):
    from services.task_manager import initialize_content_workspace_task

    initialize_content_workspace_task(
        task.id,
        **task.get_progress()['_resume']['kwargs'],
    )


def _create_ppt_project(client, monkeypatch, render_mode='image'):
    monkeypatch.setattr(
        'controllers.content_workspace_controller.submit_workspace_task',
        _run_workspace_task_now,
    )
    return client.post('/api/projects', json={
        'creation_type': 'idea',
        'idea_prompt': 'PPT workspace',
        'initial_workspace': 'ppt',
        'render_mode': render_mode,
        'native_theme': 'core01' if render_mode == 'native' else None,
    }).get_json()['data']['project_id']


def test_page_saves_raise_ppt_workspace_revision(client, app, monkeypatch):
    from models import ProjectWorkspace, WorkspaceVersion

    project_id = _create_ppt_project(client, monkeypatch)
    created = client.post(f'/api/projects/{project_id}/pages', json={
        'order_index': 0,
        'outline_content': {'title': '初稿', 'points': []},
    })
    assert created.status_code == 201
    page_id = created.get_json()['data']['page_id']

    updated = client.put(
        f'/api/projects/{project_id}/pages/{page_id}/outline',
        json={'outline_content': {'title': '精修稿', 'points': ['证据']}},
    )
    assert updated.status_code == 200

    with app.app_context():
        workspace = ProjectWorkspace.query.filter_by(
            project_id=project_id, kind='ppt',
        ).one()
        assert workspace.revision == 3
        versions = WorkspaceVersion.query.filter_by(
            workspace_id=workspace.id,
        ).order_by(WorkspaceVersion.revision).all()
        assert [item.revision for item in versions] == [1, 2, 3]
        assert json.loads(versions[-1].document_json)['operation'] == 'page.outline'
        assert json.loads(versions[-1].document_json)['changed_page_ids'] == [page_id]


def test_native_save_reads_mode_from_workspace_and_records_version(
    client, app, monkeypatch,
):
    from models import Project, ProjectWorkspace, db

    project_id = _create_ppt_project(client, monkeypatch, render_mode='native')
    page_id = client.post(f'/api/projects/{project_id}/pages', json={
        'order_index': 0,
        'outline_content': {'title': '原生页', 'points': []},
    }).get_json()['data']['page_id']
    with app.app_context():
        project = Project.query.get(project_id)
        project.render_mode = 'image'
        project.native_theme = None
        db.session.commit()

    saved = client.put(
        f'/api/projects/{project_id}/pages/{page_id}/native',
        json={
            'layout': 'core01_cover',
            'props': {'title': '来自 workspace 设置', 'subtitle': '副标题'},
        },
    )
    assert saved.status_code == 200
    reloaded = client.get(f'/api/projects/{project_id}').get_json()['data']
    assert reloaded['render_mode'] == 'native'
    assert reloaded['native_theme'] == 'core01'
    with app.app_context():
        workspace = ProjectWorkspace.query.filter_by(
            project_id=project_id, kind='ppt',
        ).one()
        assert workspace.revision == 3
        assert json.loads(workspace.document_json)['operation'] == 'native.save'


def test_ppt_to_spine_proposal_contains_only_structured_content(
    client, app, monkeypatch,
):
    project_id = _create_ppt_project(client, monkeypatch)
    page_id = client.post(f'/api/projects/{project_id}/pages', json={
        'order_index': 0,
        'outline_content': {'title': '结构标题', 'points': ['观点一']},
        'description_content': {'text_content': ['结构摘要']},
    }).get_json()['data']['page_id']
    response = client.post(
        f'/api/content-projects/{project_id}/workspaces/ppt/propose-to-spine',
        json={'target_base_revision': 1},
    )
    assert response.status_code == 201
    proposal = response.get_json()['data']
    serialized = json.dumps(proposal['diff'], ensure_ascii=False)
    assert page_id in serialized
    assert '结构标题' in serialized
    assert '结构摘要' in serialized
    assert all(token not in serialized for token in (
        'native_layout',
        'native_props',
        'generated_image',
        'template',
    ))
    summary = client.get(f'/api/content-projects/{project_id}').get_json()['data']
    assert summary['spine']['revision'] == 1
    assert summary['spine']['document']['sections'] == []


def test_export_task_records_ppt_workspace_revision(client, app, monkeypatch):
    from models import ProjectWorkspace

    project_id = _create_ppt_project(client, monkeypatch, render_mode='native')
    client.post(f'/api/projects/{project_id}/pages', json={
        'order_index': 0,
        'outline_content': {'title': '导出页', 'points': []},
    })

    response = client.post(
        f'/api/projects/{project_id}/export/native-pptx',
        json={'format': 'pptx'},
    )
    assert response.status_code == 202
    with app.app_context():
        workspace = ProjectWorkspace.query.filter_by(
            project_id=project_id, kind='ppt',
        ).one()
        assert workspace.revision == 3
        assert json.loads(workspace.document_json)['operation'] == 'export.native_pptx'

