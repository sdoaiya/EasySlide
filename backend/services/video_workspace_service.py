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
    settings = settings or {}
    title = str(spine_document['topic']['value'] or 'Untitled project')[:255]
    scenes = []
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
