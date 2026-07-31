import importlib.util
import os
import sys


_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
_module_path = os.path.join(_backend_dir, 'services', 'video_director.py')
_spec = importlib.util.spec_from_file_location('services.video_director', _module_path)
_director = importlib.util.module_from_spec(_spec)
sys.modules['services.video_director'] = _director
_spec.loader.exec_module(_director)


def test_normalize_director_config_applies_business_preset():
    config = _director.normalize_video_director_config({'preset': 'business'})

    assert config['preset'] == 'business'
    assert config['motion_intensity'] == 'subtle'
    assert config['subtitle_mode'] == 'highlight'
    assert config['page_pause_ms'] == 260


def test_normalize_director_config_rejects_unknown_values():
    config = _director.normalize_video_director_config({
        'preset': 'unknown',
        'motion_intensity': 'wild',
        'subtitle_mode': 'karaoke',
        'page_pause_ms': 9999,
    })

    assert config['preset'] == 'business'
    assert config['motion_intensity'] == 'subtle'
    assert config['subtitle_mode'] == 'highlight'
    assert config['page_pause_ms'] == 1200


def test_infer_page_kind_uses_structure_and_title():
    assert _director.infer_page_kind({'title': '项目封面', 'page_index': 0}) == 'cover'
    assert _director.infer_page_kind({'title': '核心指标与增长数据'}) == 'data'
    assert _director.infer_page_kind({'title': '实施流程与步骤'}) == 'process'
    assert _director.infer_page_kind({'title': '结论与下一步'}) == 'summary'


def test_build_director_plan_is_stable_and_content_aware():
    pages = [
        {'page_index': 0, 'title': '年度经营报告'},
        {'page_index': 1, 'title': '关键指标增长数据'},
        {'page_index': 2, 'title': '落地实施流程'},
        {'page_index': 3, 'title': '总结与行动建议'},
    ]

    first = _director.build_video_director_plan(pages, {'preset': 'business'})
    second = _director.build_video_director_plan(pages, {'preset': 'business'})

    assert first == second
    assert [page['page_kind'] for page in first['pages']] == ['cover', 'data', 'process', 'summary']
    assert first['pages'][0]['motion']['effect'] == 'zoom_in'
    assert first['pages'][1]['motion']['effect'] in {'zoom_in', 'zoom_out'}
    assert first['pages'][2]['motion']['effect'] in {'pan_left', 'pan_right'}
    assert first['pages'][3]['motion']['effect'] == 'zoom_out'


def test_minimal_motion_still_moves_the_camera():
    plan = _director.build_video_director_plan([
        {'page_index': 0, 'title': '简洁播报'},
    ], {'preset': 'brief'})

    assert plan['pages'][0]['motion'] == {
        'effect': 'zoom_in',
        'intensity': 'minimal',
        'focus_rect': None,
    }


def test_native_plan_preserves_element_animation_timeline():
    plan = _director.build_video_director_plan([{
        'page_index': 0,
        'title': '方案结构',
        'render_mode': 'native',
        'element_animations': [
            {'element_id': 'title', 'enter': 'fade', 'order': 1},
            {'element_id': 'chart', 'enter': 'wipe', 'order': 2},
        ],
    }], {'preset': 'training'})

    timeline = plan['pages'][0]['element_timeline']
    assert [item['element_id'] for item in timeline] == ['title', 'chart']
    assert timeline[0]['start_ms'] < timeline[1]['start_ms']
    assert timeline[0]['duration_ms'] == 420
