import hashlib
import json
import subprocess
from pathlib import Path

import pytest

from services import tts_video_service as service


def _segments():
    return [
        {'id': 'intro', 'text': '第一段。', 'speaker_id': 'host', 'pause_after_ms': 250},
        {'id': 'detail', 'text': '第二段。', 'speaker_id': 'guest'},
    ]


def test_edge_timeline_reconciles_only_mathematical_millisecond_rounding():
    timeline, warning = service._build_page_tts_timeline(
        page_id='page-1',
        segments=_segments(),
        audio_duration=2.251,
        segment_durations=[1.0004, 1.0004],
        padding_before_ms=800,
        padding_after_ms=1200,
        provider='edge',
    )

    assert warning is None
    assert timeline['timing_quality'] == 'segment_exact'
    assert timeline['audio_duration_ms'] == 2251
    assert timeline['segments'] == [
        {'segment_id': 'intro', 'start_ms': 800, 'end_ms': 1800},
        {'segment_id': 'detail', 'start_ms': 2050, 'end_ms': 3051},
    ]


def test_edge_timeline_uses_generated_pause_when_no_explicit_pause_exists():
    segments = [
        {'id': 'intro', 'text': '第一段。', '_pause_after_seconds': 0.25},
        {'id': 'detail', 'text': '第二段。'},
    ]

    timeline, warning = service._build_page_tts_timeline(
        page_id='page-1',
        segments=segments,
        audio_duration=2.25,
        segment_durations=[1.0, 1.0],
        padding_before_ms=0,
        padding_after_ms=0,
        provider='edge',
    )

    assert warning is None
    assert timeline['timing_quality'] == 'segment_exact'
    assert timeline['segments'][1]['start_ms'] == 1250


def test_edge_timeline_downgrades_codec_drift_instead_of_claiming_exact():
    timeline, warning = service._build_page_tts_timeline(
        page_id='page-1',
        segments=_segments(),
        audio_duration=2.300,
        segment_durations=[1.0, 1.0],
        padding_before_ms=0,
        padding_after_ms=0,
        provider='edge',
    )

    assert timeline['timing_quality'] == 'estimated'
    assert '相差 50ms' in warning
    assert '舍入上限 2ms' in warning


def test_fish_uses_aligned_only_when_asr_boundaries_match_authored_segments():
    timeline, warning = service._build_page_tts_timeline(
        page_id='page-1',
        segments=_segments(),
        audio_duration=2.5,
        segment_durations=[1.0, 1.5],
        padding_before_ms=100,
        padding_after_ms=0,
        provider='fish_audio',
        transcript_matched=True,
        asr_result={
            'segments': [
                {'text': '第一段', 'start': 0.1, 'end': 1.0},
                {'text': '第二段', 'start': 1.2, 'end': 2.4},
            ],
        },
    )

    assert warning is None
    assert timeline['timing_quality'] == 'aligned'
    assert timeline['segments'] == [
        {'segment_id': 'intro', 'start_ms': 200, 'end_ms': 1100},
        {'segment_id': 'detail', 'start_ms': 1300, 'end_ms': 2500},
    ]


def test_fish_without_reliable_asr_stays_estimated():
    timeline, _ = service._build_page_tts_timeline(
        page_id='page-1',
        segments=_segments(),
        audio_duration=2.5,
        segment_durations=[1.0, 1.5],
        padding_before_ms=0,
        padding_after_ms=0,
        provider='fish_audio',
        transcript_matched=True,
        asr_result={'segments': [{'text': '合并结果', 'start': 0, 'end': 2.5}]},
    )

    assert timeline['timing_quality'] == 'estimated'


def test_fish_rejects_asr_boundaries_when_quality_check_is_not_reliable():
    timeline, _ = service._build_page_tts_timeline(
        page_id='page-1',
        segments=_segments(),
        audio_duration=2.5,
        segment_durations=[1.0, 1.5],
        padding_before_ms=0,
        padding_after_ms=0,
        provider='fish_audio',
        transcript_matched=False,
        asr_result={
            'segments': [
                {'text': '第一段', 'start': 0.1, 'end': 1.0},
                {'text': '第二段', 'start': 1.2, 'end': 2.4},
            ],
        },
    )

    assert timeline['timing_quality'] == 'estimated'


def test_estimated_subtitles_keep_authored_segments_without_sentence_split(monkeypatch):
    monkeypatch.setattr(
        service,
        '_build_timed_subtitle_entries',
        lambda *_args, **_kwargs: pytest.fail('estimated timeline must not split by sentence weights'),
    )
    segments = [{
        'id': 'intro',
        'text': '第一句。第二句。',
        'speaker_id': 'host',
    }]
    timeline, _ = service._build_page_tts_timeline(
        page_id='page-1',
        segments=segments,
        audio_duration=3.0,
        segment_durations=[3.0],
        padding_before_ms=800,
        padding_after_ms=1200,
        provider='fish_audio',
    )

    entries = service._build_timeline_subtitle_entries(
        segments,
        timeline,
        page_start=10.0,
        speakers=[{'id': 'host', 'name': '主持人'}],
    )

    assert entries == [{
        'start': 10.8,
        'end': 13.8,
        'text': '第一句。第二句。',
        'speaker': '主持人',
    }]


def test_aligned_subtitles_intentionally_keep_authored_segment_granularity(monkeypatch):
    monkeypatch.setattr(
        service,
        '_build_timed_subtitle_entries',
        lambda *_args, **_kwargs: pytest.fail('aligned timeline must not invent sentence timing'),
    )
    segments = [{'id': 'intro', 'text': '第一句。第二句。', 'speaker_id': 'host'}]
    timeline, _ = service._build_page_tts_timeline(
        page_id='page-1',
        segments=segments,
        audio_duration=3.0,
        segment_durations=[3.0],
        padding_before_ms=100,
        padding_after_ms=0,
        provider='fish_audio',
        transcript_matched=True,
        asr_result={'segments': [{'text': '第一句第二句', 'start': 0.2, 'end': 2.8}]},
    )

    entries = service._build_timeline_subtitle_entries(segments, timeline, page_start=5.0)

    assert entries == [{
        'start': 5.3,
        'end': 7.9,
        'text': '第一句。第二句。',
        'speaker': 'host',
    }]


def _mock_video_pipeline(monkeypatch, tmp_path, captured):
    monkeypatch.setattr(service, 'check_ffmpeg_available', lambda *_: True)
    monkeypatch.setattr(service, 'check_ffmpeg_ass_filter_available', lambda *_: True)
    monkeypatch.setattr(service, 'pad_audio_with_silence', lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        service,
        'create_static_clip',
        lambda _image, output, *_args, **_kwargs: Path(output).write_bytes(b'clip'),
    )
    def fake_mux(_video, _audio, output, **kwargs):
        captured.setdefault('normalize_audio', []).append(kwargs.get('normalize_audio'))
        Path(output).write_bytes(b'muxed')

    monkeypatch.setattr(service, 'mux_video_audio', fake_mux)
    monkeypatch.setattr(
        service,
        'composite_video',
        lambda _clips, output, **_kwargs: Path(output).write_bytes(b'raw'),
    )
    monkeypatch.setattr(
        service,
        'generate_ass_subtitle',
        lambda entries, output, **_kwargs: (
            captured.setdefault('subtitles', entries),
            Path(output).write_text('ass', encoding='utf-8'),
        ),
    )
    monkeypatch.setattr(
        service,
        'burn_subtitles',
        lambda _video, _ass, output, **_kwargs: Path(output).write_bytes(b'video'),
    )
    image_path = tmp_path / 'slide.png'
    image_path.write_bytes(b'image')
    audio_path = tmp_path / 'audio.mp3'
    audio_path.write_bytes(b'audio')
    return image_path, audio_path


def test_phase_b_reuses_fish_estimated_timeline_and_reports_quality(monkeypatch, tmp_path):
    captured = {}
    image_path, audio_path = _mock_video_pipeline(monkeypatch, tmp_path, captured)
    monkeypatch.setattr(
        service,
        'generate_fish_narration_audio_sync',
        lambda **_kwargs: (str(audio_path), 3.0, [3.0]),
    )
    monkeypatch.setattr(
        service,
        '_build_timed_subtitle_entries',
        lambda *_args, **_kwargs: pytest.fail('estimated timeline must not use sentence splitting'),
    )
    output_path = tmp_path / 'video.mp4'
    artifact_directory = tmp_path / '_native_video_task-1'
    narration_snapshot = tmp_path / 'narration_snapshot.json'
    narration_snapshot.write_bytes(b'{"project_id":"project-1","schema_version":1}')
    narration_snapshot_hash = hashlib.sha256(narration_snapshot.read_bytes()).hexdigest()

    report = service.generate_narration_video(
        pages_data=[{
            'page_id': 'page-1',
            'page_index': 0,
            'image_path': str(image_path),
            'scene_level': 'L3',
            'scene_level_reason': '背景修复质量不足',
            'narration_segments': [{
                'segment_id': 'authored-1',
                'speaker_id': 'host',
                'text': '第一句。第二句。',
            }],
        }],
        output_path=str(output_path),
        tts_provider='fish_audio',
        fish_api_key='fish-secret',
        voice='voice-host',
        artifact_directory=str(artifact_directory),
        project_id='project-1',
        narration_snapshot_path=str(narration_snapshot),
        narration_snapshot_hash=narration_snapshot_hash,
    )

    audio_timeline_hash = report['quality_pages'][0].pop('audio_timeline_sha256')
    audio_hash = report['quality_pages'][0].pop('audio_sha256')
    assert report['quality_pages'] == [{
        'page_index': 0,
        'scene_level': 'L3',
        'scene_level_reason': '背景修复质量不足',
        'timing_quality': 'estimated',
        'visual_renderer': 'static_frame',
    }]
    timeline_files = list(artifact_directory.glob('audio_timeline_*.json'))
    assert len(timeline_files) == 1
    assert hashlib.sha256(timeline_files[0].read_bytes()).hexdigest() == audio_timeline_hash
    audio_files = list(artifact_directory.glob('audio_*.mp3'))
    assert len(audio_files) == 1
    assert hashlib.sha256(audio_files[0].read_bytes()).hexdigest() == audio_hash
    render_snapshot = report['render_snapshot']
    assert render_snapshot is not None
    assert Path(render_snapshot['path']).is_file()
    assert hashlib.sha256(Path(render_snapshot['path']).read_bytes()).hexdigest() == render_snapshot['sha256']
    assert captured['subtitles'] == [{
        'start': 0.8,
        'end': 3.8,
        'text': '第一句。第二句。',
        'speaker': 'host',
    }]
    assert output_path.read_bytes() == b'video'


def test_phase_b_uses_each_pages_local_audio_direction(monkeypatch, tmp_path):
    captured = {}
    image_path, audio_path = _mock_video_pipeline(monkeypatch, tmp_path, captured)
    monkeypatch.setattr(
        service,
        'generate_fish_narration_audio_sync',
        lambda **_kwargs: (str(audio_path), 1.0, [1.0]),
    )

    service.generate_narration_video(
        pages_data=[
            {
                'page_id': 'page-1',
                'page_index': 0,
                'image_path': str(image_path),
                'narration_text': '第一页',
            },
            {
                'page_id': 'page-2',
                'page_index': 1,
                'image_path': str(image_path),
                'narration_text': '第二页',
            },
        ],
        output_path=str(tmp_path / 'video.mp4'),
        tts_provider='fish_audio',
        fish_api_key='fish-secret',
        voice='voice-host',
        director_plan={
            'pages': [
                {'page_index': 0, 'audio': {'normalize_loudness': True}},
                {'page_index': 1, 'audio': {'normalize_loudness': False}},
            ],
        },
    )

    assert captured['normalize_audio'] == [True, False]


def test_hyperframes_failure_reuses_existing_audio_and_falls_back_per_page(monkeypatch, tmp_path):
    captured = {}
    image_path, audio_path = _mock_video_pipeline(monkeypatch, tmp_path, captured)
    second_frame = tmp_path / 'stage-2.png'
    second_frame.write_bytes(b'image')
    synth_calls = []

    def synthesize(**_kwargs):
        synth_calls.append('fish')
        return str(audio_path), 1.0, [1.0]

    monkeypatch.setattr(service, 'generate_fish_narration_audio_sync', synthesize)
    monkeypatch.setattr(
        service,
        '_prepare_native_motion_manifest',
        lambda *_args, **_kwargs: ({
            'page_id': 'page-1',
            'scene_manifest_sha256': 'a' * 64,
        }, {'sha256': 'b' * 64}),
    )
    monkeypatch.setattr(
        'services.native_scene_bundle.load_native_scene_bundle',
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError('injected hyperframes failure')),
    )
    monkeypatch.setattr(
        service,
        'create_staged_clip',
        lambda _paths, output, *_args, **_kwargs: Path(output).write_bytes(b'fallback'),
    )

    report = service.generate_narration_video(
        pages_data=[{
            'page_id': 'page-1',
            'page_index': 0,
            'image_path': str(image_path),
            'stage_image_paths': [str(image_path), str(second_frame)],
            'native_scene_bundle_ref': {
                'page_id': 'page-1',
                'path': str(tmp_path / 'bundle.json'),
                'sha256': 'c' * 64,
            },
            'narration_text': '只生成一次音频',
        }],
        output_path=str(tmp_path / 'fallback-video.mp4'),
        tts_provider='fish_audio',
        fish_api_key='fish-secret',
        voice='voice-host',
        hyperframes_enabled=True,
    )

    assert synth_calls == ['fish']
    assert report['quality_pages'][0]['visual_renderer'] == 'browser_frames'
    assert any('injected hyperframes failure' in warning for warning in report['warnings'])


def test_silent_browser_frames_keep_requested_total_duration(tmp_path):
    if not service.check_ffmpeg_available():
        pytest.skip('ffmpeg not available')

    image = pytest.importorskip('PIL.Image')
    first_frame = tmp_path / 'stage-1.png'
    second_frame = tmp_path / 'stage-2.png'
    image.new('RGB', (160, 90), color='red').save(first_frame)
    image.new('RGB', (160, 90), color='blue').save(second_frame)
    output_path = tmp_path / 'silent-browser-frames.mp4'
    artifact_directory = tmp_path / 'artifacts'

    report = service.generate_narration_video(
        pages_data=[{
            'page_id': 'page-1',
            'page_index': 0,
            'image_path': str(second_frame),
            'stage_image_paths': [str(first_frame), str(second_frame)],
            'allow_silent': True,
        }],
        output_path=str(output_path),
        width=160,
        height=90,
        fps=10,
        silent_duration=3,
        artifact_directory=str(artifact_directory),
    )

    probe = subprocess.run(
        [
            'ffprobe', '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'json',
            str(output_path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    timeline_path = next(artifact_directory.glob('audio_timeline_*.json'))
    timeline = json.loads(timeline_path.read_text(encoding='utf-8'))

    assert timeline['duration_ms'] == 3000
    assert 2.95 <= float(json.loads(probe.stdout)['format']['duration']) <= 3.10
    assert report['duration_seconds'] == 3
    assert report['quality_pages'][0]['visual_renderer'] == 'browser_frames'


def test_native_motion_manifest_is_built_from_frozen_scene_and_actual_audio_timeline(tmp_path):
    from services.native_scene_bundle import save_native_scene_bundles
    from services.scene_manifest import save_scene_manifests

    scene = {
        'schema_version': 1,
        'page_id': 'page-1',
        'render_mode': 'native',
        'width': 1920,
        'height': 1080,
        'visual_style': {'theme_id': 'core01', 'colors': [], 'font_families': []},
        'elements': [{
            'id': 'title',
            'kind': 'title',
            'role': 'headline',
            'bbox': [100, 100, 800, 120],
            'z_index': 1,
            'asset_path': None,
            'text': '标题',
            'motion_capabilities': ['reveal', 'highlight'],
        }],
        'fallback_preview_path': None,
        'quality': {'score': 1, 'warnings': []},
    }
    scene_refs = save_scene_manifests([scene], tmp_path, ['page-1'])
    bundle = {
        'schema_version': 1,
        'page_id': 'page-1',
        'scene_manifest_sha256': scene_refs[0]['sha256'],
        'width': 1920,
        'height': 1080,
        'html': '<div class="native-slide" data-page-id="page-1"><h1 data-motion-id="title">标题</h1></div>',
        'css': '',
        'assets': [],
        'warnings': [],
    }
    bundle_refs = save_native_scene_bundles([bundle], tmp_path, scene_refs, ['page-1'])
    timeline = {
        'schema_version': 1,
        'page_id': 'page-1',
        'duration_ms': 3000,
        'audio_duration_ms': 3000,
        'padding': {'before_ms': 0, 'after_ms': 0},
        'timing_quality': 'segment_exact',
        'segments': [{'segment_id': 'seg-1', 'start_ms': 0, 'end_ms': 3000}],
    }

    manifest, reference = service._prepare_native_motion_manifest(
        {
            'page_id': 'page-1',
            'scene_manifest_ref': scene_refs[0],
            'native_scene_bundle_ref': bundle_refs[0],
            'native_animation': {},
        },
        timeline,
        [{'segment_id': 'seg-1', 'speaker_id': 'host', 'text': '讲解标题'}],
        {},
        str(tmp_path),
    )

    assert manifest['duration_ms'] == 3000
    assert manifest['elements'][0]['element_id'] == 'title'
    assert Path(reference['path']).is_file()
