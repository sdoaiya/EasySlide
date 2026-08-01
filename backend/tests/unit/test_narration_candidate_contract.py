"""Narration candidate stable contract and batch APIs (reconstruction plan §7.4/§11.4).

Focused suite: candidate serialization with real IDs and legacy.unknown
fallbacks, active job listing for refresh recovery, per-page batch apply
with revision conflicts, and batch archive.
"""

from types import SimpleNamespace
from unittest.mock import patch

from conftest import assert_success_response
from models import NarrationVersion, Page, Project, Task, db


def _project_with_pages():
    from services.narration_service import save_manual_narration_version

    project = Project(id='narration-candidate-project', creation_type='idea', render_mode='image')
    pages = [
        Page(
            id=f'narr-candidate-page-{index}',
            project_id=project.id,
            order_index=index,
            narration_text=f'confirmed {index}',
            narration_status='READY',
        )
        for index in range(3)
    ]
    db.session.add_all([project, *pages])
    db.session.commit()
    # 物化确认稿版本，避免 ensure_legacy 在候选创建中途递增 revision
    for page in pages:
        save_manual_narration_version(page, {
            'text': page.narration_text,
            'base_revision': int(page.narration_revision or 0),
        })
    db.session.commit()
    return project, pages


def _make_candidate(client, project_id, page, *, operation='polish', generation_config=None, provider_meta=None):
    """Create one AI candidate through the single-page API."""
    provider = SimpleNamespace(
        generate_text=lambda _prompt: '{"text":"candidate for %s","segments":[]}' % page.id,
        model='upstream-model-9',
    )
    payload = {
        'operation': operation,
        'base_revision': int(page.narration_revision or 0),
        'generation_config': generation_config or {
            'style_profile_id': 'script.conversational.v1',
            'expressiveness_id': 'expression.warm.v1',
            'voice_profile_id': 'fish:voice-dd43b30d',
        },
    }
    with patch(
        'controllers.narration_controller.get_ai_service',
        return_value=SimpleNamespace(text_provider=provider),
    ):
        response = client.post(
            f'/api/projects/{project_id}/pages/{page.id}/narration/ai-candidates',
            json=payload,
        )
    return assert_success_response(response, 201)['data']['candidate']


def test_candidate_contract_exposes_stable_ids_and_legacy_unknown(client):
    project, pages = _project_with_pages()
    page = pages[0]
    candidate = _make_candidate(client, project.id, page)

    # 新候选：真实 provider/model 与 style/expressiveness/voice ID
    with patch(
        'services.ai_service_manager.get_ai_service',
        return_value=SimpleNamespace(text_provider=SimpleNamespace(model='upstream-model-9')),
    ):
        listing = client.get(f'/api/projects/{project.id}/narration-candidates')
    data = assert_success_response(listing)['data']
    assert data['total'] == 1
    item = data['candidates'][0]
    assert item['candidate_id'] == candidate['id']
    assert item['page_id'] == page.id
    assert item['status'] == 'candidate'
    assert item['style_profile_id'] == 'script.conversational.v1'
    assert item['expressiveness_id'] == 'expression.warm.v1'
    assert item['voice_profile_id'] == 'fish:voice-dd43b30d'
    assert item['provider'] == 'unknown' or item['provider'] in {
        'openai', 'genai', 'codex', 'anthropic', 'lazyllm',
    }
    assert item['prompt_version'] == 'narration-candidate-v2'
    assert item['source_page_revision'] == 1
    assert item['text'].startswith('candidate for ')

    # 旧候选缺 ai_config：所有缺失 ID 一律 legacy.unknown，不伪造
    legacy = NarrationVersion(
        page_id=page.id,
        version_number=99,
        mode='single',
        language='zh',
        text='旧候选',
        source_type='ai_generated',
        status='candidate',
        content_hash='legacy-hash',
        created_by='ai',
    )
    db.session.add(legacy)
    db.session.commit()
    listing = client.get(
        f'/api/projects/{project.id}/narration-candidates?page_id={page.id}&status=candidate',
    )
    data = assert_success_response(listing)['data']
    legacy_item = next(item for item in data['candidates'] if item['candidate_id'] == legacy.id)
    assert legacy_item['style_profile_id'] == 'legacy.unknown'
    assert legacy_item['expressiveness_id'] == 'legacy.unknown'
    assert legacy_item['voice_profile_id'] == 'legacy.unknown'
    assert legacy_item['provider'] == 'legacy.unknown'
    assert legacy_item['model_id'] == 'legacy.unknown'
    assert legacy_item['prompt_version'] == 'legacy.unknown'
    assert legacy_item['operation'] == 'legacy.unknown'


def test_active_job_listing_supports_refresh_recovery(client):
    from services.narration_service import create_ai_narration_candidate

    project, pages = _project_with_pages()
    payload = {
        'page_ids': [page.id for page in pages],
        'operation': 'polish',
        'instruction': '',
        'generation_config': {},
    }
    with patch('controllers.narration_controller.task_manager.submit_task') as submit:
        response = client.post(f'/api/projects/{project.id}/narrations/ai-jobs', json=payload)
    data = assert_success_response(response, 202)['data']
    task_id = data['task_id']
    args = submit.call_args.args
    kwargs = submit.call_args.kwargs

    # 只执行前两页后模拟中断（任务停在 PROCESSING）
    def interrupted_task(*a, **kw):
        from services.task_manager import generate_narration_candidates_task
        from services.narration_service import provider_metadata
        original = generate_narration_candidates_task

        def short_circuit(task_id, project_id, page_ids, operation, **opts):
            from models import Task as TaskModel
            task = db.session.get(TaskModel, task_id)
            task.status = 'PROCESSING'
            db.session.commit()
            for page_id in page_ids[:2]:
                page = db.session.get(Page, page_id)
                create_ai_narration_candidate(
                    page,
                    payload={
                        'base_revision': int(page.narration_revision or 0),
                        'operation': operation,
                        'generation_config': {},
                    },
                    result={'text': f'job candidate {page_id}', 'segments': []},
                    source_type='ai_polished',
                    provider_meta=provider_metadata(SimpleNamespace(model='job-model')),
                )
                db.session.commit()
            task = db.session.get(TaskModel, task_id)
            progress = task.get_progress()
            progress.update({'completed': 2, 'failed': 0, 'skipped': 0})
            task.set_progress(progress)
            task.status = 'PROCESSING'
            db.session.commit()

        short_circuit(*a, **kw)

    interrupted_task(task_id, *args[2:], **kwargs)

    listing = client.get(f'/api/projects/{project.id}/narrations/ai-jobs?status=active')
    jobs = assert_success_response(listing)['data']['jobs']
    assert any(job['task_id'] == task_id and job['status'] == 'PROCESSING' for job in jobs)
    active_job = next(job for job in jobs if job['task_id'] == task_id)
    assert active_job['completed'] == 2
    assert set(active_job['page_ids']) == {page.id for page in pages}

    # 候选列表能看到任务已生成的候选（刷新恢复的落点）
    candidates = assert_success_response(
        client.get(f'/api/projects/{project.id}/narration-candidates'),
    )['data']['candidates']
    assert len(candidates) == 2


def test_batch_apply_applies_per_page_and_reports_conflicts(client):
    project, pages = _project_with_pages()
    candidates = [
        _make_candidate(client, project.id, page) for page in pages
    ]

    # 先改一页的 revision，制造冲突（记录应用项发送的过期 revision）
    stale_revision = int(pages[1].narration_revision or 0)
    page = pages[1]
    page.narration_revision = stale_revision + 5
    db.session.commit()

    response = client.post(
        f'/api/projects/{project.id}/narration-candidates/batch-apply',
        json={'items': [
            {'candidate_id': candidates[0]['id'], 'base_revision': int(pages[0].narration_revision or 0)},
            {'candidate_id': candidates[1]['id'], 'base_revision': stale_revision},
            {'candidate_id': candidates[2]['id'], 'base_revision': int(pages[2].narration_revision or 0)},
        ]},
    )
    data = assert_success_response(response)['data']
    by_candidate = {item['candidate_id']: item for item in data['results']}
    assert data['applied'] == 2
    assert by_candidate[candidates[0]['id']]['status'] == 'applied'
    assert by_candidate[candidates[1]['id']]['status'] == 'conflict'
    assert '当前 revision' in by_candidate[candidates[1]['id']]['message']
    assert by_candidate[candidates[2]['id']]['status'] == 'applied'

    # 已应用候选再次应用 → skipped（不能重复应用）
    again = client.post(
        f'/api/projects/{project.id}/narration-candidates/batch-apply',
        json={'items': [{'candidate_id': candidates[0]['id'], 'base_revision': 1}]},
    )
    again_data = assert_success_response(again)['data']
    assert again_data['results'][0]['status'] == 'skipped'


def test_batch_archive_discards_candidates_once(client):
    project, pages = _project_with_pages()
    candidates = [
        _make_candidate(client, project.id, page) for page in pages
    ]

    response = client.post(
        f'/api/projects/{project.id}/narration-candidates/batch-archive',
        json={'candidate_ids': [candidates[0]['id'], candidates[1]['id']]},
    )
    data = assert_success_response(response)['data']
    assert data['archived'] == 2
    assert {item['status'] for item in data['results']} == {'archived'}

    # 再次归档 → skipped
    again = client.post(
        f'/api/projects/{project.id}/narration-candidates/batch-archive',
        json={'candidate_ids': [candidates[0]['id']]},
    )
    again_data = assert_success_response(again)['data']
    assert again_data['results'][0]['status'] == 'skipped'

    # 候选列表只返回候选态
    listing = assert_success_response(
        client.get(f'/api/projects/{project.id}/narration-candidates'),
    )['data']
    assert listing['total'] == 1
    assert listing['candidates'][0]['candidate_id'] == candidates[2]['id']


def test_batch_apply_rejects_foreign_or_missing_candidates(client):
    project, pages = _project_with_pages()
    from services.narration_service import save_manual_narration_version as save_manual

    other = Project(id='narration-foreign-project', creation_type='idea', render_mode='image')
    other_page = Page(
        id='narration-foreign-page', project_id=other.id, order_index=0,
        narration_text='other', narration_status='READY',
    )
    db.session.add_all([other, other_page])
    db.session.commit()
    save_manual(other_page, {'text': 'other', 'base_revision': 0})
    db.session.commit()
    foreign = _make_candidate(client, other.id, other_page)

    response = client.post(
        f'/api/projects/{project.id}/narration-candidates/batch-apply',
        json={'items': [
            {'candidate_id': foreign['id'], 'base_revision': 0},
            {'candidate_id': 'missing-candidate', 'base_revision': 0},
        ]},
    )
    data = assert_success_response(response)['data']
    assert data['applied'] == 0
    assert all(item['status'] == 'error' for item in data['results'])
