"""Immutable export input for the independent video workspace."""

import hashlib
import json
import os
import re
import shutil
import uuid
from datetime import datetime
from pathlib import Path

from services.video_workspace_render_plan import build_video_workspace_render_items


SNAPSHOT_SCHEMA_VERSION = 1
_STABLE_ID_RE = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$')


def _encoded(payload):
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')


def save_browser_frame_handoff(
    *, project_id, page_ids, frame_counts, frames, upload_root,
):
    directory = (
        Path(upload_root) / project_id / 'workspace-assets' / 'browser-frames' / str(uuid.uuid4())
    )
    directory.mkdir(parents=True)
    entries = []
    offset = 0
    try:
        for page_index, (page_id, count) in enumerate(zip(page_ids, frame_counts)):
            paths = []
            hashes = []
            for stage_index, frame in enumerate(frames[offset:offset + count]):
                path = directory / f'{page_index:04d}-{stage_index:02d}.png'
                temporary = path.with_suffix('.tmp')
                frame.save(temporary)
                os.replace(temporary, path)
                content = path.read_bytes()
                paths.append(path.relative_to(upload_root).as_posix())
                hashes.append(hashlib.sha256(content).hexdigest())
            entries.append({'page_id': page_id, 'paths': paths, 'sha256': hashes})
            offset += count
    except Exception:
        shutil.rmtree(directory, ignore_errors=True)
        raise
    return {'schema_version': 1, 'frames': entries}


def _materialize_browser_frames(render_items, settings, upload_root, directory):
    handoff = settings.get('browser_frame_handoff')
    if not handoff:
        return
    if handoff.get('schema_version') != 1 or not isinstance(handoff.get('frames'), list):
        raise ValueError('视频工作区 Browser Frames 交接清单无效')
    items_by_page = {
        item.get('visual_source_ref'): item
        for item in render_items
        if item.get('visual_source_ref')
    }
    root = Path(upload_root).resolve()
    directory.mkdir(parents=True, exist_ok=True)
    seen = set()
    for page_index, entry in enumerate(handoff['frames']):
        page_id = entry.get('page_id')
        paths = entry.get('paths')
        hashes = entry.get('sha256')
        item = items_by_page.get(page_id)
        if (
            not item or page_id in seen or not isinstance(paths, list) or not paths
            or len(paths) != len(hashes or []) or len(paths) > 4
        ):
            raise ValueError('视频工作区 Browser Frames 与当前场景不一致')
        materialized = []
        for stage_index, (source_ref, expected_hash) in enumerate(zip(paths, hashes)):
            source = (root / source_ref).resolve()
            if os.path.commonpath([str(root), str(source)]) != str(root) or not source.is_file():
                raise ValueError('视频工作区 Browser Frames 文件不存在')
            content = source.read_bytes()
            if hashlib.sha256(content).hexdigest() != expected_hash:
                raise ValueError('视频工作区 Browser Frames 哈希校验失败')
            target = directory / f'{page_index:04d}-{stage_index:02d}.png'
            target.write_bytes(content)
            materialized.append(str(target.resolve()))
        item['stage_image_paths'] = materialized
        item['stage_image_sha256'] = hashes
        item['image_path'] = materialized[-1]
        item['fallback_reason'] = None
        seen.add(page_id)


def _stable_audio_asset_id(raw_ref):
    value = str(raw_ref or '')
    if _STABLE_ID_RE.fullmatch(value):
        return value
    return f'asset.{hashlib.sha256(value.encode("utf-8")).hexdigest()[:24]}'


def _freeze_audio_mix(render_items):
    """Freeze scene audio cues into the shared manifest protocol."""
    from services.audio_mix_service import (
        audio_mix_manifest_hash,
        build_audio_mix_manifest,
        resolve_audio_assets,
    )

    music = None
    sfx = []
    assets = {}
    for item in render_items:
        cues = item.get('audio_cues') or []
        cue_assets = item.get('audio_cue_assets') or []
        if len(cues) != len(cue_assets):
            raise ValueError('视频工作区音频素材与音频 cue 不一致')
        for cue, asset in zip(cues, cue_assets):
            raw_ref = cue.get('asset_ref')
            asset_id = _stable_audio_asset_id(raw_ref)
            path = asset.get('path')
            digest = asset.get('sha256')
            if not path or not digest:
                raise ValueError(f'视频工作区音频素材不可用: {raw_ref}')
            assets[asset_id] = {'path': path, 'sha256': digest}
            kind = cue.get('kind', 'sfx')
            if kind == 'bgm' and music is None:
                music = {
                    'asset_id': asset_id,
                    'enabled': True,
                    'loop': True,
                    'fade_in_ms': int(cue.get('fade_in_ms') or 0),
                    'fade_out_ms': int(cue.get('fade_out_ms') or 0),
                    'duck_under_narration': bool(cue.get('duck_under_narration', True)),
                    'gain_db': float(cue.get('gain_db') or 0),
                }
                continue
            cue_id = _stable_audio_asset_id(cue.get('cue_id') or f"{item['scene_id']}.cue")
            sfx.append({
                'cue_id': cue_id,
                'asset_id': asset_id,
                'page_id': _stable_audio_asset_id(item['scene_id']),
                'offset_ms': int(cue.get('offset_ms') or 0),
                'gain_db': float(cue.get('gain_db') or 0),
            })
    manifest = build_audio_mix_manifest(
        narration={'normalize': False},
        music=music or {'enabled': False},
        sfx=sfx,
    )
    resolved = resolve_audio_assets(manifest, assets)
    return {
        'manifest': manifest,
        'asset_hashes': resolved['asset_hashes'],
        'manifest_hash': audio_mix_manifest_hash(
            manifest, asset_hashes=resolved['asset_hashes'],
        ),
    }


def create_video_workspace_export_snapshot(
    *, project_id, workspace_version, upload_root, page_lookup, path_resolver, export_config=None,
):
    document = json.loads(workspace_version.document_json)
    directory = Path(upload_root) / project_id / 'exports' / 'workspace-snapshots'
    directory.mkdir(parents=True, exist_ok=True)
    snapshot_id = uuid.uuid4()
    render_items = build_video_workspace_render_items(
        document, page_lookup=page_lookup, path_resolver=path_resolver,
        native_bundle_directory=directory / f'{snapshot_id}-native-bundles',
    )
    settings = json.loads(getattr(workspace_version, 'settings_json', None) or '{}')
    _materialize_browser_frames(
        render_items, settings, upload_root, directory / f'{snapshot_id}-browser-frames',
    )
    audio_mix = _freeze_audio_mix(render_items)
    payload = {
        'schema_version': SNAPSHOT_SCHEMA_VERSION,
        'project_id': project_id,
        'workspace_version': {
            'id': workspace_version.id,
            'revision': workspace_version.revision,
            'content_hash': workspace_version.content_hash,
        },
        'render_items': render_items,
        'audio_mix': audio_mix,
        'export_config': export_config or {},
        'created_at': datetime.utcnow().isoformat(),
    }
    content = _encoded(payload)
    digest = hashlib.sha256(content).hexdigest()
    path = directory / f'{snapshot_id}.json'
    temporary = path.with_suffix('.tmp')
    temporary.write_bytes(content)
    os.replace(temporary, path)
    return {'path': str(path.resolve()), 'sha256': digest, 'snapshot': payload}


def load_video_workspace_export_snapshot(path, expected_sha256):
    content = Path(path).read_bytes()
    if hashlib.sha256(content).hexdigest() != expected_sha256:
        raise ValueError('视频工作区导出快照校验失败，请重新创建导出任务')
    payload = json.loads(content.decode('utf-8'))
    if payload.get('schema_version') != SNAPSHOT_SCHEMA_VERSION:
        raise ValueError('不支持的视频工作区导出快照版本')
    audio_mix = payload.get('audio_mix')
    if audio_mix is not None:
        from services.audio_mix_service import audio_mix_manifest_hash, resolve_audio_assets
        manifest = audio_mix.get('manifest')
        expected_hash = audio_mix.get('manifest_hash')
        entries = {
            asset_id: {
                'path': next(
                    (asset.get('path') for item in payload.get('render_items', [])
                     for asset in item.get('audio_cue_assets', [])
                     if _stable_audio_asset_id(asset.get('asset_ref')) == asset_id),
                    None,
                ),
                'sha256': digest,
            }
            for asset_id, digest in (audio_mix.get('asset_hashes') or {}).items()
        }
        resolved = resolve_audio_assets(manifest, entries)
        if audio_mix_manifest_hash(manifest, asset_hashes=resolved['asset_hashes']) != expected_hash:
            raise ValueError('视频工作区音频混音清单校验失败')
    for item in payload.get('render_items', []):
        paths = item.get('stage_image_paths') or []
        hashes = item.get('stage_image_sha256') or []
        if len(paths) != len(hashes):
            raise ValueError('视频工作区 Browser Frames 快照无效')
        for frame_path, expected_hash in zip(paths, hashes):
            content = Path(frame_path).read_bytes()
            if hashlib.sha256(content).hexdigest() != expected_hash:
                raise ValueError('视频工作区 Browser Frames 快照校验失败')
    return payload
