from types import SimpleNamespace
from unittest.mock import patch

from conftest import assert_error_response, assert_success_response
from models import Page, Project, db


def _page(project_id='narration-project', page_id='narration-page', text='旧旁白'):
    project = Project(id=project_id, creation_type='idea', render_mode='image')
    page = Page(
        id=page_id,
        project_id=project.id,
        order_index=0,
        narration_text=text,
        narration_status='READY',
    )
    db.session.add_all([project, page])
    db.session.commit()
    return project, page


def test_legacy_narration_is_materialized_on_first_version_read(client):
    project, page = _page()

    response = client.get(
        f'/api/projects/{project.id}/pages/{page.id}/narration/versions'
    )

    data = assert_success_response(response)['data']
    assert data['revision'] == 1
    assert data['current_version_id']
    assert data['versions'][0]['source_type'] == 'legacy'
    assert data['versions'][0]['status'] == 'applied'
    assert data['versions'][0]['text'] == '旧旁白'


def test_manual_version_updates_projection_and_rejects_stale_revision(client):
    project, page = _page(text='')

    created = assert_success_response(client.post(
        f'/api/projects/{project.id}/pages/{page.id}/narration/versions',
        json={
            'base_revision': 0,
            'mode': 'single',
            'language': 'zh-CN',
            'text': '人工确认稿',
        },
    ), 201)['data']
    assert created['version']['status'] == 'applied'
    assert created['revision'] == 1

    stale = client.post(
        f'/api/projects/{project.id}/pages/{page.id}/narration/versions',
        json={'base_revision': 0, 'text': '晚到的旧稿'},
    )
    error = assert_error_response(stale, 409)
    assert error['error']['code'] == 'NARRATION_REVISION_CONFLICT'

    db.session.refresh(page)
    assert page.narration_text == '人工确认稿'
    assert page.narration_revision == 1


def test_ai_candidate_does_not_replace_current_narration(client):
    project, page = _page(text='人工原稿')
    assert_success_response(client.get(
        f'/api/projects/{project.id}/pages/{page.id}/narration/versions'
    ))
    db.session.refresh(page)
    base_version_id = page.current_narration_version_id
    base_revision = page.narration_revision

    provider = SimpleNamespace(generate_text=lambda _prompt: '{"text":"AI 润色候选","segments":[]}')
    with patch(
        'controllers.narration_controller.get_ai_service',
        return_value=SimpleNamespace(text_provider=provider),
    ):
        response = client.post(
            f'/api/projects/{project.id}/pages/{page.id}/narration/ai-candidates',
            json={
                'operation': 'polish',
                'base_version_id': base_version_id,
                'base_revision': base_revision,
                'instruction': '更自然，但不要改变事实',
            },
        )

    data = assert_success_response(response, 201)['data']
    assert data['candidate']['status'] == 'candidate'
    assert data['candidate']['text'] == 'AI 润色候选'
    assert data['diff']['changed'] is True

    db.session.refresh(page)
    assert page.narration_text == '人工原稿'
    assert page.current_narration_version_id == base_version_id
    assert page.narration_revision == base_revision


def test_applying_candidate_creates_new_applied_version(client):
    project, page = _page(text='原稿')
    versions = assert_success_response(client.get(
        f'/api/projects/{project.id}/pages/{page.id}/narration/versions'
    ))['data']
    base = versions['versions'][0]

    provider = SimpleNamespace(generate_text=lambda _prompt: '{"text":"候选稿","segments":[]}')
    with patch(
        'controllers.narration_controller.get_ai_service',
        return_value=SimpleNamespace(text_provider=provider),
    ):
        candidate = assert_success_response(client.post(
            f'/api/projects/{project.id}/pages/{page.id}/narration/ai-candidates',
            json={
                'operation': 'polish',
                'base_version_id': base['id'],
                'base_revision': versions['revision'],
            },
        ), 201)['data']['candidate']

    applied = assert_success_response(client.post(
        f"/api/projects/{project.id}/pages/{page.id}/narration/versions/{candidate['id']}/apply",
        json={'base_revision': versions['revision']},
    ))['data']

    assert applied['version']['id'] != candidate['id']
    assert applied['version']['status'] == 'applied'
    assert applied['version']['parent_version_id'] == candidate['id']
    assert applied['revision'] == versions['revision'] + 1
    db.session.refresh(page)
    assert page.narration_text == '候选稿'


def test_locked_page_rejects_ai_candidate_but_can_be_unlocked(client):
    project, page = _page()
    locked = assert_success_response(client.put(
        f'/api/projects/{project.id}/pages/{page.id}/narration/lock',
        json={'locked': True, 'base_revision': 0},
    ))['data']
    assert locked['locked'] is True

    response = client.post(
        f'/api/projects/{project.id}/pages/{page.id}/narration/ai-candidates',
        json={'operation': 'polish', 'base_revision': locked['revision']},
    )
    error = assert_error_response(response, 409)
    assert error['error']['code'] == 'NARRATION_LOCKED'

    unlocked = assert_success_response(client.put(
        f'/api/projects/{project.id}/pages/{page.id}/narration/lock',
        json={'locked': False, 'base_revision': locked['revision']},
    ))['data']
    assert unlocked['locked'] is False


def test_project_narration_summary_reports_candidates_and_lock(client):
    project, page = _page()
    assert_success_response(client.put(
        f'/api/projects/{project.id}/pages/{page.id}/narration/lock',
        json={'locked': True, 'base_revision': 0},
    ))

    data = assert_success_response(
        client.get(f'/api/projects/{project.id}/narrations')
    )['data']

    assert data['pages'][0]['page_id'] == page.id
    assert data['pages'][0]['locked'] is True
    assert data['pages'][0]['word_count'] == len('旧旁白')
    assert data['pages'][0]['candidate_count'] == 0


def test_legacy_put_narration_delegates_to_version_service(client):
    project, page = _page(text='旧稿')
    page.narration_audio_manifest = '{"stale":true}'
    db.session.commit()

    data = assert_success_response(client.put(
        f'/api/projects/{project.id}/pages/{page.id}/narration',
        json={'narration_text': '兼容接口新稿'},
    ))['data']

    assert data['narration_text'] == '兼容接口新稿'
    assert data['narration_revision'] == 2
    assert data['current_narration_version_id']
    db.session.refresh(page)
    assert page.narration_audio_manifest is None
    assert [version.source_type for version in page.narration_versions.all()] == ['manual', 'legacy']


def test_project_narration_summary_reports_has_content_for_page_materials(client):
    """从 PPT 编辑页进入视频文案：页面有正文/大纲时 has_content=True，
    前端据此显示「待生成确认稿」而非「缺少确认稿」。"""
    project = Project(id='narration-content-project', creation_type='idea', render_mode='native')
    with_content = Page(id='content-page', project_id=project.id, order_index=0)
    with_content.set_outline_content({'title': '核心观点', 'points': ['要点一']})
    empty = Page(id='empty-page', project_id=project.id, order_index=1)
    db.session.add_all([project, with_content, empty])
    db.session.commit()

    data = assert_success_response(
        client.get(f'/api/projects/{project.id}/narrations')
    )['data']

    by_id = {item['page_id']: item for item in data['pages']}
    assert by_id['content-page']['has_content'] is True
    assert by_id['content-page']['current_version_id'] is None
    assert by_id['empty-page']['has_content'] is False
    assert data['missing_pages'] == 2
