"""Build the canonical video workspace document from existing content sources."""

import json
import re


def _stable_id(value, fallback):
    cleaned = re.sub(r'[^A-Za-z0-9._:-]+', '_', str(value or '')).strip('._:-')
    return (cleaned or fallback)[:128]


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
    from services.content_spine_service import get_spine_sections

    settings = settings or {}
    title = str(spine_document['topic']['value'] or 'Untitled project')[:255]
    scenes = []
    for index, section in enumerate(get_spine_sections(spine_document)):
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


def build_video_document_from_brief(brief: dict, options=None) -> dict:
    """Mechanical first-pass video candidate from a frozen brief snapshot.

    V1-shaped so the existing workspace validator and publish transaction
    accept it; AI adaptation arrives in later stages. Never reads live
    project or spine state.
    """
    options = options or {}
    title = str(brief.get('title') or brief.get('topic') or '未命名视频')[:255]
    blocks = _split_source_blocks(str(brief.get('source_text') or ''))
    if not blocks:
        blocks = [str(brief.get('topic') or title)]
    target_duration_ms = max(1000, int(options.get('target_duration_seconds') or 120) * 1000)
    per_scene_ms = max(3000, target_duration_ms // max(1, len(blocks)))
    scenes = []
    for index, block in enumerate(blocks):
        lines = [line.strip() for line in block.splitlines() if line.strip()]
        scene_title = _brief_scene_title(lines[0] if lines else '', index + 1)
        scenes.append(_scene(
            _stable_id(f'scene.brief.{index + 1}', f'scene.{index + 1}'),
            scene_title,
            block,
            visual_kind='blank',
            source_ref=None,
            source_revision=brief.get('revision'),
            segments=[],
        ))
    return {
        'schema_version': 1,
        'title': title,
        'aspect_ratio': options.get('aspect_ratio') or '16:9',
        'scenes': scenes,
    }


def build_video_document_from_ppt_snapshot(snapshot: dict, options=None) -> dict:
    """Mechanical first-pass video candidate from a frozen PPT snapshot.

    Uses only the frozen pages (never live pages table state), preserving
    page ids and source revisions for the review page.
    """
    options = options or {}
    title = str(snapshot.get('project_title') or '未命名视频')[:255]
    scenes = []
    for page in snapshot.get('pages') or []:
        scene_title = str(page.get('title') or f'Page {(page.get("order_index") or 0) + 1}')
        narration = page.get('narration') or ''
        narration_text = narration if isinstance(narration, str) else str(narration)
        segments = narration if isinstance(narration, list) else []
        scenes.append(_scene(
            _stable_id(f'scene.page.{page.get("page_id")}', f'scene.{len(scenes) + 1}'),
            scene_title,
            narration_text or scene_title,
            visual_kind='native_scene' if page.get('visual_kind') == 'native_scene' else 'page',
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
