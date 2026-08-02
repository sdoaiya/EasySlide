from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parents[2]


def _read_source(relative_path: str) -> str:
    """读取 backend 源码文件：基于本文件定位，与 pytest 启动目录无关。"""
    return (_BACKEND_DIR / relative_path).read_text(encoding='utf-8')


def test_hybrid_export_extractor_no_longer_auto_uses_baidu_ocr():
    source = _read_source('services/image_editability/factories.py')
    start = source.index("if use_hybrid_extractor:")
    end = source.index("# 创建Inpaint提供者", start)
    branch = source[start:end]

    assert "create_hybrid_extractor(" not in branch
    assert "MinerUElementExtractor(parser_service, upload_path)" in branch


def test_editable_export_uses_mineru_layout_parser():
    source = _read_source('services/image_editability/factories.py')

    assert "MinerU token is required. Please configure MINERU_TOKEN." in source
    assert 'pdf_parser="mineru"' in source


def test_file_parser_pdf_default_remains_paddle():
    source = _read_source('services/file_parser_service.py')

    assert 'pdf_parser: str = "paddle"' in source
    assert "if file_ext == 'pdf' and self.pdf_parser != 'mineru':" in source
