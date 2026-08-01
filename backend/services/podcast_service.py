"""Canonical podcast workspace adapters without Page ownership."""

import hashlib
import json


def build_podcast_document_from_spine(spine_document, settings=None):
    from services.content_spine_service import get_spine_sections

    settings = settings or {}
    title = str(spine_document['topic']['value'] or 'Untitled project')[:255]
    speakers = settings.get('speakers') or [
        {'speaker_id': 'speaker.main', 'name': 'Host', 'voice_ref': 'default'},
    ]
    fmt = settings.get('format', 'single')
    if fmt == 'single':
        speakers = speakers[:1]
    if fmt == 'dialogue' and len(speakers) < 2:
        raise ValueError('dialogue podcast requires at least two speakers')
    segments = []
    for index, section in enumerate(get_spine_sections(spine_document)):
        speaker = speakers[index % len(speakers)]
        segments.append({
            'segment_id': f'segment.{index + 1}',
            'speaker_id': speaker['speaker_id'],
            'text': str(section.get('summary') or section.get('title') or '').strip() or title,
            'locked': False,
            'audio_cues': [],
        })
    return {
        'schema_version': 1,
        'title': title,
        'format': fmt,
        'language': settings.get('language', 'zh-CN'),
        'speakers': speakers,
        'segments': segments,
        'mixing': {'bgm_asset_ref': None, 'ducking': True, 'fade_in_ms': 500, 'fade_out_ms': 500},
        'cover': {'asset_ref': None, 'title': title, 'subtitle': ''},
    }


def propose_podcast_to_spine(project, target_base_revision):
    from services.content_sync_service import create_sync_proposal

    workspace = next((item for item in project.workspaces if item.kind == 'podcast'), None)
    if not workspace or not workspace.current_version_id:
        raise ValueError('podcast workspace is not initialized')
    spine_document = json.loads(project.content_spine.document_json)
    sections = {item['section_id']: item for item in spine_document.get('sections', [])}
    items = []
    for segment in json.loads(workspace.document_json).get('segments', []):
        section_id = f"podcast.segment:{segment['segment_id']}"
        candidate = {
            'section_id': section_id,
            'title': segment['text'][:80],
            'summary': segment['text'],
            'key_points': [],
            'fact_refs': [],
            'source_refs': [],
        }
        before = sections.get(section_id)
        if before != candidate:
            items.append({
                'item_id': f'{section_id}.content', 'path': f'/sections/{section_id}',
                'operation': 'replace' if before else 'add', 'change_type': 'content',
                'before': before, 'after': candidate, 'source_ref': segment['segment_id'],
            })
    if not items:
        raise ValueError('No structured podcast changes to propose')
    return create_sync_proposal(
        project, source_kind='podcast', target_kind='spine',
        source_revision=workspace.revision, target_base_revision=target_base_revision,
        diff={'schema_version': 1, 'items': items}, reason='Podcast structured content update',
    )


def normalize_podcast_preview_segments(document, segment_id=None):
    """Return a validated preview slice without mutating the frozen document."""
    segments = document.get('segments') if isinstance(document, dict) else None
    if not isinstance(segments, list) or not segments:
        raise ValueError('播客至少需要一个可试听片段')
    if segment_id is not None:
        selected = [item for item in segments if item.get('segment_id') == segment_id]
        if not selected:
            raise LookupError('Podcast segment')
        segments = selected
    result = []
    for item in segments:
        text = str(item.get('text') or '').strip()
        speaker_id = str(item.get('speaker_id') or '').strip()
        if not text or not speaker_id:
            continue
        result.append({**item, 'text': text, 'speaker_id': speaker_id})
    if not result:
        raise ValueError('播客试听片段不能为空')
    return result


def podcast_preview_cache_key(*, document, provider, segment_id=None, voice=None, speed=1.0):
    payload = {
        'schema_version': document.get('schema_version', 1),
        'provider': provider,
        'segment_id': segment_id,
        'voice': voice or '',
        'speed': round(float(speed), 3),
        'revision': document.get('revision'),
        'segments': document.get('segments', []),
    }
    return hashlib.sha256(
        json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
    ).hexdigest()


def upgrade_podcast_document_v1_to_v2(document: dict) -> dict:
    """Pure V1 → V2 adapter (reconstruction plan §10.1).

    Legacy V1 podcast documents stay stored as V1; this function is the
    read-time upgrade used by editors and generation candidates. It never
    mutates the input.
    """
    speakers = []
    for speaker in document.get('speakers') or []:
        voice_ref = str(speaker.get('voice_ref') or '').strip()
        speakers.append({
            'speaker_id': speaker.get('speaker_id'),
            'name': speaker.get('name', ''),
            'voice_profile_id': voice_ref or None,
            'expressiveness_id': 'expression.standard.v1',
        })
    segments = []
    for segment in document.get('segments') or []:
        source_kind = str(segment.get('source_kind') or 'manual').strip()
        if source_kind not in {'brief', 'manual', 'transcript'}:
            source_kind = 'manual'
        segments.append({
            'segment_id': segment.get('segment_id'),
            'title': '',
            'speaker_id': segment.get('speaker_id'),
            'text': segment.get('text', ''),
            'locked': bool(segment.get('locked', False)),
            'source': {
                'kind': source_kind,
                'ref': segment.get('source_ref'),
                'content_hash': None,
            },
            'audio_cues': segment.get('audio_cues') or [],
        })
    return {
        'schema_version': 2,
        'title': document.get('title', ''),
        'format': document.get('format', 'single'),
        'language': document.get('language', 'zh-CN'),
        'speakers': speakers,
        'segments': segments,
        'mixing': document.get('mixing') or {},
        'cover': document.get('cover') or {},
    }


def build_podcast_document_from_brief(brief: dict, options=None) -> dict:
    """Mechanical first-pass podcast candidate from a frozen brief snapshot.

    V1-shaped so the existing workspace validator and publish transaction
    accept it; AI adaptation arrives in later stages. Never reads live
    project or spine state.
    """
    from services.video_workspace_service import _split_source_blocks

    options = options or {}
    title = str(brief.get('title') or brief.get('topic') or '未命名播客')[:255]
    fmt = str(options.get('format') or 'single').strip()
    if fmt not in {'single', 'dialogue'}:
        fmt = 'single'
    voice_refs = options.get('voice_profile_ids') or []
    if fmt == 'single':
        speakers = [{
            'speaker_id': 'speaker.main',
            'name': str(options.get('speaker_name') or '主持人'),
            'voice_ref': str(voice_refs[0] or '') if voice_refs else 'default',
        }]
    else:
        names = list(options.get('speaker_names') or ['主持人', '嘉宾'])
        speakers = [
            {
                'speaker_id': f'speaker.{index + 1}',
                'name': str(names[index] if index < len(names) else f'角色 {index + 1}'),
                'voice_ref': str(voice_refs[index] or '') if index < len(voice_refs) else 'default',
            }
            for index in range(min(4, max(2, len(voice_refs) or 2)))
        ]
    blocks = _split_source_blocks(str(brief.get('source_text') or ''))
    if not blocks:
        blocks = [str(brief.get('topic') or title)]
    segments = []
    for index, block in enumerate(blocks):
        speaker = speakers[index % len(speakers)]
        segments.append({
            'segment_id': f'segment.{index + 1}',
            'speaker_id': speaker['speaker_id'],
            'text': block,
            'locked': False,
            'audio_cues': [],
            # V1 schema 只允许 audio/transcript/null；brief 来源记录在 source_ref
            'source_kind': None,
            'source_ref': brief.get('content_hash'),
        })
    return {
        'schema_version': 1,
        'title': title,
        'format': fmt,
        'language': str(options.get('language') or 'zh-CN'),
        'speakers': speakers,
        'segments': segments,
        'mixing': {'bgm_asset_ref': None, 'ducking': True, 'fade_in_ms': 300, 'fade_out_ms': 500},
        'cover': {'asset_ref': None, 'title': title, 'subtitle': ''},
    }
