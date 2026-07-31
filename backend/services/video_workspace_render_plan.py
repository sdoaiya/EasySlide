"""Adapt a video workspace document to the existing dict-based renderer input."""

import hashlib
import os


def _current_scene_manifest_ref(page):
    versions = getattr(page, 'image_versions', None)
    if versions is None:
        return None
    current = versions.filter_by(is_current=True).first() if hasattr(versions, 'filter_by') else next((item for item in versions if getattr(item, 'is_current', False)), None)
    if not current or not getattr(current, 'scene_manifest_path', None) or not getattr(current, 'scene_manifest_sha256', None):
        return None
    return {'page_id': page.id, 'path': current.scene_manifest_path, 'sha256': current.scene_manifest_sha256}


def _audio_cue_assets(cues, path_resolver):
    assets = []
    for cue in cues:
        if not isinstance(cue, dict):
            continue
        asset_ref = cue.get('asset_ref')
        path = path_resolver(asset_ref) if asset_ref else None
        digest = None
        if path and os.path.isfile(path):
            hasher = hashlib.sha256()
            with open(path, 'rb') as handle:
                for chunk in iter(lambda: handle.read(1024 * 1024), b''):
                    hasher.update(chunk)
            digest = hasher.hexdigest()
        assets.append({
            'cue_id': cue.get('cue_id'),
            'asset_ref': asset_ref,
            'path': path,
            'sha256': digest,
        })
    return assets


def build_video_workspace_render_items(document, *, page_lookup, path_resolver, native_bundle_directory=None):
    """Return renderer dictionaries without treating video scenes as Page records.

    ``page_lookup`` and ``path_resolver`` keep database and filesystem policy at
    the caller boundary.  Missing visuals remain explicit placeholders so an
    export can report its fidelity instead of silently borrowing another page.
    """
    items = []
    for index, scene in enumerate(document.get('scenes') or []):
        visual = scene.get('visual') or {}
        source_ref = visual.get('source_ref')
        page = page_lookup(source_ref) if visual.get('kind') in {'page', 'native_scene'} and source_ref else None
        image_path = None
        fallback_reason = None
        if page and getattr(page, 'generated_image_path', None):
            candidate = path_resolver(page.generated_image_path)
            if candidate:
                image_path = candidate
        scene_manifest_ref = _current_scene_manifest_ref(page) if page else None
        native_scene_bundle_ref = None
        if scene_manifest_ref and native_bundle_directory:
            try:
                from services.image_scene_service import materialize_image_scene_bundle
                native_scene_bundle_ref = materialize_image_scene_bundle(scene_manifest_ref, native_bundle_directory)
            except Exception:
                fallback_reason = 'native_scene_bundle_unavailable'
        if not image_path:
            fallback_reason = (
                'source_page_has_no_renderable_image' if page
                else 'scene_has_no_renderable_page_source'
            )
        narration = scene.get('narration') or {}
        animation = scene.get('animation') or {}
        transition = scene.get('transition') or 'cut'
        audio_cues = list(scene.get('audio_cues') or [])
        items.append({
            'scene_id': scene['scene_id'],
            'page_id': scene['scene_id'],
            'page_index': index,
            'title': scene.get('title') or f'Scene {index + 1}',
            'duration_ms': scene.get('duration_ms'),
            'image_path': image_path,
            'render_mode': 'image',
            'narration_text': narration.get('text') or '',
            'narration_segments': narration.get('segments') or [],
            'narration_mode': narration.get('mode', 'single'),
            'allow_silent': not bool(narration.get('text') or narration.get('segments')),
            'fallback_reason': fallback_reason,
            'visual_source_kind': visual.get('kind'),
            'visual_source_ref': source_ref,
            'scene_manifest_ref': scene_manifest_ref,
            'native_scene_bundle_ref': native_scene_bundle_ref,
            'transition': transition,
            'animation': animation,
            'audio_cues': audio_cues,
            'audio_cue_assets': _audio_cue_assets(audio_cues, path_resolver),
            'native_animation': {
                'transition': transition,
                'elements': {
                    str(cue.get('element_id')): cue
                    for cue in animation.get('cues', [])
                    if isinstance(cue, dict) and cue.get('element_id')
                },
            },
        })
    if not items:
        raise ValueError('视频工作区没有可导出的场景')
    return items
