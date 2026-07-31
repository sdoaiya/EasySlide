import json
from pathlib import Path

from services.video_audio_timeline import TIMING_QUALITIES


def test_shared_audio_timeline_schema_matches_backend_contract():
    schema_path = Path(__file__).parents[3] / 'shared' / 'video' / 'audio-timeline.schema.json'
    schema = json.loads(schema_path.read_text(encoding='utf-8'))

    assert set(schema['properties']['timing_quality']['enum']) == TIMING_QUALITIES
    assert set(schema['required']) == {
        'schema_version',
        'page_id',
        'duration_ms',
        'audio_duration_ms',
        'padding',
        'timing_quality',
        'segments',
    }
