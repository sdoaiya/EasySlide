from pathlib import Path

import services.hyperframes_renderer as hyperframes
import services.tts_video_service as legacy
import services.video_visual_renderer as renderer


def _page(tmp_path, *, stages=1):
    paths = []
    for index in range(stages):
        path = tmp_path / f'frame-{index}.png'
        path.write_bytes(b'image')
        paths.append(str(path))
    return {
        'page_id': 'page-1',
        'image_path': paths[-1],
        'stage_image_paths': paths,
        'native_scene_bundle_ref': {'page_id': 'page-1', 'path': 'bundle.json', 'sha256': 'a' * 64},
    }


def _kwargs(tmp_path, page):
    return {
        'page': page,
        'motion_manifest': {'page_id': 'page-1', 'scene_manifest_sha256': 'b' * 64},
        'output_path': str(tmp_path / 'visual.mp4'),
        'output_root': str(tmp_path),
        'duration': 3,
        'width': 1920,
        'height': 1080,
        'fps': 25,
        'ffmpeg_path': 'ffmpeg',
        'effect': 'static',
        'enable_ken_burns': False,
        'fade_in_seconds': 0,
        'fade_out_seconds': 0,
        'motion_intensity': 'subtle',
        'include_silent_audio': False,
        'hyperframes_enabled': True,
    }


def test_uses_hyperframes_when_native_motion_is_available(tmp_path, monkeypatch):
    page = _page(tmp_path, stages=2)
    monkeypatch.setattr(renderer, '_hyperframes_runtime', lambda *_: object())
    monkeypatch.setattr(
        'services.native_scene_bundle.load_native_scene_bundle',
        lambda *_args, **_kwargs: {'page_id': 'page-1'},
    )
    monkeypatch.setattr(
        hyperframes,
        'render_page',
        lambda *_args, **_kwargs: {
            'output_path': str((tmp_path / 'hyperframes.mp4').resolve()),
            'renderer': 'hyperframes',
            'warnings': [],
        },
    )
    (tmp_path / 'hyperframes.mp4').write_bytes(b'animated')

    result = renderer.render_page_visual(**_kwargs(tmp_path, page))

    assert result['renderer'] == 'hyperframes'
    assert Path(result['output_path']).read_bytes() == b'animated'


def test_hyperframes_failure_falls_back_to_browser_frames(tmp_path, monkeypatch):
    page = _page(tmp_path, stages=2)
    calls = []
    monkeypatch.setattr(
        'services.native_scene_bundle.load_native_scene_bundle',
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError('injected failure')),
    )
    monkeypatch.setattr(
        legacy,
        'create_staged_clip',
        lambda paths, output, *_args, **_kwargs: (
            calls.append(paths),
            Path(output).write_bytes(b'fallback'),
        ),
    )

    result = renderer.render_page_visual(**_kwargs(tmp_path, page))

    assert result['renderer'] == 'browser_frames'
    assert calls == [page['stage_image_paths']]
    assert 'injected failure' in result['warnings'][0]


def test_browser_frame_failure_boundary_ends_at_static_frame(tmp_path, monkeypatch):
    page = _page(tmp_path, stages=2)
    monkeypatch.setattr(
        'services.native_scene_bundle.load_native_scene_bundle',
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError('injected failure')),
    )
    monkeypatch.setattr(
        legacy,
        'create_staged_clip',
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError('staged failure')),
    )
    monkeypatch.setattr(
        legacy,
        'create_static_clip',
        lambda _image, output, *_args, **_kwargs: Path(output).write_bytes(b'static'),
    )

    result = renderer.render_page_visual(**_kwargs(tmp_path, page))

    assert result['renderer'] == 'static_frame'
    assert result['fallback_from'] == 'browser_frames'
    assert result['fallback_reason'] == 'staged failure'
    assert any('staged failure' in warning for warning in result['warnings'])
    assert Path(result['output_path']).read_bytes() == b'static'


def test_silent_page_skips_hyperframes_and_keeps_compatible_audio_track(tmp_path, monkeypatch):
    page = _page(tmp_path)
    calls = []
    monkeypatch.setattr(
        legacy,
        'create_silent_clip',
        lambda _image, output, *_args, **_kwargs: (
            calls.append(output),
            Path(output).write_bytes(b'silent'),
        ),
    )
    kwargs = _kwargs(tmp_path, page)
    kwargs['include_silent_audio'] = True

    result = renderer.render_page_visual(**kwargs)

    assert result['renderer'] == 'static_frame'
    assert calls == [kwargs['output_path']]
