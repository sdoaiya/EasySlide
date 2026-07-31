import hashlib
import json
import math
import os
import re
from pathlib import Path


TIMING_QUALITIES = {'word_exact', 'segment_exact', 'aligned', 'estimated'}
_TOP_LEVEL_FIELDS = {
    'schema_version', 'page_id', 'duration_ms', 'audio_duration_ms',
    'padding', 'timing_quality', 'segments',
}
_REFERENCE_FIELDS = {'page_id', 'path', 'sha256'}
_SHA256_RE = re.compile(r'^[0-9a-f]{64}$')


def _milliseconds(value, label):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f'{label} 必须是有限数字')
    result = int(round(value))
    if result < 0:
        raise ValueError(f'{label} 不能为负数')
    return result


def _stored_milliseconds(value, label):
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f'{label} 必须是整数')
    return _milliseconds(value, label)


def _segment_ids(segments):
    if not isinstance(segments, list):
        raise ValueError('segments 必须是数组')
    ids = []
    for index, segment in enumerate(segments):
        if not isinstance(segment, dict):
            raise ValueError(f'segments[{index}] 必须是对象')
        segment_id = segment.get('id')
        if not isinstance(segment_id, str) or not segment_id.strip():
            raise ValueError(f'segments[{index}] 的 segment ID 不能为空')
        segment_id = segment_id.strip()
        if segment_id in ids:
            raise ValueError(f'segment ID 重复: {segment_id}')
        ids.append(segment_id)
    return ids


def _shift_boundaries(entries, padding_before_ms):
    return [
        {
            'segment_id': entry['segment_id'],
            'start_ms': entry['start_ms'] + padding_before_ms,
            'end_ms': entry['end_ms'] + padding_before_ms,
        }
        for entry in entries
    ]


def _pause_after_ms(segment, index, is_last):
    if is_last:
        return 0
    if segment.get('pause_after_ms') is not None:
        return _milliseconds(segment['pause_after_ms'], f'segments[{index}].pause_after_ms')
    if segment.get('_pause_after_seconds') is not None:
        seconds = segment['_pause_after_seconds']
        if isinstance(seconds, bool) or not isinstance(seconds, (int, float)) or not math.isfinite(seconds):
            raise ValueError(f'segments[{index}]._pause_after_seconds 必须是有限数字')
        return _milliseconds(seconds * 1000, f'segments[{index}]._pause_after_seconds')
    return 0


def _from_durations(segments, segment_ids, durations, audio_duration_ms):
    if not isinstance(durations, list) or len(durations) != len(segment_ids):
        raise ValueError('segment_exact 的 segment_durations_ms 数量必须与 segments 一致')
    normalized = [
        _milliseconds(duration, f'segment_durations_ms[{index}]')
        for index, duration in enumerate(durations)
    ]
    pauses = [
        _pause_after_ms(segment, index, index == len(segments) - 1)
        for index, segment in enumerate(segments)
    ]
    if sum(normalized) + sum(pauses) != audio_duration_ms:
        raise ValueError('语音时长与段间 pause 总时长必须等于 audio_duration_ms')

    cursor = 0
    entries = []
    for segment_id, duration, pause_after_ms in zip(segment_ids, normalized, pauses):
        entries.append({
            'segment_id': segment_id,
            'start_ms': cursor,
            'end_ms': cursor + duration,
        })
        cursor += duration + pause_after_ms
    return entries


def _from_estimated_weights(segments, segment_ids, audio_duration_ms):
    weights = []
    for index, segment in enumerate(segments):
        explicit_weight = segment.get('weight')
        if explicit_weight is not None:
            if (
                isinstance(explicit_weight, bool)
                or not isinstance(explicit_weight, (int, float))
                or not math.isfinite(explicit_weight)
                or explicit_weight <= 0
            ):
                raise ValueError(f'segments[{index}].weight 必须是正数')
            weights.append(float(explicit_weight))
            continue
        text = re.sub(r'\s+', '', str(segment.get('text') or ''))
        weights.append(float(max(1, len(text))))

    if not weights:
        if audio_duration_ms:
            raise ValueError('estimated 时间线有音频时必须包含 segments')
        return []

    total_weight = sum(weights)
    entries = []
    cursor = 0
    cumulative_weight = 0.0
    for index, (segment_id, weight) in enumerate(zip(segment_ids, weights)):
        cumulative_weight += weight
        end_ms = (
            audio_duration_ms
            if index == len(weights) - 1
            else int(round(audio_duration_ms * cumulative_weight / total_weight))
        )
        entries.append({'segment_id': segment_id, 'start_ms': cursor, 'end_ms': end_ms})
        cursor = end_ms
    return entries


def _from_explicit_boundaries(segment_ids, boundaries, audio_duration_ms):
    if not isinstance(boundaries, list) or len(boundaries) != len(segment_ids):
        raise ValueError('aligned 的 segment_boundaries 数量必须与 segments 一致')

    entries = []
    previous_end = 0
    for index, (expected_id, boundary) in enumerate(zip(segment_ids, boundaries)):
        if not isinstance(boundary, dict):
            raise ValueError(f'segment_boundaries[{index}] 必须是对象')
        if boundary.get('segment_id') != expected_id:
            raise ValueError(f'segment_boundaries[{index}] 的 segment ID 顺序与 segments 不一致')
        start_ms = _milliseconds(boundary.get('start_ms'), f'segment_boundaries[{index}].start_ms')
        end_ms = _milliseconds(boundary.get('end_ms'), f'segment_boundaries[{index}].end_ms')
        if end_ms < start_ms:
            raise ValueError(f'segment_boundaries[{index}] 结束时间不能早于开始时间')
        if start_ms < previous_end:
            raise ValueError('segment_boundaries 必须保持单调且不能重叠')
        if end_ms > audio_duration_ms:
            raise ValueError(f'segment_boundaries[{index}] 不能越过 audio_duration_ms')
        entries.append({'segment_id': expected_id, 'start_ms': start_ms, 'end_ms': end_ms})
        previous_end = end_ms
    return entries


def _from_word_timestamps(segment_ids, timestamps, audio_duration_ms):
    if not isinstance(timestamps, list) or (segment_ids and not timestamps):
        raise ValueError('word_exact 必须提供显式 word_timestamps')

    grouped = {segment_id: [] for segment_id in segment_ids}
    segment_indexes = {segment_id: index for index, segment_id in enumerate(segment_ids)}
    previous_end = 0
    previous_segment_index = 0
    for index, timestamp in enumerate(timestamps):
        if not isinstance(timestamp, dict):
            raise ValueError(f'word_timestamps[{index}] 必须是对象')
        segment_id = timestamp.get('segment_id')
        if segment_id not in grouped:
            raise ValueError(f'word_timestamps[{index}] 包含未知 segment ID: {segment_id}')
        segment_index = segment_indexes[segment_id]
        if segment_index < previous_segment_index:
            raise ValueError('word_timestamps 的 segment ID 顺序与 segments 不一致')
        text = timestamp.get('text')
        if not isinstance(text, str) or not text:
            raise ValueError(f'word_timestamps[{index}].text 不能为空')
        start_ms = _milliseconds(timestamp.get('start_ms'), f'word_timestamps[{index}].start_ms')
        end_ms = _milliseconds(timestamp.get('end_ms'), f'word_timestamps[{index}].end_ms')
        if end_ms < start_ms:
            raise ValueError(f'word_timestamps[{index}] 结束时间不能早于开始时间')
        if start_ms < previous_end:
            raise ValueError('word_timestamps 必须保持单调且不能重叠')
        if end_ms > audio_duration_ms:
            raise ValueError(f'word_timestamps[{index}] 不能越过 audio_duration_ms')
        grouped[segment_id].append({'text': text, 'start_ms': start_ms, 'end_ms': end_ms})
        previous_end = end_ms
        previous_segment_index = segment_index

    entries = []
    for segment_id in segment_ids:
        words = grouped[segment_id]
        if not words:
            raise ValueError(f'word_exact 的 segment 缺少显式词时间戳: {segment_id}')
        entries.append({
            'segment_id': segment_id,
            'start_ms': words[0]['start_ms'],
            'end_ms': words[-1]['end_ms'],
            'words': words,
        })
    return entries


def build_page_audio_timeline(
    page_id,
    segments,
    *,
    audio_duration_ms,
    padding_before_ms=0,
    padding_after_ms=0,
    timing_quality,
    segment_durations_ms=None,
    segment_boundaries=None,
    word_timestamps=None,
):
    if not isinstance(page_id, str) or not page_id.strip():
        raise ValueError('page_id 必须是非空文本')
    segment_ids = _segment_ids(segments)
    audio_duration_ms = _milliseconds(audio_duration_ms, 'audio_duration_ms')
    padding_before_ms = _milliseconds(padding_before_ms, 'padding_before_ms')
    padding_after_ms = _milliseconds(padding_after_ms, 'padding_after_ms')
    if timing_quality not in TIMING_QUALITIES:
        raise ValueError(f'不支持的 timing_quality: {timing_quality}')

    if timing_quality == 'segment_exact':
        if segment_boundaries is not None or word_timestamps is not None:
            raise ValueError('segment_exact 只接受 segment_durations_ms')
        entries = _from_durations(segments, segment_ids, segment_durations_ms, audio_duration_ms)
    elif timing_quality == 'estimated':
        if any(value is not None for value in (segment_durations_ms, segment_boundaries, word_timestamps)):
            raise ValueError('estimated 只能从整页音频时长和段权重构造，不能声明精确边界')
        entries = _from_estimated_weights(segments, segment_ids, audio_duration_ms)
    elif timing_quality == 'aligned':
        if segment_durations_ms is not None or word_timestamps is not None:
            raise ValueError('aligned 只接受 segment_boundaries')
        entries = _from_explicit_boundaries(segment_ids, segment_boundaries, audio_duration_ms)
    else:
        if segment_durations_ms is not None or segment_boundaries is not None:
            raise ValueError('word_exact 只接受显式 word_timestamps')
        entries = _from_word_timestamps(segment_ids, word_timestamps, audio_duration_ms)

    shifted_entries = _shift_boundaries(entries, padding_before_ms)
    if timing_quality == 'word_exact':
        for shifted, original in zip(shifted_entries, entries):
            shifted['words'] = [
                {
                    'text': word['text'],
                    'start_ms': word['start_ms'] + padding_before_ms,
                    'end_ms': word['end_ms'] + padding_before_ms,
                }
                for word in original['words']
            ]

    return {
        'schema_version': 1,
        'page_id': page_id.strip(),
        'duration_ms': padding_before_ms + audio_duration_ms + padding_after_ms,
        'audio_duration_ms': audio_duration_ms,
        'padding': {'before_ms': padding_before_ms, 'after_ms': padding_after_ms},
        'timing_quality': timing_quality,
        'segments': shifted_entries,
    }


def validate_audio_timeline(payload, expected_page_id=None):
    if not isinstance(payload, dict) or set(payload) != _TOP_LEVEL_FIELDS:
        raise ValueError('Audio Timeline 字段无效')
    if payload.get('schema_version') != 1:
        raise ValueError('Audio Timeline schema_version 必须为 1')
    page_id = payload.get('page_id')
    if not isinstance(page_id, str) or not page_id:
        raise ValueError('Audio Timeline page_id 必须是非空文本')
    if expected_page_id is not None and page_id != expected_page_id:
        raise ValueError('Audio Timeline page_id 与导出页面不匹配')

    duration_ms = _stored_milliseconds(payload.get('duration_ms'), 'duration_ms')
    audio_duration_ms = _stored_milliseconds(payload.get('audio_duration_ms'), 'audio_duration_ms')
    padding = payload.get('padding')
    if not isinstance(padding, dict) or set(padding) != {'before_ms', 'after_ms'}:
        raise ValueError('Audio Timeline padding 字段无效')
    before_ms = _stored_milliseconds(padding.get('before_ms'), 'padding.before_ms')
    after_ms = _stored_milliseconds(padding.get('after_ms'), 'padding.after_ms')
    if duration_ms != before_ms + audio_duration_ms + after_ms:
        raise ValueError('Audio Timeline duration_ms 与音频和 padding 不一致')

    timing_quality = payload.get('timing_quality')
    if timing_quality not in TIMING_QUALITIES:
        raise ValueError(f'不支持的 timing_quality: {timing_quality}')
    segments = payload.get('segments')
    if not isinstance(segments, list):
        raise ValueError('Audio Timeline segments 必须是数组')
    seen_ids = set()
    previous_end = before_ms
    audio_end = before_ms + audio_duration_ms
    for index, segment in enumerate(segments):
        expected_fields = {'segment_id', 'start_ms', 'end_ms'}
        if timing_quality == 'word_exact':
            expected_fields.add('words')
        if not isinstance(segment, dict) or set(segment) != expected_fields:
            raise ValueError(f'Audio Timeline segments[{index}] 字段无效')
        segment_id = segment.get('segment_id')
        if not isinstance(segment_id, str) or not segment_id or segment_id in seen_ids:
            raise ValueError(f'Audio Timeline segments[{index}] 的 segment_id 无效')
        seen_ids.add(segment_id)
        start_ms = _stored_milliseconds(segment.get('start_ms'), f'segments[{index}].start_ms')
        end_ms = _stored_milliseconds(segment.get('end_ms'), f'segments[{index}].end_ms')
        if start_ms < previous_end or end_ms < start_ms or end_ms > audio_end:
            raise ValueError('Audio Timeline segment 时间范围无效')
        previous_end = end_ms
        if timing_quality == 'word_exact':
            words = segment.get('words')
            if not isinstance(words, list) or not words:
                raise ValueError(f'Audio Timeline segments[{index}].words 无效')
            word_end = start_ms
            for word_index, word in enumerate(words):
                if not isinstance(word, dict) or set(word) != {'text', 'start_ms', 'end_ms'}:
                    raise ValueError('Audio Timeline word 字段无效')
                if not isinstance(word.get('text'), str) or not word['text']:
                    raise ValueError('Audio Timeline word.text 不能为空')
                word_start = _stored_milliseconds(word.get('start_ms'), f'words[{word_index}].start_ms')
                next_word_end = _stored_milliseconds(word.get('end_ms'), f'words[{word_index}].end_ms')
                if word_start < word_end or next_word_end < word_start or next_word_end > end_ms:
                    raise ValueError('Audio Timeline word 时间范围无效')
                word_end = next_word_end
    if bool(segments) != bool(audio_duration_ms):
        raise ValueError('Audio Timeline segments 与 audio_duration_ms 不一致')
    return payload


def _canonical_bytes(payload):
    return json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(',', ':'),
    ).encode('utf-8')


def save_audio_timeline(timeline, directory, expected_page_id=None):
    validated = validate_audio_timeline(timeline, expected_page_id)
    content = _canonical_bytes(validated)
    digest = hashlib.sha256(content).hexdigest()
    target_dir = Path(directory)
    target_dir.mkdir(parents=True, exist_ok=True)
    page_key = hashlib.sha256(validated['page_id'].encode('utf-8')).hexdigest()[:16]
    path = target_dir / f'audio_timeline_{page_key}.json'
    temporary = path.with_suffix('.tmp')
    temporary.write_bytes(content)
    os.replace(temporary, path)
    return {
        'page_id': validated['page_id'],
        'path': str(path.resolve()),
        'sha256': digest,
    }


def load_audio_timeline(reference, expected_page_id=None):
    if not isinstance(reference, dict) or set(reference) != _REFERENCE_FIELDS:
        raise ValueError('Audio Timeline 引用无效')
    page_id = reference.get('page_id')
    path_value = reference.get('path')
    digest = reference.get('sha256')
    if (
        not isinstance(page_id, str) or not page_id
        or not isinstance(path_value, str) or not path_value
        or not isinstance(digest, str) or not _SHA256_RE.fullmatch(digest)
    ):
        raise ValueError('Audio Timeline 引用无效')
    try:
        content = Path(path_value).read_bytes()
    except (OSError, ValueError) as exc:
        raise ValueError('Audio Timeline 引用无效') from exc
    if hashlib.sha256(content).hexdigest() != digest:
        raise ValueError('Audio Timeline 校验失败，请重新创建导出任务')
    try:
        payload = json.loads(content.decode('utf-8'))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError('Audio Timeline 内容无效') from exc
    return validate_audio_timeline(payload, expected_page_id or page_id)
