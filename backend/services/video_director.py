"""Deterministic direction plans shared by image and native video exports."""

from __future__ import annotations

from copy import deepcopy
from typing import Any


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
    if intensity == 'minimal':
        effect = 'static'
    elif kind == 'cover':
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
