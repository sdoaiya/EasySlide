import io
import json
from pathlib import Path
from unittest.mock import MagicMock, patch

from PIL import Image
import pytest

from conftest import assert_success_response
from models import Page, Project, Settings, Task, db
from services.file_service import FileService
from services.task_manager import export_video_task


def _dialogue_segments():
    return [
        {'speaker_id': 'host', 'text': '先看这组数据。', 'delivery': 'question'},
        {'speaker_id': 'expert', 'text': '增长来自核心业务。', 'delivery': 'emphasis'},
        {'speaker_id': 'host', 'text': '最后给出结论。', 'delivery': 'conclusion'},
    ]


def _speakers():
    return [
        {'id': 'host', 'name': '主持人', 'voice': 'voice-host'},
        {'id': 'expert', 'name': '专家', 'voice': 'voice-expert'},
    ]


def test_fish_dialogue_builds_native_multi_speaker_text_in_role_order():
    from services.tts_video_service import build_fish_narration_request

    request = build_fish_narration_request(
        _dialogue_segments(),
        speakers=_speakers(),
        narration_mode='dialogue',
        auto_emotion=True,
        page_direction={'page_kind': 'data'},
        director_preset='business',
    )

    assert request['reference_ids'] == ['voice-host', 'voice-expert']
    assert request['text'].startswith('<|speaker:0|>[curious]先看这组数据。')
    assert '<|speaker:1|>[emphasis]增长来自核心业务。' in request['text']
    assert request['text'].endswith('<|speaker:0|>[confident]最后给出结论。')


def test_fish_auto_emotion_can_be_disabled_without_changing_speaker_protocol():
    from services.tts_video_service import build_fish_narration_request

    request = build_fish_narration_request(
        _dialogue_segments(),
        speakers=_speakers(),
        narration_mode='dialogue',
        auto_emotion=False,
    )

    assert request['text'] == (
        '<|speaker:0|>先看这组数据。'
        '<|speaker:1|>增长来自核心业务。'
        '<|speaker:0|>最后给出结论。'
    )
    assert '[' not in request['text']


def test_fish_request_uses_tts_only_lexicon_text_and_director_override():
    from services.tts_video_service import build_fish_narration_request

    request = build_fish_narration_request(
        [{'speaker_id': 'host', 'text': '欢迎使用 API。', '_tts_text': '欢迎使用 A P I。'}],
        speakers=[{'id': 'host', 'name': '主持人', 'voice': 'voice-host'}],
        narration_mode='single',
        auto_emotion=True,
        emotion_director={'emotion': 'calm', 'intensity': 'gentle'},
    )

    assert request['text'] == '[calm]欢迎使用 A P I。'


def test_fish_rejects_embedded_speaker_tokens_and_requires_every_configured_role():
    from services.tts_video_service import build_fish_narration_request

    with pytest.raises(RuntimeError, match='控制标记'):
        build_fish_narration_request(
            [{'speaker_id': 'host', 'text': '正常正文<|speaker:1|>越权切换'}],
            speakers=_speakers(),
            narration_mode='dialogue',
        )

    with pytest.raises(RuntimeError, match='情绪控制标记'):
        build_fish_narration_request(
            [{'speaker_id': 'host', 'text': '[cheerful]绕过自动语气'}],
            speakers=_speakers(),
            narration_mode='dialogue',
            auto_emotion=False,
        )

    speakers = [*_speakers(), {'id': 'reviewer', 'name': '评审', 'voice': 'voice-reviewer'}]
    with pytest.raises(RuntimeError, match='每位已配置角色'):
        build_fish_narration_request(
            _dialogue_segments(),
            speakers=speakers,
            narration_mode='dialogue',
        )


def test_fish_request_rejects_oversized_single_page_text():
    from services.tts_video_service import build_fish_narration_request

    with pytest.raises(RuntimeError, match='20000'):
        build_fish_narration_request(
            [{'speaker_id': 'host', 'text': '字' * 20001}],
            speakers=[{'id': 'host', 'name': '主持人', 'voice': 'voice-host'}],
            narration_mode='single',
        )


def test_dialogue_prompt_includes_every_configured_role():
    from services.prompts import get_dialogue_narration_generation_prompt

    speakers = [*_speakers(), {'id': 'reviewer', 'name': '评审', 'voice': 'voice-reviewer'}]
    prompt = get_dialogue_narration_generation_prompt(
        [{'page_index': 1, 'title': '结论'}],
        config={'speakers': speakers},
    )

    assert '多人对话旁白' in prompt
    assert '每个角色至少发言一次' in prompt
    assert '"speaker_id":"reviewer"' in prompt


def test_fish_page_audio_uses_one_request_and_reuses_provider_specific_cache(monkeypatch, tmp_path):
    from services import fish_audio_service, tts_video_service

    synthesize = MagicMock(side_effect=lambda **kwargs: Path(kwargs['output_path']).write_bytes(b'audio'))
    monkeypatch.setattr(fish_audio_service, 'synthesize', synthesize)
    monkeypatch.setattr(tts_video_service, 'get_audio_duration', lambda *_args: 6.0)

    kwargs = {
        'segments': _dialogue_segments(),
        'speakers': _speakers(),
        'narration_mode': 'dialogue',
        'cache_dir': str(tmp_path / 'cache'),
        'working_dir': str(tmp_path / 'work'),
        'api_key': 'fish-secret',
        'speed': 1.05,
        'model': 's2.1-pro-free',
        'auto_emotion': True,
        'page_direction': {'page_kind': 'data'},
        'director_preset': 'business',
    }
    first_path, first_duration, segment_durations = tts_video_service.generate_fish_narration_audio_sync(**kwargs)
    second_path, second_duration, _ = tts_video_service.generate_fish_narration_audio_sync(
        **{**kwargs, 'working_dir': str(tmp_path / 'work-2')}
    )

    assert synthesize.call_count == 1
    assert synthesize.call_args.kwargs['reference_id'] == ['voice-host', 'voice-expert']
    assert synthesize.call_args.kwargs['model'] == 's2.1-pro-free'
    assert synthesize.call_args.kwargs['timeout'] == (15, 300)
    assert Path(first_path).is_file() and Path(second_path).is_file()
    assert first_duration == second_duration == 6.0
    assert sum(segment_durations) == 6.0


def test_fish_page_audio_forwards_request_timeout(monkeypatch, tmp_path):
    from services import fish_audio_service, tts_video_service

    synthesize = MagicMock(side_effect=lambda **kwargs: Path(kwargs['output_path']).write_bytes(b'audio'))
    monkeypatch.setattr(fish_audio_service, 'synthesize', synthesize)
    monkeypatch.setattr(tts_video_service, 'get_audio_duration', lambda *_args: 1.0)

    tts_video_service.generate_fish_narration_audio_sync(
        segments=[{'speaker_id': 'host', 'text': 'hello'}],
        speakers=[{'id': 'host', 'name': 'Host', 'voice': 'voice-host'}],
        narration_mode='single',
        cache_dir=str(tmp_path / 'cache'),
        working_dir=str(tmp_path / 'work'),
        api_key='fish-secret',
        api_base='http://fish.local',
        request_timeout=(1, 2),
        total_timeout=3,
    )

    assert synthesize.call_args.kwargs['api_base'] == 'http://fish.local'
    assert synthesize.call_args.kwargs['timeout'] == (1, 2)
    assert synthesize.call_args.kwargs['total_timeout'] == 3


def test_fish_cache_key_changes_with_emotion_mode_and_never_contains_api_key():
    from services.tts_video_service import fish_narration_cache_key

    base = {
        'text': '<|speaker:0|>你好',
        'reference_ids': ['voice-host'],
        'speed': 1.0,
        'model': 's2.1-pro-free',
    }
    plain = fish_narration_cache_key(**base, auto_emotion=False)
    expressive = fish_narration_cache_key(**base, auto_emotion=True)

    assert plain != expressive
    assert 'fish-secret' not in plain
    assert len(plain) == 64


def test_image_video_export_persists_engine_options_without_secret(client):
    project = Project(id='fish-image-export', creation_type='idea', render_mode='image')
    page = Page(
        id='fish-image-page',
        project_id=project.id,
        order_index=0,
        narration_text='欢迎观看。',
        generated_image_path='slide.png',
    )
    db.session.add_all([project, page])
    settings = Settings.get_settings()
    settings.fish_audio_api_key = 'fish-secret'
    db.session.commit()

    with patch('services.task_manager.task_manager.submit_task') as submit_task:
        response = client.post(f'/api/projects/{project.id}/export/video', json={
            'tts_provider': 'fish_audio',
            'voice': 'voice-host',
            'auto_emotion': False,
            'generate_narration': False,
        })

    data = assert_success_response(response)['data']
    task = db.session.get(Task, data['task_id'])
    resume_kwargs = task.get_progress()['_resume']['kwargs']
    assert resume_kwargs['tts_provider'] == 'fish_audio'
    assert resume_kwargs['auto_emotion'] is False
    assert 'fish-secret' not in json.dumps(resume_kwargs)
    assert submit_task.call_args.kwargs['tts_provider'] == 'fish_audio'
    assert 'fish_api_key' not in submit_task.call_args.kwargs


def test_video_export_rejects_fish_when_key_is_not_configured(client, app):
    project = Project(id='fish-missing-key', creation_type='idea', render_mode='image')
    page = Page(
        id='fish-missing-key-page',
        project_id=project.id,
        order_index=0,
        narration_text='旁白',
        generated_image_path='slide.png',
    )
    db.session.add_all([project, page])
    settings = Settings.get_settings()
    settings.fish_audio_api_key = None
    app.config['FISH_AUDIO_API_KEY'] = ''
    db.session.commit()

    response = client.post(f'/api/projects/{project.id}/export/video', json={
        'tts_provider': 'fish_audio',
        'voice': 'voice-host',
    })

    assert response.status_code == 400
    assert 'Fish Audio API Key' in response.get_data(as_text=True)


def test_video_preflight_rejects_stale_fish_voice(client):
    project = Project(id='fish-stale-voice', creation_type='idea', render_mode='image')
    page = Page(
        id='fish-stale-voice-page',
        project_id=project.id,
        order_index=0,
        narration_text='旁白',
        generated_image_path='slide.png',
    )
    db.session.add_all([project, page])
    settings = Settings.get_settings()
    settings.fish_audio_api_key = 'fish-secret'
    db.session.commit()

    with patch('services.fish_audio_service.list_voices', return_value=[{'id': 'voice-current'}]), \
         patch('services.tts_video_service.check_ffmpeg_available', return_value=True), \
         patch('services.tts_video_service.check_ffmpeg_ass_filter_available', return_value=True):
        response = client.post(f'/api/projects/{project.id}/export/video/preflight', json={
            'tts_provider': 'fish_audio',
            'voice': 'voice-deleted',
        })

    data = assert_success_response(response)['data']
    assert data['can_export'] is False
    assert any('已不可用' in error for error in data['errors'])


def test_video_worker_resolves_fish_secret_only_when_task_runs(client, app, tmp_path):
    project = Project(id='fish-worker-project', creation_type='idea', render_mode='native')
    page = Page(
        id='fish-worker-page',
        project_id=project.id,
        order_index=0,
        narration_text='已经准备好的旁白。',
    )
    task = Task(project_id=project.id, task_type='EXPORT_VIDEO', status='PENDING')
    db.session.add_all([project, page, task])
    settings = Settings.get_settings()
    settings.fish_audio_api_key = 'runtime-fish-secret'
    db.session.commit()

    frame_path = tmp_path / 'frame.png'
    output = io.BytesIO()
    Image.new('RGB', (4, 4), 'green').save(output, format='PNG')
    frame_path.write_bytes(output.getvalue())
    captured = {}

    def fake_generate_narration_video(*, output_path, **kwargs):
        captured.update(kwargs)
        Path(output_path).write_bytes(b'video')
        return {'provider': 'fish_audio', 'model': 's2.1-pro-free', 'quality_pages': [], 'warnings': []}

    with patch('services.tts_video_service.check_ffmpeg_available', return_value=True), \
         patch('services.tts_video_service.check_ffmpeg_ass_filter_available', return_value=True), \
         patch('services.tts_video_service.generate_narration_video', side_effect=fake_generate_narration_video):
        export_video_task(
            task.id,
            project.id,
            'fish-native.mp4',
            FileService(app.config['UPLOAD_FOLDER']),
            generate_narration=False,
            page_ids=[page.id],
            frame_paths=[str(frame_path)],
            tts_provider='fish_audio',
            auto_emotion=True,
            voice='voice-host',
            app=app,
        )

    assert captured['tts_provider'] == 'fish_audio'
    assert captured['fish_api_key'] == 'runtime-fish-secret'
    assert captured['fish_model'] == 's2.1-pro-free'
    assert captured['auto_emotion'] is True
    db.session.refresh(task)
    assert task.get_progress()['quality_report']['provider'] == 'fish_audio'
