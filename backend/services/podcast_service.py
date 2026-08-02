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


def _build_podcast_speakers(fmt: str, options: dict) -> list[dict]:
    """按节目形式构建角色列表（canonical voice_ref，绝不 default/空）。"""
    from services.voice_catalog_service import resolve_voice_id

    voice_refs = [
        resolve_voice_id(item)
        for item in (options.get('voice_profile_ids') or [])
    ]
    voice_refs = [item for item in voice_refs if item]
    if fmt == 'single':
        return [{
            'speaker_id': 'speaker.main',
            'name': str(options.get('speaker_name') or '主持人'),
            'voice_ref': voice_refs[0] if voice_refs else _default_role_voice(0),
        }]
    names = list(options.get('speaker_names') or ['主持人', '嘉宾'])
    count = min(4, max(2, len(voice_refs) or 2))
    return [
        {
            'speaker_id': f'speaker.{index + 1}',
            'name': str(names[index] if index < len(names) else f'角色 {index + 1}'),
            'voice_ref': (
                voice_refs[index] if index < len(voice_refs)
                else _default_role_voice(index)
            ),
        }
        for index in range(count)
    ]


def build_podcast_document_from_brief(brief: dict, options=None) -> dict:
    """Direct brief → podcast candidate with program structure and roles (§7.3/阶段2).

    Speakers carry canonical ``voice_ref`` IDs (never ``default``/empty);
    every segment gets its own title derived from the block's first line.
    Only the frozen snapshot and options are read.
    """
    from services.video_workspace_service import _brief_scene_title, _split_source_blocks

    options = options or {}
    title = str(brief.get('title') or brief.get('topic') or '未命名播客')[:255]
    fmt = str(options.get('format') or 'single').strip()
    if fmt not in {'single', 'dialogue'}:
        fmt = 'single'
    speakers = _build_podcast_speakers(fmt, options)
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


def build_podcast_document_from_ppt_snapshot(snapshot: dict, options=None) -> dict:
    """Frozen PPT pages → podcast candidate（每页一个片段，角色轮转）。

    Segment 文本取已确认旁白（narration），缺省用页面描述；source 记录
    ppt 页面引用，供编辑器溯源。
    """
    options = options or {}
    title = str(snapshot.get('project_title') or '未命名播客')[:255]
    fmt = str(options.get('format') or 'dialogue').strip()
    if fmt not in {'single', 'dialogue'}:
        fmt = 'dialogue'
    speakers = _build_podcast_speakers(fmt, options)
    pages = list(snapshot.get('pages') or [])
    pages.sort(key=lambda item: int(item.get('order_index') or 0))
    segments = []
    for index, page in enumerate(pages):
        narration = str(page.get('narration') or '')
        text = narration.strip() or str(
            (page.get('description') or {}).get('text') or ''
        ).strip() or f'第 {index + 1} 页内容'
        speaker = speakers[index % len(speakers)]
        segments.append({
            'segment_id': f'segment.{index + 1}',
            'speaker_id': speaker['speaker_id'],
            'text': text,
            'locked': False,
            'audio_cues': [],
            'source_kind': 'ppt_page',
            'source_ref': str(page.get('page_id') or ''),
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


def enrich_podcast_candidate_document(document: dict) -> dict:
    """Candidate-time enrichment: independent segment titles (stage-2 contract).

    The V1-shaped builder output stays schema-valid; titles are added only
    to the stored candidate and stripped again at publish time.
    """
    segments = []
    for index, segment in enumerate(document.get('segments') or []):
        text = str(segment.get('text') or '')
        first_line = next(
            (line.strip() for line in text.splitlines() if line.strip()),
            text,
        )
        from services.video_workspace_service import _brief_scene_title
        enriched = dict(segment)
        enriched['title'] = _brief_scene_title(first_line, index + 1)
        segments.append(enriched)
    return {**document, 'segments': segments}


def chunk_podcast_segments(segments, speaker_ids, max_chars=18000, mode='single'):
    """按字符预算把播客片段分块（Fish 单请求上限）。

    - 预算留余量（默认 18000 < 20000 上限），按段累计切块；
    - dialogue 模式：切块必须已覆盖全部配置角色（Fish 原生多说话人
      要求每位已配置角色在每请求中都实际发言），未覆盖则继续累积。
    返回分块列表（每块是 segment dict 列表）。
    """
    import re as _re

    required_speakers = {str(item) for item in (speaker_ids or [])}
    chunks = []
    current = []
    current_chars = 0
    for segment in segments:
        text = str(segment.get('text') or '')
        length = len(_re.sub(r'\s+', '', text))
        if current and current_chars + length > max_chars:
            covered = {str(item.get('speaker_id') or '') for item in current}
            if mode != 'dialogue' or required_speakers <= covered:
                chunks.append(current)
                current = []
                current_chars = 0
        current.append(segment)
        current_chars += length
    if current:
        chunks.append(current)
    return chunks


def _extract_json_payload(response: str) -> dict | None:
    """从 AI 回复中提取 JSON 对象（容忍 ```json fence 与前后缀文本）。"""
    import json as _json

    text = str(response or '').strip()
    start = text.find('{')
    end = text.rfind('}')
    if start < 0 or end <= start:
        return None
    try:
        payload = _json.loads(text[start:end + 1])
        return payload if isinstance(payload, dict) else None
    except _json.JSONDecodeError:
        return None


def ai_polish_podcast_document(document: dict, brief: dict, options=None) -> dict | None:
    """AI 打磨播客逐字稿：口语化改写并保持段落结构；失败返回 None。

    调用方（候选生成）在返回 None 时降级为机械版，不阻塞生成链路。
    """
    from services.ai_service_manager import get_ai_service
    from services.prompts import get_podcast_script_prompt

    options = options or {}
    source_text = str(brief.get('source_text') or '').strip()
    segments = document.get('segments') or []
    if not source_text or not segments:
        return None
    try:
        prompt = get_podcast_script_prompt(
            title=str(document.get('title') or '未命名播客'),
            source_text=source_text[:6000],
            segment_count=len(segments),
            fmt=str(document.get('format') or 'single'),
            speaker_names=[
                str(item.get('name') or '') for item in (document.get('speakers') or [])
            ],
            language=str(options.get('language') or document.get('language') or 'zh-CN'),
        )
        response = get_ai_service().text_provider.generate_text(prompt, thinking_budget=0)
        payload = _extract_json_payload(response)
        if not payload:
            return None
        polished_texts = [
            str(item.get('text') or '').strip()
            for item in payload.get('segments') or []
            if isinstance(item, dict)
        ]
        if len(polished_texts) != len(segments) or any(not item for item in polished_texts):
            return None
        return {
            **document,
            'segments': [
                {**segment, 'text': polished_texts[index]}
                for index, segment in enumerate(segments)
            ],
        }
    except Exception:
        return None


def downgrade_podcast_document_v2_to_v1(document: dict) -> dict:
    """Publish-time adapter: strip candidate-only fields (segment title)."""
    segments = []
    for segment in document.get('segments') or []:
        cleaned = {
            'segment_id': segment.get('segment_id'),
            'speaker_id': segment.get('speaker_id'),
            'text': segment.get('text', ''),
            'locked': bool(segment.get('locked', False)),
            'audio_cues': segment.get('audio_cues') or [],
        }
        if segment.get('source_ref'):
            cleaned['source_ref'] = segment['source_ref']
        if segment.get('source_kind'):
            cleaned['source_kind'] = segment['source_kind']
        segments.append(cleaned)
    return {
        'schema_version': 1,
        'title': document.get('title', ''),
        'format': document.get('format', 'single'),
        'language': document.get('language', 'zh-CN'),
        'speakers': document.get('speakers') or [],
        'segments': segments,
        'mixing': document.get('mixing') or {},
        'cover': document.get('cover') or {},
    }


def _default_role_voice(index: int) -> str:
    """Deterministic per-role default voice (never ``default``/empty)."""
    from services.voice_catalog_service import DEFAULT_VOICE_BY_LANGUAGE

    zh_defaults = [
        'edge:zh-CN-XiaoxiaoNeural',
        'edge:zh-CN-YunxiNeural',
        'edge:zh-CN-XiaoyiNeural',
        'edge:zh-CN-YunjianNeural',
    ]
    return zh_defaults[index % len(zh_defaults)] if index < len(zh_defaults) else DEFAULT_VOICE_BY_LANGUAGE['zh']
