import hashlib
import json
import math
import os
from pathlib import Path


KINDS = {'title', 'body', 'image', 'number', 'chart'}
ROLES = {'headline', 'supporting', 'visual', 'evidence'}
RENDER_MODES = {'native', 'image'}
CAPABILITIES = {
    'title': {'reveal', 'highlight'},
    'body': {'reveal', 'highlight'},
    'image': {'reveal', 'scale', 'pan'},
    'number': {'reveal', 'highlight', 'count'},
    'chart': {'reveal', 'highlight', 'scale', 'pan'},
}
TOP_LEVEL_FIELDS = {
    'schema_version', 'page_id', 'render_mode', 'width', 'height',
    'visual_style', 'elements', 'fallback_preview_path', 'quality',
}
VISUAL_STYLE_FIELDS = {'theme_id', 'colors', 'font_families'}
ELEMENT_FIELDS = {
    'id', 'kind', 'role', 'bbox', 'z_index', 'asset_path', 'text',
    'motion_capabilities',
}
QUALITY_FIELDS = {'score', 'warnings'}


def _require_exact_fields(payload, fields, label):
    missing = fields - set(payload)
    if missing:
        raise ValueError(f'{label} 缺少必填字段: {sorted(missing)[0]}')
    unexpected = set(payload) - fields
    if unexpected:
        raise ValueError(f'{label} 包含未知字段: {sorted(unexpected)[0]}')


def _validate_unique_string_list(value, label, *, allow_empty_items=True):
    if not isinstance(value, list) or any(
        not isinstance(item, str) or (not allow_empty_items and not item)
        for item in value
    ):
        raise ValueError(f'{label} 必须是文本数组')
    if len(value) != len(set(value)):
        raise ValueError(f'{label} 不允许重复项')


def validate_scene_manifest(payload, expected_page_id=None):
    if not isinstance(payload, dict):
        raise ValueError('场景清单必须是 JSON 对象')
    _require_exact_fields(payload, TOP_LEVEL_FIELDS, '场景清单')
    if payload.get('schema_version') != 1:
        raise ValueError('场景清单 schema_version 必须为 1')
    page_id = payload.get('page_id')
    if not isinstance(page_id, str) or not page_id:
        raise ValueError('场景清单缺少 page_id')
    if expected_page_id is not None and page_id != expected_page_id:
        raise ValueError(f'场景清单页面不匹配: {page_id}')
    if payload.get('render_mode') not in RENDER_MODES:
        raise ValueError('原生视频场景清单 render_mode 必须为 native')
    if payload.get('width') != 1920 or payload.get('height') != 1080:
        raise ValueError('原生视频场景尺寸必须为 1920x1080')

    visual_style = payload.get('visual_style')
    if not isinstance(visual_style, dict):
        raise ValueError('场景清单 visual_style 必须是 JSON 对象')
    _require_exact_fields(visual_style, VISUAL_STYLE_FIELDS, '场景清单 visual_style')
    if not isinstance(visual_style.get('theme_id'), str) or not visual_style['theme_id']:
        raise ValueError('场景清单 visual_style.theme_id 必须是非空文本')
    _validate_unique_string_list(visual_style.get('colors'), '场景清单 visual_style.colors')
    _validate_unique_string_list(
        visual_style.get('font_families'),
        '场景清单 visual_style.font_families',
        allow_empty_items=False,
    )

    elements = payload.get('elements')
    if not isinstance(elements, list):
        raise ValueError('场景清单 elements 必须是数组')

    element_ids = set()
    for element in elements:
        if not isinstance(element, dict):
            raise ValueError('场景元素必须是 JSON 对象')
        _require_exact_fields(element, ELEMENT_FIELDS, '场景元素')
        element_id = element.get('id')
        if not isinstance(element_id, str) or not element_id or element_id in element_ids:
            raise ValueError(f'场景元素 ID 重复或为空: {element_id}')
        element_ids.add(element_id)
        kind = element.get('kind')
        if kind not in KINDS:
            raise ValueError(f'不支持的场景元素类型: {kind}')
        role = element.get('role')
        if role not in ROLES:
            raise ValueError(f'不支持的场景元素 role: {role}')
        bbox = element.get('bbox')
        if not isinstance(bbox, list) or len(bbox) != 4 or any(
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not math.isfinite(value)
            for value in bbox
        ):
            raise ValueError(f'场景元素 bbox 无效: {element_id}')
        x, y, width, height = bbox
        if width <= 0 or height <= 0 or x < 0 or y < 0 or x + width > 1920 or y + height > 1080:
            raise ValueError(f'场景元素 bbox 越界: {element_id}')
        if isinstance(element.get('z_index'), bool) or not isinstance(element.get('z_index'), int):
            raise ValueError(f'场景元素 z_index 必须是整数: {element_id}')
        if element.get('asset_path') is not None and not isinstance(element.get('asset_path'), str):
            raise ValueError(f'场景元素 asset_path 必须是文本或 null: {element_id}')
        if element.get('text') is not None and not isinstance(element.get('text'), str):
            raise ValueError(f'场景元素 text 必须是文本或 null: {element_id}')
        capabilities = element.get('motion_capabilities')
        if (
            not isinstance(capabilities, list)
            or len(capabilities) != len(set(capabilities))
            or any(item not in CAPABILITIES[kind] for item in capabilities)
        ):
            raise ValueError(f'场景元素 motion_capabilities 无效: {element_id}')

    fallback_preview_path = payload.get('fallback_preview_path')
    if fallback_preview_path is not None and not isinstance(fallback_preview_path, str):
        raise ValueError('场景清单 fallback_preview_path 必须是文本或 null')

    quality = payload.get('quality')
    if not isinstance(quality, dict):
        raise ValueError('场景清单 quality 必须是 JSON 对象')
    _require_exact_fields(quality, QUALITY_FIELDS, '场景清单 quality')
    score = quality.get('score')
    if (
        isinstance(score, bool)
        or not isinstance(score, (int, float))
        or not math.isfinite(score)
        or score < 0
        or score > 1
    ):
        raise ValueError('场景清单 quality.score 必须是 0-1 的数字')
    _validate_unique_string_list(quality.get('warnings'), '场景清单 quality.warnings')
    return payload


def save_scene_manifests(manifests, directory, page_ids):
    if not isinstance(manifests, list) or len(manifests) != len(page_ids):
        raise ValueError('场景清单数量与导出页面不一致')
    target_dir = Path(directory)
    target_dir.mkdir(parents=True, exist_ok=True)
    references = []
    for index, (manifest, page_id) in enumerate(zip(manifests, page_ids)):
        validated = validate_scene_manifest(manifest, page_id)
        content = json.dumps(validated, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
        digest = hashlib.sha256(content).hexdigest()
        path = target_dir / f'scene_{index:04d}.json'
        temporary = path.with_suffix('.tmp')
        temporary.write_bytes(content)
        os.replace(temporary, path)
        references.append({'page_id': page_id, 'path': str(path.resolve()), 'sha256': digest})
    return references


def load_scene_manifest(reference, expected_page_id=None):
    if not isinstance(reference, dict):
        raise ValueError('场景清单引用无效')
    path = Path(str(reference.get('path') or ''))
    content = path.read_bytes()
    digest = hashlib.sha256(content).hexdigest()
    if digest != reference.get('sha256'):
        raise ValueError('场景清单校验失败，请重新创建导出任务')
    payload = json.loads(content.decode('utf-8'))
    return validate_scene_manifest(payload, expected_page_id or reference.get('page_id'))
