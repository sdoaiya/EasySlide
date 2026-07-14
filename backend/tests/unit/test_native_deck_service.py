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


def test_fits_generated_copy_to_layout_budgets_without_mutating_model_output():
    service = NativeDeckService()
    props = {'eyebrow': 'E' * 30, 'title': '融资企业榜单'}

    fitted = service.fit_copy_budgets('theme07_page011', props)

    assert props['eyebrow'] == 'E' * 30
    assert len(fitted['eyebrow']) == 18
    assert service.validate_props('theme07_page011', fitted)


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
