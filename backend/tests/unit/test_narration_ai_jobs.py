from types import SimpleNamespace
from unittest.mock import patch

from conftest import assert_success_response
from models import NarrationVersion, Page, Project, Task, db


def _project_with_pages():
    project = Project(id='narration-ai-job-project', creation_type='idea', render_mode='image')
    pages = [
        Page(
            id=f'narration-ai-job-page-{index}',
            project_id=project.id,
            order_index=index,
            narration_text=f'confirmed {index}',
            narration_status='READY',
        )
        for index in range(3)
    ]
    db.session.add_all([project, *pages])
    db.session.commit()
    return project, pages


def _run_submitted_job(client, project_id, payload):
    with patch('controllers.narration_controller.task_manager.submit_task') as submit:
        response = client.post(
            f'/api/projects/{project_id}/narrations/ai-jobs',
            json=payload,
        )
    data = assert_success_response(response, 202)['data']
    task_id = data['task_id']
    args = submit.call_args.args
    kwargs = submit.call_args.kwargs
    args[1](task_id, *args[2:], **kwargs)
    return task_id


def test_ai_job_creates_candidates_without_leaking_text_or_secrets(client):
    project, pages = _project_with_pages()
    provider = SimpleNamespace(
        generate_text=lambda _prompt: '{"text":"AI candidate","segments":[]}'
    )

    with patch(
        'services.task_manager.get_ai_service',
        return_value=SimpleNamespace(text_provider=provider),
    ):
        task_id = _run_submitted_job(client, project.id, {
            'page_ids': [pages[0].id, pages[1].id],
            'operation': 'polish',
            'instruction': 'keep this private instruction',
            'api_key': 'must-not-be-stored',
        })

    result = assert_success_response(client.get(
        f'/api/projects/{project.id}/narrations/ai-jobs/{task_id}/result'
    ))['data']
    assert result['status'] == 'COMPLETED'
    assert [item['status'] for item in result['pages']] == ['candidate', 'candidate']
    assert all(item['candidate_id'] for item in result['pages'])
    assert 'private instruction' not in Task.query.get(task_id).progress
    assert 'must-not-be-stored' not in Task.query.get(task_id).progress
    assert 'confirmed 0' not in Task.query.get(task_id).progress
    assert [page.narration_text for page in pages] == ['confirmed 0', 'confirmed 1', 'confirmed 2']
    assert NarrationVersion.query.filter_by(status='candidate').count() == 2


def test_ai_job_checks_lock_before_generation_and_again_before_write(client):
    project, pages = _project_with_pages()
    pages[0].narration_locked = True
    db.session.commit()

    calls = {'count': 0}

    def generate(_prompt):
        calls['count'] += 1
        page = Page.query.get(pages[1].id)
        page.narration_locked = True
        db.session.commit()
        return '{"text":"late candidate","segments":[]}'

    with patch(
        'services.task_manager.get_ai_service',
        return_value=SimpleNamespace(text_provider=SimpleNamespace(generate_text=generate)),
    ):
        task_id = _run_submitted_job(client, project.id, {
            'page_ids': [pages[0].id, pages[1].id],
            'operation': 'polish',
        })

    result = assert_success_response(client.get(
        f'/api/projects/{project.id}/narrations/ai-jobs/{task_id}/result'
    ))['data']
    assert calls['count'] == 1
    assert [(item['status'], item['reason']) for item in result['pages']] == [
        ('skipped', 'locked'),
        ('skipped', 'locked_before_write'),
    ]
    assert NarrationVersion.query.filter_by(status='candidate').count() == 0


def test_ai_job_returns_per_page_failure_and_single_page_post_retries(client):
    project, pages = _project_with_pages()
    calls = {'count': 0}

    def flaky(_prompt):
        calls['count'] += 1
        if calls['count'] == 1:
            raise RuntimeError('temporary provider failure')
        return '{"text":"retry candidate","segments":[]}'

    with patch(
        'services.task_manager.get_ai_service',
        return_value=SimpleNamespace(text_provider=SimpleNamespace(generate_text=flaky)),
    ):
        failed_task_id = _run_submitted_job(client, project.id, {
            'page_ids': [pages[0].id],
            'operation': 'polish',
        })
        retry_task_id = _run_submitted_job(client, project.id, {
            'page_ids': [pages[0].id],
            'operation': 'polish',
        })

    failed = assert_success_response(client.get(
        f'/api/projects/{project.id}/narrations/ai-jobs/{failed_task_id}/result'
    ))['data']
    retried = assert_success_response(client.get(
        f'/api/projects/{project.id}/narrations/ai-jobs/{retry_task_id}/result'
    ))['data']
    assert failed['pages'][0]['status'] == 'failed'
    assert failed['pages'][0]['reason'] == 'ai_service_error'
    assert retried['pages'][0]['status'] == 'candidate'


def test_ai_job_pause_resume_and_cancel_reuse_task_status(client):
    project, _pages = _project_with_pages()
    task = Task(
        id='narration-ai-job-controls',
        project_id=project.id,
        task_type='GENERATE_NARRATION_CANDIDATES',
        status='PROCESSING',
    )
    task.set_progress({'total': 1, 'completed': 0, 'failed': 0, 'skipped': 0, 'pages': []})
    db.session.add(task)
    db.session.commit()

    paused = assert_success_response(client.post(
        f'/api/projects/{project.id}/narrations/ai-jobs/{task.id}/pause'
    ))['data']
    assert paused['status'] == 'PAUSED'

    with patch('controllers.narration_controller.task_manager.is_task_active', return_value=True):
        resumed = assert_success_response(client.post(
            f'/api/projects/{project.id}/narrations/ai-jobs/{task.id}/resume'
        ))['data']
    assert resumed['status'] == 'PROCESSING'

    cancelled = assert_success_response(client.post(
        f'/api/projects/{project.id}/narrations/ai-jobs/{task.id}/cancel'
    ))['data']
    assert cancelled['status'] == 'CANCELLED'


def test_ai_job_scope_selects_missing_or_all_unlocked_pages(client):
    project, pages = _project_with_pages()
    pages[0].narration_text = ''
    pages[0].narration_status = 'EMPTY'
    pages[1].narration_locked = True
    db.session.commit()

    with patch('controllers.narration_controller.task_manager.submit_task') as submit:
        missing = client.post(
            f'/api/projects/{project.id}/narrations/ai-jobs',
            json={'scope': 'missing', 'operation': 'generate'},
        )
        assert_success_response(missing, 202)
        assert submit.call_args.args[3] == [pages[0].id]

        unlocked = client.post(
            f'/api/projects/{project.id}/narrations/ai-jobs',
            json={'scope': 'all_unlocked', 'operation': 'polish'},
        )
        assert_success_response(unlocked, 202)
        assert submit.call_args.args[3] == [pages[0].id, pages[2].id]
