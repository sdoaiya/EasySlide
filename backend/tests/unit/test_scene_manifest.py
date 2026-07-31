import json

import pytest

from services.scene_manifest import load_scene_manifest, save_scene_manifests, validate_scene_manifest


def _manifest(page_id='page-1'):
    return {
        'schema_version': 1,
        'page_id': page_id,
        'render_mode': 'native',
        'width': 1920,
        'height': 1080,
        'visual_style': {'theme_id': 'core01', 'colors': [], 'font_families': []},
        'elements': [{
            'id': 'title',
            'kind': 'title',
            'role': 'headline',
            'bbox': [100, 80, 600, 100],
            'z_index': 1,
            'asset_path': None,
            'text': '标题',
            'motion_capabilities': ['reveal', 'highlight'],
        }],
        'fallback_preview_path': None,
        'quality': {'score': 1, 'warnings': []},
    }


def test_scene_manifest_round_trip_is_hash_verified(tmp_path):
    references = save_scene_manifests([_manifest()], tmp_path, ['page-1'])

    assert load_scene_manifest(references[0], 'page-1')['elements'][0]['id'] == 'title'

    path = tmp_path / 'scene_0000.json'
    payload = json.loads(path.read_text(encoding='utf-8'))
    payload['elements'][0]['text'] = '篡改'
    path.write_text(json.dumps(payload), encoding='utf-8')
    with pytest.raises(ValueError, match='校验失败'):
        load_scene_manifest(references[0], 'page-1')


def test_scene_manifest_rejects_duplicate_ids_and_out_of_bounds_boxes():
    manifest = _manifest()
    manifest['elements'].append({**manifest['elements'][0]})
    with pytest.raises(ValueError, match='ID 重复'):
        validate_scene_manifest(manifest)

    manifest = _manifest()
    manifest['elements'][0]['bbox'] = [1900, 0, 100, 50]
    with pytest.raises(ValueError, match='bbox 越界'):
        validate_scene_manifest(manifest)


def test_scene_manifest_rejects_unknown_capabilities():
    manifest = _manifest()
    manifest['elements'][0]['motion_capabilities'] = ['spin_forever']
    with pytest.raises(ValueError, match='motion_capabilities'):
        validate_scene_manifest(manifest)


def test_image_scene_manifest_uses_the_same_hash_verified_contract(tmp_path):
    manifest = _manifest()
    manifest['render_mode'] = 'image'
    manifest['fallback_preview_path'] = 'page-1-hero.png'

    reference = save_scene_manifests([manifest], tmp_path, ['page-1'])[0]
    loaded = load_scene_manifest(reference, 'page-1')

    assert loaded['render_mode'] == 'image'
    assert loaded['fallback_preview_path'] == 'page-1-hero.png'
