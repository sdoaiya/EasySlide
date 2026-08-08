import hashlib
import json
import subprocess
from pathlib import Path

import pytest
from PIL import Image, ImageDraw

from services.image_scene_service import (
    append_image_scene_background_requirements,
    build_image_scene_bundle,
    build_image_scene_hero_motion,
    build_image_scene_manifest,
    create_image_scene_artifacts,
    fit_image_scene_background,
    materialize_image_scene_bundle,
    render_image_scene_hero,
)
from services.native_scene_bundle import load_native_scene_bundle
from services.scene_manifest import load_scene_manifest


DATA_URL = 'data:image/png;base64,iVBORw0KGgo='


def _manifest(**overrides):
    values = {
        'page_id': 'page-1',
        'background_asset_path': 'assets/page-1-background.png',
        'title': '年度增长引擎',
        'body_lines': ['产品进入规模化阶段', '收入同比增长 68%'],
    }
    values.update(overrides)
    return build_image_scene_manifest(**values)


def _digest(manifest):
    content = json.dumps(
        manifest, ensure_ascii=False, sort_keys=True, separators=(',', ':'),
    ).encode('utf-8')
    return hashlib.sha256(content).hexdigest()


def test_image_scene_renders_structured_chart_as_independent_motion_layer():
    manifest = _manifest(chart_data=[
        {'label': '华东', 'value': 68},
        {'label': '华南', 'value': 42},
    ])
    bundle = build_image_scene_bundle(manifest, _digest(manifest), DATA_URL)

    chart = next(element for element in manifest['elements'] if element['id'] == 'chart')
    assert chart['kind'] == 'chart'
    assert chart['text'] == '华东\t68.0\n华南\t42.0'
    assert 'data-motion-id="chart"' in bundle['html']
    assert '<svg' in bundle['html']


def test_image_scene_keeps_text_outside_the_generated_background():
    manifest = _manifest()

    assert manifest['render_mode'] == 'image'
    assert manifest['elements'][0]['asset_path'] == 'assets/page-1-background.png'
    assert manifest['elements'][0]['text'] is None
    assert [element['id'] for element in manifest['elements']] == ['background', 'title', 'body']
    assert manifest['elements'][1]['text'] == '年度增长引擎'
    assert manifest['quality']['warnings'] == ['hero_frame_unverified']


def test_image_scene_background_prompt_and_canvas_are_layer_safe():
    requirements = append_image_scene_background_requirements('保持品牌配色')
    source = Image.new('RGB', (1200, 1200), '#17324d')

    fitted = fit_image_scene_background(source)

    assert requirements.startswith('保持品牌配色')
    assert '不要在图片中绘制标题、正文' in requirements
    assert fitted.size == (1920, 1080)


def test_image_scene_bundle_is_inline_safe_and_motion_addressable():
    manifest = _manifest(title='<script>alert(1)</script>')
    bundle = build_image_scene_bundle(manifest, _digest(manifest), DATA_URL)

    assert '<script>' not in bundle['html']
    assert '&lt;script&gt;' in bundle['html']
    assert bundle['html'].count('data-motion-id=') == len(manifest['elements'])
    assert bundle['assets'][0]['data_url'] == DATA_URL
    assert 'http://' not in bundle['html']
    assert 'https://' not in bundle['html']
    assert 'width:960px' in bundle['css']


def test_image_scene_rejects_remote_or_non_image_backgrounds():
    manifest = _manifest()
    digest = _digest(manifest)

    with pytest.raises(ValueError, match='inline image'):
        build_image_scene_bundle(manifest, digest, 'https://example.com/background.png')


def test_hero_motion_places_every_scene_element_in_its_final_state():
    manifest = _manifest()

    motion = build_image_scene_hero_motion(manifest, _digest(manifest))

    assert motion['camera']['preset'] == 'static'
    assert [item['element_id'] for item in motion['elements']] == [
        element['id'] for element in manifest['elements']
    ]
    assert all(item['start_ms'] == 0 and item['duration_ms'] == 1 for item in motion['elements'])


def test_render_hero_extracts_png_atomically(tmp_path, monkeypatch):
    manifest = _manifest()
    bundle = build_image_scene_bundle(manifest, _digest(manifest), DATA_URL)
    render_roots = []

    def fake_render(_bundle, _motion, output_root, _runtime):
        render_roots.append(Path(output_root).resolve())
        video = Path(output_root) / 'scene.mp4'
        video.write_bytes(b'video')
        return {'output_path': str(video)}

    def fake_ffmpeg(command, **_kwargs):
        output = command[-1]
        with open(output, 'wb') as handle:
            handle.write(b'png')
        return subprocess.CompletedProcess(command, 0, b'', b'')

    monkeypatch.setattr('services.hyperframes_renderer.render_page', fake_render)
    monkeypatch.setattr('services.image_scene_service.subprocess.run', fake_ffmpeg)
    output = tmp_path / 'deep' / 'project' / 'artifacts' / 'hero.png'

    result = render_image_scene_hero(bundle, manifest, output, runtime=object())

    assert result == {'path': str(output.resolve()), 'renderer': 'hyperframes'}
    assert output.read_bytes() == b'png'
    assert len(render_roots) == 1
    assert not render_roots[0].is_relative_to(output.parent.resolve())


def test_create_image_scene_artifacts_persists_a_verified_same_source_set(
    tmp_path,
    monkeypatch,
):
    background = Image.new('RGB', (1920, 1080), '#17324d')

    def fake_hero(_bundle, _manifest, output_path, _runtime, **_kwargs):
        hero = Image.new('RGB', (1920, 1080), '#17324d')
        draw = ImageDraw.Draw(hero)
        draw.rectangle((120, 160, 840, 840), fill='#f7f5ef')
        hero.save(output_path, format='PNG')
        return {'path': str(output_path), 'renderer': 'hyperframes'}

    monkeypatch.setattr('services.image_scene_service.render_image_scene_hero', fake_hero)

    result = create_image_scene_artifacts(
        page_id='page-1',
        background_image=background,
        title='年度增长引擎',
        body_lines=['产品进入规模化阶段', '收入同比增长 68%'],
        output_directory=tmp_path,
        runtime=object(),
    )

    manifest = load_scene_manifest(result['scene_manifest_ref'], 'page-1')
    bundle = load_native_scene_bundle(
        result['scene_bundle_ref'],
        'page-1',
        result['scene_manifest_ref']['sha256'],
    )
    assert Path(result['background_path']).is_file()
    assert Path(result['hero_path']).is_file()
    assert manifest['fallback_preview_path'] == result['hero_path']
    assert manifest['quality'] == {'score': 1.0, 'warnings': []}
    assert bundle['scene_manifest_sha256'] == result['scene_manifest_ref']['sha256']
    assert result['quality']['status'] == 'passed'


def test_create_image_scene_artifacts_removes_its_partial_set_on_failure(
    tmp_path,
    monkeypatch,
):
    background = Image.new('RGB', (1920, 1080), '#17324d')

    def fail_hero(*_args, **_kwargs):
        raise RuntimeError('renderer unavailable')

    monkeypatch.setattr('services.image_scene_service.render_image_scene_hero', fail_hero)

    with pytest.raises(RuntimeError, match='renderer unavailable'):
        create_image_scene_artifacts(
            page_id='page-1',
            background_image=background,
            title='年度增长引擎',
            output_directory=tmp_path,
            runtime=object(),
        )

    assert list(tmp_path.iterdir()) == []


def test_materialize_image_scene_bundle_rebuilds_from_bound_manifest(
    tmp_path,
    monkeypatch,
):
    background = Image.new('RGB', (1920, 1080), '#17324d')

    def fake_hero(_bundle, _manifest, output_path, _runtime, **_kwargs):
        hero = Image.new('RGB', (1920, 1080), '#17324d')
        ImageDraw.Draw(hero).rectangle((120, 160, 840, 840), fill='#f7f5ef')
        hero.save(output_path, format='PNG')
        return {'path': str(output_path), 'renderer': 'hyperframes'}

    monkeypatch.setattr('services.image_scene_service.render_image_scene_hero', fake_hero)
    artifacts = create_image_scene_artifacts(
        page_id='page-1',
        background_image=background,
        title='年度增长引擎',
        output_directory=tmp_path / 'source',
        runtime=object(),
    )

    bundle_ref = materialize_image_scene_bundle(
        artifacts['scene_manifest_ref'],
        tmp_path / 'snapshot',
    )
    bundle = load_native_scene_bundle(
        bundle_ref,
        'page-1',
        artifacts['scene_manifest_ref']['sha256'],
    )

    assert bundle['page_id'] == 'page-1'
    assert bundle['scene_manifest_sha256'] == artifacts['scene_manifest_ref']['sha256']


def test_compose_plain_page_image_draws_title_and_body_over_background():
    """降级合成：背景+文字，输出 1920x1080 RGB，文字区域出现亮色像素。"""
    from services.image_scene_service import compose_plain_page_image

    background = Image.new('RGB', (1200, 1200), '#17324d')
    composed = compose_plain_page_image(
        background,
        '年度经营复盘',
        ['收入同比增长 68%', '产品进入规模化阶段'],
    )

    assert composed.size == (1920, 1080)
    assert composed.mode == 'RGB'
    # 左栏标题区域应出现接近白色的文字像素
    crop = composed.crop((180, 140, 420, 300))
    light_pixels = sum(1 for pixel in crop.getdata() if sum(pixel) > 600)
    assert light_pixels > 100, f'标题区域应有亮色文字像素，实际 {light_pixels}'
    # 背景主体区域（右侧）保持原背景色，无文字干扰
    right = composed.crop((1500, 300, 1800, 700))
    dominant = right.getcolors(maxcolors=10**7)
    assert any(count / (right.width * right.height) > 0.9 for count, _ in dominant)
    composed.close()
