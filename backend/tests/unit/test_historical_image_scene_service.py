from types import SimpleNamespace

from PIL import Image

from services.historical_image_scene_service import (
    classify_historical_scene,
    create_historical_image_scene_artifacts,
)
from services.image_editability.data_models import BBox


def _element(x0, y0, x1, y1, confidence=0.9):
    return SimpleNamespace(
        element_type='image',
        bbox=BBox(x0, y0, x1, y1),
        bbox_global=BBox(x0, y0, x1, y1),
        content=None,
        metadata={'confidence': confidence, 'source_width': 1920, 'source_height': 1080},
    )


def test_historical_scene_levels_are_explicit():
    elements = [_element(10, 10, 200, 100) for _ in range(3)]
    assert classify_historical_scene(has_clean_background=True, elements=elements)['level'] == 'L0'
    assert classify_historical_scene(has_clean_background=False, elements=elements)['level'] == 'L2'
    assert classify_historical_scene(has_clean_background=False, elements=[])['level'] == 'L3'
    assert classify_historical_scene(
        has_clean_background=False,
        elements=[],
        image_decodable=False,
    )['level'] == 'L4'


def test_low_quality_history_never_returns_scene_refs(tmp_path):
    original = tmp_path / 'original.png'
    Image.new('RGB', (1920, 1080), 'white').save(original)
    editable = SimpleNamespace(
        image_path=str(original),
        clean_background=None,
        elements=[_element(10, 10, 200, 100)],
    )

    result = create_historical_image_scene_artifacts(
        page_id='page-1',
        editable_image=editable,
        output_directory=tmp_path / 'output',
        runtime=None,
    )

    assert result['level'] == 'L2'
    assert result['scene_manifest_ref'] is None
    assert result['scene_bundle_ref'] is None
