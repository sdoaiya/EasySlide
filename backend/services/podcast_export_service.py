"""Frozen podcast workspace input for later audio rendering."""

import hashlib
import json
import math
import os
import subprocess
import re
import shutil
import uuid
from array import array
from datetime import datetime
from pathlib import Path

from models import Material


SNAPSHOT_SCHEMA_VERSION = 1


def _encoded(payload):
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')


def build_podcast_audio_mix_manifest(document):
    """Translate a podcast document into the shared audio mix protocol."""
    from services.audio_mix_service import build_audio_mix_manifest

    mixing = document.get('mixing') or {}
    bgm_ref = mixing.get('bgm_asset_ref')
    sfx = []
    for segment in document.get('segments') or []:
        segment_id = segment.get('segment_id') or 'segment.unknown'
        for index, cue in enumerate(segment.get('audio_cues') or [], start=1):
            asset_ref = cue.get('asset_ref')
            if not asset_ref:
                continue
            sfx.append({
                'cue_id': cue.get('cue_id') or f'{segment_id}.cue.{index}',
                'asset_id': asset_ref,
                'segment_id': segment_id,
                'offset_ms': cue.get('offset_ms', 0),
                'gain_db': cue.get('gain_db', 0),
            })
    return build_audio_mix_manifest(
        narration={'normalize': False},
        music={
            'asset_id': bgm_ref,
            'enabled': bool(bgm_ref),
            'loop': True,
            'fade_in_ms': mixing.get('fade_in_ms', 0),
            'fade_out_ms': mixing.get('fade_out_ms', 0),
            'duck_under_narration': bool(mixing.get('ducking', True)),
            'gain_db': -20,
        },
        sfx=sfx,
    )


def freeze_podcast_audio_mix(document, audio_assets, upload_root):
    """Freeze the shared manifest and asset hashes into an export snapshot."""
    from services.audio_mix_service import audio_mix_manifest_hash, resolve_audio_assets

    manifest = build_podcast_audio_mix_manifest(document)
    entries = []
    for item in audio_assets or []:
        asset_ref = item.get('asset_ref')
        relative_path = item.get('relative_path')
        if asset_ref and relative_path:
            entries.append({
                'asset_id': asset_ref,
                'path': str((Path(upload_root) / relative_path).resolve()),
            })
    try:
        resolved = resolve_audio_assets(manifest, entries)
    except FileNotFoundError as exc:
        raise ValueError(f'播客音频素材不可用: {exc}') from exc
    return {
        'manifest': manifest,
        'asset_hashes': resolved['asset_hashes'],
        'manifest_hash': audio_mix_manifest_hash(
            manifest, asset_hashes=resolved['asset_hashes'],
        ),
    }


def build_podcast_export_snapshot(workspace_version):
    document = json.loads(workspace_version.document_json)
    payload = {
        'schema_version': SNAPSHOT_SCHEMA_VERSION,
        'workspace_version': {
            'id': workspace_version.id,
            'revision': workspace_version.revision,
            'content_hash': workspace_version.content_hash,
        },
        'title': document['title'],
        'format': document['format'],
        'language': document['language'],
        'speakers': document['speakers'],
        'segments': document['segments'],
        'mixing': document['mixing'],
        'cover': document['cover'],
    }
    content = _encoded(payload)
    return {'snapshot': payload, 'sha256': hashlib.sha256(content).hexdigest()}


def create_podcast_export_snapshot(*, project_id, workspace_version, upload_root, export_config=None):
    result = build_podcast_export_snapshot(workspace_version)
    frozen_export_config = dict(export_config or {})
    payload = {
        **result['snapshot'],
        'project_id': project_id,
        'export_config': frozen_export_config,
        'audio_mix': freeze_podcast_audio_mix(
            result['snapshot'], frozen_export_config.get('audio_assets') or [], upload_root,
        ),
        'created_at': datetime.utcnow().isoformat(),
    }
    content = _encoded(payload)
    digest = hashlib.sha256(content).hexdigest()
    directory = Path(upload_root) / project_id / 'exports' / 'podcast-workspace-snapshots'
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f'{uuid.uuid4()}.json'
    temporary = path.with_suffix('.tmp')
    temporary.write_bytes(content)
    os.replace(temporary, path)
    return {'path': str(path.resolve()), 'sha256': digest, 'snapshot': payload}


def load_podcast_export_snapshot(path, expected_sha256):
    content = Path(path).read_bytes()
    if hashlib.sha256(content).hexdigest() != expected_sha256:
        raise ValueError('播客工作区导出快照校验失败，请重新创建导出任务')
    payload = json.loads(content.decode('utf-8'))
    if payload.get('schema_version') != SNAPSHOT_SCHEMA_VERSION:
        raise ValueError('不支持的播客工作区导出快照版本')
    return payload


def _preflight_podcast_materials(project_id, document, *, include_cover):
    """Reject missing, foreign, wrong-kind, or unlicensed workspace references."""
    if not document.get('segments'):
        raise ValueError('播客至少需要一个非空片段才能导出')
    expected = {}
    mixing_ref = document.get('mixing', {}).get('bgm_asset_ref')
    if mixing_ref:
        expected[mixing_ref] = 'bgm'
    for segment in document.get('segments', []):
        for cue in segment.get('audio_cues', []):
            expected[cue['asset_ref']] = cue['kind']
    if include_cover:
        cover_ref = document.get('cover', {}).get('asset_ref')
        if cover_ref:
            expected[cover_ref] = 'cover'
    if not expected:
        return []
    materials = Material.query.filter(Material.id.in_(expected)).all()
    by_id = {material.id: material for material in materials}
    for material_id, purpose in expected.items():
        material = by_id.get(material_id)
        if not material or material.project_id not in {None, project_id}:
            raise ValueError(f'音频素材不可用: {material_id}')
        if purpose == 'cover':
            valid_kind = material.media_kind == 'image'
            valid_purpose = material.purpose in {'cover', 'image'}
        else:
            valid_kind = material.media_kind == 'audio'
            valid_purpose = material.purpose in {purpose, 'audio'}
        if not valid_kind or not valid_purpose:
            raise ValueError(f'播客素材类型不匹配: {material_id}')
        if not str(material.license_status or '').strip():
            raise ValueError(f'音频素材缺少授权状态: {material_id}')
    return [
        {'asset_ref': material_id, 'relative_path': by_id[material_id].relative_path, 'purpose': purpose}
        for material_id, purpose in expected.items()
    ]


def preflight_podcast_audio_materials(project_id, document):
    """Reject missing, foreign, non-audio, or unlicensed BGM/SFX references."""
    return _preflight_podcast_materials(project_id, document, include_cover=False)


def preflight_podcast_materials(project_id, document):
    """Validate all audio and optional cover references used by an export."""
    return _preflight_podcast_materials(project_id, document, include_cover=True)


def _metadata_args(metadata=None):
    args = []
    for key, value in (metadata or {}).items():
        if value is not None and str(value).strip():
            args.extend(['-metadata', f'{key}={value}'])
    return args


def mix_podcast_audio(*, narration_path, output_path, document, audio_assets, upload_root, ffmpeg_path='ffmpeg', metadata=None, cover_path=None, audio_mix=None):
    """Mix frozen BGM/SFX references into one MP3 with FFmpeg."""
    from services.tts_video_service import get_audio_duration

    if audio_mix:
        from services.audio_mix_service import (
            audio_mix_manifest_hash,
            mix_audio_manifest,
            resolve_audio_assets,
        )

        manifest = audio_mix.get('manifest')
        expected_hash = audio_mix.get('manifest_hash')
        expected_asset_hashes = audio_mix.get('asset_hashes') or {}
        if not isinstance(manifest, dict) or not isinstance(expected_hash, str):
            raise ValueError('播客导出快照缺少有效音频混音清单')
        entries = []
        for item in audio_assets or []:
            asset_ref = item.get('asset_ref')
            relative_path = item.get('relative_path')
            if asset_ref and relative_path:
                entries.append({
                    'asset_id': asset_ref,
                    'path': str((Path(upload_root) / relative_path).resolve()),
                    'sha256': expected_asset_hashes.get(asset_ref),
                })
        resolved = resolve_audio_assets(manifest, entries)
        actual_hash = audio_mix_manifest_hash(
            manifest, asset_hashes=resolved['asset_hashes'],
        )
        if actual_hash != expected_hash:
            raise ValueError('播客音频素材在快照后发生变化，请重新创建导出任务')
        if manifest['music']['enabled'] or manifest['sfx']:
            return mix_audio_manifest(
                narration_path,
                output_path,
                manifest,
                entries,
                duration=get_audio_duration(narration_path, ffmpeg_path),
                ffmpeg_path=ffmpeg_path,
                metadata=metadata,
                cover_path=cover_path,
            )

    assets = {item['asset_ref']: str((Path(upload_root) / item['relative_path']).resolve()) for item in audio_assets}
    duration = get_audio_duration(narration_path, ffmpeg_path)
    bgm_ref = document.get('mixing', {}).get('bgm_asset_ref')
    cues = [cue for segment in document.get('segments', []) for cue in segment.get('audio_cues', [])]
    has_cover = bool(cover_path and Path(cover_path).is_file() and str(output_path).lower().endswith('.mp3'))
    if not bgm_ref and not cues and not metadata and not has_cover:
        if Path(narration_path).suffix.lower() == Path(output_path).suffix.lower():
            shutil.copy2(narration_path, output_path)
        else:
            codec = ['-c:a', 'pcm_s16le'] if str(output_path).lower().endswith('.wav') else ['-c:a', 'libmp3lame', '-b:a', '128k']
            command = [ffmpeg_path, '-y', '-i', narration_path, *codec, output_path]
            result = subprocess.run(command, capture_output=True, text=True, timeout=120)
            if result.returncode != 0:
                raise RuntimeError(f'FFmpeg podcast transcode failed: {result.stderr[-400:]}')
        return get_audio_duration(output_path, ffmpeg_path)
    inputs, filters = [ffmpeg_path, '-y', '-i', narration_path], []
    labels = ['[0:a]anull[voice]']
    mix_labels = ['[voice]']
    next_index = 1
    if bgm_ref:
        inputs.extend(['-stream_loop', '-1', '-i', assets[bgm_ref]])
        mixing = document['mixing']
        fade_in = min(mixing['fade_in_ms'] / 1000, duration)
        fade_out = min(mixing['fade_out_ms'] / 1000, duration)
        labels.append(f'[{next_index}:a]atrim=duration={duration:.3f},volume=-20dB,afade=t=in:st=0:d={fade_in:.3f},afade=t=out:st={max(0, duration-fade_out):.3f}:d={fade_out:.3f}[bgm]')
        if mixing['ducking']:
            labels.append('[bgm][voice]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=200[bed]')
            mix_labels.append('[bed]')
        else:
            mix_labels.append('[bgm]')
        next_index += 1
    for cue in cues:
        inputs.extend(['-itsoffset', f"{cue['offset_ms'] / 1000:.3f}", '-i', assets[cue['asset_ref']]])
        label = f'[sfx{next_index}]'
        labels.append(f'[{next_index}:a]volume={cue["gain_db"]}dB{label}')
        mix_labels.append(label)
        next_index += 1
    labels.append(f'{"".join(mix_labels)}amix=inputs={len(mix_labels)}:duration=first:normalize=0[mixed]')
    cover_index = None
    if has_cover:
        cover_index = next_index
        inputs.extend(['-i', str(cover_path)])
    codec = ['-c:a', 'pcm_s16le'] if str(output_path).lower().endswith('.wav') else ['-c:a', 'libmp3lame', '-b:a', '128k']
    mapping = ['-map', '[mixed]']
    if cover_index is not None:
        mapping.extend(['-map', f'{cover_index}:v:0', '-c:v', 'mjpeg', '-disposition:v:0', 'attached_pic', '-id3v2_version', '3'])
    command = inputs + ['-filter_complex', ';'.join(labels), *mapping, *_metadata_args(metadata), *codec, output_path]
    result = subprocess.run(command, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        raise RuntimeError(f'FFmpeg podcast mix failed: {result.stderr[-400:]}')
    return get_audio_duration(output_path, ffmpeg_path)


def write_podcast_export_sidecars(*, output_path, snapshot, cover_path=None):
    """Keep transcript and cover metadata beside the immutable audio export."""
    directory = Path(output_path).parent
    stem = Path(output_path).stem
    transcript = directory / f'{stem}.transcript.json'
    cover = directory / f'{stem}.cover.json'
    transcript.write_bytes(_encoded({
        'workspace_version': snapshot['workspace_version'],
        'title': snapshot['title'],
        'language': snapshot['language'],
        'segments': [{'segment_id': item['segment_id'], 'speaker_id': item['speaker_id'], 'text': item['text']} for item in snapshot['segments']],
    }))
    cover.write_bytes(_encoded({'workspace_version': snapshot['workspace_version'], 'cover': snapshot['cover']}))
    result = {'transcript': str(transcript), 'cover_manifest': str(cover)}
    if cover_path and Path(cover_path).is_file():
        suffix = Path(cover_path).suffix.lower() or '.jpg'
        image_copy = directory / f'{stem}.cover{suffix}'
        shutil.copy2(cover_path, image_copy)
        result['cover'] = str(image_copy)
    return result


def check_podcast_audio_peak(path, ffmpeg_path='ffmpeg'):
    result = subprocess.run(
        [ffmpeg_path, '-hide_banner', '-loglevel', 'info', '-i', path, '-af', 'volumedetect', '-f', 'null', '-'],
        capture_output=True,
        text=True,
        timeout=60,
    )
    diagnostics = '\n'.join(filter(None, (result.stderr or '', result.stdout or '')))
    match = re.search(r'max_volume:\s*(-?[\d.]+) dB', diagnostics)
    if result.returncode != 0:
        raise RuntimeError(f'FFmpeg podcast peak check failed: {diagnostics[-300:]}')
    if match:
        peak_db = float(match.group(1))
    else:
        pcm = subprocess.run(
            [ffmpeg_path, '-v', 'error', '-i', path, '-f', 's16le', '-ac', '1', '-'],
            capture_output=True,
            timeout=60,
        )
        if pcm.returncode != 0 or not pcm.stdout:
            raise RuntimeError(f'FFmpeg podcast peak check failed: {diagnostics[-300:]}')
        samples = array('h')
        samples.frombytes(pcm.stdout[:len(pcm.stdout) - (len(pcm.stdout) % 2)])
        maximum = max((abs(sample) for sample in samples), default=0)
        peak_db = -float('inf') if maximum == 0 else 20 * math.log10(maximum / 32768)
    if peak_db > 0:
        raise ValueError(f'播客音频削波: 峰值 {peak_db} dB')
    return peak_db
