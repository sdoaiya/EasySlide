import json
from pathlib import Path

from services.video_export_snapshot import RENDER_SNAPSHOT_SCHEMA_VERSION


def test_shared_video_render_snapshot_schema_matches_backend_contract():
    schema_path = Path(__file__).parents[3] / 'shared' / 'video' / 'video-render-snapshot.schema.json'
    schema = json.loads(schema_path.read_text(encoding='utf-8'))

    assert schema['properties']['schema_version']['const'] == RENDER_SNAPSHOT_SCHEMA_VERSION
    assert set(schema['required']) == {
        'schema_version',
        'project_id',
        'narration_snapshot',
        'pages',
        'renderer',
        'created_at',
    }
    page_schema = schema['properties']['pages']['items']
    assert {'audio_track', 'audio_timeline', 'motion_manifest'} <= set(page_schema['required'])
