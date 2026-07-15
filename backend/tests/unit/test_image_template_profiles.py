import importlib.util
import sys
from pathlib import Path


_MODULE_PATH = Path(__file__).parents[2] / 'services' / 'image_template_profiles.py'
_SPEC = importlib.util.spec_from_file_location('image_template_profiles_under_test', _MODULE_PATH)
assert _SPEC and _SPEC.loader
_MODULE = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(_MODULE)
append_image_page_role_hint = _MODULE.append_image_page_role_hint
infer_image_page_role = _MODULE.infer_image_page_role
resolve_template_reference_path = _MODULE.resolve_template_reference_path


def test_infers_common_image_page_roles():
    assert infer_image_page_role(1, 8, {'title': '项目概览'}) == 'cover'
    assert infer_image_page_role(2, 8, {'title': '目录'}) == 'agenda'
    assert infer_image_page_role(3, 8, {'title': '关键指标数据'}) == 'data'
    assert infer_image_page_role(8, 8, {'title': '谢谢聆听'}) == 'ending'
    assert infer_image_page_role(4, 8, {'title': '方案概述'}) == 'content'


def test_appends_role_hint_without_duplicate_or_data_mutation():
    base = '深蓝商务风'
    result = append_image_page_role_hint(base, 'section')

    assert result is not None
    assert result.startswith(base)
    assert '章节分隔页' in result
    assert append_image_page_role_hint(result, 'section') == result
    assert append_image_page_role_hint('', 'content').startswith('本页视觉角色：普通内容页')


def test_resolves_role_asset_and_preserves_legacy_fallback(tmp_path, monkeypatch):
    pack = tmp_path / 'gorden' / 'data-viz-deck'
    pack.mkdir(parents=True)
    role_asset = pack / 'data.webp'
    role_asset.write_bytes(b'asset')
    monkeypatch.setenv('TEMPLATE_PACKS_DIR', str(tmp_path / 'gorden'))

    assert resolve_template_reference_path('gorden-data-viz-deck', 'data', 'legacy.png') == str(role_asset)
    assert resolve_template_reference_path('gorden-data-viz-deck', 'cover', 'legacy.png') == 'legacy.png'
    assert resolve_template_reference_path(None, 'data', 'legacy.png') == 'legacy.png'


def test_resolves_checked_in_gorden_sample_slide_assets():
    resolved = resolve_template_reference_path(
        'gorden-minimal-business-summary',
        'cover',
        'legacy.png',
    )

    assert resolved is not None
    assert resolved.endswith('minimal-business-summary\\cover.webp') or resolved.endswith(
        'minimal-business-summary/cover.webp'
    )


def test_resolves_bundled_pyinstaller_assets(tmp_path, monkeypatch):
    bundle_root = tmp_path / 'bundle' / 'template-packs' / 'gorden' / 'data-viz-deck'
    bundle_root.mkdir(parents=True)
    bundled_asset = bundle_root / 'content.webp'
    bundled_asset.write_bytes(b'asset')
    monkeypatch.delenv('TEMPLATE_PACKS_DIR', raising=False)
    monkeypatch.setattr(sys, '_MEIPASS', str(tmp_path / 'bundle'), raising=False)

    assert resolve_template_reference_path('gorden-data-viz-deck', 'content', 'legacy.png') == str(bundled_asset)
