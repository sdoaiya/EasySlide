import json


def _run_workspace_task_now(task, _app):
    from services.task_manager import initialize_content_workspace_task

    initialize_content_workspace_task(
        task.id,
        **task.get_progress()['_resume']['kwargs'],
    )


def _replace(item_id, path, before, after):
    return {
        'item_id': item_id,
        'path': path,
        'operation': 'replace',
        'change_type': 'content',
        'before': before,
        'after': after,
    }


def test_sync_api_applies_selected_items_and_restores_as_new_revision(
    client, app, monkeypatch,
):
    from models import ProjectWorkspace, WorkspaceVersion

    monkeypatch.setattr(
        'controllers.content_workspace_controller.submit_workspace_task',
        _run_workspace_task_now,
    )
    created = client.post('/api/projects', json={
        'creation_type': 'idea',
        'idea_prompt': 'API 同步',
        'initial_workspace': 'video',
    }).get_json()['data']
    project_id = created['project_id']
    summary = client.get(f'/api/content-projects/{project_id}').get_json()['data']
    video = next(item for item in summary['workspaces'] if item['kind'] == 'video')
    proposal = client.post(
        f'/api/content-projects/{project_id}/sync-proposals',
        json={
            'source_kind': 'spine',
            'target_kind': 'video',
            'source_revision': summary['spine']['revision'],
            'target_base_revision': video['revision'],
            'diff': {
                'schema_version': 1,
                'items': [
                    _replace('title', '/title', video['document']['title'], '已选择标题'),
                    _replace('ratio', '/aspect_ratio', '16:9', '9:16'),
                ],
            },
        },
    )
    assert proposal.status_code == 201
    proposal_id = proposal.get_json()['data']['id']
    assert client.get(
        f'/api/content-projects/{project_id}',
    ).get_json()['data']['pending_sync_count'] == 1

    applied = client.post(
        f'/api/content-projects/{project_id}/sync-proposals/{proposal_id}/apply',
        json={'base_revision': 1, 'selected_item_ids': ['title']},
    )
    assert applied.status_code == 200
    payload = applied.get_json()['data']
    assert payload['proposal']['status'] == 'partially_applied'
    assert payload['workspace']['document']['title'] == '已选择标题'
    assert payload['workspace']['document']['aspect_ratio'] == '16:9'

    with app.app_context():
        workspace = ProjectWorkspace.query.filter_by(
            project_id=project_id, kind='video',
        ).one()
        first = WorkspaceVersion.query.filter_by(
            workspace_id=workspace.id, revision=1,
        ).one()
        assert json.loads(workspace.document_json)['title'] == '已选择标题'
        first_id = first.id

    restored = client.post(
        f'/api/content-projects/{project_id}/workspaces/video/versions/{first_id}/restore',
        json={'base_revision': 2},
    )
    assert restored.status_code == 200
    restored_data = restored.get_json()['data']
    assert restored_data['version']['revision'] == 3
    assert restored_data['version']['source_type'] == 'restore'
    assert restored_data['workspace']['document']['title'] == 'API 同步'

    versions = client.get(
        f'/api/content-projects/{project_id}/workspaces/video/versions',
    ).get_json()['data']['versions']
    assert [item['revision'] for item in versions] == [3, 2, 1]


def test_sync_api_returns_409_and_marks_concurrent_proposal_stale(
    client, app, monkeypatch,
):
    from models import ContentSyncProposal, ProjectWorkspace, db
    from services.project_workspace_service import save_workspace_revision

    monkeypatch.setattr(
        'controllers.content_workspace_controller.submit_workspace_task',
        _run_workspace_task_now,
    )
    created = client.post('/api/projects', json={
        'creation_type': 'idea',
        'idea_prompt': '并发同步',
        'initial_workspace': 'video',
    }).get_json()['data']
    project_id = created['project_id']
    summary = client.get(f'/api/content-projects/{project_id}').get_json()['data']
    video = next(item for item in summary['workspaces'] if item['kind'] == 'video')
    proposal_id = client.post(
        f'/api/content-projects/{project_id}/sync-proposals',
        json={
            'source_kind': 'spine',
            'target_kind': 'video',
            'source_revision': 1,
            'target_base_revision': 1,
            'diff': {
                'schema_version': 1,
                'items': [_replace(
                    'title', '/title', video['document']['title'], '过时候选',
                )],
            },
        },
    ).get_json()['data']['id']

    with app.app_context():
        workspace = ProjectWorkspace.query.filter_by(
            project_id=project_id, kind='video',
        ).one()
        document = json.loads(workspace.document_json)
        save_workspace_revision(
            workspace,
            {**document, 'title': '人工并发版本'},
            {},
            expected_revision=1,
            source_type='manual',
        )
        db.session.commit()

    stale = client.post(
        f'/api/content-projects/{project_id}/sync-proposals/{proposal_id}/apply',
        json={'base_revision': 1, 'selected_item_ids': ['title']},
    )
    assert stale.status_code == 409
    assert stale.get_json()['error']['code'] == 'SYNC_PROPOSAL_STALE'
    with app.app_context():
        assert db.session.get(ContentSyncProposal, proposal_id).status == 'stale'
