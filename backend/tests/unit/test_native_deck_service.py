import pytest

from services.native_deck_service import NativeDeckService


def test_lists_layouts_by_role_and_media_need():
    service = NativeDeckService()

    covers = service.list_layouts(role='cover')
    with_media = service.list_layouts(needs_media=True)

    assert any(item['layout'] == 'core01_cover' for item in covers)
    assert any(item['layout'] == 'theme01_page001' for item in covers)
    assert any(item['layout'] == 'core01_case' for item in with_media)
    assert all(item['mediaSlots'] for item in with_media)


def test_lists_all_dashiai_themes_and_filters_by_theme():
    service = NativeDeckService()

    dashiai_layouts = [
        layout
        for theme in [f'theme{index:02d}' for index in range(1, 13)]
        for layout in service.list_layouts(theme=theme)
    ]

    assert len(dashiai_layouts) == 1020
    assert {layout['theme'] for layout in dashiai_layouts} == {
        f'theme{index:02d}' for index in range(1, 13)
    }
    assert all(layout['theme'] == 'theme01' for layout in service.list_layouts(theme='theme01'))


def test_rejects_unknown_props_and_over_budget_copy():
    service = NativeDeckService()

    with pytest.raises(ValueError, match='未知字段'):
        service.validate_props('core01_cover', {'title': '标题', 'className': 'hidden'})

    with pytest.raises(ValueError, match='title'):
        service.validate_props('core01_cover', {'title': '超' * 25})


def test_allows_only_controlled_native_metadata():
    service = NativeDeckService()

    assert service.validate_props('core01_case', {
        'title': '案例',
        '__media_prompts': {'image': '突出产品主体'},
        '__unmapped_content': {'legacyBody': '切换主题后仍需保留'},
        '__design_intent': {'direction': '克制的政府汇报', 'layout_reason': '用案例结构承载问题和动作'},
    })

    with pytest.raises(ValueError, match='未知字段'):
        service.validate_props('core01_case', {'title': '案例', '__anything': {'unsafe': True}})


def test_rejects_wrong_array_count_and_invalid_media_path():
    service = NativeDeckService()

    with pytest.raises(ValueError, match='items'):
        service.validate_props('core01_agenda', {'title': '目录', 'items': []})

    with pytest.raises(ValueError, match='image'):
        service.validate_props(
            'core01_case',
            {'title': '案例', 'summary': '说明', 'image': 'javascript:alert(1)'},
        )


def test_normalizes_only_contract_fields():
    service = NativeDeckService()

    slide = service.normalize_slide(
        'core01_cover',
        {'title': '原生标题', 'subtitle': None},
    )

    assert slide == {
        'layout': 'core01_cover',
        'theme': 'core01',
        'props': {'title': '原生标题', 'subtitle': ''},
    }


def test_normalizes_missing_native_values_from_layout_defaults_and_accepts_animation_metadata():
    service = NativeDeckService()

    slide = service.normalize_slide(
        'theme01_page001',
        {'titleTop': None, '__animation': {'enter': 'fade'}},
    )

    assert slide['theme'] == 'theme01'
    assert slide['props']['titleTop'] == '新消费趋势'
    assert slide['props']['__animation'] == {'enter': 'fade'}


def test_fits_generated_copy_to_layout_budgets_without_mutating_model_output():
    service = NativeDeckService()
    props = {'eyebrow': 'E' * 30, 'title': '融资企业榜单'}

    fitted = service.fit_copy_budgets('theme07_page011', props)

    assert props['eyebrow'] == 'E' * 30
    assert len(fitted['eyebrow']) == 18
    assert service.validate_props('theme07_page011', fitted)


def test_fills_missing_dashiai_copy_from_outline_without_overwriting_model_copy():
    service = NativeDeckService()

    props = service.fill_outline_props(
        'theme01_page001',
        {'titleTop': '模型标题'},
        {'title': '产业带供应链计划', 'points': ['筛选企业', '连接海外需求']},
    )

    assert props['titleTop'] == '模型标题'
    assert '产业带供应链计划' in props['titleBottom']
    assert '筛选企业' in ''.join(props['chips'])
    assert service.validate_props('theme01_page001', service.fit_copy_budgets('theme01_page001', props))


def test_builds_huashu_page_plan_and_prefers_matching_dashi_candidates():
    service = NativeDeckService()
    outline = {'title': '关键数据与增长趋势', 'points': ['成交额同比增长', '区域分布对比', '核心指标变化']}

    plan = service.build_page_plan(outline=outline, role='content')
    candidates = service.select_layout_candidates(
        theme='theme01',
        role='content',
        outline=outline,
        used_layouts=set(),
        limit=6,
    )

    assert plan['design_engine'] == 'huashu_dashi_native'
    assert plan['page_kind'] == 'data'
    assert 'data' in plan['preferred_roles']
    assert candidates
    assert any(role in candidates[0]['roles'] for role in ('data', 'metrics', 'trend', 'distribution'))
    assert all(candidate['theme'] == 'theme01' for candidate in candidates)


def test_huashu_page_plan_prefers_media_layouts_only_when_content_needs_media():
    service = NativeDeckService()
    outline = {'title': '产品场景展示', 'points': ['展示产品照片', '突出客户使用现场']}

    plan = service.build_page_plan(outline=outline, role='content')
    candidates = service.select_layout_candidates(
        theme='theme05',
        role='content',
        outline=outline,
        used_layouts=set(),
        limit=6,
    )

    assert plan['page_kind'] == 'image'
    assert plan['needs_media'] is True
    assert candidates
    assert candidates[0]['mediaSlots']


def test_huashu_page_plan_exposes_a_renderable_visual_brief():
    service = NativeDeckService()

    plan = service.build_page_plan(
        outline={
            'title': '产业带出海增长路径',
            'points': ['搭建供应链服务网络', '验证海外渠道需求', '形成区域复制机制'],
        },
        role='content',
    )

    assert plan['information_focus'] == 'process'
    assert plan['composition'] == 'sequence'
    assert plan['media_direction'] == 'supportive'
    assert plan['motion_direction'] == 'progressive'
    assert plan['visual_system'] == 'route'
    assert plan['quality_checks'] == ['single_message', 'no_template_copy', 'contract_safe']


def test_classic_native_design_intent_uses_the_content_led_huashu_engine():
    service = NativeDeckService()
    outline = {'title': '关键数据与增长趋势', 'points': ['成交额同比增长', '区域分布对比']}
    candidates = service.select_layout_candidates(theme='core01', outline=outline, role='content')

    intent = service.build_design_intent(outline=outline, theme='core01', layout_candidates=candidates)

    assert intent['mode'] == 'huashu_native'
    assert intent['design_engine'] == 'huashu_native'
    assert intent['page_plan']['visual_system'] == 'signal'
    assert '主题' not in intent['visual_direction']


def test_classic_native_prefers_huashu_content_driven_layouts():
    service = NativeDeckService()

    statement = service.select_layout_candidates(
        theme='core01',
        outline={'title': '区域合作的核心判断', 'points': ['聚焦链主企业', '形成区域共识']},
        role='content',
    )
    process = service.select_layout_candidates(
        theme='core01',
        outline={'title': '项目推进路径', 'points': ['启动试点', '验证结果', '区域复制']},
        role='content',
    )

    assert statement[0]['layout'] == 'core01_statement'
    assert process[0]['layout'] == 'core01_narrative'


def test_deck_plan_and_recent_layout_penalty_keep_the_deck_coherent_without_consecutive_repeats():
    service = NativeDeckService()
    outlines = [
        {'title': '区域协同计划', 'points': ['建立共同目标']},
        {'title': '核心判断', 'points': ['聚焦链主企业', '形成区域共识']},
        {'title': '下一步行动', 'points': ['启动试点']},
    ]

    plan = service.build_deck_design_plan(
        outlines=outlines,
        theme='core01',
        style_hint='政府汇报、克制专业',
        project_topic='区域协同',
    )
    candidates = service.select_layout_candidates(
        theme='core01',
        outline=outlines[1],
        role='content',
        used_layouts={'core01_statement'},
        recent_layouts=['core01_statement'],
    )

    assert plan['design_engine'] == 'huashu_native'
    assert plan['page_count'] == 3
    assert len(plan['visual_sequence']) == 3
    assert candidates[0]['layout'] != 'core01_statement'


def test_native_quality_report_tracks_outline_coverage_and_layout_repetition():
    service = NativeDeckService()

    report = service.evaluate_slide_quality(
        layout='core01_statement',
        props={
            'kicker': '核心观点',
            'title': '区域合作判断',
            'summary': '聚焦链主企业',
            'points': ['形成区域共识', '建立合作基础'],
        },
        outline={'title': '区域合作判断', 'points': ['聚焦链主企业', '形成区域共识']},
        recent_layouts=['core01_statement'],
    )

    assert report['status'] == 'warning'
    assert report['outline_coverage'] == 1.0
    assert report['issues'] == ['consecutive_layout_repeat']


@pytest.mark.parametrize(
    ('outline', 'role', 'expected'),
    [
        ({'title': '项目风险与合规边界', 'points': ['数据风险', '执行挑战', '合规要求']}, 'content', 'core01_risk'),
        ({'title': '客户现场图片展示', 'points': ['展示产品照片', '说明使用场景']}, 'content', 'core01_image_story'),
        ({'title': '访谈观点摘录', 'points': ['引用客户原话', '说明观点背景']}, 'content', 'core01_quote'),
        ({'title': '年度里程碑时间轴', 'points': ['一季度启动', '二季度验证', '三季度推广']}, 'content', 'core01_timeline'),
        ({'title': '客户转化漏斗', 'points': ['线索筛选', '需求验证', '签约转化']}, 'content', 'core01_funnel'),
        ({'title': '平台系统架构', 'points': ['接入层', '服务层', '数据层']}, 'content', 'core01_architecture'),
        ({'title': '核心负责人介绍', 'points': ['产业经验', '项目职责']}, 'content', 'core01_profile'),
        ({'title': '下一步行动', 'points': ['启动试点', '明确责任', '复盘结果']}, 'end', 'core01_actions'),
    ],
)
def test_classic_native_selects_specialized_huashu_layouts(outline, role, expected):
    service = NativeDeckService()

    candidates = service.select_layout_candidates(theme='core01', outline=outline, role=role)

    assert candidates[0]['layout'] == expected


def test_outline_fallback_pads_required_array_items_for_contract_safe_generation():
    service = NativeDeckService()

    props = service.fill_outline_props(
        'core01_actions',
        {},
        {'title': '下一步', 'points': ['启动试点']},
    )

    assert len(props['actions']) == 3
    assert service.validate_props('core01_actions', service.fit_copy_budgets('core01_actions', props))


def test_classic_native_exposes_twenty_five_editable_layouts():
    service = NativeDeckService()

    assert len(service.list_layouts(theme='core01')) == 25


def test_resolves_native_theme_from_existing_layout_when_project_theme_is_missing():
    service = NativeDeckService()

    assert service.resolve_theme(None, ['theme05_page006']) == 'theme05'
    assert service.resolve_theme('missing', ['theme05_page006']) == 'theme05'
    assert service.resolve_theme(None, []) == 'theme01'


def test_rejects_unknown_layout():
    service = NativeDeckService()

    with pytest.raises(ValueError, match='未知布局'):
        service.validate_props('missing', {})


def test_validates_dashiai_nested_props_and_controls():
    service = NativeDeckService()

    assert service.validate_props('theme01_page040', {
        'title': '升级路线图',
        'phases': [
            {'period': 'Q1', 'step': '01', 'heading': '试点', 'points': ['验证'], 'verdict': '可行'},
            {'period': 'Q2', 'step': '02', 'heading': '推广', 'points': ['复制'], 'verdict': '增长'},
        ],
        'highlight': True,
        'highlightIndex': 1,
    })

    with pytest.raises(ValueError, match='phases'):
        service.validate_props('theme01_page040', {'phases': [{'heading': 123}]})

    with pytest.raises(ValueError, match='highlightIndex'):
        service.validate_props('theme01_page040', {'highlightIndex': 99})
