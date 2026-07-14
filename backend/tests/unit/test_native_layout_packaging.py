from pathlib import Path


def test_desktop_spec_packages_native_layout_contract():
    spec = (Path(__file__).resolve().parents[2] / 'desktop.spec').read_text(encoding='utf-8')

    assert "'shared' / 'native-deck'" in spec
    assert "'shared/native-deck'" in spec


def test_frontend_build_and_quit_flow_include_native_export():
    root = Path(__file__).resolve().parents[3]
    package = (root / 'frontend/package.json').read_text(encoding='utf-8')
    desktop = (root / 'desktop/main.js').read_text(encoding='utf-8')
    app = (root / 'backend/app.py').read_text(encoding='utf-8')

    assert 'pptxgenjs' in package
    assert '/api/projects/tasks/pause-active-exports' in desktop
    assert 'EXPORT_NATIVE_PPTX' in app
