"""Create and verify immutable narration inputs for a video export task."""

import hashlib
import json
import os
import uuid
from datetime import datetime
from pathlib import Path

from models import NarrationVersion, db
from services.narration_service import ensure_legacy_narration_version


SNAPSHOT_SCHEMA_VERSION = 1
RENDER_SNAPSHOT_SCHEMA_VERSION = 1
NARRATION_POLICIES = {
    'confirmed_only',
    'export_only_auto_fill',
    'allow_silent_pages',
}
_EXPORT_CONFIG_FIELDS = {
    'tts_provider', 'voice', 'rate', 'speed', 'language', 'narration_mode',
    'speakers', 'auto_emotion', 'fish_model', 'pronunciation_lexicon',
    'narration_preferences',
}


def _safe_artifact_refs(value, page_ids, label):
    if value is None or value == []:
        return []
    if not isinstance(value, list) or len(value) != len(page_ids):
        raise ValueError(f'{label}引用数量与导出页面不一致')
    references = []
    for reference, page_id in zip(value, page_ids):
        if reference is None:
            references.append(None)
            continue
        if not isinstance(reference, dict) or reference.get('page_id') != page_id:
            raise ValueError(f'{label}引用与导出页面不匹配')
        path = reference.get('path')
        digest = reference.get('sha256')
        if not isinstance(path, str) or not path:
            raise ValueError(f'{label}引用缺少文件路径')
        if (
            not isinstance(digest, str)
            or len(digest) != 64
            or any(character not in '0123456789abcdef' for character in digest.lower())
        ):
            raise ValueError(f'{label}引用缺少有效 SHA-256')
        references.append({
            'page_id': page_id,
            'path': path,
            'sha256': digest.lower(),
        })
    return references


def _safe_scene_manifest_refs(value, page_ids):
    return _safe_artifact_refs(value, page_ids, '场景清单')


def _safe_scene_levels(value, page_ids):
    if value is None or value == []:
        return []
    if not isinstance(value, list) or len(value) != len(page_ids):
        raise ValueError('场景级别数量与导出页面不一致')
    levels = []
    for item, page_id in zip(value, page_ids):
        if (
            not isinstance(item, dict)
            or item.get('page_id') != page_id
            or item.get('level') not in {'L0', 'L1', 'L2', 'L3', 'L4'}
            or not isinstance(item.get('reason'), str)
        ):
            raise ValueError('场景级别与导出页面不匹配')
        levels.append({
            'page_id': page_id,
            'level': item['level'],
            'reason': item['reason'],
        })
    return levels


def _safe_export_config(value):
    if not isinstance(value, dict):
        return {}
    return {key: value[key] for key in _EXPORT_CONFIG_FIELDS if key in value}


def _snapshot_bytes(payload):
    return json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(',', ':'),
    ).encode('utf-8')


def _version_for_page(page, version_map):
    requested_id = version_map.get(page.id)
    if requested_id:
        version = NarrationVersion.query.filter_by(id=requested_id, page_id=page.id).first()
        if not version or version.status == 'candidate':
            raise ValueError(f'第 {page.order_index + 1} 页指定的旁白版本不可导出')
        return version
    return ensure_legacy_narration_version(page)


def create_video_export_snapshot(
    *,
    project,
    pages,
    upload_root,
    narration_policy='confirmed_only',
    narration_version_map=None,
    export_config=None,
    scene_manifest_refs=None,
    native_scene_bundle_refs=None,
    scene_levels=None,
):
    policy = str(narration_policy or 'confirmed_only')
    if policy == 'review_missing':
        raise ValueError('缺失旁白请先在视频文案工作台确认，再重新发起导出')
    if policy not in NARRATION_POLICIES:
        raise ValueError('不支持的旁白导出策略')
    version_map = narration_version_map if isinstance(narration_version_map, dict) else {}
    page_entries = []
    for page in pages:
        version = _version_for_page(page, version_map)
        if version:
            page_entries.append({
                'page_id': page.id,
                'order_index': page.order_index,
                'narration_version_id': version.id,
                'content_hash': version.content_hash,
                'mode': version.mode,
                'language': version.language,
                'text': version.text,
                'segments': version.get_segments(),
                'silent': False,
            })
            continue
        if policy == 'confirmed_only':
            raise ValueError(f'第 {page.order_index + 1} 页缺少已确认旁白')
        if policy == 'allow_silent_pages':
            page_entries.append({
                'page_id': page.id,
                'order_index': page.order_index,
                'narration_version_id': None,
                'content_hash': None,
                'mode': 'single',
                'language': 'auto',
                'text': '',
                'segments': [],
                'silent': True,
            })
            continue
        page_entries.append({
            'page_id': page.id,
            'order_index': page.order_index,
            'narration_version_id': None,
            'content_hash': None,
            'mode': 'single',
            'language': str((export_config or {}).get('language') or 'auto'),
            'text': '',
            'segments': [],
            'silent': False,
            'pending_generation': True,
            'source': {
                'outline': page.get_outline_content() or {},
                'description': page.get_description_content() or {},
            },
        })

    payload = {
        'schema_version': SNAPSHOT_SCHEMA_VERSION,
        'project_id': project.id,
        'narration_policy': policy,
        'pages': page_entries,
        'scene_manifests': _safe_scene_manifest_refs(
            scene_manifest_refs,
            [page.id for page in pages],
        ),
        'native_scene_bundles': _safe_artifact_refs(
            native_scene_bundle_refs,
            [page.id for page in pages],
            '原生场景包',
        ),
        'scene_levels': _safe_scene_levels(
            scene_levels,
            [page.id for page in pages],
        ),
        'export_config': _safe_export_config(export_config),
        'created_at': datetime.utcnow().isoformat(),
    }
    content = _snapshot_bytes(payload)
    digest = hashlib.sha256(content).hexdigest()
    directory = Path(upload_root) / project.id / 'exports' / 'snapshots'
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f'{uuid.uuid4()}.json'
    temporary = path.with_suffix('.tmp')
    temporary.write_bytes(content)
    os.replace(temporary, path)
    db.session.flush()
    return {'path': str(path.resolve()), 'sha256': digest, 'snapshot': payload}


def load_video_export_snapshot(path, expected_sha256):
    content = Path(path).read_bytes()
    actual = hashlib.sha256(content).hexdigest()
    if actual != expected_sha256:
        raise ValueError('视频导出快照校验失败，请重新创建导出任务')
    payload = json.loads(content.decode('utf-8'))
    if payload.get('schema_version') != SNAPSHOT_SCHEMA_VERSION:
        raise ValueError('不支持的视频导出快照版本')
    return payload


def _render_artifact_ref(value, page_id, label, *, scene_hash=False):
    if value is None:
        return None
    expected_fields = {'page_id', 'path', 'sha256'}
    if scene_hash:
        expected_fields.add('scene_manifest_sha256')
    if not isinstance(value, dict) or set(value) != expected_fields or value.get('page_id') != page_id:
        raise ValueError(f'{label}引用与渲染页面不匹配')
    safe = _safe_artifact_refs([value], [page_id], label)[0]
    if scene_hash:
        digest = value.get('scene_manifest_sha256')
        if (
            not isinstance(digest, str)
            or len(digest) != 64
            or any(character not in '0123456789abcdef' for character in digest.lower())
        ):
            raise ValueError(f'{label}引用缺少有效 Scene SHA-256')
        safe['scene_manifest_sha256'] = digest.lower()
    try:
        content = Path(safe['path']).read_bytes()
    except (OSError, ValueError) as exc:
        raise ValueError(f'{label}引用文件无效') from exc
    if hashlib.sha256(content).hexdigest() != safe['sha256']:
        raise ValueError(f'{label}引用文件校验失败')
    return safe


def _validate_video_render_snapshot(payload):
    top_fields = {
        'schema_version', 'project_id', 'narration_snapshot',
        'pages', 'renderer', 'created_at',
    }
    if not isinstance(payload, dict) or set(payload) != top_fields:
        raise ValueError('视频渲染快照字段无效')
    if payload.get('schema_version') != RENDER_SNAPSHOT_SCHEMA_VERSION:
        raise ValueError('不支持的视频渲染快照版本')
    project_id = payload.get('project_id')
    if not isinstance(project_id, str) or not project_id:
        raise ValueError('视频渲染快照项目 ID 无效')
    source = payload.get('narration_snapshot')
    if not isinstance(source, dict) or set(source) != {'path', 'sha256'}:
        raise ValueError('视频渲染快照旁白引用无效')
    source_payload = load_video_export_snapshot(source.get('path'), source.get('sha256'))
    if source_payload.get('project_id') != project_id:
        raise ValueError('渲染快照与旁白快照项目不匹配')
    pages = payload.get('pages')
    if not isinstance(pages, list) or not pages:
        raise ValueError('视频渲染快照 pages 无效')
    page_fields = {
        'page_id', 'audio_track', 'audio_timeline', 'motion_manifest',
        'scene_manifest', 'native_scene_bundle', 'visual_renderer',
        'fallback_from', 'fallback_reason',
    }
    seen_page_ids = set()
    for index, page in enumerate(pages):
        if not isinstance(page, dict) or set(page) != page_fields:
            raise ValueError(f'视频渲染快照 pages[{index}] 字段无效')
        page_id = page.get('page_id')
        if not isinstance(page_id, str) or not page_id or page_id in seen_page_ids:
            raise ValueError(f'视频渲染快照 pages[{index}].page_id 无效')
        seen_page_ids.add(page_id)
        _render_artifact_ref(page.get('audio_track'), page_id, '旁白音轨')
        if _render_artifact_ref(page.get('audio_timeline'), page_id, 'Audio Timeline') is None:
            raise ValueError('视频渲染快照缺少 Audio Timeline')
        _render_artifact_ref(
            page.get('motion_manifest'), page_id, 'Motion Manifest', scene_hash=True,
        )
        _render_artifact_ref(page.get('scene_manifest'), page_id, 'Scene Manifest')
        _render_artifact_ref(page.get('native_scene_bundle'), page_id, '原生场景包')
        if page.get('visual_renderer') not in {
            'hyperframes', 'browser_frames', 'ken_burns', 'static_frame',
        }:
            raise ValueError('视频渲染快照 visual_renderer 无效')
        if page.get('fallback_from') not in {None, 'hyperframes', 'browser_frames'}:
            raise ValueError('视频渲染快照 fallback_from 无效')
        if page.get('fallback_reason') is not None and not isinstance(page['fallback_reason'], str):
            raise ValueError('视频渲染快照 fallback_reason 无效')
    renderer = payload.get('renderer')
    if not isinstance(renderer, dict) or set(renderer) != {
        'width', 'height', 'fps', 'hyperframes_enabled',
    }:
        raise ValueError('视频渲染快照 renderer 无效')
    if any(
        isinstance(renderer.get(key), bool)
        or not isinstance(renderer.get(key), int)
        or renderer[key] <= 0
        for key in ('width', 'height', 'fps')
    ) or not isinstance(renderer.get('hyperframes_enabled'), bool):
        raise ValueError('视频渲染快照分辨率或 FPS 无效')
    if not isinstance(payload.get('created_at'), str) or not payload['created_at']:
        raise ValueError('视频渲染快照 created_at 无效')
    return payload


def create_video_render_snapshot(
    *,
    directory,
    project_id,
    narration_snapshot_path,
    narration_snapshot_hash,
    pages,
    renderer_config,
):
    if not isinstance(project_id, str) or not project_id:
        raise ValueError('渲染快照缺少项目 ID')
    source_ref = {
        'path': narration_snapshot_path,
        'sha256': str(narration_snapshot_hash or '').lower(),
    }
    if (
        not isinstance(narration_snapshot_path, str)
        or not narration_snapshot_path
        or len(source_ref['sha256']) != 64
        or any(character not in '0123456789abcdef' for character in source_ref['sha256'])
    ):
        raise ValueError('渲染快照缺少有效旁白快照引用')
    source_snapshot = load_video_export_snapshot(
        narration_snapshot_path,
        source_ref['sha256'],
    )
    if source_snapshot.get('project_id') != project_id:
        raise ValueError('渲染快照与旁白快照项目不匹配')
    if not isinstance(pages, list) or not pages:
        raise ValueError('渲染快照 pages 必须是非空数组')

    safe_pages = []
    seen_page_ids = set()
    for index, page in enumerate(pages):
        if not isinstance(page, dict):
            raise ValueError(f'渲染快照 pages[{index}] 无效')
        page_id = page.get('page_id')
        if not isinstance(page_id, str) or not page_id or page_id in seen_page_ids:
            raise ValueError(f'渲染快照 pages[{index}].page_id 无效')
        seen_page_ids.add(page_id)
        renderer = page.get('visual_renderer')
        if renderer not in {'hyperframes', 'browser_frames', 'ken_burns', 'static_frame'}:
            raise ValueError(f'渲染快照 pages[{index}].visual_renderer 无效')
        fallback_from = page.get('fallback_from')
        fallback_reason = page.get('fallback_reason')
        if fallback_from is not None and fallback_from not in {'hyperframes', 'browser_frames'}:
            raise ValueError(f'渲染快照 pages[{index}].fallback_from 无效')
        if fallback_reason is not None and not isinstance(fallback_reason, str):
            raise ValueError(f'渲染快照 pages[{index}].fallback_reason 无效')
        safe_pages.append({
            'page_id': page_id,
            'audio_track': _render_artifact_ref(
                page.get('audio_track'), page_id, '旁白音轨',
            ),
            'audio_timeline': _render_artifact_ref(
                page.get('audio_timeline'), page_id, 'Audio Timeline',
            ),
            'motion_manifest': _render_artifact_ref(
                page.get('motion_manifest'), page_id, 'Motion Manifest', scene_hash=True,
            ),
            'scene_manifest': _render_artifact_ref(
                page.get('scene_manifest'), page_id, 'Scene Manifest',
            ),
            'native_scene_bundle': _render_artifact_ref(
                page.get('native_scene_bundle'), page_id, '原生场景包',
            ),
            'visual_renderer': renderer,
            'fallback_from': fallback_from,
            'fallback_reason': fallback_reason,
        })

    if not isinstance(renderer_config, dict):
        raise ValueError('渲染快照 renderer_config 无效')
    width = renderer_config.get('width')
    height = renderer_config.get('height')
    fps = renderer_config.get('fps')
    if any(isinstance(value, bool) or not isinstance(value, int) or value <= 0 for value in (width, height, fps)):
        raise ValueError('渲染快照分辨率或 FPS 无效')
    safe_renderer = {
        'width': width,
        'height': height,
        'fps': fps,
        'hyperframes_enabled': bool(renderer_config.get('hyperframes_enabled')),
    }
    payload = {
        'schema_version': RENDER_SNAPSHOT_SCHEMA_VERSION,
        'project_id': project_id,
        'narration_snapshot': source_ref,
        'pages': safe_pages,
        'renderer': safe_renderer,
        'created_at': datetime.utcnow().isoformat(),
    }
    _validate_video_render_snapshot(payload)
    content = _snapshot_bytes(payload)
    digest = hashlib.sha256(content).hexdigest()
    target_dir = Path(directory)
    target_dir.mkdir(parents=True, exist_ok=True)
    path = target_dir / 'video_render_snapshot.json'
    temporary = path.with_suffix('.tmp')
    temporary.write_bytes(content)
    os.replace(temporary, path)
    return {'path': str(path.resolve()), 'sha256': digest, 'snapshot': payload}


def load_video_render_snapshot(path, expected_sha256):
    content = Path(path).read_bytes()
    actual = hashlib.sha256(content).hexdigest()
    if actual != expected_sha256:
        raise ValueError('视频渲染快照校验失败，请重新创建导出任务')
    try:
        payload = json.loads(content.decode('utf-8'))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError('视频渲染快照内容无效') from exc
    return _validate_video_render_snapshot(payload)
