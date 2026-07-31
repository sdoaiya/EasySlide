import hashlib
import json
from pathlib import Path

import pytest

from services.motion_manifest import (
    load_motion_manifest,
    save_motion_manifest,
    validate_motion_manifest,
)


def _scene_manifest():
    return {
        'schema_version': 1,
        'page_id': 'page-1',
        'elements': [
            {
                'id': 'title',
                'motion_capabilities': ['reveal', 'highlight'],
            },
            {
                'id': 'metric',
                'motion_capabilities': ['reveal', 'count'],
            },
            {
                'id': 'image',
                'motion_capabilities': ['reveal', 'scale', 'pan'],
            },
        ],
    }


def _scene_sha256():
    content = json.dumps(
        _scene_manifest(),
        ensure_ascii=False,
        sort_keys=True,
        separators=(',', ':'),
    ).encode('utf-8')
    return hashlib.sha256(content).hexdigest()


def _manifest(*, timing_quality='segment_exact'):
    return {
        'schema_version': 1,
        'page_id': 'page-1',
        'scene_manifest_sha256': _scene_sha256(),
        'duration_ms': 6000,
        'timing_quality': timing_quality,
        'transition': {
            'type': 'crossfade',
            'duration_ms': 420,
            'direction': None,
        },
        'camera': {
            'preset': 'subtle_push',
            'start_ms': 0,
            'end_ms': 6000,
        },
        'elements': [
            {
                'element_id': 'title',
                'effect': 'fade_up',
                'start_ms': 200,
                'duration_ms': 700,
                'easing': 'power3.out',
                'cue': {
                    'basis': 'segment',
                    'segment_id': 'seg-1',
                    'precision': 'exact',
                },
            },
            {
                'element_id': 'metric',
                'effect': 'count_up',
                'start_ms': 1200,
                'duration_ms': 900,
                'easing': 'power2.out',
                'cue': {
                    'basis': 'segment',
                    'segment_id': 'seg-1',
                    'precision': 'exact',
                },
            },
        ],
        'captions': [
            {
                'segment_id': 'seg-1',
                'speaker_id': 'speaker-a',
                'text': '这是讲解文案。',
                'start_ms': 100,
                'end_ms': 3000,
                'granularity': 'segment',
            },
        ],
        'fallback': {
            'strategy': 'browser_frames',
            'reason': None,
        },
        'warnings': [],
    }


def _audio_timeline(*, timing_quality='segment_exact'):
    return {
        'schema_version': 1,
        'page_id': 'page-1',
        'duration_ms': 6000,
        'audio_duration_ms': 5600,
        'padding': {'before_ms': 200, 'after_ms': 200},
        'timing_quality': timing_quality,
        'segments': [
            {'segment_id': 'seg-1', 'start_ms': 200, 'end_ms': 5800},
        ],
    }


def test_motion_manifest_round_trip_uses_canonical_hash(tmp_path):
    manifest = _manifest()

    reference = save_motion_manifest(
        manifest,
        tmp_path,
        _scene_manifest(),
        expected_page_id='page-1',
        expected_scene_sha256=_scene_sha256(),
        audio_timeline=_audio_timeline(),
    )

    assert reference['page_id'] == 'page-1'
    assert reference['scene_manifest_sha256'] == _scene_sha256()
    assert Path(reference['path']).parent == tmp_path.resolve()
    page_key = hashlib.sha256(b'page-1').hexdigest()[:16]
    assert Path(reference['path']).name == f'motion_{page_key}.json'
    persisted = Path(reference['path']).read_bytes()
    expected = json.dumps(
        manifest,
        ensure_ascii=False,
        sort_keys=True,
        separators=(',', ':'),
    ).encode('utf-8')
    assert persisted == expected
    assert load_motion_manifest(
        reference,
        _scene_manifest(),
        audio_timeline=_audio_timeline(),
    ) == manifest

    Path(reference['path']).write_text('{}', encoding='utf-8')
    with pytest.raises(ValueError, match='校验失败'):
        load_motion_manifest(
            reference,
            _scene_manifest(),
            audio_timeline=_audio_timeline(),
        )


def test_motion_manifest_filename_never_uses_raw_page_id(tmp_path):
    scene_manifest = _scene_manifest()
    scene_manifest['page_id'] = '../outside'
    scene_sha256 = hashlib.sha256(
        json.dumps(
            scene_manifest,
            ensure_ascii=False,
            sort_keys=True,
            separators=(',', ':'),
        ).encode('utf-8'),
    ).hexdigest()
    manifest = _manifest()
    manifest['page_id'] = '../outside'
    manifest['scene_manifest_sha256'] = scene_sha256

    reference = save_motion_manifest(manifest, tmp_path, scene_manifest)

    page_key = hashlib.sha256(b'../outside').hexdigest()[:16]
    assert Path(reference['path']).parent == tmp_path.resolve()
    assert Path(reference['path']).name == f'motion_{page_key}.json'


@pytest.mark.parametrize(
    ('field', 'value', 'message'),
    [
        ('page_id', 'page-2', '页面不匹配'),
        ('scene_manifest_sha256', 'b' * 64, '场景清单 hash 不匹配'),
    ],
)
def test_motion_manifest_binds_page_and_scene_hash(field, value, message):
    manifest = _manifest()
    manifest[field] = value

    with pytest.raises(ValueError, match=message):
        validate_motion_manifest(
            manifest,
            _scene_manifest(),
            expected_page_id='page-1',
            expected_scene_sha256=_scene_sha256(),
        )


def test_motion_manifest_rejects_unknown_element_and_missing_capability():
    manifest = _manifest()
    manifest['elements'][0]['element_id'] = 'missing'
    with pytest.raises(ValueError, match='不存在的场景元素'):
        validate_motion_manifest(manifest, _scene_manifest())

    manifest = _manifest()
    manifest['elements'][0]['effect'] = 'count_up'
    with pytest.raises(ValueError, match='不支持效果 count_up'):
        validate_motion_manifest(manifest, _scene_manifest())


def test_motion_manifest_rejects_out_of_bounds_and_overlapping_element_time():
    manifest = _manifest()
    manifest['elements'][0]['start_ms'] = 5500
    manifest['elements'][0]['duration_ms'] = 501
    with pytest.raises(ValueError, match='超出页面时长'):
        validate_motion_manifest(manifest, _scene_manifest())

    manifest = _manifest()
    duplicate = {**manifest['elements'][0], 'start_ms': 899}
    duplicate['cue'] = {**manifest['elements'][0]['cue']}
    manifest['elements'].append(duplicate)
    with pytest.raises(ValueError, match='动画时间冲突'):
        validate_motion_manifest(manifest, _scene_manifest())

    manifest['elements'][-1]['start_ms'] = 900
    assert validate_motion_manifest(manifest, _scene_manifest()) == manifest


def test_motion_manifest_rejects_invalid_transition_camera_and_caption_time():
    manifest = _manifest()
    manifest['transition']['duration_ms'] = 6001
    with pytest.raises(ValueError, match='transition.duration_ms'):
        validate_motion_manifest(manifest, _scene_manifest())

    manifest = _manifest()
    manifest['camera']['end_ms'] = 6001
    with pytest.raises(ValueError, match='camera 时间范围'):
        validate_motion_manifest(manifest, _scene_manifest())

    manifest = _manifest()
    manifest['captions'][0]['end_ms'] = 6001
    with pytest.raises(ValueError, match='字幕时间范围'):
        validate_motion_manifest(manifest, _scene_manifest())


@pytest.mark.parametrize(
    ('mutate', 'message'),
    [
        (
            lambda manifest: manifest['elements'][0]['cue'].update(
                {'basis': 'word', 'precision': 'coarse'},
            ),
            'estimated.*word',
        ),
        (
            lambda manifest: manifest['elements'][0]['cue'].update(
                {'basis': 'segment_window', 'precision': 'exact'},
            ),
            'estimated.*exact',
        ),
        (
            lambda manifest: manifest['captions'][0].update(
                {'granularity': 'sentence'},
            ),
            'estimated.*sentence',
        ),
        (
            lambda manifest: manifest['captions'][0].update(
                {'granularity': 'word'},
            ),
            'estimated.*word',
        ),
    ],
)
def test_estimated_timing_rejects_false_precision(mutate, message):
    manifest = _manifest(timing_quality='estimated')
    manifest['elements'][0]['cue'] = {
        'basis': 'segment_window',
        'segment_id': 'seg-1',
        'precision': 'coarse',
    }
    manifest['elements'][1]['cue'] = {
        'basis': 'page',
        'segment_id': None,
        'precision': 'coarse',
    }
    mutate(manifest)

    with pytest.raises(ValueError, match=message):
        validate_motion_manifest(manifest, _scene_manifest())


def test_estimated_timing_accepts_only_coarse_page_or_segment_windows():
    manifest = _manifest(timing_quality='estimated')
    manifest['elements'][0]['cue'] = {
        'basis': 'segment_window',
        'segment_id': 'seg-1',
        'precision': 'coarse',
    }
    manifest['elements'][1]['cue'] = {
        'basis': 'page',
        'segment_id': None,
        'precision': 'coarse',
    }

    assert validate_motion_manifest(manifest, _scene_manifest()) == manifest


def test_rejects_unknown_fields_and_invalid_reference(tmp_path):
    manifest = _manifest()
    manifest['renderer_command'] = 'do-not-persist-runtime-details'
    with pytest.raises(ValueError, match='未知字段'):
        validate_motion_manifest(manifest, _scene_manifest())

    with pytest.raises(ValueError, match='引用无效'):
        load_motion_manifest(
            {'path': str(tmp_path / 'missing.json')},
            _scene_manifest(),
        )


def test_rejects_scene_payload_that_does_not_match_bound_hash():
    scene_manifest = _scene_manifest()
    scene_manifest['elements'][0]['motion_capabilities'] = ['reveal']

    with pytest.raises(ValueError, match='场景清单 hash 不匹配'):
        validate_motion_manifest(_manifest(), scene_manifest)


def test_motion_manifest_rejects_malformed_unique_arrays_with_value_error():
    manifest = _manifest()
    manifest['warnings'] = [{}]
    with pytest.raises(ValueError, match='warnings'):
        validate_motion_manifest(manifest, _scene_manifest())

    scene_manifest = _scene_manifest()
    scene_manifest['elements'][0]['motion_capabilities'] = [{}]
    manifest = _manifest()
    manifest['scene_manifest_sha256'] = hashlib.sha256(
        json.dumps(
            scene_manifest,
            ensure_ascii=False,
            sort_keys=True,
            separators=(',', ':'),
        ).encode('utf-8'),
    ).hexdigest()
    with pytest.raises(ValueError, match='motion_capabilities'):
        validate_motion_manifest(manifest, scene_manifest)


@pytest.mark.parametrize(
    ('field', 'value', 'message'),
    [
        ('page_id', 'page-2', 'Audio Timeline 页面不匹配'),
        ('duration_ms', 5999, 'Audio Timeline 页面时长不匹配'),
        ('timing_quality', 'aligned', 'Audio Timeline timing_quality 不匹配'),
    ],
)
def test_motion_manifest_binds_audio_timeline_identity(field, value, message):
    audio_timeline = _audio_timeline()
    audio_timeline[field] = value

    with pytest.raises(ValueError, match=message):
        validate_motion_manifest(
            _manifest(),
            _scene_manifest(),
            audio_timeline=audio_timeline,
        )


def test_motion_manifest_rejects_boolean_audio_timeline_duration():
    manifest = _manifest()
    manifest['duration_ms'] = 1
    manifest['transition'] = {
        'type': 'cut',
        'duration_ms': 0,
        'direction': None,
    }
    manifest['camera']['end_ms'] = 1
    manifest['elements'] = []
    manifest['captions'] = []
    audio_timeline = _audio_timeline()
    audio_timeline['duration_ms'] = True

    with pytest.raises(ValueError, match='duration_ms 必须是整数'):
        validate_motion_manifest(
            manifest,
            _scene_manifest(),
            audio_timeline=audio_timeline,
        )


@pytest.mark.parametrize('target', ['cue', 'caption'])
def test_rejects_segment_ids_missing_from_audio_timeline(target):
    manifest = _manifest()
    if target == 'cue':
        manifest['elements'][0]['cue']['segment_id'] = 'missing'
    else:
        manifest['captions'][0]['segment_id'] = 'missing'

    with pytest.raises(ValueError, match='Audio Timeline 中不存在'):
        validate_motion_manifest(
            manifest,
            _scene_manifest(),
            audio_timeline=_audio_timeline(),
        )


def test_motion_manifest_rejects_duplicate_audio_timeline_segment_ids():
    audio_timeline = _audio_timeline()
    audio_timeline['segments'].append({
        'segment_id': 'seg-1',
        'start_ms': 5800,
        'end_ms': 5900,
    })

    with pytest.raises(ValueError, match='segment_id 重复'):
        validate_motion_manifest(
            _manifest(),
            _scene_manifest(),
            audio_timeline=audio_timeline,
        )
