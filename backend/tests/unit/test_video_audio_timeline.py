from pathlib import Path

import pytest

from services.video_audio_timeline import (
    build_page_audio_timeline,
    load_audio_timeline,
    save_audio_timeline,
)


def _segments():
    return [
        {'id': 'intro', 'text': '开场'},
        {'id': 'detail', 'text': '详细说明'},
    ]


def test_builds_segment_exact_timeline_from_independent_durations():
    timeline = build_page_audio_timeline(
        'page-1',
        _segments(),
        audio_duration_ms=3000,
        padding_before_ms=200,
        padding_after_ms=300,
        timing_quality='segment_exact',
        segment_durations_ms=[1000, 2000],
    )

    assert timeline == {
        'schema_version': 1,
        'page_id': 'page-1',
        'duration_ms': 3500,
        'audio_duration_ms': 3000,
        'padding': {'before_ms': 200, 'after_ms': 300},
        'timing_quality': 'segment_exact',
        'segments': [
            {'segment_id': 'intro', 'start_ms': 200, 'end_ms': 1200},
            {'segment_id': 'detail', 'start_ms': 1200, 'end_ms': 3200},
        ],
    }


def test_segment_exact_includes_inter_segment_pauses_but_keeps_speech_ends():
    segments = [
        {'id': 'intro', 'text': '开场', 'pause_after_ms': 250, '_pause_after_seconds': 0.9},
        {'id': 'detail', 'text': '详细说明', '_pause_after_seconds': 0.5},
        {'id': 'close', 'text': '收尾', 'pause_after_ms': 9000},
    ]

    timeline = build_page_audio_timeline(
        'page-1',
        segments,
        audio_duration_ms=4250,
        padding_before_ms=100,
        timing_quality='segment_exact',
        segment_durations_ms=[1000, 2000, 500],
    )

    assert timeline['duration_ms'] == 4350
    assert timeline['segments'] == [
        {'segment_id': 'intro', 'start_ms': 100, 'end_ms': 1100},
        {'segment_id': 'detail', 'start_ms': 1350, 'end_ms': 3350},
        {'segment_id': 'close', 'start_ms': 3850, 'end_ms': 4350},
    ]


def test_builds_estimated_timeline_from_text_weights_without_fake_detail():
    timeline = build_page_audio_timeline(
        'page-1',
        _segments(),
        audio_duration_ms=3000,
        padding_before_ms=100,
        timing_quality='estimated',
    )

    assert timeline['timing_quality'] == 'estimated'
    assert timeline['segments'] == [
        {'segment_id': 'intro', 'start_ms': 100, 'end_ms': 1100},
        {'segment_id': 'detail', 'start_ms': 1100, 'end_ms': 3100},
    ]
    assert all(set(segment) == {'segment_id', 'start_ms', 'end_ms'} for segment in timeline['segments'])


def test_builds_aligned_timeline_from_explicit_boundaries():
    timeline = build_page_audio_timeline(
        'page-1',
        _segments(),
        audio_duration_ms=3000,
        padding_before_ms=100,
        timing_quality='aligned',
        segment_boundaries=[
            {'segment_id': 'intro', 'start_ms': 150, 'end_ms': 900},
            {'segment_id': 'detail', 'start_ms': 1100, 'end_ms': 2800},
        ],
    )

    assert timeline['segments'] == [
        {'segment_id': 'intro', 'start_ms': 250, 'end_ms': 1000},
        {'segment_id': 'detail', 'start_ms': 1200, 'end_ms': 2900},
    ]


def test_builds_word_exact_timeline_only_from_explicit_word_timestamps():
    timeline = build_page_audio_timeline(
        'page-1',
        _segments(),
        audio_duration_ms=2200,
        padding_before_ms=100,
        timing_quality='word_exact',
        word_timestamps=[
            {'segment_id': 'intro', 'text': '开场', 'start_ms': 0, 'end_ms': 700},
            {'segment_id': 'detail', 'text': '详细', 'start_ms': 900, 'end_ms': 1500},
            {'segment_id': 'detail', 'text': '说明', 'start_ms': 1500, 'end_ms': 2200},
        ],
    )

    assert timeline['segments'] == [
        {
            'segment_id': 'intro',
            'start_ms': 100,
            'end_ms': 800,
            'words': [{'text': '开场', 'start_ms': 100, 'end_ms': 800}],
        },
        {
            'segment_id': 'detail',
            'start_ms': 1000,
            'end_ms': 2300,
            'words': [
                {'text': '详细', 'start_ms': 1000, 'end_ms': 1600},
                {'text': '说明', 'start_ms': 1600, 'end_ms': 2300},
            ],
        },
    ]


@pytest.mark.parametrize(
    ('kwargs', 'message'),
    [
        ({'segments': [{'id': 'same'}, {'id': 'same'}]}, 'segment ID'),
        ({'audio_duration_ms': -1}, 'audio_duration_ms'),
        ({'padding_before_ms': -1}, 'padding_before_ms'),
        ({'segment_durations_ms': [1000, 1000]}, '总时长'),
        ({'segment_boundaries': [
            {'segment_id': 'intro', 'start_ms': 0, 'end_ms': 1800},
            {'segment_id': 'detail', 'start_ms': 1700, 'end_ms': 3000},
        ]}, '单调'),
        ({'segment_boundaries': [
            {'segment_id': 'detail', 'start_ms': 0, 'end_ms': 1000},
            {'segment_id': 'intro', 'start_ms': 1000, 'end_ms': 3000},
        ]}, '顺序'),
    ],
)
def test_rejects_invalid_ids_times_and_totals(kwargs, message):
    arguments = {
        'page_id': 'page-1',
        'segments': _segments(),
        'audio_duration_ms': 3000,
        'padding_before_ms': 0,
        'padding_after_ms': 0,
        'timing_quality': 'aligned' if 'segment_boundaries' in kwargs else 'segment_exact',
        'segment_durations_ms': [1000, 2000],
    }
    if 'segment_boundaries' in kwargs:
        arguments.pop('segment_durations_ms')
    arguments.update(kwargs)

    with pytest.raises(ValueError, match=message):
        build_page_audio_timeline(**arguments)


def test_rejects_precision_inputs_that_do_not_match_timing_quality():
    with pytest.raises(ValueError, match='estimated'):
        build_page_audio_timeline(
            'page-1',
            _segments(),
            audio_duration_ms=3000,
            timing_quality='estimated',
            segment_boundaries=[
                {'segment_id': 'intro', 'start_ms': 0, 'end_ms': 1000},
                {'segment_id': 'detail', 'start_ms': 1000, 'end_ms': 3000},
            ],
        )

    with pytest.raises(ValueError, match='word_exact'):
        build_page_audio_timeline(
            'page-1',
            _segments(),
            audio_duration_ms=3000,
            timing_quality='word_exact',
        )


def test_segment_exact_rejects_invalid_inter_segment_pause():
    segments = _segments()
    segments[0]['pause_after_ms'] = -1

    with pytest.raises(ValueError, match='pause_after_ms'):
        build_page_audio_timeline(
            'page-1',
            segments,
            audio_duration_ms=3000,
            timing_quality='segment_exact',
            segment_durations_ms=[1000, 2000],
        )


def test_audio_timeline_round_trip_uses_canonical_hash(tmp_path):
    timeline = build_page_audio_timeline(
        'page/unsafe',
        _segments(),
        audio_duration_ms=3000,
        timing_quality='segment_exact',
        segment_durations_ms=[1000, 2000],
    )

    reference = save_audio_timeline(timeline, tmp_path, 'page/unsafe')

    assert reference['page_id'] == 'page/unsafe'
    assert '/' not in reference['path'].split('audio_timeline_', 1)[1]
    assert load_audio_timeline(reference, 'page/unsafe') == timeline


def test_audio_timeline_load_rejects_tampered_content(tmp_path):
    timeline = build_page_audio_timeline(
        'page-1',
        _segments(),
        audio_duration_ms=3000,
        timing_quality='segment_exact',
        segment_durations_ms=[1000, 2000],
    )
    reference = save_audio_timeline(timeline, tmp_path)
    Path(reference['path']).write_text('{}', encoding='utf-8')

    with pytest.raises(ValueError, match='校验失败'):
        load_audio_timeline(reference)
