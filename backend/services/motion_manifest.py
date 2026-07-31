import hashlib
import json
import os
import re
from pathlib import Path


SHA256_RE = re.compile(r'^[0-9a-f]{64}$')
TOP_LEVEL_FIELDS = {
    'schema_version', 'page_id', 'scene_manifest_sha256', 'duration_ms',
    'timing_quality', 'transition', 'camera', 'elements', 'captions',
    'fallback', 'warnings',
}
TRANSITION_FIELDS = {'type', 'duration_ms', 'direction'}
CAMERA_FIELDS = {'preset', 'start_ms', 'end_ms'}
ELEMENT_FIELDS = {
    'element_id', 'effect', 'start_ms', 'duration_ms', 'easing', 'cue',
}
CUE_FIELDS = {'basis', 'segment_id', 'precision'}
CAPTION_FIELDS = {
    'segment_id', 'speaker_id', 'text', 'start_ms', 'end_ms', 'granularity',
}
FALLBACK_FIELDS = {'strategy', 'reason'}
TIMING_QUALITIES = {'word_exact', 'segment_exact', 'aligned', 'estimated'}
TRANSITIONS = {'cut', 'crossfade', 'push'}
PUSH_DIRECTIONS = {'left', 'right', 'up', 'down'}
CAMERA_PRESETS = {'static', 'subtle_push', 'pan_left', 'pan_right'}
EFFECT_CAPABILITIES = {
    'fade_in': 'reveal',
    'fade_up': 'reveal',
    'slide_in': 'reveal',
    'scale_in': 'scale',
    'mask_reveal': 'reveal',
    'chart_reveal': 'reveal',
    'count_up': 'count',
    'highlight': 'highlight',
    'drift': 'pan',
}
EASINGS = {
    'none', 'linear', 'power1.out', 'power2.out', 'power3.out',
    'power4.out', 'sine.inOut', 'expo.out',
}
CUE_BASES = {'page', 'segment_window', 'segment', 'word'}
CUE_PRECISIONS = {'coarse', 'exact'}
CAPTION_GRANULARITIES = {'page', 'segment', 'sentence', 'word'}
FALLBACK_STRATEGIES = {
    'browser_frames', 'region_focus', 'ken_burns', 'static_frame',
}
REFERENCE_FIELDS = {
    'page_id', 'path', 'sha256', 'scene_manifest_sha256',
}


def _require_exact_fields(payload, fields, label):
    if not isinstance(payload, dict):
        raise ValueError(f'{label} 必须是 JSON 对象')
    missing = fields - set(payload)
    if missing:
        raise ValueError(f'{label} 缺少必填字段: {sorted(missing)[0]}')
    unexpected = set(payload) - fields
    if unexpected:
        raise ValueError(f'{label} 包含未知字段: {sorted(unexpected)[0]}')


def _require_non_empty_string(value, label):
    if not isinstance(value, str) or not value:
        raise ValueError(f'{label} 必须是非空文本')


def _require_integer(value, label, *, minimum=None):
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f'{label} 必须是整数')
    if minimum is not None and value < minimum:
        raise ValueError(f'{label} 必须大于等于 {minimum}')


def _scene_elements(scene_manifest):
    if not isinstance(scene_manifest, dict):
        raise ValueError('Scene Manifest 必须是 JSON 对象')
    _require_non_empty_string(
        scene_manifest.get('page_id'),
        'Scene Manifest page_id',
    )
    elements = scene_manifest.get('elements')
    if not isinstance(elements, list):
        raise ValueError('Scene Manifest elements 必须是数组')
    result = {}
    for index, element in enumerate(elements):
        if not isinstance(element, dict):
            raise ValueError(f'Scene Manifest elements[{index}] 必须是 JSON 对象')
        element_id = element.get('id')
        _require_non_empty_string(
            element_id,
            f'Scene Manifest elements[{index}].id',
        )
        if element_id in result:
            raise ValueError(f'Scene Manifest 元素 ID 重复: {element_id}')
        capabilities = element.get('motion_capabilities')
        if not isinstance(capabilities, list) or any(
            not isinstance(item, str) or not item for item in capabilities
        ):
            raise ValueError(
                f'Scene Manifest 元素 motion_capabilities 无效: {element_id}',
            )
        if len(capabilities) != len(set(capabilities)):
            raise ValueError(
                f'Scene Manifest 元素 motion_capabilities 无效: {element_id}',
            )
        result[element_id] = set(capabilities)
    return result


def _validate_transition(transition, duration_ms):
    _require_exact_fields(
        transition,
        TRANSITION_FIELDS,
        'Motion Manifest transition',
    )
    transition_type = transition.get('type')
    if transition_type not in TRANSITIONS:
        raise ValueError(f'不支持的 transition.type: {transition_type}')
    transition_duration = transition.get('duration_ms')
    _require_integer(
        transition_duration,
        'Motion Manifest transition.duration_ms',
        minimum=0,
    )
    if transition_duration > duration_ms:
        raise ValueError('Motion Manifest transition.duration_ms 超出页面时长')
    direction = transition.get('direction')
    if transition_type == 'cut':
        if transition_duration != 0 or direction is not None:
            raise ValueError('cut transition 必须使用 0ms 且 direction 为 null')
    elif transition_type == 'crossfade':
        if transition_duration == 0 or direction is not None:
            raise ValueError('crossfade transition 必须有时长且 direction 为 null')
    elif transition_duration == 0 or direction not in PUSH_DIRECTIONS:
        raise ValueError('push transition 必须有时长和有效 direction')


def _validate_camera(camera, duration_ms):
    _require_exact_fields(camera, CAMERA_FIELDS, 'Motion Manifest camera')
    if camera.get('preset') not in CAMERA_PRESETS:
        raise ValueError(f"不支持的 camera.preset: {camera.get('preset')}")
    start_ms = camera.get('start_ms')
    end_ms = camera.get('end_ms')
    _require_integer(start_ms, 'Motion Manifest camera.start_ms', minimum=0)
    _require_integer(end_ms, 'Motion Manifest camera.end_ms', minimum=1)
    if start_ms >= end_ms or end_ms > duration_ms:
        raise ValueError('Motion Manifest camera 时间范围无效')


def _validate_cue(cue, timing_quality, label):
    _require_exact_fields(cue, CUE_FIELDS, label)
    basis = cue.get('basis')
    precision = cue.get('precision')
    if basis not in CUE_BASES:
        raise ValueError(f'{label}.basis 无效: {basis}')
    if precision not in CUE_PRECISIONS:
        raise ValueError(f'{label}.precision 无效: {precision}')
    segment_id = cue.get('segment_id')
    if basis == 'page':
        if segment_id is not None:
            raise ValueError(f'{label}.segment_id 在 page cue 中必须为 null')
    else:
        _require_non_empty_string(segment_id, f'{label}.segment_id')
    if timing_quality == 'estimated':
        if basis not in {'page', 'segment_window'}:
            raise ValueError(f'estimated timing 不允许 {basis} cue')
        if precision != 'coarse':
            raise ValueError(f'estimated timing 不允许 {precision} cue')


def _validate_elements(elements, scene_elements, duration_ms, timing_quality):
    if not isinstance(elements, list):
        raise ValueError('Motion Manifest elements 必须是数组')
    intervals = {}
    for index, element in enumerate(elements):
        label = f'Motion Manifest elements[{index}]'
        _require_exact_fields(element, ELEMENT_FIELDS, label)
        element_id = element.get('element_id')
        _require_non_empty_string(element_id, f'{label}.element_id')
        if element_id not in scene_elements:
            raise ValueError(f'Motion Manifest 引用了不存在的场景元素: {element_id}')
        effect = element.get('effect')
        required_capability = EFFECT_CAPABILITIES.get(effect)
        if required_capability is None:
            raise ValueError(f'不支持的 Motion Manifest effect: {effect}')
        if required_capability not in scene_elements[element_id]:
            raise ValueError(f'场景元素 {element_id} 不支持效果 {effect}')
        start_ms = element.get('start_ms')
        motion_duration = element.get('duration_ms')
        _require_integer(start_ms, f'{label}.start_ms', minimum=0)
        _require_integer(motion_duration, f'{label}.duration_ms', minimum=1)
        end_ms = start_ms + motion_duration
        if end_ms > duration_ms:
            raise ValueError(f'场景元素 {element_id} 动画超出页面时长')
        if element.get('easing') not in EASINGS:
            raise ValueError(f"{label}.easing 无效: {element.get('easing')}")
        _validate_cue(element.get('cue'), timing_quality, f'{label}.cue')
        intervals.setdefault(element_id, []).append((start_ms, end_ms))

    for element_id, element_intervals in intervals.items():
        element_intervals.sort()
        for previous, current in zip(element_intervals, element_intervals[1:]):
            if current[0] < previous[1]:
                raise ValueError(f'场景元素 {element_id} 动画时间冲突')


def _validate_captions(captions, duration_ms, timing_quality):
    if not isinstance(captions, list):
        raise ValueError('Motion Manifest captions 必须是数组')
    for index, caption in enumerate(captions):
        label = f'Motion Manifest captions[{index}]'
        _require_exact_fields(caption, CAPTION_FIELDS, label)
        for field in ('segment_id', 'speaker_id', 'text'):
            _require_non_empty_string(caption.get(field), f'{label}.{field}')
        start_ms = caption.get('start_ms')
        end_ms = caption.get('end_ms')
        _require_integer(start_ms, f'{label}.start_ms', minimum=0)
        _require_integer(end_ms, f'{label}.end_ms', minimum=1)
        if start_ms >= end_ms or end_ms > duration_ms:
            raise ValueError(f'Motion Manifest 字幕时间范围无效: {index}')
        granularity = caption.get('granularity')
        if granularity not in CAPTION_GRANULARITIES:
            raise ValueError(f'{label}.granularity 无效: {granularity}')
        if (
            timing_quality == 'estimated'
            and granularity in {'sentence', 'word'}
        ):
            raise ValueError(
                f'estimated timing 不允许 {granularity} 字幕粒度',
            )


def _validate_fallback(fallback):
    _require_exact_fields(
        fallback,
        FALLBACK_FIELDS,
        'Motion Manifest fallback',
    )
    if fallback.get('strategy') not in FALLBACK_STRATEGIES:
        raise ValueError(
            f"不支持的 fallback.strategy: {fallback.get('strategy')}",
        )
    reason = fallback.get('reason')
    if reason is not None and not isinstance(reason, str):
        raise ValueError('Motion Manifest fallback.reason 必须是文本或 null')


def _validate_warnings(warnings):
    if not isinstance(warnings, list) or any(
        not isinstance(item, str) or not item for item in warnings
    ):
        raise ValueError('Motion Manifest warnings 必须是不重复的非空文本数组')
    if len(warnings) != len(set(warnings)):
        raise ValueError('Motion Manifest warnings 必须是不重复的非空文本数组')


def _validate_audio_timeline_binding(payload, audio_timeline):
    if audio_timeline is None:
        return
    if not isinstance(audio_timeline, dict):
        raise ValueError('Audio Timeline 必须是 JSON 对象')
    if audio_timeline.get('page_id') != payload['page_id']:
        raise ValueError('Audio Timeline 页面不匹配')
    timeline_duration_ms = audio_timeline.get('duration_ms')
    _require_integer(
        timeline_duration_ms,
        'Audio Timeline duration_ms',
        minimum=1,
    )
    if timeline_duration_ms != payload['duration_ms']:
        raise ValueError('Audio Timeline 页面时长不匹配')
    if audio_timeline.get('timing_quality') != payload['timing_quality']:
        raise ValueError('Audio Timeline timing_quality 不匹配')

    segments = audio_timeline.get('segments')
    if not isinstance(segments, list):
        raise ValueError('Audio Timeline segments 必须是数组')
    segment_ids = set()
    for index, segment in enumerate(segments):
        if not isinstance(segment, dict):
            raise ValueError(f'Audio Timeline segments[{index}] 必须是 JSON 对象')
        segment_id = segment.get('segment_id')
        _require_non_empty_string(
            segment_id,
            f'Audio Timeline segments[{index}].segment_id',
        )
        if segment_id in segment_ids:
            raise ValueError(f'Audio Timeline segment_id 重复: {segment_id}')
        segment_ids.add(segment_id)

    referenced_segment_ids = {
        element['cue']['segment_id']
        for element in payload['elements']
        if element['cue']['segment_id'] is not None
    }
    referenced_segment_ids.update(
        caption['segment_id'] for caption in payload['captions']
    )
    missing = referenced_segment_ids - segment_ids
    if missing:
        raise ValueError(
            f'Audio Timeline 中不存在 segment_id: {sorted(missing)[0]}',
        )


def validate_motion_manifest(
    payload,
    scene_manifest,
    expected_page_id=None,
    expected_scene_sha256=None,
    audio_timeline=None,
):
    _require_exact_fields(payload, TOP_LEVEL_FIELDS, 'Motion Manifest')
    if payload.get('schema_version') != 1:
        raise ValueError('Motion Manifest schema_version 必须为 1')
    page_id = payload.get('page_id')
    _require_non_empty_string(page_id, 'Motion Manifest page_id')
    scene_page_id = (
        scene_manifest.get('page_id')
        if isinstance(scene_manifest, dict)
        else None
    )
    bound_page_id = expected_page_id or scene_page_id
    if bound_page_id is not None and page_id != bound_page_id:
        raise ValueError(f'Motion Manifest 页面不匹配: {page_id}')
    if scene_page_id is not None and page_id != scene_page_id:
        raise ValueError(f'Motion Manifest 与 Scene Manifest 页面不匹配: {page_id}')

    scene_sha256 = payload.get('scene_manifest_sha256')
    if (
        not isinstance(scene_sha256, str)
        or not SHA256_RE.fullmatch(scene_sha256)
    ):
        raise ValueError('Motion Manifest scene_manifest_sha256 无效')
    actual_scene_sha256 = hashlib.sha256(
        _canonical_bytes(scene_manifest),
    ).hexdigest()
    if scene_sha256 != actual_scene_sha256 or (
        expected_scene_sha256 is not None
        and scene_sha256 != expected_scene_sha256
    ):
        raise ValueError('Motion Manifest 场景清单 hash 不匹配')

    duration_ms = payload.get('duration_ms')
    _require_integer(duration_ms, 'Motion Manifest duration_ms', minimum=1)
    timing_quality = payload.get('timing_quality')
    if timing_quality not in TIMING_QUALITIES:
        raise ValueError(f'不支持的 timing_quality: {timing_quality}')

    scene_elements = _scene_elements(scene_manifest)
    _validate_transition(payload.get('transition'), duration_ms)
    _validate_camera(payload.get('camera'), duration_ms)
    _validate_elements(
        payload.get('elements'),
        scene_elements,
        duration_ms,
        timing_quality,
    )
    _validate_captions(payload.get('captions'), duration_ms, timing_quality)
    _validate_fallback(payload.get('fallback'))
    _validate_warnings(payload.get('warnings'))
    _validate_audio_timeline_binding(payload, audio_timeline)
    return payload


def _canonical_bytes(payload):
    return json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(',', ':'),
    ).encode('utf-8')


def save_motion_manifest(
    manifest,
    directory,
    scene_manifest,
    expected_page_id=None,
    expected_scene_sha256=None,
    audio_timeline=None,
):
    validated = validate_motion_manifest(
        manifest,
        scene_manifest,
        expected_page_id=expected_page_id,
        expected_scene_sha256=expected_scene_sha256,
        audio_timeline=audio_timeline,
    )
    content = _canonical_bytes(validated)
    digest = hashlib.sha256(content).hexdigest()
    target_dir = Path(directory)
    target_dir.mkdir(parents=True, exist_ok=True)
    page_key = hashlib.sha256(
        validated['page_id'].encode('utf-8'),
    ).hexdigest()[:16]
    path = target_dir / f'motion_{page_key}.json'
    temporary = path.with_suffix('.tmp')
    temporary.write_bytes(content)
    os.replace(temporary, path)
    return {
        'page_id': validated['page_id'],
        'path': str(path.resolve()),
        'sha256': digest,
        'scene_manifest_sha256': validated['scene_manifest_sha256'],
    }


def load_motion_manifest(
    reference,
    scene_manifest,
    expected_page_id=None,
    audio_timeline=None,
):
    if not isinstance(reference, dict) or set(reference) != REFERENCE_FIELDS:
        raise ValueError('Motion Manifest 引用无效')
    page_id = reference.get('page_id')
    path_value = reference.get('path')
    digest = reference.get('sha256')
    scene_sha256 = reference.get('scene_manifest_sha256')
    if (
        not isinstance(page_id, str)
        or not page_id
        or not isinstance(path_value, str)
        or not path_value
        or not isinstance(digest, str)
        or not SHA256_RE.fullmatch(digest)
        or not isinstance(scene_sha256, str)
        or not SHA256_RE.fullmatch(scene_sha256)
    ):
        raise ValueError('Motion Manifest 引用无效')
    path = Path(path_value)
    try:
        content = path.read_bytes()
    except (OSError, ValueError) as exc:
        raise ValueError('Motion Manifest 引用无效') from exc
    if hashlib.sha256(content).hexdigest() != digest:
        raise ValueError('Motion Manifest 校验失败，请重新创建导出任务')
    try:
        payload = json.loads(content.decode('utf-8'))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError('Motion Manifest 内容无效') from exc
    return validate_motion_manifest(
        payload,
        scene_manifest,
        expected_page_id=expected_page_id or page_id,
        expected_scene_sha256=scene_sha256,
        audio_timeline=audio_timeline,
    )
