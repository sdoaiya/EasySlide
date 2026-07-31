import json
from pathlib import Path

from services.native_scene_bundle import ASSET_FIELDS, TOP_LEVEL_FIELDS


def test_shared_native_scene_bundle_schema_matches_backend_contract():
    schema_path = (
        Path(__file__).parents[3]
        / 'shared'
        / 'video'
        / 'native-scene-bundle.schema.json'
    )
    schema = json.loads(schema_path.read_text(encoding='utf-8'))

    assert set(schema['required']) == TOP_LEVEL_FIELDS
    assert set(schema['properties']) == TOP_LEVEL_FIELDS
    assert schema['additionalProperties'] is False
    assert schema['properties']['schema_version']['const'] == 1
    assert schema['properties']['width']['const'] == 1920
    assert schema['properties']['height']['const'] == 1080

    asset = schema['properties']['assets']['items']
    assert set(asset['required']) == ASSET_FIELDS
    assert set(asset['properties']) == ASSET_FIELDS
    assert asset['additionalProperties'] is False
