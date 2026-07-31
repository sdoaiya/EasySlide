import copy

import pytest


VIDEO_DOCUMENT = {
    'schema_version': 1,
    'title': '视频',
    'aspect_ratio': '16:9',
    'scenes': [{
        'scene_id': 'scene.1',
        'title': '开场',
        'visual': {'kind': 'video', 'source_ref': '/files/materials/clip.mp4'},
        'narration': {'mode': 'single', 'text': '旁白', 'segments': []},
        'subtitles': {'enabled': True, 'text': '旁白'},
        'duration_ms': 1000,
        'transition': 'cut',
        'animation': {'intensity': 'subtle', 'cues': []},
        'audio_cues': [{'cue_id': 'cue.1', 'kind': 'sfx', 'asset_ref': '/files/materials/music.mp3', 'offset_ms': 0, 'gain_db': 0}],
    }],
}

PODCAST_DOCUMENT = {
    'schema_version': 1,
    'title': '播客',
    'format': 'single',
    'language': 'zh-CN',
    'speakers': [{'speaker_id': 'host', 'name': '主持人', 'voice_ref': 'edge:voice'}],
    'segments': [{'segment_id': 'segment.1', 'speaker_id': 'host', 'text': '脚本', 'locked': False, 'audio_cues': [], 'source_ref': '/files/materials/script.md', 'source_kind': 'transcript'}],
    'mixing': {'bgm_asset_ref': None, 'ducking': True, 'fade_in_ms': 0, 'fade_out_ms': 0},
    'cover': {'asset_ref': None, 'title': '播客', 'subtitle': ''},
}


def _material(url, kind):
    from models import Material
    return Material(filename=url.rsplit('/', 1)[-1], relative_path=url.removeprefix('/files/'), url=url, media_kind=kind, purpose=kind)


@pytest.mark.unit
def test_workspace_material_refs_accept_matching_media_kinds(app):
    from models import db
    from services.project_workspace_service import validate_workspace_document

    with app.app_context():
        db.session.add_all([
            _material('/files/materials/clip.mp4', 'video'),
            _material('/files/materials/music.mp3', 'audio'),
            _material('/files/materials/script.md', 'transcript'),
        ])
        db.session.commit()

        validate_workspace_document('video', VIDEO_DOCUMENT)
        validate_workspace_document('podcast', PODCAST_DOCUMENT)


@pytest.mark.unit
def test_workspace_material_refs_reject_wrong_or_missing_media_kind(app):
    from models import db
    from services.project_workspace_service import validate_workspace_document

    with app.app_context():
        wrong_video = copy.deepcopy(VIDEO_DOCUMENT)
        wrong_video['scenes'][0]['visual']['source_ref'] = '/files/materials/wrong-clip.mp4'
        db.session.add(_material('/files/materials/wrong-clip.mp4', 'audio'))
        db.session.commit()

        with pytest.raises(ValueError, match='expected video'):
            validate_workspace_document('video', wrong_video)

        podcast = copy.deepcopy(PODCAST_DOCUMENT)
        podcast['segments'][0]['source_ref'] = '/files/materials/missing.md'
        with pytest.raises(ValueError, match='not found'):
            validate_workspace_document('podcast', podcast)
