"""Build the canonical video workspace document from existing content sources."""

import json
import re

from services.voice_catalog_service import (
    DEFAULT_EXPRESSIVENESS_ID,
    resolve_historical_voice,
    resolve_voice_id,
)


def _stable_id(value, fallback):
    cleaned = re.sub(r'[^A-Za-z0-9._:-]+', '_', str(value or '')).strip('._:-')
    return (cleaned or fallback)[:128]


def _canonical_voice(raw, language='zh'):
    """候选场景声音固化：canonical ID 直通，历史默认按语言解析并标记。"""
    canonical = resolve_voice_id(raw)
    if canonical:
        return canonical
    resolved, _needs_confirmation = resolve_historical_voice(raw, language=language)
    return resolved


def _canonical_expressiveness(raw):
    value = str(raw or '').strip()
    return value if value.startswith('expression.') else DEFAULT_EXPRESSIVENESS_ID


def _scene(scene_id, title, narration_text, *, visual_kind, source_ref, source_revision=None, segments=None):
    normalized_segments = []
    for index, segment in enumerate(segments or []):
        text = str(segment.get('text') or '').strip()
        if not text:
            continue
        normalized_segments.append({
            'segment_id': _stable_id(
                segment.get('segment_id'),
                f'{scene_id}.segment.{index + 1}',
            ),
            'speaker_id': _stable_id(segment.get('speaker_id'), 'speaker.main'),
            'text': text,
        })
    speakers = {item['speaker_id'] for item in normalized_segments}
    return {
        'scene_id': scene_id,
        'title': title,
        'visual': {
            'kind': visual_kind,
            'source_ref': source_ref,
            'source_revision': source_revision,
        },
        'narration': {
            'mode': 'dialogue' if len(speakers) > 1 else 'single',
            'text': narration_text,
            'segments': normalized_segments,
        },
        'subtitles': {'enabled': True, 'text': narration_text},
        'duration_ms': 3000,
        'transition': 'cut',
        'animation': {'intensity': 'subtle', 'cues': []},
        'audio_cues': [],
    }


def build_video_document_from_spine(spine_document, settings=None):
    settings = settings or {}
    title = str(spine_document['topic']['value'] or 'Untitled project')[:255]
    scenes = []
    # 只物化结构化章节；raw-source 回退仅用于预览，未生成大纲时保持空场景
    for index, section in enumerate(spine_document.get('sections') or []):
        scene_title = str(section.get('title') or '')
        narration_text = str(section.get('summary') or scene_title)
        scenes.append(_scene(
            _stable_id(f"scene.{section.get('section_id')}", f'scene.{index + 1}'),
            scene_title,
            narration_text,
            visual_kind='blank',
            source_ref=None,
        ))
    return {
        'schema_version': 1,
        'title': title,
        'aspect_ratio': settings.get('aspect_ratio', '16:9'),
        'scenes': scenes,
    }


def build_video_document_from_ppt(project, settings=None):
    settings = settings or {}
    pages = sorted(project.pages, key=lambda page: page.order_index)
    title = str(
        getattr(project, 'project_title', None)
        or getattr(project, 'idea_prompt', None)
        or 'Untitled project'
    )[:255]
    scenes = []
    for index, page in enumerate(pages):
        outline = page.get_outline_content() or {}
        description = page.get_description_content() or {}
        scene_title = str(outline.get('title') or page.part or f'Page {index + 1}')
        narration_text = str(
            page.get_narration_text()
            or description.get('text')
            or scene_title
        )
        scenes.append(_scene(
            _stable_id(f'scene.page.{page.id}', f'scene.{index + 1}'),
            scene_title,
            narration_text,
            visual_kind='native_scene' if page.native_layout else 'page',
            source_ref=page.id,
            source_revision=_page_source_revision(page),
            segments=page.get_narration_segments(),
        ))
    return {
        'schema_version': 1,
        'title': title,
        'aspect_ratio': settings.get(
            'aspect_ratio',
            getattr(project, 'image_aspect_ratio', None) or '16:9',
        ),
        'scenes': scenes,
    }


def _page_source_revision(page):
    """Return the revision that identifies the page visual used by a scene."""
    versions = getattr(page, 'image_versions', None)
    if versions is not None:
        try:
            current = versions.filter_by(is_current=True).first()
        except AttributeError:
            current = next(
                (item for item in versions if getattr(item, 'is_current', False)),
                None,
            )
        if current is not None and getattr(current, 'version_number', None) is not None:
            return int(current.version_number)
    return int(getattr(page, 'narration_revision', 0) or 0)


def propose_video_to_spine(project, target_base_revision):
    from services.content_sync_service import create_sync_proposal

    workspace = next(
        (item for item in project.workspaces if item.kind == 'video'),
        None,
    )
    if not workspace or not workspace.current_version_id:
        raise ValueError('video workspace is not initialized')
    spine_document = json.loads(project.content_spine.document_json)
    sections = {
        section['section_id']: section
        for section in spine_document.get('sections', [])
    }
    items = []
    for scene in json.loads(workspace.document_json).get('scenes', []):
        section_id = f"video.scene:{scene['scene_id']}"
        narration = scene.get('narration') or {}
        candidate = {
            'section_id': section_id,
            'title': str(scene.get('title') or ''),
            'summary': str(narration.get('text') or ''),
            'key_points': [
                str(item.get('text'))
                for item in narration.get('segments') or []
                if str(item.get('text') or '').strip()
            ],
            'fact_refs': [],
            'source_refs': [],
        }
        before = sections.get(section_id)
        if before == candidate:
            continue
        items.append({
            'item_id': f'{section_id}.content',
            'path': f'/sections/{section_id}',
            'operation': 'replace' if before else 'add',
            'change_type': 'content',
            'before': before,
            'after': candidate,
            'source_ref': scene['scene_id'],
        })
    if not items:
        raise ValueError('No structured video changes to propose')
    return create_sync_proposal(
        project,
        source_kind='video',
        target_kind='spine',
        source_revision=workspace.revision,
        target_base_revision=target_base_revision,
        diff={'schema_version': 1, 'items': items},
        reason='Video structured content update',
    )


def upgrade_video_document_v1_to_v2(document: dict) -> dict:
    """Pure V1 → V2 adapter (reconstruction plan §9.1).

    Legacy V1 workspace documents stay stored as V1; this function is the
    read-time upgrade used by editors and generation candidates. It never
    mutates the input.
    """
    scenes = []
    for scene in document.get('scenes') or []:
        narration = scene.get('narration') or {}
        visual = scene.get('visual') or {}
        visual_kind = visual.get('kind')
        if visual_kind == 'page':
            visual_kind = 'ppt_page'
        elif visual_kind == 'material':
            visual_kind = 'image'
        if visual_kind not in {'generated', 'ppt_page', 'native_scene', 'image', 'video', 'blank'}:
            visual_kind = 'blank'
        source_ref = visual.get('source_ref')
        animation = scene.get('animation') or {}
        scenes.append({
            'scene_id': scene.get('scene_id'),
            'source': {
                'kind': 'ppt_page' if source_ref else 'manual',
                'ref': source_ref,
                'revision': visual.get('source_revision'),
                'content_hash': None,
            },
            'title': scene.get('title', ''),
            'script': {
                'mode': narration.get('mode', 'single'),
                'text': narration.get('text', ''),
                'segments': narration.get('segments') or [],
            },
            'visual': {
                'kind': visual_kind,
                'asset_ref': source_ref,
                'prompt': '',
                'fit': 'contain',
            },
            'voice': {
                'voice_profile_id': None,
                'expressiveness_id': 'expression.standard.v1',
            },
            'subtitles': {
                'enabled': bool((scene.get('subtitles') or {}).get('enabled', True)),
                'text': (scene.get('subtitles') or {}).get('text', ''),
                'style_profile_id': 'subtitle.standard.v1',
            },
            'duration_ms': int(scene.get('duration_ms') or 5000),
            'transition': {
                'type': scene.get('transition', 'cut'),
                'duration_ms': 400,
            },
            'motion': {
                'profile_id': 'motion.standard.v1',
                'intensity': animation.get('intensity', 'none'),
                'cues': animation.get('cues') or [],
            },
            'audio_cues': scene.get('audio_cues') or [],
        })
    return {
        'schema_version': 2,
        'title': document.get('title', ''),
        'aspect_ratio': document.get('aspect_ratio', '16:9'),
        'scenes': scenes,
    }


def downgrade_video_document_v2_to_v1(document: dict) -> dict:
    """Publish-time V2 candidate → V1 workspace document (V1 storage contract).

    The formal workspace stores V1-shaped documents; editors upgrade them at
    read time. Extra candidate fields (voice/script/source/motion) and the
    V1-incompatible visual kind ``ppt_page`` are stripped here.
    """
    scenes = []
    for scene in document.get('scenes') or []:
        script = scene.get('script') or {}
        narration = scene.get('narration') or script
        visual = scene.get('visual') or {}
        kind = visual.get('kind')
        if kind == 'ppt_page':
            kind = 'page'
        transition = scene.get('transition')
        if isinstance(transition, dict):
            transition = transition.get('type', 'cut')
        motion = scene.get('motion') or {}
        subtitles = scene.get('subtitles') or {}
        scenes.append({
            'scene_id': scene.get('scene_id'),
            'title': scene.get('title', ''),
            'visual': {
                'kind': kind,
                'source_ref': visual.get('source_ref'),
                'source_revision': visual.get('source_revision'),
            },
            'narration': {
                'mode': narration.get('mode', 'single'),
                'text': narration.get('text', ''),
                'segments': narration.get('segments') or [],
            },
            'subtitles': {
                'enabled': bool(subtitles.get('enabled', True)),
                'text': subtitles.get('text', ''),
            },
            'duration_ms': int(scene.get('duration_ms') or 5000),
            'transition': transition if transition in {'cut', 'fade', 'dissolve', 'slide'} else 'cut',
            'animation': {
                'intensity': motion.get('intensity', 'subtle'),
                'cues': motion.get('cues') or [],
            },
            'audio_cues': scene.get('audio_cues') or [],
        })
    return {
        'schema_version': 1,
        'title': document.get('title', ''),
        'aspect_ratio': document.get('aspect_ratio', '16:9'),
        'scenes': scenes,
    }


def _split_source_blocks(text: str) -> list[str]:
    """Split raw brief source text into ordered blocks for first-pass scenes."""
    blocks = [item.strip() for item in re.split(r'\n\s*\n+', text) if item.strip()]
    if not blocks:
        blocks = [item.strip() for item in text.splitlines() if item.strip()]
    return blocks[:24]


def _brief_scene_title(first_line: str, index: int) -> str:
    cleaned = re.sub(
        r'^(?:第\s*[0-9一二三四五六七八九十]+\s*(?:页|章节|部分)\s*[:：.\-]?\s*|(?:page|slide)\s*\d+\s*[:：.\-]?\s*)',
        '', first_line,
        flags=re.IGNORECASE,
    ).strip()
    return cleaned or f'场景 {index + 1}'


def _visual_prompt_for_block(scene_title: str, block: str, index: int) -> str:
    """确定性视觉画面计划：从场景标题与内容生成可执行 prompt。

    阶段 2 不依赖 AI 调用（候选生成保持确定、可重试），生产可被后续
    优化任务用 AI 替换为更精细的画面提示。
    """
    snippet = re.sub(r'\s+', ' ', block)[:80].strip()
    return (
        f'为演示场景「{scene_title}」设计一帧视觉画面：'
        f'内容要点——{snippet or scene_title}；'
        f'风格——现代商务演示，构图清晰，主体突出，留白得当'
    )


def build_video_document_from_brief(brief: dict, options=None) -> dict:
    """Direct brief → video candidate, V1-shaped and schema-valid (§7.2/阶段2).

    Visual kind is ``image`` (never ``blank``) with a deterministic prompt
    added at candidate-enrich time; voice/expressiveness and transition
    details are enriched into the candidate by ``enrich_video_candidate_document``.
    Only the frozen snapshot and options are read.
    """
    options = options or {}
    title = str(brief.get('title') or brief.get('topic') or '未命名视频')[:255]
    blocks = _split_source_blocks(str(brief.get('source_text') or ''))
    if not blocks:
        blocks = [str(brief.get('topic') or title)]
    target_duration_ms = max(1000, int(options.get('target_duration_seconds') or 120) * 1000)
    per_scene_ms = max(3000, target_duration_ms // max(1, len(blocks)))
    transitions = ['cut', 'fade', 'dissolve', 'slide']
    scenes = []
    for index, block in enumerate(blocks):
        lines = [line.strip() for line in block.splitlines() if line.strip()]
        scene_title = _brief_scene_title(lines[0] if lines else '', index + 1)
        scenes.append(_scene(
            _stable_id(f'scene.brief.{index + 1}', f'scene.{index + 1}'),
            scene_title,
            block,
            visual_kind='image',
            source_ref=None,
            source_revision=brief.get('revision'),
        ))
        scenes[-1]['duration_ms'] = per_scene_ms
        scenes[-1]['transition'] = transitions[index % len(transitions)]
    return {
        'schema_version': 1,
        'title': title,
        'aspect_ratio': options.get('aspect_ratio') or '16:9',
        'scenes': scenes,
    }


def enrich_video_candidate_document(document: dict, options=None) -> dict:
    """Candidate-time V2 enrichment over the V1-shaped builder output.

    Adds the frozen voice profile, script/source mirrors, transition objects
    and deterministic visual prompts — the fields stage-2 contracts require
    in the candidate while the formal workspace keeps its V1 storage shape.
    """
    options = options or {}
    voice_profile_id = options.get('voice_profile_id')
    expressiveness_id = options.get('expressiveness_id')
    scenes = []
    for scene in document.get('scenes') or []:
        narration = scene.get('narration') or {}
        visual = scene.get('visual') or {}
        transition = scene.get('transition')
        animation = scene.get('animation') or {}
        enriched = dict(scene)
        enriched['script'] = {
            'mode': narration.get('mode', 'single'),
            'text': narration.get('text', ''),
            'segments': narration.get('segments') or [],
        }
        enriched['source'] = {
            'kind': 'ppt_page' if visual.get('source_ref') else 'manual',
            'ref': visual.get('source_ref'),
            'revision': visual.get('source_revision'),
            'content_hash': None,
        }
        enriched['voice'] = {
            'voice_profile_id': _canonical_voice(voice_profile_id),
            'expressiveness_id': _canonical_expressiveness(expressiveness_id),
        }
        enriched['transition'] = (
            {'type': transition, 'duration_ms': 400}
            if isinstance(transition, str)
            else transition
        )
        enriched['motion'] = {
            'profile_id': 'motion.standard.v1',
            'intensity': animation.get('intensity', 'subtle'),
            'cues': animation.get('cues') or [],
        }
        if visual.get('kind') == 'image' and not visual.get('prompt') and not visual.get('asset_ref'):
            enriched['visual'] = dict(visual)
            enriched['visual']['prompt'] = _visual_prompt_for_block(
                str(scene.get('title') or ''), narration.get('text', ''), len(scenes),
            )
        scenes.append(enriched)
    return {
        'schema_version': 1,
        'title': document.get('title', ''),
        'aspect_ratio': document.get('aspect_ratio', '16:9'),
        'scenes': scenes,
    }


def build_video_document_from_ppt_snapshot(snapshot: dict, options=None) -> dict:
    """Frozen PPT pages → video candidate, V1-shaped and schema-valid (§7.1/阶段2).

    Consumes wizard options: ``page_ids`` (relative order), ``script_source``
    (confirmed narration preferred) and ``visual_strategy`` (reuse page).
    Voice/expressiveness are enriched into the candidate later.
    """
    options = options or {}
    title = str(snapshot.get('project_title') or '未命名视频')[:255]
    pages = list(snapshot.get('pages') or [])
    pages.sort(key=lambda item: int(item.get('order_index') or 0))
    selected_ids = options.get('page_ids')
    if selected_ids:
        wanted = [str(item) for item in selected_ids]
        by_id = {str(page.get('page_id')): page for page in pages}
        pages = [by_id[item] for item in wanted if item in by_id]
    script_source = str(options.get('script_source') or 'confirmed_narration_or_page')
    visual_strategy = str(options.get('visual_strategy') or 'reuse_ppt')
    scenes = []
    for page in pages:
        scene_title = str(page.get('title') or f'Page {(page.get("order_index") or 0) + 1}')
        narration = page.get('narration') or ''
        narration_text = narration if isinstance(narration, str) else str(narration)
        segments = narration if isinstance(narration, list) else []
        if script_source == 'confirmed_narration_or_page':
            if not narration_text.strip():
                narration_text = str(
                    (page.get('description') or {}).get('text')
                    or scene_title
                )
        elif script_source == 'page_content':
            narration_text = str((page.get('description') or {}).get('text') or scene_title)
            segments = []
        visual_kind = 'native_scene' if page.get('visual_kind') == 'native_scene' else 'page'
        if visual_strategy != 'reuse_ppt':
            visual_kind = 'image'
        scenes.append(_scene(
            _stable_id(f'scene.page.{page.get("page_id")}', f'scene.{len(scenes) + 1}'),
            scene_title,
            narration_text,
            visual_kind=visual_kind,
            source_ref=page.get('page_id'),
            source_revision=page.get('page_revision'),
            segments=segments,
        ))
    return {
        'schema_version': 1,
        'title': title,
        'aspect_ratio': options.get('aspect_ratio') or '16:9',
        'scenes': scenes,
    }
