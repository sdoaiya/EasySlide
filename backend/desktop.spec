# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_submodules

from pathlib import Path

BACKEND_DIR = Path.cwd() / 'backend'

hiddenimports = [
    'controllers.project_controller',
    'controllers.page_controller',
    'controllers.template_controller',
    'controllers.export_controller',
    'controllers.file_controller',
    'controllers.material_controller',
    'controllers.native_deck_controller',
    'controllers.settings_controller',
    'controllers.reference_file_controller',
]
for name in ['controllers']:
    hiddenimports += collect_submodules(name)
for name in [
    'flask',
    'flask_cors',
    'flask_sqlalchemy',
    'flask_migrate',
    'sqlalchemy',
    'alembic',
    'openai',
    'anthropic',
    'google.genai',
    'google.generativeai',
    'httpx',
    'pptx',
    'docx',
    'lxml',
    'reportlab',
    'markitdown',
    'PIL',
    'img2pdf',
    'fitz',
    'pydantic',
    'tenacity',
    'dotenv',
    'werkzeug',
    'jinja2',
    'lazyllm',
    'dashscope',
    'zhipuai',
    'volcengine',
    'edge_tts',
    'cv2',
    'onnxruntime',
]:
    try:
        hiddenimports += collect_submodules(name)
    except Exception:
        pass

a = Analysis(
    [str(BACKEND_DIR / 'app.py')],
    pathex=[str(BACKEND_DIR)],
    binaries=[],
    datas=[
        (str(BACKEND_DIR / 'fonts'), 'fonts'),
        (str(BACKEND_DIR / 'migrations'), 'migrations'),
        (str(BACKEND_DIR.parent / 'assets'), 'assets'),
        (str(BACKEND_DIR.parent / 'shared' / 'content'), 'shared/content'),
        (str(BACKEND_DIR.parent / 'shared' / 'native-deck'), 'shared/native-deck'),
        (str(BACKEND_DIR.parent / 'frontend' / 'public' / 'template-packs' / 'gorden'), 'template-packs/gorden'),
    ],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'matplotlib', 'scipy', 'pytest', 'jupyter'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=None,
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='easyslide-backend',
    console=False,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    name='easyslide-backend',
)
