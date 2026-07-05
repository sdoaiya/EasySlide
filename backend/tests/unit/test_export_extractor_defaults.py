from pathlib import Path


def test_hybrid_export_extractor_no_longer_auto_uses_baidu_ocr():
    source = Path("backend/services/image_editability/factories.py").read_text(encoding="utf-8")
    start = source.index("if use_hybrid_extractor:")
    end = source.index("# 创建Inpaint提供者", start)
    branch = source[start:end]

    assert "create_hybrid_extractor(" not in branch
    assert "MinerUElementExtractor(parser_service, upload_path)" in branch


def test_editable_export_uses_mineru_layout_parser():
    source = Path("backend/services/image_editability/factories.py").read_text(encoding="utf-8")

    assert "MinerU token is required. Please configure MINERU_TOKEN." in source
    assert 'pdf_parser="mineru"' in source


def test_file_parser_pdf_default_remains_paddle():
    source = Path("backend/services/file_parser_service.py").read_text(encoding="utf-8")

    assert 'pdf_parser: str = "paddle"' in source
    assert "if file_ext == 'pdf' and self.pdf_parser != 'mineru':" in source
