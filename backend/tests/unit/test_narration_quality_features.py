import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from conftest import assert_success_response
from models import Page, Project, Settings, db


def _add_content_project(project):
    from services.content_spine_service import create_spine
    from services.project_workspace_service import (
        create_workspace_set,
        initialize_workspace_from_snapshot,
    )

    db.session.add(project)
    db.session.flush()
    project.content_spine = create_spine(project.id, {'idea_prompt': project.id})
    project.workspaces.extend(create_workspace_set(project.id))
    db.session.flush()
    spine = project.content_spine
    initialize_workspace_from_snapshot(
        project.id,
        'ppt',
        spine.revision,
        spine.content_hash,
        json.loads(spine.document_json),
        {'render_mode': 'image', 'image_aspect_ratio': '16:9'},
    )


def test_pronunciation_lexicon_is_normalized_and_only_changes_tts_text():
    from services.narration_service import (
        apply_pronunciation_lexicon,
        normalize_pronunciation_entries,
    )

    entries = normalize_pronunciation_entries([
        {'term': 'EasySlide', 'pronunciation': 'Easy Slide'},
        {'term': 'AI', 'pronunciation': 'A I'},
        {'term': 'AI', 'pronunciation': 'duplicate is ignored'},
        {'term': '', 'pronunciation': 'ignored'},
    ])

    assert entries == [
        {'term': 'EasySlide', 'pronunciation': 'Easy Slide'},
        {'term': 'AI', 'pronunciation': 'A I'},
    ]
    assert apply_pronunciation_lexicon('EasySlide AI 演示', entries) == 'Easy Slide A I 演示'


@pytest.mark.parametrize('value', [
    [{'term': '品牌', 'pronunciation': '<|speaker:1|>越权'}],
    [{'term': '品牌', 'pronunciation': '[excited]越权'}],
])
def test_pronunciation_lexicon_rejects_fish_control_token_injection(value):
    from services.narration_service import normalize_pronunciation_entries

    with pytest.raises(ValueError, match='控制标记'):
        normalize_pronunciation_entries(value)


def test_narration_preferences_and_usage_estimate_have_stable_defaults():
    from services.narration_service import (
        estimate_narration_usage,
        normalize_narration_preferences,
    )

    preferences = normalize_narration_preferences({
        'quality_check': True,
        'subtitle_timing': 'asr',
        'emotion_director': {'intensity': 'strong', 'pace': 'fast', 'pause': 'long'},
        'page_overrides': {'page-1': {'pace': 'slow', 'emotion': 'calm'}},
    })
    estimate = estimate_narration_usage([
        {'narration_text': '第一段旁白。'},
        {'narration_segments': [
            {'speaker_id': 'host', 'text': '主持人发言。'},
            {'speaker_id': 'expert', 'text': '专家发言。'},
        ]},
    ], speed=1.0)

    assert preferences['quality_check'] is True
    assert preferences['subtitle_timing'] == 'asr'
    assert preferences['emotion_director']['relationship'] == 'neutral'
    assert preferences['page_overrides']['page-1']['emotion'] == 'calm'
    assert normalize_narration_preferences({'strict_quality_check': True})['strict_quality_check'] is False
    assert estimate['characters'] == len('第一段旁白。主持人发言。专家发言。')
    assert estimate['requests'] == 2
    assert estimate['roles'] == 2
    assert estimate['estimated_seconds'] > 0
    assert 's2.1-pro-free' in estimate['free_model_notice']


def test_voice_assets_preserve_avatar_and_delivery_defaults():
    from services.narration_service import normalize_voice_assets

    assets = normalize_voice_assets([{
        'id': 'host', 'name': '品牌主持人', 'voice': 'voice-host', 'avatar': '🎙️',
        'rate': '+10%', 'default_emotion': 'confident', 'use_case': '发布会',
    }])

    assert assets[0]['avatar'] == '🎙️'
    assert assets[0]['rate'] == '+10%'
    assert assets[0]['default_emotion'] == 'confident'
    assert assets[0]['use_case'] == '发布会'


def test_asr_comparison_ignores_punctuation_and_reports_mismatch():
    from services.narration_service import compare_asr_transcript

    exact = compare_asr_transcript('欢迎使用 EasySlide。', '欢迎使用EasySlide')
    mismatch = compare_asr_transcript('欢迎使用 EasySlide。', '欢迎使用别的产品')

    assert exact['similarity'] == 1.0
    assert mismatch['similarity'] < 0.8
    assert mismatch['matched'] is False


def test_asr_timestamps_keep_original_script_in_subtitles():
    from services.tts_video_service import _build_asr_subtitle_entries

    entries = _build_asr_subtitle_entries(
        [
            {'speaker_id': 'host', 'text': '欢迎使用 API。', '_tts_text': '欢迎使用 A P I。'},
            {'speaker_id': 'expert', 'text': '这是第二句。', '_tts_text': '这是第二句。'},
        ],
        [
            {'text': '欢迎使用A P I', 'start': 0.2, 'end': 1.8},
            {'text': '这是第二句', 'start': 2.0, 'end': 3.2},
        ],
        page_start=10.0,
        speakers=[
            {'id': 'host', 'name': '主持人'},
            {'id': 'expert', 'name': '专家'},
        ],
    )

    assert entries[0]['text'] == '欢迎使用 API。'
    assert 'A P I' not in ''.join(item['text'] for item in entries)
    assert entries[0]['start'] == pytest.approx(10.2)
    assert entries[-1]['end'] == pytest.approx(13.2)
    assert {item['speaker'] for item in entries} == {'主持人', '专家'}


def test_project_persists_pronunciation_and_narration_preferences(client):
    created = assert_success_response(client.post('/api/projects', json={
        'creation_type': 'idea',
        'idea_prompt': '旁白项目',
        'pronunciation_lexicon': [{'term': 'API', 'pronunciation': 'A P I'}],
        'narration_preferences': {'quality_check': True, 'subtitle_timing': 'asr'},
    }), 201)['data']

    project = assert_success_response(client.get(f"/api/projects/{created['project_id']}"))['data']
    assert project['pronunciation_lexicon'] == [{'term': 'API', 'pronunciation': 'A P I'}]
    assert project['narration_preferences']['quality_check'] is True
    assert project['narration_preferences']['subtitle_timing'] == 'asr'

    updated = assert_success_response(client.put(f"/api/projects/{created['project_id']}", json={
        'pronunciation_lexicon': [{'term': 'SaaS', 'pronunciation': '萨斯'}],
        'narration_preferences': {'emotion_director': {'pace': 'slow'}},
    }))['data']
    assert updated['pronunciation_lexicon'][0]['term'] == 'SaaS'
    assert updated['narration_preferences']['emotion_director']['pace'] == 'slow'


def test_fish_preflight_returns_usage_estimate(client):
    project = Project(id='fish-estimate', creation_type='idea', render_mode='image')
    page = Page(
        id='fish-estimate-page',
        project_id=project.id,
        order_index=0,
        narration_text='欢迎观看本次演示。',
        generated_image_path='slide.png',
    )
    _add_content_project(project)
    # PPT 工作区初始化会按内容主线预填页面；本用例构造自己的页面，先移除预填页
    Page.query.filter_by(project_id=project.id).delete(synchronize_session=False)
    db.session.add(page)
    settings = Settings.get_settings()
    settings.fish_audio_api_key = 'fish-secret'
    db.session.commit()

    with patch('services.fish_audio_service.list_voices', return_value=[{'id': 'voice-host'}]), \
         patch('services.tts_video_service.check_ffmpeg_available', return_value=True), \
         patch('services.tts_video_service.check_ffmpeg_ass_filter_available', return_value=True):
        response = client.post(f'/api/projects/{project.id}/export/video/preflight', json={
            'tts_provider': 'fish_audio',
            'voice': 'voice-host',
            'speed': 1.0,
        })

    data = assert_success_response(response)['data']
    assert data['can_export'] is True
    assert data['estimate']['characters'] == len(page.narration_text)
    assert data['estimate']['requests'] == 1
    assert data['estimate']['roles'] == 1


def test_fish_preflight_rejects_oversized_page_and_missing_ass_support(client):
    project = Project(id='fish-preflight-errors', creation_type='idea', render_mode='image')
    page = Page(
        id='fish-preflight-errors-page',
        project_id=project.id,
        order_index=0,
        narration_text='字' * 20001,
        generated_image_path='slide.png',
    )
    _add_content_project(project)
    db.session.add(page)
    settings = Settings.get_settings()
    settings.fish_audio_api_key = 'fish-secret'
    db.session.commit()

    with patch('services.fish_audio_service.list_voices', return_value=[{'id': 'voice-host'}]), \
         patch('services.tts_video_service.check_ffmpeg_available', return_value=True), \
         patch('services.tts_video_service.check_ffmpeg_ass_filter_available', return_value=False):
        response = client.post(f'/api/projects/{project.id}/export/video/preflight', json={
            'tts_provider': 'fish_audio',
            'voice': 'voice-host',
        })

    data = assert_success_response(response)['data']
    assert data['can_export'] is False
    assert any('20000 字限制' in error for error in data['errors'])
    assert any('ASS 字幕' in error for error in data['errors'])


def test_fish_preview_returns_audio_without_persisting_secret(client):
    project = Project(id='fish-preview', creation_type='idea', render_mode='image')
    db.session.add(project)
    settings = Settings.get_settings()
    settings.fish_audio_api_key = 'fish-secret'
    db.session.commit()

    def fake_synthesize(**kwargs):
        with open(kwargs['output_path'], 'wb') as handle:
            handle.write(b'ID3preview')

    with patch('services.fish_audio_service.synthesize', side_effect=fake_synthesize) as synthesize:
        response = client.post(f'/api/projects/{project.id}/narration/preview', json={
            'text': '欢迎使用 API。',
            'voice': 'voice-host',
            'speed': 1.05,
            'auto_emotion': False,
            'pronunciation_lexicon': [{'term': 'API', 'pronunciation': 'A P I'}],
        })

    assert response.status_code == 200
    assert response.mimetype == 'audio/mpeg'
    assert response.data == b'ID3preview'
    assert synthesize.call_args.kwargs['text'] == '欢迎使用 A P I。'
    assert 'fish-secret' not in response.get_data(as_text=True)


def test_video_pipeline_uses_asr_once_and_returns_quality_report(monkeypatch, tmp_path):
    from services import fish_audio_service, tts_video_service

    image_path = tmp_path / 'slide.png'
    image_path.write_bytes(b'image')
    audio_path = tmp_path / 'audio.mp3'
    audio_path.write_bytes(b'audio')
    output_path = tmp_path / 'video.mp4'
    captured = {}

    monkeypatch.setattr(tts_video_service, 'check_ffmpeg_available', lambda *_: True)
    monkeypatch.setattr(tts_video_service, 'check_ffmpeg_ass_filter_available', lambda *_: True)
    monkeypatch.setattr(tts_video_service, 'generate_fish_narration_audio_sync', lambda **kwargs: (
        captured.setdefault('tts_text', kwargs['segments'][0]['_tts_text']) and str(audio_path), 2.0, [2.0]
    ))
    transcribe = MagicMock(return_value={
        'text': '欢迎使用A P I', 'duration': 2.0,
        'segments': [{'text': '欢迎使用A P I', 'start': 0.1, 'end': 1.9}],
    })
    monkeypatch.setattr(fish_audio_service, 'transcribe', transcribe)
    monkeypatch.setattr(tts_video_service, 'pad_audio_with_silence', lambda *_args, **_kwargs: None)
    monkeypatch.setattr(tts_video_service, 'create_static_clip', lambda _image, output, *_args, **_kwargs: Path(output).write_bytes(b'clip'))
    monkeypatch.setattr(tts_video_service, 'mux_video_audio', lambda _video, _audio, output, **_kwargs: Path(output).write_bytes(b'muxed'))
    monkeypatch.setattr(tts_video_service, 'composite_video', lambda _clips, output, **_kwargs: Path(output).write_bytes(b'raw'))
    monkeypatch.setattr(tts_video_service, 'generate_ass_subtitle', lambda entries, output, **_kwargs: (captured.setdefault('subtitles', entries), Path(output).write_text('ass', encoding='utf-8')))
    monkeypatch.setattr(tts_video_service, 'burn_subtitles', lambda _video, _ass, output, **_kwargs: Path(output).write_bytes(b'video'))

    report = tts_video_service.generate_narration_video(
        pages_data=[{
            'page_id': 'page-1', 'page_index': 0, 'image_path': str(image_path),
            'narration_text': '欢迎使用 API。',
        }],
        output_path=str(output_path),
        tts_provider='fish_audio',
        fish_api_key='fish-secret',
        voice='voice-host',
        pronunciation_lexicon=[{'term': 'API', 'pronunciation': 'A P I'}],
        narration_preferences={'quality_check': True, 'subtitle_timing': 'asr'},
    )

    assert captured['tts_text'] == '欢迎使用 A P I。'
    assert ''.join(item['text'] for item in captured['subtitles']) == '欢迎使用 API。'
    assert transcribe.call_count == 1
    assert report['quality_pages'][0]['matched'] is True
    assert report['provider'] == 'fish_audio'
    assert output_path.read_bytes() == b'video'
