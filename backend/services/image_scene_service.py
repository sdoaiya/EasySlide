import base64
import hashlib
import html
import json
import os
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from services.image_generation_quality import assess_generated_image
from services.native_scene_bundle import save_native_scene_bundles
from services.native_scene_bundle import validate_native_scene_bundle
from services.scene_manifest import load_scene_manifest
from services.scene_manifest import save_scene_manifests
from services.scene_manifest import validate_scene_manifest


IMAGE_SCENE_LAYOUTS = {'text_left', 'text_right'}
DEFAULT_STYLE = {
    'theme_id': 'image-scene-default',
    'colors': ['#0B1F33', '#F7F5EF', '#0B6E69'],
    'font_families': ['Microsoft YaHei'],
}
IMAGE_SCENE_BACKGROUND_REQUIREMENTS = (
    '本页启用可动画分层场景：只生成背景、插图、纹理和装饰图形。'
    '不要在图片中绘制标题、正文、数字、标签、图例或任何可读文字；'
    '这些信息将由清晰的 HTML/SVG 图层单独渲染。'
)


def append_image_scene_background_requirements(value):
    prefix = str(value or '').strip()
    if not prefix:
        return IMAGE_SCENE_BACKGROUND_REQUIREMENTS
    return f'{prefix}\n\n{IMAGE_SCENE_BACKGROUND_REQUIREMENTS}'


def fit_image_scene_background(image):
    if not isinstance(image, Image.Image):
        raise ValueError('Image scene background must be a PIL image')
    source = image.convert('RGB')
    source_ratio = source.width / source.height
    target_ratio = 16 / 9
    if source_ratio > target_ratio:
        crop_width = round(source.height * target_ratio)
        left = (source.width - crop_width) // 2
        source = source.crop((left, 0, left + crop_width, source.height))
    elif source_ratio < target_ratio:
        crop_height = round(source.width / target_ratio)
        top = (source.height - crop_height) // 2
        source = source.crop((0, top, source.width, top + crop_height))
    return source.resize((1920, 1080), Image.Resampling.LANCZOS)


def compose_plain_page_image(image, title, body_lines=None, layout='text_left'):
    """把「纯背景」生图结果合成为背景+文字的完整页面图。

    Hyperframes 分层渲染不可用时的降级路径：生图 prompt 在可编辑场景
    模式下只画背景不画文字，若场景渲染失败直接保存原图会出现
    「只有背景没有文字」。此函数用 PIL 在左栏半透明遮罩上绘制
    标题与正文，产出与 scene hero 布局一致的完整页面图。
    """
    background = fit_image_scene_background(image).convert('RGBA')
    margin = 96
    panel_width = 760
    overlay = Image.new('RGBA', background.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.rectangle(
        [margin, 0, margin + panel_width, background.height],
        fill=(11, 31, 51, 130),
    )
    title_font = _load_image_scene_font(64, bold=True)
    body_font = _load_image_scene_font(36, bold=False)
    text_left = margin * 2
    text_max = panel_width - margin
    y = 140
    for line in _wrap_image_scene_text(str(title or '').strip(), title_font, draw, text_max):
        draw.text((text_left, y), line, font=title_font, fill=(247, 245, 239, 255))
        y += 88
        if y > 440:
            break
    y += 24
    for raw in (body_lines or [])[:6]:
        for wrapped in _wrap_image_scene_text(str(raw).strip(), body_font, draw, text_max):
            draw.text((text_left, y), wrapped, font=body_font, fill=(247, 245, 239, 230))
            y += 52
            if y > background.height - 120:
                break
    composed = background.copy()
    composed.alpha_composite(overlay)
    return composed.convert('RGB')


def _load_image_scene_font(size, *, bold):
    candidates = (
        [r'C:\Windows\Fonts\msyhbd.ttc', r'C:\Windows\Fonts\msyh.ttc', r'C:\Windows\Fonts\simhei.ttf']
        if bold
        else [r'C:\Windows\Fonts\msyh.ttc', r'C:\Windows\Fonts\msyhl.ttc', r'C:\Windows\Fonts\simhei.ttf']
    )
    last_error = None
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError as exc:
            last_error = exc
    raise OSError(f'No CJK font available for image scene composition: {last_error}')


def _wrap_image_scene_text(text, font, draw, max_width):
    if not text:
        return []
    lines = []
    current = ''
    for char in text:
        if draw.textlength(current + char, font=font) <= max_width:
            current += char
        else:
            if current:
                lines.append(current)
            current = char
    if current:
        lines.append(current)
    return lines


def create_image_scene_artifacts(
    *,
    page_id,
    background_image,
    title,
    output_directory,
    runtime,
    body_lines=None,
    chart_data=None,
    layout='text_left',
    visual_style=None,
    ffmpeg_path='ffmpeg',
):
    """Create one isolated, verified image-scene artifact set."""
    if not isinstance(background_image, Image.Image):
        raise ValueError('Image scene background_image must be a PIL image')
    if background_image.size != (1920, 1080):
        raise ValueError('Image scene background must be 1920x1080')

    root = Path(output_directory).resolve()
    root.mkdir(parents=True, exist_ok=True)
    artifact_dir = root / f'image_scene_{uuid.uuid4().hex}'
    artifact_dir.mkdir()
    background_path = artifact_dir / 'background.png'
    hero_path = artifact_dir / 'hero.png'

    try:
        _save_png_atomically(background_image, background_path)
        background_data_url = _png_data_url(background_path)
        provisional_manifest = build_image_scene_manifest(
            page_id=page_id,
            background_asset_path=str(background_path),
            title=title,
            body_lines=body_lines,
            chart_data=chart_data,
            layout=layout,
            visual_style=visual_style,
            fallback_preview_path=str(hero_path),
        )
        provisional_digest = _canonical_digest(provisional_manifest)
        provisional_bundle = build_image_scene_bundle(
            provisional_manifest,
            provisional_digest,
            background_data_url,
        )
        render_image_scene_hero(
            provisional_bundle,
            provisional_manifest,
            hero_path,
            runtime,
            ffmpeg_path=ffmpeg_path,
        )

        with Image.open(hero_path) as hero:
            quality = assess_generated_image(
                hero,
                aspect_ratio='16:9',
                resolution_matches=hero.size == (1920, 1080),
            )
        if quality['status'] != 'passed':
            issues = ', '.join(quality['issues']) or 'unknown'
            raise ValueError(f'Image scene hero quality gate failed: {issues}')

        final_manifest = dict(provisional_manifest)
        final_manifest['quality'] = {
            'score': _quality_score(quality),
            'warnings': list(quality['issues']),
        }
        scene_ref = save_scene_manifests(
            [final_manifest],
            artifact_dir,
            [page_id],
        )[0]
        final_bundle = build_image_scene_bundle(
            final_manifest,
            scene_ref['sha256'],
            background_data_url,
        )
        bundle_ref = save_native_scene_bundles(
            [final_bundle],
            artifact_dir,
            [scene_ref],
            [page_id],
        )[0]
        return {
            'background_path': str(background_path),
            'scene_manifest_ref': scene_ref,
            'scene_bundle_ref': bundle_ref,
            'hero_path': str(hero_path),
            'quality': quality,
        }
    except Exception:
        shutil.rmtree(artifact_dir, ignore_errors=True)
        raise


def materialize_image_scene_bundle(scene_manifest_ref, output_directory):
    manifest = load_scene_manifest(scene_manifest_ref)
    if manifest['render_mode'] != 'image':
        raise ValueError('Only image Scene Manifests can be materialized here')
    background = next(
        (element for element in manifest['elements'] if element['id'] == 'background'),
        None,
    )
    if not background or not background.get('asset_path'):
        raise ValueError('Image Scene Manifest is missing its background asset')
    data_url = _image_file_data_url(background['asset_path'])
    bundle = build_image_scene_bundle(
        manifest,
        scene_manifest_ref['sha256'],
        data_url,
    )
    return save_native_scene_bundles(
        [bundle],
        output_directory,
        [scene_manifest_ref],
        [manifest['page_id']],
    )[0]


def build_image_scene_manifest(
    *,
    page_id,
    background_asset_path,
    title,
    body_lines=None,
    chart_data=None,
    layout='text_left',
    visual_style=None,
    fallback_preview_path=None,
):
    if not isinstance(page_id, str) or not page_id:
        raise ValueError('Image scene page_id is required')
    if not isinstance(background_asset_path, str) or not background_asset_path:
        raise ValueError('Image scene background asset path is required')
    if not isinstance(title, str) or not title.strip():
        raise ValueError('Image scene title is required')
    if layout not in IMAGE_SCENE_LAYOUTS:
        raise ValueError(f'Unsupported image scene layout: {layout}')
    lines = _body_lines(body_lines)
    style = visual_style or DEFAULT_STYLE
    panel_x = 120 if layout == 'text_left' else 1080
    elements = [{
        'id': 'background',
        'kind': 'image',
        'role': 'visual',
        'bbox': [0, 0, 1920, 1080],
        'z_index': 0,
        'asset_path': background_asset_path,
        'text': None,
        'motion_capabilities': ['reveal', 'scale', 'pan'],
    }, {
        'id': 'title',
        'kind': 'title',
        'role': 'headline',
        'bbox': [panel_x, 160, 720, 210],
        'z_index': 2,
        'asset_path': None,
        'text': title.strip(),
        'motion_capabilities': ['reveal', 'highlight'],
    }]
    if lines:
        elements.append({
            'id': 'body',
            'kind': 'body',
            'role': 'supporting',
            'bbox': [panel_x, 410, 720, min(430, 72 * len(lines))],
            'z_index': 2,
            'asset_path': None,
            'text': '\n'.join(lines),
            'motion_capabilities': ['reveal', 'highlight'],
        })
    chart_rows = _chart_rows(chart_data)
    if chart_rows:
        chart_x = 1040 if layout == 'text_left' else 120
        elements.append({
            'id': 'chart',
            'kind': 'chart',
            'role': 'evidence',
            'bbox': [chart_x, 240, 760, 600],
            'z_index': 2,
            'asset_path': None,
            'text': '\n'.join(f'{label}\t{value}' for label, value in chart_rows),
            'motion_capabilities': ['reveal', 'highlight', 'scale', 'pan'],
        })
    manifest = {
        'schema_version': 1,
        'page_id': page_id,
        'render_mode': 'image',
        'width': 1920,
        'height': 1080,
        'visual_style': style,
        'elements': elements,
        'fallback_preview_path': fallback_preview_path,
        'quality': {'score': 0, 'warnings': ['hero_frame_unverified']},
    }
    return validate_scene_manifest(manifest, page_id)


def build_image_scene_bundle(manifest, scene_manifest_sha256, background_data_url):
    validated = validate_scene_manifest(manifest)
    if validated['render_mode'] != 'image':
        raise ValueError('Image Scene Adapter requires render_mode=image')
    if not isinstance(background_data_url, str) or not background_data_url.startswith('data:image/'):
        raise ValueError('Image scene background must be an inline image data URL')
    title = next(element for element in validated['elements'] if element['id'] == 'title')
    body = next((element for element in validated['elements'] if element['id'] == 'body'), None)
    chart = next((element for element in validated['elements'] if element['id'] == 'chart'), None)
    panel_side = 'left' if title['bbox'][0] < 960 else 'right'
    body_html = ''
    if body:
        body_html = '<p data-motion-id="body">{}</p>'.format(
            '<br>'.join(html.escape(line) for line in body['text'].splitlines())
        )
    chart_html = _chart_svg(chart) if chart else ''
    page_id = html.escape(validated['page_id'], quote=True)
    data_url = html.escape(background_data_url, quote=True)
    markup = (
        f'<div class="native-slide image-scene panel-{panel_side}" data-page-id="{page_id}">'
        f'<img class="image-scene-background" data-motion-id="background" src="{data_url}">'
        '<section class="image-scene-panel">'
        f'<h1 data-motion-id="title">{html.escape(title["text"])}</h1>'
        f'{body_html}</section>{chart_html}</div>'
    )
    bundle = {
        'schema_version': 1,
        'page_id': validated['page_id'],
        'scene_manifest_sha256': scene_manifest_sha256,
        'width': 1920,
        'height': 1080,
        'html': markup,
        'css': _scene_css(validated['visual_style'], panel_side),
        'assets': [{
            'asset_id': 'background',
            'source': validated['elements'][0]['asset_path'],
            'data_url': background_data_url,
            'mime_type': background_data_url[5:background_data_url.index(';')],
        }],
        'warnings': [],
    }
    return validate_native_scene_bundle(
        bundle,
        validated['page_id'],
        scene_manifest_sha256,
    )


def build_image_scene_hero_motion(manifest, scene_manifest_sha256):
    validated = validate_scene_manifest(manifest)
    return {
        'schema_version': 1,
        'page_id': validated['page_id'],
        'scene_manifest_sha256': scene_manifest_sha256,
        'duration_ms': 1000,
        'timing_quality': 'segment_exact',
        'transition': {'type': 'cut', 'duration_ms': 0, 'direction': None},
        'camera': {'preset': 'static', 'start_ms': 0, 'end_ms': 1000},
        'elements': [{
            'element_id': element['id'],
            'effect': 'fade_in',
            'start_ms': 0,
            'duration_ms': 1,
            'easing': 'none',
            'cue': {'basis': 'page', 'segment_id': None, 'precision': 'exact'},
        } for element in validated['elements']],
        'captions': [],
        'fallback': {'strategy': 'static_frame', 'reason': None},
        'warnings': [],
    }


def render_image_scene_hero(
    bundle,
    manifest,
    output_path,
    runtime,
    ffmpeg_path='ffmpeg',
):
    from services.hyperframes_renderer import render_page

    target = Path(output_path).resolve()
    if target.suffix.lower() != '.png':
        raise ValueError('Image scene hero output must be a PNG')
    target.parent.mkdir(parents=True, exist_ok=True)
    motion = build_image_scene_hero_motion(
        manifest,
        bundle.get('scene_manifest_sha256'),
    )
    with tempfile.TemporaryDirectory(prefix='easyslide-image-scene-hero-') as temp_dir:
        render = render_page(bundle, motion, temp_dir, runtime)
        temporary = Path(temp_dir) / 'hero.png'
        result = subprocess.run(
            [
                ffmpeg_path, '-y', '-ss', '0.96', '-i', render['output_path'],
                '-frames:v', '1', str(temporary),
            ],
            capture_output=True,
            timeout=120,
            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0),
        )
        if result.returncode != 0 or not temporary.is_file() or temporary.stat().st_size <= 0:
            detail = (result.stderr or result.stdout or b'FFmpeg hero extraction failed').decode(
                'utf-8', errors='replace',
            )
            raise RuntimeError(detail.strip())
        descriptor, staged_value = tempfile.mkstemp(
            prefix='.hero-',
            suffix='.tmp',
            dir=target.parent,
        )
        os.close(descriptor)
        staged = Path(staged_value)
        try:
            shutil.copyfile(temporary, staged)
            os.replace(staged, target)
        finally:
            if staged.exists():
                staged.unlink()
    return {'path': str(target), 'renderer': 'hyperframes'}


def _body_lines(value):
    if value is None:
        return []
    if not isinstance(value, list) or any(not isinstance(line, str) for line in value):
        raise ValueError('Image scene body_lines must be a list of strings')
    return [line.strip() for line in value if line.strip()][:6]


def _chart_rows(value):
    if value is None:
        return []
    rows = []
    if isinstance(value, dict) and isinstance(value.get('labels'), list) and isinstance(value.get('values'), list):
        value = [
            {'label': label, 'value': amount}
            for label, amount in zip(value['labels'], value['values'])
        ]
    if not isinstance(value, list):
        return []
    for item in value[:6]:
        if not isinstance(item, dict):
            continue
        label = str(item.get('label') or item.get('name') or '').strip()
        amount = item.get('value')
        if label and isinstance(amount, (int, float)) and not isinstance(amount, bool):
            rows.append((label[:24], float(amount)))
    return rows


def _chart_svg(element):
    rows = []
    for line in str(element.get('text') or '').splitlines():
        label, separator, amount = line.partition('\t')
        try:
            value = float(amount) if separator else None
        except ValueError:
            value = None
        if label and value is not None:
            rows.append((label, value))
    if not rows:
        return ''
    maximum = max(abs(value) for _label, value in rows) or 1
    bars = []
    for index, (label, value) in enumerate(rows):
        y = 72 + index * 86
        width = round(420 * abs(value) / maximum)
        bars.append(
            f'<text x="36" y="{y + 30}">{html.escape(label)}</text>'
            f'<rect class="bar" x="220" y="{y}" width="{width}" height="48" rx="12"></rect>'
            f'<text class="value" x="{min(700, 240 + width)}" y="{y + 32}">{value:g}</text>'
        )
    x, y, width, height = element['bbox']
    return (
        f'<svg class="image-scene-chart" data-motion-id="chart" '
        f'viewBox="0 0 760 600" style="left:{x}px;top:{y}px;width:{width}px;height:{height}px">'
        f'<rect class="chart-bg" width="760" height="600" rx="36"></rect>{"".join(bars)}</svg>'
    )


def _save_png_atomically(image, path):
    temporary = path.with_suffix('.tmp')
    image.save(temporary, format='PNG')
    os.replace(temporary, path)


def _png_data_url(path):
    encoded = base64.b64encode(path.read_bytes()).decode('ascii')
    return f'data:image/png;base64,{encoded}'


def _image_file_data_url(path):
    source = Path(path).resolve()
    suffix = source.suffix.lower()
    mime_type = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
    }.get(suffix)
    if not mime_type or not source.is_file():
        raise ValueError('Image scene background asset is missing or unsupported')
    encoded = base64.b64encode(source.read_bytes()).decode('ascii')
    return f'data:{mime_type};base64,{encoded}'


def _canonical_digest(payload):
    content = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(',', ':'),
    ).encode('utf-8')
    return hashlib.sha256(content).hexdigest()


def _quality_score(quality):
    checks = quality.get('checks') or {}
    if not checks:
        return 0.0
    return round(sum(value is True for value in checks.values()) / len(checks), 4)


def _scene_css(style, panel_side):
    fonts = ','.join(f'"{font}"' for font in style['font_families'])
    foreground = style['colors'][1] if len(style['colors']) > 1 else '#F7F5EF'
    accent = style['colors'][2] if len(style['colors']) > 2 else '#0B6E69'
    return (
        '.image-scene{position:relative;width:1920px;height:1080px;overflow:hidden;'
        f'font-family:{fonts};color:{foreground};background:#0B1F33}}'
        '.image-scene-background{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}'
        '.image-scene-panel{position:absolute;top:0;bottom:0;width:960px;padding:160px 120px;'
        'box-sizing:border-box;background:rgba(11,31,51,.78)}'
        f'.panel-{panel_side} .image-scene-panel{{{panel_side}:0}}'
        '.image-scene h1{margin:0;font-size:88px;line-height:1.12;letter-spacing:-2px}'
        '.image-scene p{margin:44px 0 0;font-size:38px;line-height:1.6}'
        f'.image-scene p::before{{content:"";display:block;width:92px;height:8px;background:{accent};margin-bottom:34px}}'
        f'.image-scene-chart{{position:absolute;overflow:visible;color:{foreground}}}'
        '.image-scene-chart text{fill:currentColor;font-size:28px;font-weight:600}'
        '.image-scene-chart .chart-bg{fill:rgba(11,31,51,.78);stroke:rgba(247,245,239,.18);stroke-width:2}'
        f'.image-scene-chart .bar{{fill:{accent};stroke:{foreground};stroke-width:2}}'
        '.image-scene-chart .value{font-size:24px;font-weight:700}'
    )
