from io import BytesIO
from unittest.mock import Mock

import pytest


def _run_workspace_task_now(task, _app):
    from services.task_manager import initialize_content_workspace_task

    initialize_content_workspace_task(
        task.id,
        **task.get_progress()['_resume']['kwargs'],
    )


@pytest.mark.parametrize('workspace_kind', ['ppt', 'video', 'podcast'])
def test_create_content_project_initializes_only_selected_workspace(
    client, app, monkeypatch, workspace_kind,
):
    from models import ContentSpine, ProjectWorkspace, Task, WorkspaceVersion, db

    ai_probe = Mock()
    monkeypatch.setattr(
        'controllers.content_workspace_controller.submit_workspace_task',
        _run_workspace_task_now,
    )
    monkeypatch.setattr('controllers.project_controller.get_ai_service', ai_probe)
    response = client.post('/api/projects', json={
        'creation_type': 'idea',
        'idea_prompt': f'{workspace_kind} 统一项目',
        'audience': '产品团队',
        'goal': '生成第一版',
        'initial_workspace': workspace_kind,
    })

    assert response.status_code == 202
    payload = response.get_json()['data']
    project_id = payload['project_id']
    initialization_task = payload['initialization_task']
    assert initialization_task['task_id'] == payload['task_id']
    assert initialization_task['task_type'] == 'INITIALIZE_CONTENT_WORKSPACE'
    assert initialization_task['workspace_kind'] == workspace_kind
    assert initialization_task['status'] == 'COMPLETED'
    assert initialization_task['progress']['stage'] == 'completed'
    assert '_resume' not in initialization_task['progress']
    with app.app_context():
        workspaces = ProjectWorkspace.query.filter_by(project_id=project_id).all()
        selected = next(item for item in workspaces if item.kind == workspace_kind)
        untouched = [item for item in workspaces if item.kind != workspace_kind]
        assert ContentSpine.query.filter_by(project_id=project_id).count() == 1
        assert len(workspaces) == 3
        assert selected.state == 'draft'
        assert selected.current_version_id
        assert all(item.state == 'uninitialized' for item in untouched)
        assert WorkspaceVersion.query.count() == 1
        assert Task.query.filter_by(project_id=project_id).one().status == 'COMPLETED'
    ai_probe.assert_not_called()

    summary = client.get(f'/api/content-projects/{project_id}')
    assert summary.status_code == 200
    summary_data = summary.get_json()['data']
    assert len(summary_data['workspaces']) == 3
    assert summary_data['lifecycle_state'] == 'active'
    assert summary_data['project_settings']['pronunciation_lexicon'] == []
    assert summary_data['created_at']
    assert 'stage' in summary_data['workspaces'][0]


def test_other_workspace_requires_confirmed_spine_then_uses_task(client, app, monkeypatch):
    from models import ProjectWorkspace, Task

    monkeypatch.setattr(
        'controllers.content_workspace_controller.submit_workspace_task',
        _run_workspace_task_now,
    )
    created = client.post('/api/projects', json={
        'creation_type': 'idea',
        'idea_prompt': '确认门禁',
        'initial_workspace': 'ppt',
    }).get_json()['data']
    project_id = created['project_id']

    blocked = client.post(
        f'/api/content-projects/{project_id}/workspaces/video/initialize',
        json={},
    )
    assert blocked.status_code == 409
    assert blocked.get_json()['error']['code'] == 'SPINE_CONFIRMATION_REQUIRED'

    confirmed = client.post(
        f'/api/content-projects/{project_id}/spine/confirm',
        json={'expected_revision': 1},
    )
    assert confirmed.status_code == 200
    initialized = client.post(
        f'/api/content-projects/{project_id}/workspaces/video/initialize',
        json={'settings': {'aspect_ratio': '16:9'}},
    )
    assert initialized.status_code == 202
    initialization_task = initialized.get_json()['data']['initialization_task']
    assert initialization_task['workspace_kind'] == 'video'
    assert initialization_task['task_type'] == 'INITIALIZE_CONTENT_WORKSPACE'
    assert initialization_task['task_id'] == initialized.get_json()['data']['task_id']
    assert '_resume' not in initialization_task['progress']
    with app.app_context():
        video = ProjectWorkspace.query.filter_by(
            project_id=project_id, kind='video',
        ).one()
        assert video.state == 'draft'
        assert Task.query.filter_by(project_id=project_id).count() == 2


def test_video_workspace_can_initialize_from_existing_ppt(client, app, monkeypatch):
    from models import Page, ProjectWorkspace, WorkspaceVersion, db

    monkeypatch.setattr(
        'controllers.content_workspace_controller.submit_workspace_task',
        _run_workspace_task_now,
    )
    project_id = client.post('/api/projects', json={
        'creation_type': 'idea',
        'idea_prompt': 'PPT 转视频',
        'initial_workspace': 'ppt',
    }).get_json()['data']['project_id']
    with app.app_context():
        page = Page(project_id=project_id, order_index=0, status='COMPLETED')
        page.set_outline_content({'title': '关键结论'})
        page.set_description_content({'text': '把关键结论讲清楚。'})
        page.set_narration_segments([
            {'speaker_id': 'host', 'text': '先看结论。'},
            {'speaker_id': 'expert', 'text': '再解释原因。'},
        ])
        db.session.add(page)
        db.session.commit()

    assert client.post(
        f'/api/content-projects/{project_id}/workspaces/video/initialize-from-ppt',
        json={},
    ).status_code == 409
    assert client.post(
        f'/api/content-projects/{project_id}/spine/confirm',
        json={'expected_revision': 1},
    ).status_code == 200
    initialized = client.post(
        f'/api/content-projects/{project_id}/workspaces/video/initialize-from-ppt',
        json={'settings': {'aspect_ratio': '16:9'}},
    )

    assert initialized.status_code == 201
    payload = initialized.get_json()['data']
    assert payload['source_kind'] == 'ppt'
    assert payload['document']['scenes'][0]['visual']['source_ref']
    document = payload['document']
    document['scenes'][0]['narration']['text'] = '更新后的讲解内容。'
    updated = client.put(
        f'/api/content-projects/{project_id}/workspaces/video',
        json={'base_revision': 1, 'document': document},
    )
    assert updated.status_code == 200
    proposal = client.post(
        f'/api/content-projects/{project_id}/workspaces/video/propose-to-spine',
        json={'target_base_revision': 1},
    )
    assert proposal.status_code == 201
    diff_text = str(proposal.get_json()['data']['diff'])
    assert '更新后的讲解内容' in diff_text
    assert 'animation' not in diff_text
    assert 'audio_cues' not in diff_text
    assert 'visual' not in diff_text
    with app.app_context():
        video = ProjectWorkspace.query.filter_by(
            project_id=project_id, kind='video',
        ).one()
        assert video.current_version_id
        assert WorkspaceVersion.query.filter_by(workspace_id=video.id).count() == 2


def test_native_browser_frames_create_a_video_workspace_revision(client, app, monkeypatch):
    from PIL import Image
    from models import Page, ProjectWorkspace, db

    monkeypatch.setattr(
        'controllers.content_workspace_controller.submit_workspace_task',
        _run_workspace_task_now,
    )
    project_id = client.post('/api/projects', json={
        'creation_type': 'idea',
        'idea_prompt': '阶段帧交接',
        'initial_workspace': 'ppt',
    }).get_json()['data']['project_id']
    with app.app_context():
        page = Page(project_id=project_id, order_index=0, status='COMPLETED')
        page.set_outline_content({'title': '阶段动画'})
        page.set_description_content({'text': '逐步呈现。'})
        db.session.add(page)
        db.session.commit()
        page_id = page.id
    assert client.post(
        f'/api/content-projects/{project_id}/spine/confirm',
        json={'expected_revision': 1},
    ).status_code == 200
    assert client.post(
        f'/api/content-projects/{project_id}/workspaces/video/initialize-from-ppt',
        json={},
    ).status_code == 201
    image = BytesIO()
    Image.new('RGB', (8, 8), 'white').save(image, format='PNG')
    image.seek(0)

    response = client.post(
        f'/api/content-projects/{project_id}/workspaces/video/browser-frames',
        data={
            'page_ids': f'["{page_id}"]',
            'frame_counts': '[1]',
            'frames': (image, 'frame.png'),
        },
        content_type='multipart/form-data',
    )

    assert response.status_code == 200
    assert response.get_json()['data']['attached'] is True
    with app.app_context():
        video = ProjectWorkspace.query.filter_by(project_id=project_id, kind='video').one()
        assert video.revision == 2
        handoff = video.current_version and __import__('json').loads(
            video.current_version.settings_json,
        )['browser_frame_handoff']
        assert handoff['frames'][0]['page_id'] == page_id
        assert len(handoff['frames'][0]['sha256'][0]) == 64


def test_video_workspace_export_freezes_current_workspace_version(client, app, monkeypatch):
    from models import Task

    monkeypatch.setattr(
        'controllers.content_workspace_controller.submit_workspace_task',
        _run_workspace_task_now,
    )
    submitted = []
    monkeypatch.setattr(
        'controllers.content_workspace_controller.task_manager.submit_task',
        lambda task_id, _fn, **kwargs: submitted.append((task_id, kwargs)),
    )
    project_id = client.post('/api/projects', json={
        'creation_type': 'idea', 'idea_prompt': '视频导出快照', 'initial_workspace': 'video',
    }).get_json()['data']['project_id']
    document = client.get(f'/api/content-projects/{project_id}').get_json()['data']['workspaces'][1]['document']
    document['scenes'] = [{
        'scene_id': 'scene.1', 'title': '导出场景',
        'visual': {'kind': 'blank', 'source_ref': None},
        'narration': {'mode': 'single', 'text': '这是旁白。', 'segments': []},
        'subtitles': {'enabled': True, 'text': '这是旁白。'},
        'duration_ms': 3000, 'transition': 'cut',
        'animation': {'intensity': 'subtle', 'cues': []}, 'audio_cues': [],
    }]
    assert client.put(
        f'/api/content-projects/{project_id}/workspaces/video',
        json={'base_revision': 1, 'document': document},
    ).status_code == 200

    response = client.post(
        f'/api/content-projects/{project_id}/workspaces/video/export',
        json={'filename': '../safe-name', 'enable_ken_burns': True},
    )

    assert response.status_code == 202, response.get_json()
    payload = response.get_json()['data']
    assert payload['workspace_version']['revision'] == 2
    assert submitted[0][1]['filename'] == 'safe-name.mp4'
    with app.app_context():
        task = Task.query.get(payload['task_id'])
        assert task.task_type == 'EXPORT_VIDEO_WORKSPACE'
        resume = task.get_progress()['_resume']['kwargs']
        assert resume['snapshot_hash']
        assert resume['render_profile'] == 'final'

    import services.tts_video_service as tts_video_service

    monkeypatch.setattr(tts_video_service, 'check_ffmpeg_available', lambda _path: True)
    monkeypatch.setattr(
        tts_video_service,
        'create_placeholder_frame',
        lambda path, **_kwargs: __import__('pathlib').Path(path).write_bytes(b'png'),
    )
    monkeypatch.setattr(
        tts_video_service,
        'generate_narration_video',
        lambda **kwargs: {'scene_count': len(kwargs['pages_data'])},
    )
    from services.task_manager import export_video_workspace_task

    export_video_workspace_task(payload['task_id'], **submitted[0][1])
    with app.app_context():
        task = Task.query.get(payload['task_id'])
        assert task.status == 'COMPLETED'
        assert task.get_progress()['fallback_scenes'] == [{
            'scene_id': 'scene.1', 'reason': 'scene_has_no_renderable_page_source',
        }]


def test_video_workspace_proof_then_final_reuses_snapshot(client, app, monkeypatch):
    from models import Task

    monkeypatch.setattr(
        'controllers.content_workspace_controller.submit_workspace_task',
        _run_workspace_task_now,
    )
    submitted = []
    monkeypatch.setattr(
        'controllers.content_workspace_controller.task_manager.submit_task',
        lambda task_id, _fn, **kwargs: submitted.append((task_id, kwargs)),
    )
    project_id = client.post('/api/projects', json={
        'creation_type': 'idea', 'idea_prompt': 'Proof Final 快照', 'initial_workspace': 'video',
    }).get_json()['data']['project_id']
    document = client.get(f'/api/content-projects/{project_id}').get_json()['data']['workspaces'][1]['document']
    document['scenes'] = [{
        'scene_id': 'scene.1', 'title': 'Proof 场景',
        'visual': {'kind': 'blank', 'source_ref': None},
        'narration': {'mode': 'single', 'text': 'Proof 旁白。', 'segments': []},
        'subtitles': {'enabled': True, 'text': 'Proof 旁白。'},
        'duration_ms': 3000, 'transition': 'cut',
        'animation': {'intensity': 'subtle', 'cues': []}, 'audio_cues': [],
    }]
    assert client.put(
        f'/api/content-projects/{project_id}/workspaces/video',
        json={'base_revision': 1, 'document': document},
    ).status_code == 200

    proof_response = client.post(
        f'/api/content-projects/{project_id}/workspaces/video/export',
        json={'render_profile': 'proof'},
    )
    assert proof_response.status_code == 202, proof_response.get_json()
    proof_task_id = proof_response.get_json()['data']['task_id']
    proof_kwargs = submitted[0][1]
    assert proof_kwargs['render_profile'] == 'proof'
    assert proof_kwargs['source_proof_task_id'] is None

    import services.tts_video_service as tts_video_service
    captured = {}
    monkeypatch.setattr(tts_video_service, 'check_ffmpeg_available', lambda _path: True)
    monkeypatch.setattr(
        tts_video_service,
        'create_placeholder_frame',
        lambda path, **_kwargs: __import__('pathlib').Path(path).write_bytes(b'png'),
    )
    monkeypatch.setattr(
        tts_video_service,
        'generate_narration_video',
        lambda **kwargs: (captured.update(kwargs) or {'scene_count': len(kwargs['pages_data'])}),
    )
    from services.task_manager import export_video_workspace_task
    export_video_workspace_task(proof_task_id, **proof_kwargs)
    assert captured['width'] == 960
    assert captured['height'] == 540
    assert captured['fps'] == 15

    final_response = client.post(
        f'/api/content-projects/{project_id}/workspaces/video/export',
        json={'render_profile': 'final', 'source_proof_task_id': proof_task_id},
    )
    assert final_response.status_code == 202, final_response.get_json()
    final_kwargs = submitted[1][1]
    assert final_kwargs['render_profile'] == 'final'
    assert final_kwargs['source_proof_task_id'] == proof_task_id
    assert final_kwargs['snapshot_path'] == proof_kwargs['snapshot_path']
    assert final_kwargs['snapshot_hash'] == proof_kwargs['snapshot_hash']


def test_podcast_workspace_export_freezes_current_workspace_version(client, app, monkeypatch):
    from models import Task
    monkeypatch.setattr('controllers.content_workspace_controller.submit_workspace_task', _run_workspace_task_now)
    submitted = []
    monkeypatch.setattr('controllers.content_workspace_controller.task_manager.submit_task', lambda task_id, _fn, **kwargs: submitted.append((task_id, kwargs)))
    project_id = client.post('/api/projects', json={'creation_type': 'idea', 'idea_prompt': '播客导出快照', 'initial_workspace': 'podcast'}).get_json()['data']['project_id']
    document = client.get(f'/api/content-projects/{project_id}').get_json()['data']['workspaces'][2]['document']
    document['segments'] = [{'segment_id': 'segment.1', 'speaker_id': document['speakers'][0]['speaker_id'], 'text': '导出内容。', 'locked': False, 'audio_cues': []}]
    assert client.put(f'/api/content-projects/{project_id}/workspaces/podcast', json={'base_revision': 1, 'document': document}).status_code == 200
    response = client.post(f'/api/content-projects/{project_id}/workspaces/podcast/export', json={'filename': '../safe-podcast'})
    assert response.status_code == 202, response.get_json()
    payload = response.get_json()['data']
    assert submitted[0][1]['filename'] == 'safe-podcast.mp3'
    assert payload['workspace_version']['revision'] == 2
    with app.app_context():
        task = Task.query.get(payload['task_id'])
        assert task.task_type == 'EXPORT_PODCAST_WORKSPACE'
        resume = task.get_progress()['_resume']['kwargs']
        assert resume['snapshot_hash']
        from services.podcast_export_service import load_podcast_export_snapshot
        frozen = load_podcast_export_snapshot(resume['snapshot_path'], resume['snapshot_hash'])
        assert frozen['export_config']['format'] == 'mp3'
    import subprocess
    source_audio = app.config['UPLOAD_FOLDER'] + '/source.mp3'
    subprocess.run(['ffmpeg', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', source_audio], check=True, capture_output=True)
    import services.tts_video_service as tts_video_service

    monkeypatch.setattr(
        tts_video_service,
        'generate_fish_narration_audio_sync',
        lambda **_kwargs: (source_audio, 1.5, []),
    )
    app.config['FISH_AUDIO_API_KEY'] = 'test-key'
    from services.task_manager import export_podcast_workspace_task
    export_podcast_workspace_task(payload['task_id'], **submitted[0][1])
    with app.app_context():
        task = Task.query.get(payload['task_id'])
        assert task.status == 'COMPLETED'
        assert task.get_progress()['workspace_version']['revision'] == 2
        assert len(task.get_progress()['audio_mix_manifest_hash']) == 64
        assert task.get_progress()['peak_db'] <= 0
        assert task.get_progress()['sidecars']['transcript'].endswith('.transcript.json')


def test_podcast_workspace_export_accepts_wav_format(client, app, monkeypatch):
    from models import Task
    monkeypatch.setattr('controllers.content_workspace_controller.submit_workspace_task', _run_workspace_task_now)
    submitted = []
    monkeypatch.setattr('controllers.content_workspace_controller.task_manager.submit_task', lambda task_id, _fn, **kwargs: submitted.append((task_id, kwargs)))
    project_id = client.post('/api/projects', json={'creation_type': 'idea', 'idea_prompt': 'WAV 播客导出', 'initial_workspace': 'podcast'}).get_json()['data']['project_id']
    document = client.get(f'/api/content-projects/{project_id}').get_json()['data']['workspaces'][2]['document']
    document['segments'] = [{'segment_id': 'segment.1', 'speaker_id': document['speakers'][0]['speaker_id'], 'text': 'WAV 内容。', 'locked': False, 'audio_cues': []}]
    assert client.put(f'/api/content-projects/{project_id}/workspaces/podcast', json={'base_revision': 1, 'document': document}).status_code == 200
    response = client.post(f'/api/content-projects/{project_id}/workspaces/podcast/export', json={'filename': '../episode', 'format': 'wav'})
    assert response.status_code == 202, response.get_json()
    assert submitted[0][1]['filename'] == 'episode.wav'
    with app.app_context():
        task = Task.query.get(response.get_json()['data']['task_id'])
        resume = task.get_progress()['_resume']['kwargs']
        from services.podcast_export_service import load_podcast_export_snapshot
        frozen = load_podcast_export_snapshot(resume['snapshot_path'], resume['snapshot_hash'])
        assert frozen['export_config']['format'] == 'wav'


def test_podcast_workspace_export_times_out_fish_audio(client, app, monkeypatch):
    import time
    from models import Task

    monkeypatch.setattr('controllers.content_workspace_controller.submit_workspace_task', _run_workspace_task_now)
    submitted = []
    monkeypatch.setattr('controllers.content_workspace_controller.task_manager.submit_task', lambda task_id, _fn, **kwargs: submitted.append((task_id, kwargs)))
    project_id = client.post('/api/projects', json={'creation_type': 'idea', 'idea_prompt': 'podcast timeout', 'initial_workspace': 'podcast'}).get_json()['data']['project_id']
    document = client.get(f'/api/content-projects/{project_id}').get_json()['data']['workspaces'][2]['document']
    document['segments'] = [{'segment_id': 'segment.1', 'speaker_id': document['speakers'][0]['speaker_id'], 'text': 'timeout body', 'locked': False, 'audio_cues': []}]
    assert client.put(f'/api/content-projects/{project_id}/workspaces/podcast', json={'base_revision': 1, 'document': document}).status_code == 200
    response = client.post(f'/api/content-projects/{project_id}/workspaces/podcast/export', json={'filename': 'timeout-podcast'})
    assert response.status_code == 202, response.get_json()

    import services.tts_video_service as tts_video_service

    captured = {}

    def slow_tts(**kwargs):
        captured.update(kwargs)
        time.sleep(1)
        return ('never.mp3', 1.0, [])

    monkeypatch.setattr(tts_video_service, 'generate_fish_narration_audio_sync', slow_tts)
    app.config['FISH_AUDIO_API_KEY'] = 'test-key'
    app.config['FISH_AUDIO_TTS_TOTAL_TIMEOUT'] = 0.1
    from services.task_manager import export_podcast_workspace_task

    export_podcast_workspace_task(response.get_json()['data']['task_id'], **submitted[0][1])

    with app.app_context():
        task = Task.query.get(response.get_json()['data']['task_id'])
        assert task.status == 'FAILED'
        assert 'Fish Audio' in task.error_message
        assert '超过 0.1 秒' in task.error_message
    assert captured['request_timeout'] == (0.1, 0.1)


def test_podcast_workspace_preview_uses_workspace_revision_and_edge_cache(client, app, monkeypatch, tmp_path):
    import services.tts_video_service

    monkeypatch.setattr('controllers.content_workspace_controller.submit_workspace_task', _run_workspace_task_now)
    project_id = client.post('/api/projects', json={
        'creation_type': 'idea', 'idea_prompt': '播客试听', 'initial_workspace': 'podcast',
    }).get_json()['data']['project_id']
    document = client.get(f'/api/content-projects/{project_id}').get_json()['data']['workspaces'][2]['document']
    document['segments'] = [{
        'segment_id': 'segment.1', 'speaker_id': document['speakers'][0]['speaker_id'],
        'text': '试听内容。', 'locked': False, 'audio_cues': [],
    }]
    assert client.put(
        f'/api/content-projects/{project_id}/workspaces/podcast',
        json={'base_revision': 1, 'document': document},
    ).status_code == 200
    audio = tmp_path / 'preview.mp3'
    audio.write_bytes(b'preview')
    import importlib
    tts_video_service = importlib.import_module('services.tts_video_service')
    monkeypatch.setattr(
        tts_video_service,
        'generate_narration_segments_audio_sync',
        lambda **_kwargs: (str(audio), 1.0, [1.0], True),
    )

    response = client.post(
        f'/api/content-projects/{project_id}/workspaces/podcast/preview',
        json={'provider': 'edge', 'segment_id': 'segment.1'},
    )

    assert response.status_code == 200
    assert response.data == b'preview'
    assert response.headers['X-TTS-Provider'] == 'edge'
    assert response.headers['X-Cache-Hit'] == 'true'
    assert response.headers['X-Workspace-Revision'] == '2'


def test_content_project_summary_and_last_entry_are_available_from_project_list(
    client, monkeypatch,
):
    monkeypatch.setattr(
        'controllers.content_workspace_controller.submit_workspace_task',
        _run_workspace_task_now,
    )
    created = client.post('/api/projects', json={
        'creation_type': 'idea',
        'idea_prompt': '统一项目卡片',
        'initial_workspace': 'video',
    }).get_json()['data']
    project_id = created['project_id']

    updated = client.put(
        f'/api/content-projects/{project_id}/last-workspace',
        json={'entry': 'spine'},
    )
    assert updated.status_code == 200
    assert updated.get_json()['data']['last_workspace'] == 'spine'

    projects = client.get('/api/projects?limit=8&offset=0').get_json()['data']['projects']
    project = next(item for item in projects if item['project_id'] == project_id)
    assert project['last_workspace'] == 'spine'
    assert {item['kind'] for item in project['workspaces']} == {'ppt', 'video', 'podcast'}
    assert next(item for item in project['workspaces'] if item['kind'] == 'video')['state'] == 'draft'

    invalid = client.put(
        f'/api/content-projects/{project_id}/last-workspace',
        json={'entry': 'materials'},
    )
    assert invalid.status_code == 400


def test_legacy_project_creation_contract_stays_synchronous(client, app):
    from models import ContentSpine, ProjectWorkspace

    response = client.post('/api/projects', json={
        'creation_type': 'idea',
        'idea_prompt': '旧创建契约',
    })

    assert response.status_code == 201
    project_id = response.get_json()['data']['project_id']
    with app.app_context():
        assert ContentSpine.query.filter_by(project_id=project_id).count() == 1
        assert ProjectWorkspace.query.filter_by(project_id=project_id).count() == 3
        assert ProjectWorkspace.query.filter_by(
            project_id=project_id, kind='ppt', state='draft'
        ).count() == 1


def test_content_project_creation_rolls_back_all_records_on_transaction_failure(
    client, app, monkeypatch,
):
    from models import ContentSpine, Project, ProjectWorkspace, Task

    def fail_workspace_creation(_project_id):
        raise RuntimeError('injected workspace creation failure')

    monkeypatch.setattr(
        'services.project_workspace_service.create_workspace_set',
        fail_workspace_creation,
    )
    response = client.post('/api/projects', json={
        'creation_type': 'idea',
        'idea_prompt': '事务回滚',
        'initial_workspace': 'video',
    })

    assert response.status_code == 500
    with app.app_context():
        assert Project.query.count() == 0
        assert ContentSpine.query.count() == 0
        assert ProjectWorkspace.query.count() == 0
        assert Task.query.count() == 0


def test_paused_workspace_task_resumes_with_frozen_input(client, monkeypatch):
    monkeypatch.setattr(
        'controllers.content_workspace_controller.submit_workspace_task',
        lambda _task, _app: None,
    )
    created = client.post('/api/projects', json={
        'creation_type': 'idea',
        'idea_prompt': '冻结输入',
        'initial_workspace': 'podcast',
    }).get_json()['data']
    project_id = created['project_id']
    task_id = created['task_id']
    assert client.post(
        f'/api/projects/{project_id}/tasks/{task_id}/pause',
    ).status_code == 200

    summary = client.get(f'/api/content-projects/{project_id}').get_json()['data']
    document = summary['spine']['document']
    document['topic']['value'] = '当前输入已变化'
    assert client.put(
        f'/api/content-projects/{project_id}/spine',
        json={'document': document, 'expected_revision': 1},
    ).status_code == 200

    submitted = []
    monkeypatch.setattr(
        'controllers.content_workspace_controller.submit_workspace_task',
        lambda task, _app: submitted.append(
            task.get_progress()['_resume']['kwargs']['spine_document']['topic']['value']
        ),
    )
    resumed = client.post(
        f'/api/projects/{project_id}/tasks/{task_id}/resume',
    )

    assert resumed.status_code == 200
    assert submitted == ['冻结输入']
