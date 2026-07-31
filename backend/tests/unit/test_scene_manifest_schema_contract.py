import json
from pathlib import Path

from services.scene_manifest import CAPABILITIES, KINDS, RENDER_MODES


def test_shared_scene_manifest_schema_matches_backend_contract():
    schema_path = Path(__file__).parents[3] / 'shared' / 'video' / 'scene-manifest.schema.json'
    schema = json.loads(schema_path.read_text(encoding='utf-8'))
    element_properties = schema['$defs']['element']['properties']

    assert set(element_properties['kind']['enum']) == KINDS
    assert set(schema['properties']['render_mode']['enum']) == RENDER_MODES
    assert set(element_properties['motion_capabilities']['items']['enum']) == set().union(
        *CAPABILITIES.values()
    )
    assert set(schema['required']) == {
        'schema_version',
        'page_id',
        'render_mode',
        'width',
        'height',
        'visual_style',
        'elements',
        'fallback_preview_path',
        'quality',
    }
