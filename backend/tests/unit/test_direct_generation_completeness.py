"""Direct video/podcast candidate completeness (plan §7.2/§7.3/阶段0).

阶段 0 冻结契约：直接视频候选不是空画面机械切块；直接播客候选包含
节目结构、角色与真实声音 ID，不写 `default`/空值。
当前构建器是 mechanical first-pass，本套测试必须失败。
"""

import json

import pytest


@pytest.fixture()
def enabled(monkeypatch):
    monkeypatch.setenv('WORKSPACE_GENERATION_RUNS_ENABLED', 'true')


def _run_to_review(client, app, kind, topic):
    from controllers import workspace_generation_controller as controller
    from models import WorkspaceGenerationRun, db
    from services.task_manager import generate_workspace_candidate_task

    controller.task_manager.submit_task = lambda *a, **k: None
    try:
        project_id = client.post('/api/projects', json={
            'creation_type': 'idea',
            'idea_prompt': topic,
            'initial_workspace': 'ppt',
        }).get_json()['data']['project_id']
        response = client.post(f'/api/projects/{project_id}/workspace-generation-runs', json={
            'target_workspace_kind': kind,
            'source_kind': 'brief',
            'mode': 'direct',
            'options': {'target_duration_seconds': 120},
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
    return project_id, json.loads(run.candidate_document_json)


class TestDirectVideoCompleteness:
    def test_direct_video_scenes_have_real_visual_plans(self, client, app, enabled):
        _, candidate = _run_to_review(client, app, 'video', '第一章：背景\n\n第二章：方案\n\n第三章：行动')
        assert len(candidate['scenes']) >= 2
        for scene in candidate['scenes']:
            # 契约：每个场景有真实画面计划（当前机械切块 visual=blank，测试失败）
            assert scene['visual']['kind'] != 'blank'
            assert scene['visual'].get('prompt') or scene['visual'].get('asset_ref')
            # 契约：声音与表现力已固化（当前候选无 voice 字段，测试失败）
            assert scene.get('voice', {}).get('voice_profile_id')
            assert scene.get('voice', {}).get('expressiveness_id')

    def test_direct_video_scene_has_duration_and_transition(self, client, app, enabled):
        _, candidate = _run_to_review(client, app, 'video', '第一章：背景\n\n第二章：方案')
        for scene in candidate['scenes']:
            assert scene['duration_ms'] > 0
            assert scene['transition']['type'] in {'cut', 'fade', 'dissolve', 'slide'}


class TestDirectPodcastCompleteness:
    def test_direct_podcast_has_program_structure_and_roles(self, client, app, enabled):
        _, candidate = _run_to_review(client, app, 'podcast', '第一章：背景\n\n第二章：方案')
        # 契约：节目标题与角色存在（当前机械切块 speaker 默认，测试失败）
        assert candidate.get('title')
        assert len(candidate.get('speakers') or []) >= 1
        for speaker in candidate['speakers']:
            # 契约：角色声音为真实 canonical ID（当前为空/默认，测试失败）
            voice = speaker.get('voice_ref') or ''
            assert voice.startswith(('edge:', 'fish:'))
            assert 'default' not in voice.lower()

    def test_direct_podcast_segments_have_roles_and_canonical_voices(self, client, app, enabled):
        _, candidate = _run_to_review(client, app, 'podcast', '第一章：背景\n\n第二章：方案')
        assert len(candidate.get('segments') or []) >= 2
        speakers_by_id = {s['speaker_id']: s for s in candidate['speakers']}
        for segment in candidate['segments']:
            speaker = speakers_by_id.get(segment['speaker_id'])
            # 契约：片段解析到真实角色且角色声音为 canonical ID（当前默认/空，测试失败）
            assert speaker is not None
            voice = speaker.get('voice_ref') or ''
            assert voice.startswith(('edge:', 'fish:'))
            # 契约：片段有独立标题，不用正文第一行冒充（当前机械切块无标题，测试失败）
            assert segment.get('title') and segment['title'].strip()
