import html
import shutil
import uuid
from pathlib import Path

from PIL import Image, ImageChops, ImageStat

from services.image_scene_service import (
    DEFAULT_STYLE,
    _canonical_digest,
    _image_file_data_url,
    _save_png_atomically,
    render_image_scene_hero,
)
from services.native_scene_bundle import (
    save_native_scene_bundles,
    validate_native_scene_bundle,
)
from services.scene_manifest import save_scene_manifests, validate_scene_manifest


def classify_historical_scene(*, has_clean_background, elements, image_decodable=True):
    usable = [element for element in elements if _normalized_bbox(element)]
    if has_clean_background and len(usable) >= 3 and _mean_confidence(usable) >= 0.85:
        return {'level': 'L0', 'reason': '完整背景与高置信元素可用', 'animatable': True}
    if has_clean_background and usable:
        return {'level': 'L1', 'reason': '仅可靠恢复部分元素', 'animatable': True}
    if usable:
        return {'level': 'L2', 'reason': '缺少可靠背景修复，仅可做区域聚焦', 'animatable': False}
    if image_decodable:
        return {'level': 'L3', 'reason': '未识别出可靠图层，使用整页镜头动效', 'animatable': False}
    return {'level': 'L4', 'reason': '图片不可解码，仅保留静态转场', 'animatable': False}


def create_historical_image_scene_artifacts(
    *,
    page_id,
    editable_image,
    output_directory,
    runtime,
    ffmpeg_path='ffmpeg',
    max_visual_difference=0.04,
):
    source_path = Path(editable_image.image_path).resolve()
    clean_path = Path(editable_image.clean_background).resolve() if editable_image.clean_background else None
    decision = classify_historical_scene(
        has_clean_background=bool(clean_path and clean_path.is_file()),
        elements=editable_image.elements,
        image_decodable=source_path.is_file(),
    )
    if not decision['animatable']:
        return {**decision, 'scene_manifest_ref': None, 'scene_bundle_ref': None}

    root = Path(output_directory).resolve()
    root.mkdir(parents=True, exist_ok=True)
    artifact_dir = root / f'historical_scene_{uuid.uuid4().hex}'
    artifact_dir.mkdir()
    try:
        with Image.open(source_path) as opened:
            source_size = opened.size
            source = opened.convert('RGB').resize((1920, 1080), Image.Resampling.LANCZOS)
        with Image.open(clean_path) as opened:
            background = opened.convert('RGB').resize((1920, 1080), Image.Resampling.LANCZOS)
        background_path = artifact_dir / 'background.png'
        hero_path = artifact_dir / 'hero.png'
        _save_png_atomically(background, background_path)

        elements = [_background_element(background_path)]
        for index, raw in enumerate(editable_image.elements):
            bbox = _normalized_bbox(raw, *source_size)
            if not bbox:
                continue
            crop_path = artifact_dir / f'element_{index:03d}.png'
            _save_png_atomically(source.crop(_xyxy(bbox)), crop_path)
            elements.append(_scene_element(raw, index, bbox, crop_path))

        manifest = validate_scene_manifest({
            'schema_version': 1,
            'page_id': page_id,
            'render_mode': 'image',
            'width': 1920,
            'height': 1080,
            'visual_style': DEFAULT_STYLE,
            'elements': elements,
            'fallback_preview_path': str(hero_path),
            'quality': {'score': 0, 'warnings': ['historical_scene_unverified']},
        }, page_id)
        provisional_digest = _canonical_digest(manifest)
        bundle = build_historical_image_scene_bundle(manifest, provisional_digest)
        render_image_scene_hero(bundle, manifest, hero_path, runtime, ffmpeg_path=ffmpeg_path)
        difference = _visual_difference(source, hero_path)
        if difference > max_visual_difference:
            shutil.rmtree(artifact_dir, ignore_errors=True)
            return {
                'level': 'L3',
                'reason': f'重建画面差异过大（{difference:.4f}）',
                'animatable': False,
                'scene_manifest_ref': None,
                'scene_bundle_ref': None,
            }

        manifest['quality'] = {
            'score': round(max(0.0, 1.0 - difference), 4),
            'warnings': [],
        }
        scene_ref = save_scene_manifests([manifest], artifact_dir, [page_id])[0]
        bundle_ref = save_native_scene_bundles(
            [build_historical_image_scene_bundle(manifest, scene_ref['sha256'])],
            artifact_dir,
            [scene_ref],
            [page_id],
        )[0]
        return {
            **decision,
            'visual_difference': difference,
            'hero_path': str(hero_path),
            'scene_manifest_ref': scene_ref,
            'scene_bundle_ref': bundle_ref,
        }
    except Exception:
        shutil.rmtree(artifact_dir, ignore_errors=True)
        raise


def build_historical_image_scene_bundle(manifest, scene_manifest_sha256):
    validated = validate_scene_manifest(manifest)
    markup = [
        f'<div class="native-slide historical-scene" data-page-id="{html.escape(validated["page_id"], quote=True)}">'
    ]
    assets = []
    for element in validated['elements']:
        data_url = _image_file_data_url(element['asset_path'])
        x, y, width, height = element['bbox']
        markup.append(
            f'<img data-motion-id="{html.escape(element["id"], quote=True)}" '
            f'src="{html.escape(data_url, quote=True)}" '
            f'style="left:{x}px;top:{y}px;width:{width}px;height:{height}px;z-index:{element["z_index"]}">'
        )
        assets.append({
            'asset_id': element['id'],
            'source': element['asset_path'],
            'data_url': data_url,
            'mime_type': data_url[5:data_url.index(';')],
        })
    markup.append('</div>')
    return validate_native_scene_bundle({
        'schema_version': 1,
        'page_id': validated['page_id'],
        'scene_manifest_sha256': scene_manifest_sha256,
        'width': 1920,
        'height': 1080,
        'html': ''.join(markup),
        'css': (
            '.historical-scene{position:relative;width:1920px;height:1080px;overflow:hidden;background:#000}'
            '.historical-scene img{position:absolute;display:block;object-fit:fill}'
        ),
        'assets': assets,
        'warnings': [],
    }, validated['page_id'], scene_manifest_sha256)


def _background_element(path):
    return {
        'id': 'background',
        'kind': 'image',
        'role': 'visual',
        'bbox': [0, 0, 1920, 1080],
        'z_index': 0,
        'asset_path': str(path),
        'text': None,
        'motion_capabilities': ['reveal', 'scale', 'pan'],
    }


def _scene_element(raw, index, bbox, path):
    raw_type = str(getattr(raw, 'element_type', '') or '').lower()
    kind = 'chart' if raw_type in {'chart', 'table'} else 'image'
    return {
        'id': f'recovered-{index:03d}',
        'kind': kind,
        'role': 'evidence' if kind == 'chart' else 'visual',
        'bbox': bbox,
        'z_index': index + 1,
        'asset_path': str(path),
        'text': getattr(raw, 'content', None),
        'motion_capabilities': ['reveal', 'scale', 'pan'],
    }


def _normalized_bbox(element, source_width=1920, source_height=1080):
    bbox = getattr(element, 'bbox_global', None) or getattr(element, 'bbox', None)
    if not bbox:
        return None
    values = [bbox.x0, bbox.y0, bbox.x1, bbox.y1]
    if values[0] < 0 or values[1] < 0 or values[2] <= values[0] or values[3] <= values[1]:
        return None
    width = float(source_width)
    height = float(source_height)
    x = round(values[0] * 1920 / width)
    y = round(values[1] * 1080 / height)
    right = round(values[2] * 1920 / width)
    bottom = round(values[3] * 1080 / height)
    x, y = max(0, x), max(0, y)
    right, bottom = min(1920, right), min(1080, bottom)
    return [x, y, right - x, bottom - y] if right > x and bottom > y else None


def _mean_confidence(elements):
    values = [
        float(getattr(element, 'metadata', {}).get('confidence', 0.8))
        for element in elements
    ]
    return sum(values) / len(values) if values else 0.0


def _xyxy(bbox):
    x, y, width, height = bbox
    return (x, y, x + width, y + height)


def _visual_difference(source, hero_path):
    with Image.open(hero_path) as opened:
        hero = opened.convert('RGB').resize(source.size, Image.Resampling.LANCZOS)
    difference = ImageChops.difference(source, hero)
    return round(sum(ImageStat.Stat(difference).mean) / (255 * 3), 6)
