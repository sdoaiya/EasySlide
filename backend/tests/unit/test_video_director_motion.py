import hashlib
import json

import pytest

from services.video_director import build_motion_manifest


def _scene():
    capabilities = {
        'title': ['reveal', 'highlight'],
        'body': ['reveal', 'highlight'],
        'image': ['reveal', 'scale', 'pan'],
        'number': ['reveal', 'highlight', 'count'],
        'chart': ['reveal', 'highlight', 'scale', 'pan'],
    }
    return {
        'schema_version': 1,
        'page_id': 'page-1',
        'elements': [
            {
                'id': f'{kind}-1',
                'kind': kind,
                'motion_capabilities': values,
            }
            for kind, values in capabilities.items()
        ],
    }


def _sha(scene):
    return hashlib.sha256(json.dumps(
        scene,
        ensure_ascii=False,
        sort_keys=True,
        separators=(',', ':'),
    ).encode('utf-8')).hexdigest()


def _timeline(timing_quality='segment_exact', duration_ms=5000):
    return {
        'schema_version': 1,
        'page_id': 'page-1',
        'duration_ms': duration_ms,
        'audio_duration_ms': duration_ms,
        'padding': {'before_ms': 0, 'after_ms': 0},
        'timing_quality': timing_quality,
        'segments': [
            {'segment_id': 'seg-1', 'start_ms': 0, 'end_ms': duration_ms // 2},
            {'segment_id': 'seg-2', 'start_ms': duration_ms // 2, 'end_ms': duration_ms},
        ],
    }


def _narration():
    return [
        {
            'segment_id': 'seg-1',
            'speaker_id': 'host',
            'text': '先看标题和核心数字。',
            'focus_element_ids': ['title-1', 'number-1'],
        },
        {
            'segment_id': 'seg-2',
            'speaker_id': 'guest',
            'text': '再解释图片和图表。',
            'focus_element_ids': ['image-1', 'chart-1'],
        },
    ]


def test_build_motion_manifest_is_deterministic_and_uses_real_scene_ids():
    scene = _scene()
    direction = {
        'motion': {'effect': 'pan_right'},
        'transition': {'type': 'fade', 'duration_ms': 420},
        'element_timeline': [{'element_id': 'content-group', 'enter': 'wipe'}],
    }

    first = build_motion_manifest(scene, _sha(scene), _timeline(), _narration(), direction)
    second = build_motion_manifest(scene, _sha(scene), _timeline(), _narration(), direction)

    assert first == second
    assert [item['element_id'] for item in first['elements']] == [
        'title-1', 'body-1', 'image-1', 'number-1', 'chart-1',
    ]
    assert [item['effect'] for item in first['elements']] == [
        'fade_up', 'fade_in', 'scale_in', 'count_up', 'chart_reveal',
    ]
    assert 'content-group' not in {item['element_id'] for item in first['elements']}
    assert first['transition'] == {
        'type': 'crossfade', 'duration_ms': 420, 'direction': None,
    }
    assert first['camera']['preset'] == 'pan_right'
    assert all(
        item['start_ms'] + item['duration_ms'] <= first['duration_ms']
        for item in first['elements']
    )


def test_motion_manifest_matches_narration_keywords_when_focus_ids_are_missing():
    scene = _scene()
    scene['elements'][4]['text'] = '年度营收增长 32%'
    narration = [
        {'segment_id': 'seg-1', 'speaker_id': 'host', 'text': '先介绍项目背景。'},
        {'segment_id': 'seg-2', 'speaker_id': 'host', 'text': '年度营收增长达到 32%。'},
    ]

    manifest = build_motion_manifest(scene, _sha(scene), _timeline(), narration)

    chart = next(item for item in manifest['elements'] if item['element_id'] == 'chart-1')
    assert chart['cue']['segment_id'] == 'seg-2'


@pytest.mark.parametrize(
    'timing_quality',
    ['estimated', 'segment_exact', 'aligned', 'word_exact'],
)
def test_build_motion_manifest_uses_timing_precision_gate(timing_quality):
    scene = _scene()
    manifest = build_motion_manifest(
        scene,
        _sha(scene),
        _timeline(timing_quality),
        _narration(),
    )

    if timing_quality == 'estimated':
        assert {item['cue']['basis'] for item in manifest['elements']} == {'segment_window'}
        assert {item['cue']['precision'] for item in manifest['elements']} == {'coarse'}
    else:
        assert {item['cue']['basis'] for item in manifest['elements']} == {'segment'}
        assert {item['cue']['precision'] for item in manifest['elements']} == {'exact'}
    assert {item['granularity'] for item in manifest['captions']} == {'segment'}


def test_native_animation_overrides_transition_order_and_supported_effects():
    scene = _scene()
    animation = {
        'transition': 'push',
        'transitionSpeed': 'fast',
        'transitionDirection': 'd',
        'elementEnter': 'wipe',
        'elementDuration': 700,
        'elementDelay': 40,
        'elementStagger': 50,
        'elementEasing': 'ease-in-out',
        'elements': {
            'chart-1': {'effect': 'drift', 'order': 0},
            'title-1': {'effect': 'count_up', 'order': 1},
        },
    }

    manifest = build_motion_manifest(
        scene,
        _sha(scene),
        _timeline(),
        _narration(),
        {'motion': {'effect': 'zoom_in'}},
        animation,
    )

    assert manifest['transition'] == {
        'type': 'push', 'duration_ms': 260, 'direction': 'down',
    }
    assert manifest['camera']['preset'] == 'subtle_push'
    assert manifest['elements'][0]['element_id'] == 'chart-1'
    assert manifest['elements'][0]['effect'] == 'drift'
    title = next(item for item in manifest['elements'] if item['element_id'] == 'title-1')
    assert title['effect'] == 'fade_up'
    assert title['easing'] == 'sine.inOut'
    assert '元素动效不受支持，已降级: title-1' in manifest['warnings']


def test_short_page_compresses_all_integer_times_within_duration():
    scene = _scene()
    timeline = _timeline(duration_ms=2)

    manifest = build_motion_manifest(
        scene,
        _sha(scene),
        timeline,
        _narration(),
        native_animation={
            'transition': 'fade',
            'transitionSpeed': 'slow',
            'elementDelay': 5000,
            'elementDuration': 2000,
        },
    )

    assert manifest['transition']['duration_ms'] == 2
    assert all(isinstance(item['start_ms'], int) for item in manifest['elements'])
    assert all(
        item['start_ms'] + item['duration_ms'] <= 2
        for item in manifest['elements']
    )


def test_build_motion_manifest_rejects_scene_hash_or_missing_narration():
    scene = _scene()
    with pytest.raises(ValueError, match='hash 不匹配'):
        build_motion_manifest(scene, '0' * 64, _timeline(), _narration())

    with pytest.raises(ValueError, match='旁白文案中不存在'):
        build_motion_manifest(scene, _sha(scene), _timeline(), _narration()[:1])
