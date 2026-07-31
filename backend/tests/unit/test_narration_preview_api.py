from pathlib import Path
import shutil
from unittest.mock import patch

from models import NarrationVersion, Page, Project, Settings, db


def _write_audio(path, content):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return str(path)


def _versioned_page():
    project = Project(id='preview-project', project_title='preview')
    page = Page(id='preview-page', project=project, order_index=0)
    version = NarrationVersion(
        id='preview-version',
        page=page,
        version_number=1,
        mode='dialogue',
        language='zh-CN',
        text='主持人开场。\n嘉宾回答。',
        source_type='manual',
        status='applied',
        content_hash='preview-hash',
        created_by='user',
    )
    version.set_segments([
        {'segment_id': 'seg-host', 'speaker_id': 'host', 'text': '主持人开场。'},
        {'segment_id': 'seg-guest', 'speaker_id': 'guest', 'text': '嘉宾回答。'},
    ])
    page.current_narration_version = version
    db.session.add(project)
    db.session.commit()
    return project, page, version


def test_preview_saved_version_segment_with_edge(client, tmp_path):
    project, page, version = _versioned_page()
    audio_path = _write_audio(tmp_path / 'edge-preview.mp3', b'ID3-edge-version')

    with patch(
        'services.tts_video_service.generate_narration_segments_audio_sync',
        return_value=(audio_path, 1.25, [1.25], False),
    ) as synthesize:
        response = client.post(
            f'/api/projects/{project.id}/pages/{page.id}/narration/preview',
            json={
                'version_id': version.id,
                'segment_id': 'seg-guest',
                'tts_provider': 'edge',
                'voice': 'zh-CN-XiaoxiaoNeural',
            },
        )

    assert response.status_code == 200
    assert response.mimetype == 'audio/mpeg'
    assert response.data == b'ID3-edge-version'
    assert response.headers['X-TTS-Provider'] == 'edge'
    assert response.headers['X-Timing-Quality'] == 'segment_exact'
    assert response.headers['X-Cache-Hit'] == 'false'
    kwargs = synthesize.call_args.kwargs
    assert [segment['text'] for segment in kwargs['segments']] == ['嘉宾回答。']
    assert kwargs['segments'][0]['voice'] == 'zh-CN-XiaoxiaoNeural'
    assert kwargs['return_cache_hit'] is True


def test_preview_unsaved_fish_draft_does_not_leak_secret(client, tmp_path):
    project = Project(id='fish-draft-project', project_title='fish draft')
    page = Page(id='fish-draft-page', project=project, order_index=0)
    db.session.add(project)
    settings = Settings.get_settings()
    settings.fish_audio_api_key = 'fish-preview-secret'
    db.session.commit()
    audio_path = _write_audio(tmp_path / 'fish-preview.mp3', b'ID3-fish-draft')

    with patch(
        'services.tts_video_service.generate_fish_narration_audio_sync',
        return_value=(audio_path, 2.5, [1.2, 1.3], False),
    ) as synthesize:
        response = client.post(
            f'/api/projects/{project.id}/pages/{page.id}/narration/preview',
            json={
                'draft': {
                    'mode': 'dialogue',
                    'language': 'zh-CN',
                    'text': '未保存草稿',
                    'segments': [
                        {'segment_id': 'draft-1', 'speaker_id': 'host', 'text': '先说第一句。'},
                        {'segment_id': 'draft-2', 'speaker_id': 'guest', 'text': '再说第二句。'},
                    ],
                },
                'tts_provider': 'fish_audio',
                'speakers': [
                    {'id': 'host', 'voice': 'fish-host'},
                    {'id': 'guest', 'voice': 'fish-guest'},
                ],
                'auto_emotion': False,
            },
        )

    assert response.status_code == 200
    assert response.data == b'ID3-fish-draft'
    assert response.headers['X-TTS-Provider'] == 'fish_audio'
    assert response.headers['X-Timing-Quality'] == 'estimated'
    assert response.headers['X-Cache-Hit'] == 'false'
    assert b'fish-preview-secret' not in response.data
    assert 'fish-preview-secret' not in str(response.headers)
    kwargs = synthesize.call_args.kwargs
    assert kwargs['api_key'] == 'fish-preview-secret'
    assert kwargs['narration_mode'] == 'dialogue'
    assert kwargs['auto_emotion'] is False
    assert kwargs['return_cache_hit'] is True


def test_preview_fish_reference_error_returns_actionable_400(client):
    from services.fish_audio_service import FishAudioAPIError

    project = Project(id='fish-error-project', project_title='fish error')
    page = Page(id='fish-error-page', project=project, order_index=0)
    db.session.add(project)
    settings = Settings.get_settings()
    settings.fish_audio_api_key = 'fish-preview-secret'
    db.session.commit()

    with patch(
        'services.tts_video_service.generate_fish_narration_audio_sync',
        side_effect=FishAudioAPIError('Reference not found', 404),
    ):
        response = client.post(
            f'/api/projects/{project.id}/pages/{page.id}/narration/preview',
            json={
                'draft': {'mode': 'single', 'language': 'zh-CN', 'text': '试听'},
                'tts_provider': 'fish_audio',
                'voice': 'missing-fish-voice',
            },
        )

    assert response.status_code == 400
    payload = response.get_json()
    assert payload['error']['message'] == 'Fish Audio 声线不存在或不可用，请在设置里同步/创建私有声线后再试听'
    assert 'fish-preview-secret' not in response.get_data(as_text=True)


def test_edge_and_fish_preview_cache_namespaces_do_not_cross(client, tmp_path):
    project = Project(id='cache-project', project_title='cache isolation')
    page = Page(id='cache-page', project=project, order_index=0)
    db.session.add(project)
    settings = Settings.get_settings()
    settings.fish_audio_api_key = 'cache-secret'
    db.session.commit()

    seen_cache_dirs = {}

    def fake_edge(**kwargs):
        cache_dir = Path(kwargs['cache_dir'])
        seen_cache_dirs['edge'] = cache_dir
        marker = cache_dir / 'same-input.mp3'
        cache_hit = marker.exists()
        return _write_audio(marker, b'ID3-edge'), 1.0, [1.0], cache_hit

    def fake_fish(**kwargs):
        cache_dir = Path(kwargs['cache_dir'])
        seen_cache_dirs['fish_audio'] = cache_dir
        marker = cache_dir / 'same-input.mp3'
        cache_hit = marker.exists()
        return _write_audio(marker, b'ID3-fish'), 1.0, [1.0], cache_hit

    payload = {
        'draft': {'mode': 'single', 'text': '完全相同的试听文本'},
        'voice': 'same-voice-id',
    }
    with patch(
        'services.tts_video_service.generate_narration_segments_audio_sync',
        side_effect=fake_edge,
    ), patch(
        'services.tts_video_service.generate_fish_narration_audio_sync',
        side_effect=fake_fish,
    ):
        edge_first = client.post(
            f'/api/projects/{project.id}/pages/{page.id}/narration/preview',
            json={**payload, 'tts_provider': 'edge'},
        )
        fish_first = client.post(
            f'/api/projects/{project.id}/pages/{page.id}/narration/preview',
            json={**payload, 'tts_provider': 'fish_audio'},
        )
        edge_second = client.post(
            f'/api/projects/{project.id}/pages/{page.id}/narration/preview',
            json={**payload, 'tts_provider': 'edge'},
        )
        fish_second = client.post(
            f'/api/projects/{project.id}/pages/{page.id}/narration/preview',
            json={**payload, 'tts_provider': 'fish_audio'},
        )

    assert edge_first.headers['X-Cache-Hit'] == 'false'
    assert fish_first.headers['X-Cache-Hit'] == 'false'
    assert edge_second.headers['X-Cache-Hit'] == 'true'
    assert fish_second.headers['X-Cache-Hit'] == 'true'
    assert seen_cache_dirs['edge'] != seen_cache_dirs['fish_audio']
    assert seen_cache_dirs['edge'].name == 'edge'
    assert seen_cache_dirs['fish_audio'].name == 'fish_audio'


def test_existing_edge_and_fish_generators_report_cache_hits(tmp_path):
    from services.tts_video_service import (
        generate_fish_narration_audio_sync,
        generate_narration_segments_audio_sync,
    )

    edge_cache = tmp_path / 'edge-cache'
    edge_work = tmp_path / 'edge-work'

    def fake_edge_tts(_text, output_path, **_kwargs):
        _write_audio(output_path, b'ID3-edge-cache')
        return 1.0

    def fake_pad(src_path, dst_path, **_kwargs):
        Path(dst_path).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src_path, dst_path)
        return 1.0

    def fake_ffmpeg(command, _message):
        _write_audio(command[-1], b'ID3-edge-page')

    with patch('services.tts_video_service.generate_tts_audio_sync', side_effect=fake_edge_tts) as edge_tts, \
         patch('services.tts_video_service.pad_audio_with_silence', side_effect=fake_pad), \
         patch('services.tts_video_service._run_ffmpeg_command', side_effect=fake_ffmpeg), \
         patch('services.tts_video_service.get_audio_duration', return_value=1.0):
        edge_first = generate_narration_segments_audio_sync(
            segments=[{'speaker_id': 'host', 'text': '缓存测试'}],
            cache_dir=str(edge_cache),
            working_dir=str(edge_work),
            default_voice='zh-CN-XiaoxiaoNeural',
            rate='+0%',
            return_cache_hit=True,
        )
        edge_second = generate_narration_segments_audio_sync(
            segments=[{'speaker_id': 'host', 'text': '缓存测试'}],
            cache_dir=str(edge_cache),
            working_dir=str(edge_work),
            default_voice='zh-CN-XiaoxiaoNeural',
            rate='+0%',
            return_cache_hit=True,
        )

    fish_cache = tmp_path / 'fish-cache'
    fish_work = tmp_path / 'fish-work'

    def fake_fish_tts(**kwargs):
        _write_audio(kwargs['output_path'], b'ID3-fish-cache')

    fish_kwargs = {
        'segments': [{'speaker_id': 'host', 'text': '缓存测试'}],
        'speakers': [{'id': 'host', 'voice': 'fish-host'}],
        'narration_mode': 'single',
        'cache_dir': str(fish_cache),
        'working_dir': str(fish_work),
        'api_key': 'secret-not-in-cache-key',
        'return_cache_hit': True,
    }
    with patch('services.fish_audio_service.synthesize', side_effect=fake_fish_tts) as fish_tts, \
         patch('services.tts_video_service.get_audio_duration', return_value=1.0):
        fish_first = generate_fish_narration_audio_sync(**fish_kwargs)
        fish_second = generate_fish_narration_audio_sync(**fish_kwargs)

    assert edge_first[3] is False
    assert edge_second[3] is True
    assert edge_tts.call_count == 1
    assert fish_first[3] is False
    assert fish_second[3] is True
    assert fish_tts.call_count == 1
