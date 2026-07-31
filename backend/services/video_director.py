"""Deterministic direction plans shared by image and native video exports."""

from __future__ import annotations

import re
from copy import deepcopy
from typing import Any

from services.motion_manifest import validate_motion_manifest


VIDEO_DIRECTOR_PRESETS = {
    'business': {
        'motion_intensity': 'subtle',
        'subtitle_mode': 'highlight',
        'transition': 'fade',
        'page_pause_ms': 260,
        'section_pause_ms': 620,
        'element_stagger_ms': 160,
        'element_duration_ms': 420,
    },
    'training': {
        'motion_intensity': 'standard',
        'subtitle_mode': 'highlight',
        'transition': 'fade',
        'page_pause_ms': 340,
        'section_pause_ms': 720,
        'element_stagger_ms': 220,
        'element_duration_ms': 420,
    },
    'launch': {
        'motion_intensity': 'standard',
        'subtitle_mode': 'highlight',
        'transition': 'push',
        'page_pause_ms': 220,
        'section_pause_ms': 540,
        'element_stagger_ms': 130,
        'element_duration_ms': 360,
    },
    'brief': {
        'motion_intensity': 'minimal',
        'subtitle_mode': 'standard',
        'transition': 'cut',
        'page_pause_ms': 160,
        'section_pause_ms': 420,
        'element_stagger_ms': 100,
        'element_duration_ms': 300,
    },
}

_PAGE_KIND_TERMS = {
    'summary': ('总结', '结论', '建议', '下一步', '展望', '行动', 'summary', 'conclusion', 'next step'),
    'process': ('流程', '步骤', '路径', '阶段', '路线', '实施', 'process', 'workflow', 'roadmap', 'timeline'),
    'data': ('数据', '指标', '增长', '趋势', '占比', '排名', '统计', '营收', '利润', 'data', 'metric', 'trend', 'growth', 'kpi'),
    'chapter': ('章节', '目录', 'part ', 'chapter', 'section'),
}

_EFFECT_CAPABILITY = {
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
_KIND_EFFECTS = {
    'title': ('fade_up', 'highlight'),
    'body': ('fade_in', 'highlight'),
    'image': ('scale_in', 'drift', 'fade_in'),
    'number': ('count_up', 'fade_up', 'highlight'),
    'chart': ('chart_reveal', 'scale_in', 'drift', 'highlight'),
}
_LEGACY_EFFECTS = {
    'fade': 'fade_in',
    'slide-up': 'slide_in',
    'slide-down': 'slide_in',
    'slide-left': 'slide_in',
    'slide-right': 'slide_in',
    'zoom-in': 'scale_in',
    'blur-in': 'fade_in',
    'wipe': 'mask_reveal',
    'rotate-in': 'fade_in',
}
_EASINGS = {
    'linear': 'linear',
    'ease': 'power2.out',
    'ease-out': 'power3.out',
    'ease-in-out': 'sine.inOut',
}
_TRANSITION_DIRECTIONS = {
    'l': 'left',
    'r': 'right',
    'u': 'up',
    'd': 'down',
    'left': 'left',
    'right': 'right',
    'up': 'up',
    'down': 'down',
}


def normalize_video_director_config(value: dict | None = None) -> dict:
    value = value if isinstance(value, dict) else {}
    preset = str(value.get('preset') or 'business').strip().lower()
    if preset not in VIDEO_DIRECTOR_PRESETS:
        preset = 'business'
    config = {'preset': preset, **deepcopy(VIDEO_DIRECTOR_PRESETS[preset])}

    intensity = str(value.get('motion_intensity') or config['motion_intensity']).lower()
    if intensity in {'minimal', 'subtle', 'standard'}:
        config['motion_intensity'] = intensity
    subtitle_mode = str(value.get('subtitle_mode') or config['subtitle_mode']).lower()
    if subtitle_mode in {'standard', 'highlight', 'off'}:
        config['subtitle_mode'] = subtitle_mode
    transition = str(value.get('transition') or config['transition']).lower()
    if transition in {'cut', 'fade', 'push'}:
        config['transition'] = transition
    try:
        config['page_pause_ms'] = max(0, min(int(value.get('page_pause_ms', config['page_pause_ms'])), 1200))
    except (TypeError, ValueError):
        pass
    return config


def infer_page_kind(page: dict, position: int | None = None, total: int | None = None) -> str:
    index = page.get('page_index', position if position is not None else -1)
    if index == 0 or position == 0:
        return 'cover'
    text = ' '.join(str(page.get(key) or '') for key in ('title', 'description_text', 'layout_id')).lower()
    for kind, terms in _PAGE_KIND_TERMS.items():
        if any(term in text for term in terms):
            return kind
    if total and position == total - 1:
        return 'summary'
    return 'content'


def _motion_for(kind: str, index: int, intensity: str) -> dict:
    if kind == 'cover':
        effect = 'zoom_in'
    elif kind == 'summary':
        effect = 'zoom_out'
    elif kind == 'process':
        effect = 'pan_right' if index % 2 else 'pan_left'
    elif kind == 'data':
        effect = 'zoom_in' if index % 2 else 'zoom_out'
    elif kind == 'chapter':
        effect = 'zoom_in'
    else:
        effects = ('zoom_in', 'pan_right', 'zoom_out', 'pan_left')
        effect = effects[index % len(effects)]
    return {'effect': effect, 'intensity': intensity, 'focus_rect': None}


def _element_timeline(page: dict, config: dict) -> list[dict]:
    animations = page.get('element_animations')
    if not isinstance(animations, list):
        return []
    ordered = sorted(
        (item for item in animations if isinstance(item, dict) and item.get('element_id')),
        key=lambda item: (int(item.get('order') or 0), str(item.get('element_id'))),
    )
    stagger = int(config['element_stagger_ms'])
    duration = int(config['element_duration_ms'])
    return [
        {
            'element_id': str(item['element_id']),
            'enter': str(item.get('enter') or 'fade'),
            'start_ms': order * stagger,
            'duration_ms': duration,
            'emphasis': item.get('emphasis'),
        }
        for order, item in enumerate(ordered)
    ]


def build_video_director_plan(pages: list[dict], value: dict | None = None) -> dict:
    config = normalize_video_director_config(value)
    directed_pages = []
    total = len(pages)
    for position, page in enumerate(pages):
        kind = infer_page_kind(page, position, total)
        is_section = kind in {'cover', 'chapter'}
        directed_pages.append({
            'page_index': int(page.get('page_index', position)),
            'page_kind': kind,
            'motion': _motion_for(kind, position, config['motion_intensity']),
            'transition': {
                'type': config['transition'] if position else 'fade',
                'duration_ms': 420 if config['transition'] != 'cut' else 0,
            },
            'audio': {
                'pause_before_ms': config['section_pause_ms'] if is_section and position else config['page_pause_ms'],
                'normalize_loudness': True,
            },
            'subtitle': {'mode': config['subtitle_mode']},
            'element_timeline': _element_timeline(page, config) if page.get('render_mode') == 'native' else [],
        })
    return {'version': 1, 'preset': config['preset'], 'config': config, 'pages': directed_pages}


def _integer_setting(value: Any, default: int, minimum: int, maximum: int) -> int:
    if isinstance(value, bool):
        return default
    try:
        return max(minimum, min(int(value), maximum))
    except (TypeError, ValueError):
        return default


def _effect_for(element: dict, requested: Any = None) -> str | None:
    capabilities = set(element.get('motion_capabilities') or [])
    requested_effect = _LEGACY_EFFECTS.get(str(requested or ''), requested)
    if (
        requested_effect in _EFFECT_CAPABILITY
        and _EFFECT_CAPABILITY[requested_effect] in capabilities
    ):
        return requested_effect
    for effect in _KIND_EFFECTS.get(element.get('kind'), ()):
        if _EFFECT_CAPABILITY[effect] in capabilities:
            return effect
    return None


def _native_element_settings(native_animation: dict, page_direction: dict) -> dict:
    settings = {}
    explicit = native_animation.get('elements')
    if isinstance(explicit, dict):
        for element_id, value in explicit.items():
            if isinstance(element_id, str) and isinstance(value, dict):
                settings[element_id] = value
    timeline = page_direction.get('element_timeline')
    if isinstance(timeline, list):
        for item in timeline:
            if not isinstance(item, dict) or not isinstance(item.get('element_id'), str):
                continue
            settings.setdefault(item['element_id'], item)
    return settings


def _ordered_elements(scene_manifest: dict, native_animation: dict, page_direction: dict) -> list[dict]:
    settings = _native_element_settings(native_animation, page_direction)
    indexed = list(enumerate(scene_manifest.get('elements') or []))

    def order(item):
        index, element = item
        element_setting = settings.get(element.get('id'), {})
        requested_order = element_setting.get('order', index)
        if isinstance(requested_order, bool) or not isinstance(requested_order, (int, float)):
            requested_order = index
        return (requested_order, index, str(element.get('id') or ''))

    return [element for _, element in sorted(indexed, key=order)]


def _transition(duration_ms: int, page_direction: dict, native_animation: dict) -> dict:
    directed = page_direction.get('transition')
    directed = directed if isinstance(directed, dict) else {}
    native_type = native_animation.get('transition')
    source_type = native_type if isinstance(native_type, str) and native_type != 'none' else directed.get('type')
    if source_type in {'fade', 'dissolve', 'zoom'}:
        transition_type = 'crossfade'
    elif source_type in {'push', 'wipe', 'split', 'cover', 'uncover'}:
        transition_type = 'push'
    else:
        transition_type = 'cut'

    if transition_type == 'cut':
        return {'type': 'cut', 'duration_ms': 0, 'direction': None}

    speed_duration = {'fast': 260, 'med': 520, 'slow': 900}
    requested_duration = (
        speed_duration.get(native_animation.get('transitionSpeed'))
        if native_type not in (None, 'none')
        else directed.get('duration_ms')
    )
    transition_duration = min(
        duration_ms,
        _integer_setting(requested_duration, 420, 1, 2000),
    )
    direction = None
    if transition_type == 'push':
        direction = _TRANSITION_DIRECTIONS.get(
            native_animation.get('transitionDirection'),
            _TRANSITION_DIRECTIONS.get(directed.get('direction'), 'left'),
        )
    return {
        'type': transition_type,
        'duration_ms': transition_duration,
        'direction': direction,
    }


def _camera(duration_ms: int, page_direction: dict) -> dict:
    motion = page_direction.get('motion')
    motion = motion if isinstance(motion, dict) else {}
    preset = {
        'pan_left': 'pan_left',
        'pan_right': 'pan_right',
        'zoom_in': 'subtle_push',
        'zoom_out': 'subtle_push',
    }.get(motion.get('effect'), 'static')
    return {'preset': preset, 'start_ms': 0, 'end_ms': duration_ms}


def _narration_by_id(narration_segments: list[dict]) -> dict[str, dict]:
    result = {}
    for index, segment in enumerate(narration_segments):
        if not isinstance(segment, dict):
            raise ValueError(f'narration_segments[{index}] 必须是 JSON 对象')
        segment_id = segment.get('segment_id') or segment.get('id')
        if not isinstance(segment_id, str) or not segment_id:
            raise ValueError(f'narration_segments[{index}] 缺少 segment_id')
        if segment_id in result:
            raise ValueError(f'narration segment_id 重复: {segment_id}')
        result[segment_id] = segment
    return result


def _captions(audio_timeline: dict, narration_segments: list[dict]) -> tuple[list[dict], list[str]]:
    narration = _narration_by_id(narration_segments)
    timing_quality = audio_timeline.get('timing_quality')
    captions = []
    warnings = []
    for item in audio_timeline.get('segments') or []:
        segment_id = item.get('segment_id')
        authored = narration.get(segment_id)
        if authored is None:
            raise ValueError(f'旁白文案中不存在 Audio Timeline segment_id: {segment_id}')
        text = str(authored.get('text') or '').strip()
        if not text:
            raise ValueError(f'旁白文案为空: {segment_id}')
        start_ms = item.get('start_ms')
        end_ms = item.get('end_ms')
        if not isinstance(start_ms, int) or not isinstance(end_ms, int) or end_ms <= start_ms:
            warnings.append(f'跳过零时长字幕: {segment_id}')
            continue
        speaker_id = authored.get('speaker_id') or authored.get('speaker') or 'narrator'
        captions.append({
            'segment_id': segment_id,
            'speaker_id': str(speaker_id),
            'text': text,
            'start_ms': start_ms,
            'end_ms': end_ms,
            'granularity': 'segment',
        })
    return captions, warnings


def _segment_for_element(element: dict, index: int, timeline_segments: list[dict], narration: dict) -> dict | None:
    element_id = element.get('id')
    for segment in timeline_segments:
        authored = narration.get(segment.get('segment_id'), {})
        focus_ids = authored.get('focus_element_ids')
        if isinstance(focus_ids, list) and element_id in focus_ids:
            return segment
    element_text = str(element.get('text') or '').strip()
    if element_text:
        scored = [
            (
                _keyword_score(element_text, narration.get(segment.get('segment_id'), {}).get('text')),
                -position,
                segment,
            )
            for position, segment in enumerate(timeline_segments)
        ]
        score, _position, segment = max(scored, default=(0, 0, None))
        if score > 0:
            return segment
    positive_segments = [item for item in timeline_segments if item.get('end_ms', 0) > item.get('start_ms', 0)]
    return positive_segments[index % len(positive_segments)] if positive_segments else None


def _keyword_score(element_text, narration_text):
    narration = str(narration_text or '').lower()
    if not narration:
        return 0
    phrases = [
        phrase.strip().lower()
        for phrase in re.split(r'[\s,，。；;：:、（）()【】\\[\\]!?！？]+', element_text)
        if len(phrase.strip()) >= 2
    ]
    matches = [len(phrase) for phrase in phrases if phrase in narration]
    if matches:
        return max(matches)
    latin = set(re.findall(r'[a-z0-9][a-z0-9._%-]{2,}', element_text.lower()))
    return max((len(word) for word in latin if word in narration), default=0)


def build_motion_manifest(
    scene_manifest: dict,
    scene_sha256: str,
    audio_timeline: dict,
    narration_segments: list[dict],
    page_direction: dict | None = None,
    native_animation: dict | None = None,
) -> dict:
    """Build a deterministic, validated Motion Manifest from frozen inputs."""
    page_direction = page_direction if isinstance(page_direction, dict) else {}
    native_animation = native_animation if isinstance(native_animation, dict) else {}
    duration_ms = audio_timeline.get('duration_ms')
    if isinstance(duration_ms, bool) or not isinstance(duration_ms, int) or duration_ms < 1:
        raise ValueError('Audio Timeline duration_ms 必须是正整数')
    timing_quality = audio_timeline.get('timing_quality')
    timeline_segments = audio_timeline.get('segments')
    if not isinstance(timeline_segments, list):
        raise ValueError('Audio Timeline segments 必须是数组')

    narration = _narration_by_id(narration_segments)
    captions, warnings = _captions(audio_timeline, narration_segments)
    element_settings = _native_element_settings(native_animation, page_direction)
    default_effect = native_animation.get('elementEnter')
    default_duration = _integer_setting(native_animation.get('elementDuration'), 420, 80, 2000)
    default_delay = _integer_setting(native_animation.get('elementDelay'), 0, 0, 5000)
    stagger = _integer_setting(native_animation.get('elementStagger'), 160, 0, 1000)
    easing = _EASINGS.get(native_animation.get('elementEasing'), 'power2.out')
    elements = []

    if default_effect != 'none':
        ordered = _ordered_elements(scene_manifest, native_animation, page_direction)
        for index, element in enumerate(ordered):
            element_id = element.get('id')
            setting = element_settings.get(element_id, {})
            requested_effect = setting.get('effect') or setting.get('enter') or default_effect
            effect = _effect_for(element, requested_effect)
            if effect is None:
                warnings.append(f'元素缺少可用动效能力，已跳过: {element_id}')
                continue
            if requested_effect and _LEGACY_EFFECTS.get(str(requested_effect), requested_effect) != effect:
                warnings.append(f'元素动效不受支持，已降级: {element_id}')

            segment = _segment_for_element(element, index, timeline_segments, narration)
            if segment is None:
                cue = {'basis': 'page', 'segment_id': None, 'precision': 'coarse'}
                start_ms = min(default_delay + index * stagger, duration_ms - 1)
                available_ms = duration_ms - start_ms
            else:
                segment_id = segment['segment_id']
                basis = 'segment_window' if timing_quality == 'estimated' else 'segment'
                precision = 'coarse' if timing_quality == 'estimated' else 'exact'
                cue = {'basis': basis, 'segment_id': segment_id, 'precision': precision}
                segment_start = int(segment['start_ms'])
                segment_end = int(segment['end_ms'])
                requested_start = segment_start + default_delay + index * stagger
                start_ms = min(requested_start, segment_end - 1, duration_ms - 1)
                start_ms = max(segment_start, start_ms)
                available_ms = min(segment_end, duration_ms) - start_ms
            motion_duration = min(
                _integer_setting(setting.get('duration_ms') or setting.get('duration'), default_duration, 1, 2000),
                max(1, available_ms),
            )
            elements.append({
                'element_id': element_id,
                'effect': effect,
                'start_ms': int(start_ms),
                'duration_ms': int(motion_duration),
                'easing': _EASINGS.get(setting.get('easing'), easing),
                'cue': cue,
            })

    manifest = {
        'schema_version': 1,
        'page_id': scene_manifest.get('page_id'),
        'scene_manifest_sha256': scene_sha256,
        'duration_ms': duration_ms,
        'timing_quality': timing_quality,
        'transition': _transition(duration_ms, page_direction, native_animation),
        'camera': _camera(duration_ms, page_direction),
        'elements': elements,
        'captions': captions,
        'fallback': {'strategy': 'browser_frames', 'reason': None},
        'warnings': list(dict.fromkeys(warnings)),
    }
    return validate_motion_manifest(
        manifest,
        scene_manifest,
        expected_scene_sha256=scene_sha256,
        audio_timeline=audio_timeline,
    )
