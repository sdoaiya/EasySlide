import importlib.util
import json
import os
import sys


_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, _backend_dir)


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


_narration = _load(
    'services.narration_service_test',
    os.path.join(_backend_dir, 'services', 'narration_service.py'),
)


def test_legacy_text_normalizes_to_host_segment():
    segments = _narration.normalize_narration_segments(
        None,
        fallback_text='介绍这一页的核心结论。',
        default_voice='zh-CN-XiaoxiaoNeural',
    )

    assert segments == [{
        'speaker_id': 'host',
        'text': '介绍这一页的核心结论。',
        'voice': 'zh-CN-XiaoxiaoNeural',
        'rate': '+0%',
        'segment_index': 0,
    }]


def test_segment_normalization_keeps_export_rate_as_default():
    segments = _narration.normalize_narration_segments(
        [{'speaker_id': 'host', 'text': '使用导出语速'}],
        default_rate='+12%',
    )

    assert segments[0]['rate'] == '+12%'


def test_segment_normalization_preserves_prosody_fields_from_dialogue_script():
    segments = _narration.normalize_narration_segments([{
        'speaker_id': 'expert',
        'text': '这里最值得注意。',
        'delivery': 'emphasis',
        'pause_after_ms': 520,
        'rate_delta': '-3%',
        'pitch_delta': '-2Hz',
    }])

    assert segments[0]['delivery'] == 'emphasis'
    assert segments[0]['pause_after_ms'] == 520
    assert segments[0]['rate_delta'] == '-3%'
    assert segments[0]['pitch_delta'] == '-2Hz'


def test_speakers_are_limited_and_keep_missing_voice_for_later_defaulting():
    speakers = _narration.normalize_speakers([
        {'id': 'host', 'name': '主持人', 'voice': 'voice-a'},
        {'id': 'expert', 'name': '专家'},
        {'id': 'third', 'name': '第三人', 'voice': 'voice-c'},
        {'id': 'fourth', 'name': '第四人', 'voice': 'voice-d'},
        {'id': 'ignored', 'name': '忽略', 'voice': 'voice-e'},
    ])

    assert [item['id'] for item in speakers] == ['host', 'expert', 'third', 'fourth']
    assert speakers[1]['voice'] == ''


def test_hash_ignores_voice_changes_but_tracks_dialogue_role_changes():
    class Page:
        order_index = 0

        def get_outline_content(self):
            return {'title': '旧标题', 'points': ['重点']}

        def get_description_content(self):
            return {'text': '页面说明'}

    page = Page()
    speakers = [{'id': 'host', 'name': '主持人', 'voice': 'voice-a'}]
    first = _narration.narration_source_hash(page, {'speech_tone': 'clear'}, 'dialogue', speakers)
    speakers[0]['voice'] = 'voice-b'
    second = _narration.narration_source_hash(page, {'speech_tone': 'clear'}, 'dialogue', speakers)
    speakers[0]['name'] = '主持'
    third = _narration.narration_source_hash(page, {'speech_tone': 'clear'}, 'dialogue', speakers)

    assert first == second
    assert second != third


def test_script_schema_version_invalidates_cached_narration():
    class Page:
        order_index = 0

        def get_outline_content(self):
            return {'title': '标题'}

        def get_description_content(self):
            return {'text': '说明'}

    original_version = _narration.NARRATION_SCRIPT_SCHEMA_VERSION
    first = _narration.narration_source_hash(Page(), {}, 'dialogue', [])
    try:
        _narration.NARRATION_SCRIPT_SCHEMA_VERSION += 1
        second = _narration.narration_source_hash(Page(), {}, 'dialogue', [])
    finally:
        _narration.NARRATION_SCRIPT_SCHEMA_VERSION = original_version

    assert first != second


def test_segment_payload_is_json_serializable():
    segments = _narration.normalize_narration_segments([
        {'speaker_id': 'host', 'text': '开场'},
        {'speaker_id': 'expert', 'text': '补充说明'},
    ])

    assert json.loads(json.dumps(segments, ensure_ascii=False)) == segments


def test_dialogue_requires_two_distinct_speakers():
    assert not _narration.has_dialogue_speakers([
        {'speaker_id': 'host', 'text': '单人旁白'},
    ])
    assert _narration.has_dialogue_speakers([
        {'speaker_id': 'host', 'text': '主持人'},
        {'speaker_id': 'expert', 'text': '专家'},
    ])
