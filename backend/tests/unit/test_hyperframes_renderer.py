import json
import subprocess
from pathlib import Path

import pytest

import services.hyperframes_renderer as renderer
from services.hyperframes_renderer import (
    HyperframesCompositionError,
    HyperframesEmptyOutputError,
    HyperframesProcessError,
    HyperframesRuntime,
    HyperframesRuntimeError,
    HyperframesTimeoutError,
    create_page_composition,
    render_page,
)


GSAP_STUB = 'window.gsap={timeline:()=>({from(){return this},fromTo(){return this},to(){return this}})};'
SCENE_SHA256 = 'a' * 64


def _bundle(page_id='page-1'):
    return {
        'schema_version': 1,
        'page_id': page_id,
        'scene_manifest_sha256': SCENE_SHA256,
        'width': 1920,
        'height': 1080,
        'html': (
            f'<div class="native-slide" data-page-id="{page_id}">'
            '<h1 data-motion-id="title">标题</h1>'
            '<p data-motion-id="body">正文</p>'
            '<img data-motion-id="image" src="data:image/png;base64,AA==">'
            '<strong data-motion-id="number">42%</strong>'
            '<div data-motion-id="chart"><span style="height:42%"></span></div>'
            '</div>'
        ),
        'css': '.native-slide{background:#fff}.chart{mask-image:url("data:image/svg+xml;base64,AA==")}',
        'assets': [{
            'asset_id': 'asset-001',
            'source': '/assets/image.png',
            'data_url': 'data:image/png;base64,AA==',
            'mime_type': 'image/png',
        }],
        'warnings': ['bundle-warning'],
    }


def _motion_manifest(page_id='page-1'):
    effects = [
        ('title', 'fade_in'),
        ('body', 'fade_up'),
        ('image', 'slide_in'),
        ('number', 'scale_in'),
        ('title', 'mask_reveal'),
        ('chart', 'chart_reveal'),
        ('number', 'count_up'),
        ('body', 'highlight'),
        ('image', 'drift'),
    ]
    return {
        'schema_version': 1,
        'page_id': page_id,
        'scene_manifest_sha256': SCENE_SHA256,
        'duration_ms': 12000,
        'timing_quality': 'segment_exact',
        'transition': {'type': 'cut', 'duration_ms': 0, 'direction': None},
        'camera': {'preset': 'pan_left', 'start_ms': 0, 'end_ms': 12000},
        'elements': [
            {
                'element_id': element_id,
                'effect': effect,
                'start_ms': index * 1000,
                'duration_ms': 500,
                'easing': 'power3.out',
                'cue': {
                    'basis': 'page',
                    'segment_id': None,
                    'precision': 'exact',
                },
            }
            for index, (element_id, effect) in enumerate(effects)
        ],
        'captions': [],
        'fallback': {'strategy': 'browser_frames', 'reason': None},
        'warnings': ['motion-warning', 'bundle-warning'],
    }


def _development_runtime(tmp_path):
    node = tmp_path / 'node.exe'
    cli = tmp_path / 'desktop' / 'node_modules' / 'hyperframes' / 'bin' / 'hyperframes.mjs'
    node.write_bytes(b'node')
    cli.parent.mkdir(parents=True)
    cli.write_text('// cli', encoding='utf-8')
    return HyperframesRuntime.for_development(tmp_path, node_executable=node)


def _packaged_runtime(tmp_path, browser_entry='chrome-win/chrome.exe'):
    executable = tmp_path / 'EasySlide.exe'
    resources = tmp_path / 'resources'
    browser_root = resources / 'hyperframes-browser'
    browser = browser_root.joinpath(*browser_entry.split('/'))
    executable.write_bytes(b'electron')
    resources.mkdir()
    (resources / 'app.asar').write_bytes(b'asar')
    browser.parent.mkdir(parents=True)
    browser.write_bytes(b'chrome')
    (browser_root / 'browser.json').write_text(
        json.dumps({'executable': browser_entry}),
        encoding='utf-8',
    )
    return HyperframesRuntime.for_packaged(executable)


def _successful_run(calls):
    def run(command, **kwargs):
        calls.append((command, kwargs))
        output = Path(command[command.index('--output') + 1])
        output.write_bytes(b'video')
        return subprocess.CompletedProcess(command, 0, 'rendered', '')

    return run


def test_create_page_composition_is_offline_deterministic_and_maps_all_effects(tmp_path):
    first = create_page_composition(
        _bundle(),
        _motion_manifest(),
        tmp_path / 'first',
        gsap_source=GSAP_STUB,
    )
    second = create_page_composition(
        _bundle(),
        _motion_manifest(),
        tmp_path / 'second',
        gsap_source=GSAP_STUB,
    )
    repeated = create_page_composition(
        _bundle(),
        _motion_manifest(),
        tmp_path / 'first',
        gsap_source=GSAP_STUB,
    )

    first_html = (first / 'index.html').read_text(encoding='utf-8')
    second_html = (second / 'index.html').read_text(encoding='utf-8')
    assert repeated == first
    assert first_html == second_html
    assert 'data-composition-id="easyslide-page-' in first_html
    assert 'data-duration="12"' in first_html
    assert 'data-motion-id="title"' in first_html
    assert '<script src=' not in first_html
    assert '<link ' not in first_html
    assert 'Math.random(' not in first_html
    assert 'Date.now(' not in first_html
    assert 'setTimeout(' not in first_html
    assert 'window.__timelines[compositionId] = timeline' in first_html
    for effect in {
        'fade_in', 'fade_up', 'slide_in', 'scale_in', 'mask_reveal',
        'chart_reveal', 'count_up', 'highlight', 'drift',
    }:
        assert f"case '{effect}'" in first_html
        assert f'"effect":"{effect}"' in first_html
    assert "case 'pan_left'" in first_html


def test_create_page_composition_hashes_page_id_and_rejects_unsafe_content(tmp_path):
    page_id = '../../outside'
    composition = create_page_composition(
        _bundle(page_id),
        _motion_manifest(page_id),
        tmp_path / 'renders',
        gsap_source=GSAP_STUB,
    )
    assert composition.parent == (tmp_path / 'renders').resolve()
    assert '..' not in composition.name

    remote = _bundle()
    remote['html'] = remote['html'].replace(
        'data:image/png;base64,AA==',
        'https://example.com/image.png',
        1,
    )
    with pytest.raises(HyperframesCompositionError, match='远程资源'):
        create_page_composition(remote, _motion_manifest(), tmp_path / 'remote', gsap_source=GSAP_STUB)

    mixed_srcset = _bundle()
    mixed_srcset['html'] = mixed_srcset['html'].replace(
        'src="data:image/png;base64,AA=="',
        'srcset="data:image/png;base64,AA== 1x, https://example.com/image.png 2x"',
    )
    with pytest.raises(HyperframesCompositionError, match='远程资源'):
        create_page_composition(
            mixed_srcset,
            _motion_manifest(),
            tmp_path / 'srcset',
            gsap_source=GSAP_STUB,
        )

    relative_srcset = _bundle()
    relative_srcset['html'] = relative_srcset['html'].replace(
        'src="data:image/png;base64,AA=="',
        'srcset="data:image/png;base64,AA== 1x, /local/image.png 2x"',
    )
    with pytest.raises(HyperframesCompositionError, match='未内联资源'):
        create_page_composition(
            relative_srcset,
            _motion_manifest(),
            tmp_path / 'relative-srcset',
            gsap_source=GSAP_STUB,
        )

    css_escape = _bundle()
    css_escape['css'] = '</style><script>alert(1)</script>'
    with pytest.raises(HyperframesCompositionError, match='CSS'):
        create_page_composition(css_escape, _motion_manifest(), tmp_path / 'css', gsap_source=GSAP_STUB)

    missing_element = _motion_manifest()
    missing_element['elements'][0]['element_id'] = 'missing'
    with pytest.raises(HyperframesCompositionError, match='data-motion-id'):
        create_page_composition(_bundle(), missing_element, tmp_path / 'missing', gsap_source=GSAP_STUB)


def test_create_page_composition_allows_inline_base64_double_slashes(tmp_path):
    bundle = _bundle()
    bundle['html'] = bundle['html'].replace(
        'data:image/png;base64,AA==',
        'data:image/png;base64,////',
        1,
    )

    composition = create_page_composition(
        bundle,
        _motion_manifest(),
        tmp_path / 'inline-base64',
        gsap_source=GSAP_STUB,
    )

    assert composition.is_dir()


def test_render_page_uses_development_node_cli_and_returns_contract(tmp_path, monkeypatch):
    runtime = _development_runtime(tmp_path)
    calls = []
    monkeypatch.setattr(renderer.subprocess, 'run', _successful_run(calls))

    result = render_page(
        _bundle(),
        _motion_manifest(),
        tmp_path / 'output',
        runtime,
        gsap_source=GSAP_STUB,
        timeout_seconds=45,
    )

    command, kwargs = calls[0]
    assert command[:3] == [
        str((tmp_path / 'node.exe').resolve()),
        str((tmp_path / 'desktop/node_modules/hyperframes/bin/hyperframes.mjs').resolve()),
        'render',
    ]
    assert command[command.index('--fps') + 1] == '25'
    assert command[command.index('--quality') + 1] == 'high'
    assert command[command.index('--workers') + 1] == '1'
    assert kwargs['timeout'] == 45
    assert kwargs['capture_output'] is True
    assert kwargs['text'] is True
    assert kwargs['encoding'] == 'utf-8'
    assert kwargs['errors'] == 'replace'
    if renderer.os.name == 'nt':
        assert kwargs['creationflags'] == subprocess.CREATE_NO_WINDOW
    assert result == {
        'output_path': str(Path(result['output_path']).resolve()),
        'renderer': 'hyperframes',
        'warnings': ['bundle-warning', 'motion-warning'],
    }
    assert Path(result['output_path']).read_bytes() == b'video'


def test_render_page_uses_short_scratch_workspace_for_deep_output_root(tmp_path, monkeypatch):
    runtime = _development_runtime(tmp_path)
    output_root = tmp_path.joinpath(
        'uploads',
        'project-' + ('a' * 36),
        'page-' + ('b' * 36),
        'image-scene-' + ('c' * 36),
    )
    calls = []
    monkeypatch.setattr(renderer.subprocess, 'run', _successful_run(calls))

    result = render_page(
        _bundle(),
        _motion_manifest(),
        output_root,
        runtime,
        gsap_source=GSAP_STUB,
    )

    command, kwargs = calls[0]
    composition_dir = Path(kwargs['cwd']).resolve()
    temporary_output = Path(command[command.index('--output') + 1]).resolve()
    resolved_output_root = output_root.resolve()
    assert not composition_dir.is_relative_to(resolved_output_root)
    assert not temporary_output.is_relative_to(resolved_output_root)
    assert Path(result['output_path']).parent == resolved_output_root
    assert Path(result['output_path']).read_bytes() == b'video'


def test_render_page_uses_packaged_electron_cli_and_browser_manifest(tmp_path, monkeypatch):
    runtime = _packaged_runtime(tmp_path)
    calls = []
    monkeypatch.setattr(renderer.subprocess, 'run', _successful_run(calls))

    render_page(
        _bundle(),
        _motion_manifest(),
        tmp_path / 'output',
        runtime,
        gsap_source=GSAP_STUB,
    )

    command, kwargs = calls[0]
    assert command[:3] == [
        str((tmp_path / 'EasySlide.exe').resolve()),
        str((tmp_path / 'resources/app.asar/node_modules/hyperframes/bin/hyperframes.mjs').resolve()),
        'render',
    ]
    assert kwargs['env']['ELECTRON_RUN_AS_NODE'] == '1'
    assert kwargs['env']['HYPERFRAMES_BROWSER_PATH'] == str(
        (tmp_path / 'resources/hyperframes-browser/chrome-win/chrome.exe').resolve(),
    )


def test_packaged_runtime_rejects_browser_manifest_path_injection(tmp_path):
    executable = tmp_path / 'EasySlide.exe'
    resources = tmp_path / 'resources'
    browser_root = resources / 'hyperframes-browser'
    executable.write_bytes(b'electron')
    resources.mkdir()
    (resources / 'app.asar').write_bytes(b'asar')
    browser_root.mkdir()
    (browser_root / 'browser.json').write_text(
        json.dumps({'executable': '../outside.exe'}),
        encoding='utf-8',
    )

    with pytest.raises(HyperframesRuntimeError, match='browser.json'):
        HyperframesRuntime.for_packaged(executable)


def test_render_page_classifies_timeout_nonzero_exit_and_empty_output(tmp_path, monkeypatch):
    runtime = _development_runtime(tmp_path)

    def timeout(*_args, **_kwargs):
        raise subprocess.TimeoutExpired(['node'], 1, output='partial', stderr='slow')

    monkeypatch.setattr(renderer.subprocess, 'run', timeout)
    with pytest.raises(HyperframesTimeoutError) as timed_out:
        render_page(_bundle(), _motion_manifest(), tmp_path / 'timeout', runtime, gsap_source=GSAP_STUB)
    assert timed_out.value.category == 'timeout'

    monkeypatch.setattr(
        renderer.subprocess,
        'run',
        lambda command, **_kwargs: subprocess.CompletedProcess(command, 7, '', 'render failed'),
    )
    with pytest.raises(HyperframesProcessError) as failed:
        render_page(_bundle(), _motion_manifest(), tmp_path / 'failed', runtime, gsap_source=GSAP_STUB)
    assert failed.value.category == 'nonzero_exit'
    assert 'render failed' in str(failed.value)

    monkeypatch.setattr(
        renderer.subprocess,
        'run',
        lambda command, **_kwargs: subprocess.CompletedProcess(command, 0, 'ok', ''),
    )
    with pytest.raises(HyperframesEmptyOutputError) as empty:
        render_page(_bundle(), _motion_manifest(), tmp_path / 'empty', runtime, gsap_source=GSAP_STUB)
    assert empty.value.category == 'empty_output'
