import os
import json
from pathlib import Path
from zipfile import ZipFile

from PIL import Image

from services.export_service import ExportError, ExportService
from services.image_editability.text_attribute_extractors import TextStyleResult


class FailingExtractor:
    def extract_batch_with_full_image(self, full_image, text_elements, **kwargs):
        raise RuntimeError("caption_provider 不支持图片输入")

    def extract(self, image, text_content=None, **kwargs):
        return TextStyleResult(confidence=0.0, metadata={"error": "caption_provider 不支持图片输入"})


class EmptyGlobalExtractor:
    def extract_batch_with_full_image(self, full_image, text_elements, **kwargs):
        return {}

    def extract(self, image, text_content=None, **kwargs):
        return TextStyleResult(font_color_rgb=(255, 0, 0), confidence=0.9)


class SlowLocalExtractor:
    def extract_batch_with_full_image(self, full_image, text_elements, **kwargs):
        return {
            elem["element_id"]: TextStyleResult(is_bold=True, confidence=0.9)
            for elem in text_elements
        }

    def extract(self, image, text_content=None, **kwargs):
        import time

        time.sleep(0.2)
        return TextStyleResult(font_color_rgb=(255, 0, 0), confidence=0.9)


class EditableImageStub:
    class BBox:
        def __init__(self, x0=0, y0=0, x1=100, y1=40):
            self.x0 = x0
            self.y0 = y0
            self.x1 = x1
            self.y1 = y1

    class Element:
        def __init__(self, image_path: str, element_id="text_0", content="hello", bbox=None, metadata=None, element_type="text", is_icon=None):
            self.element_type = element_type
            self.element_id = element_id
            self.content = content
            self.image_path = image_path
            self.bbox = bbox or EditableImageStub.BBox()
            self.bbox_global = self.bbox
            self.children = []
            self.metadata = metadata or {}
            self.is_icon = is_icon

    def __init__(self, image_path: str):
        self.image_path = image_path
        self.width = 300
        self.height = 120
        self.clean_background = None
        self.elements = [EditableImageStub.Element(image_path)]


def _make_editable_images(tmp_path):
    image_path = Path(tmp_path) / "text.png"
    image_path.write_bytes(b"png")
    return [EditableImageStub(str(image_path))]


def test_hybrid_style_extraction_fails_fast_when_provider_has_no_image_input(tmp_path):
    editable_images = _make_editable_images(tmp_path)

    try:
        ExportService._batch_extract_text_styles_hybrid(
            editable_images=editable_images,
            text_attribute_extractor=FailingExtractor(),
            max_workers=2,
            fail_fast=True,
        )
        assert False, "expected ExportError"
    except ExportError as exc:
        assert exc.error_type == "style_extraction"
        assert "不支持图片输入" in exc.message
        assert "image caption" in exc.help_text


def test_codex_style_extraction_network_error_uses_reconnect_copy():
    error = ExportService._build_style_extraction_error(
        "Max retries exceeded while connecting to chatgpt codex: connection reset"
    )

    assert "重新连接 Codex/OpenAI" in error.help_text
    assert "登录" not in error.help_text


def test_hybrid_style_extraction_reports_missing_global_results_when_not_fail_fast(tmp_path):
    editable_images = _make_editable_images(tmp_path)

    results, failures = ExportService._batch_extract_text_styles_hybrid(
        editable_images=editable_images,
        text_attribute_extractor=EmptyGlobalExtractor(),
        max_workers=2,
        fail_fast=False,
    )

    assert "text_0" in results
    assert failures == [("text_0", "全局识别未返回完整结果")]


def test_hybrid_style_extraction_uses_global_result_without_slow_local_fallback(tmp_path):
    editable_images = _make_editable_images(tmp_path)

    results, failures = ExportService._batch_extract_text_styles_hybrid(
        editable_images=editable_images,
        text_attribute_extractor=SlowLocalExtractor(),
        max_workers=2,
        fail_fast=False,
        local_timeout_seconds=0.05,
    )

    assert "text_0" in results
    assert results["text_0"].is_bold is True
    assert failures == []


def test_local_clean_background_masks_text_bbox(tmp_path):
    image_path = tmp_path / "text-bg.png"
    img = Image.new("RGB", (300, 120), (240, 240, 230))
    for x in range(10, 90):
        for y in range(10, 35):
            img.putpixel((x, y), (0, 0, 0))
    img.save(image_path)
    editable = EditableImageStub(str(image_path))

    clean_path = ExportService._create_local_clean_background(
        editable.image_path,
        editable.elements,
    )

    clean = Image.open(clean_path)
    assert clean.getpixel((50, 20)) == (240, 240, 230)


def test_local_clean_background_masks_image_bbox(tmp_path):
    image_path = tmp_path / "image-bg.png"
    img = Image.new("RGB", (300, 120), (240, 240, 230))
    for x in range(110, 190):
        for y in range(40, 90):
            img.putpixel((x, y), (20, 80, 180))
    img.save(image_path)
    editable = EditableImageStub(str(image_path))
    editable.elements = [
        EditableImageStub.Element(
            str(image_path),
            element_id="image_0",
            content=None,
            bbox=EditableImageStub.BBox(110, 40, 190, 90),
            element_type="image",
        )
    ]

    clean_path = ExportService._create_local_clean_background(
        editable.image_path,
        editable.elements,
    )

    clean = Image.open(clean_path)
    assert clean.getpixel((150, 65)) == (240, 240, 230)


def test_editable_export_continues_when_style_extraction_fails(tmp_path):
    background = tmp_path / "slide.png"
    output = tmp_path / "style-fallback.pptx"
    Image.new("RGB", (300, 120), "white").save(background)

    _, warnings = ExportService.create_editable_pptx_with_recursive_analysis(
        editable_images=[EditableImageStub(str(background))],
        output_file=str(output),
        slide_width_pixels=300,
        slide_height_pixels=120,
        text_attribute_extractor=FailingExtractor(),
        fail_fast=True,
    )

    with ZipFile(output) as archive:
        slide_xml = archive.read("ppt/slides/slide1.xml").decode("utf-8")

    assert output.exists()
    assert "hello" in slide_xml
    assert warnings.style_extraction_failed == [
        {"element_id": "all", "reason": "文本样式提取失败: caption_provider 不支持图片输入"}
    ]


def test_editable_export_writes_rebuild_manifest_and_validation(tmp_path):
    background = tmp_path / "slide.png"
    output = tmp_path / "manifested.pptx"
    Image.new("RGB", (300, 120), "white").save(background)

    _, warnings = ExportService.create_editable_pptx_with_recursive_analysis(
        editable_images=[EditableImageStub(str(background))],
        output_file=str(output),
        slide_width_pixels=300,
        slide_height_pixels=120,
        fail_fast=True,
    )

    manifest_dir = Path(warnings.rebuild_artifacts_dir)
    manifest = json.loads((manifest_dir / "page_001" / "manifest.json").read_text(encoding="utf-8"))
    validation = json.loads((manifest_dir / "page_001" / "validation.json").read_text(encoding="utf-8"))

    assert manifest["background_strategy"]["mode"] == "source-preserving-local-cleanup"
    assert manifest["text_boxes"][0]["text"] == "hello"
    assert validation == {"passed": True, "errors": []}


def test_rebuild_validation_rejects_full_slide_source_with_editable_text():
    validation = ExportService._validate_page_rebuild_manifest({
        "background_strategy": {"mode": "source-full-slide-raster"},
        "text_boxes": [{"id": "title", "text": "hello", "box_px": [0, 0, 100, 40]}],
        "images": [],
    })

    assert validation["passed"] is False
    assert "原始整页截图" in validation["errors"][0]


def test_rebuild_validation_rejects_full_slide_raster_element():
    validation = ExportService._validate_page_rebuild_manifest({
        "slide": {"width_px": 300, "height_px": 120},
        "background_strategy": {"mode": "external-clean-background"},
        "text_boxes": [{"id": "title", "text": "hello", "box_px": [0, 0, 100, 40]}],
        "images": [{"id": "full", "path": "full.png", "box_px": [0, 0, 300, 120]}],
    })

    assert validation["passed"] is False
    assert any("整页栅格" in error for error in validation["errors"])


def test_text_hints_unify_same_level_font_size_in_manifest(tmp_path):
    background = tmp_path / "slide.png"
    Image.new("RGB", (300, 120), "white").save(background)
    editable = EditableImageStub(str(background))
    editable.elements = [
        EditableImageStub.Element(
            str(background),
            element_id="body_1",
            content="同级文字一",
            bbox=EditableImageStub.BBox(0, 0, 120, 24),
            metadata={"text_hint": {"glyph_height_px": 18, "size_group": "body", "font_size_pt": 13}},
        ),
        EditableImageStub.Element(
            str(background),
            element_id="body_2",
            content="同级文字二",
            bbox=EditableImageStub.BBox(0, 40, 120, 70),
            metadata={"text_hint": {"glyph_height_px": 20, "size_group": "body", "font_size_pt": 15}},
        ),
    ]

    manifest = ExportService._build_page_rebuild_manifest(
        editable_img=editable,
        page_idx=0,
        background_source=str(background),
        background_path=str(background) + ".clean.png",
    )

    font_sizes = {item["font_size"] for item in manifest["text_boxes"]}
    assert font_sizes == {14}
    assert all(item["font_size_source"] == "text_hint_size_group" for item in manifest["text_boxes"])


def test_text_hint_font_size_is_bounded(tmp_path):
    image_path = tmp_path / "hint.png"
    Image.new("RGB", (300, 120), "white").save(image_path)
    elem = EditableImageStub.Element(
        str(image_path),
        metadata={"text_hint": {"font_size_pt": 10000}},
    )

    hint = ExportService._text_hint_from_element(elem)

    assert hint["font_size"] == 200


def test_formula_inventory_records_formula_fallback_items(tmp_path):
    background = tmp_path / "slide.png"
    Image.new("RGB", (300, 120), "white").save(background)
    editable = EditableImageStub(str(background))
    editable.elements = [
        EditableImageStub.Element(
            str(background),
            element_id="formula_1",
            content=r"\sum_i x_i",
            element_type="equation",
        )
    ]

    manifest = ExportService._build_page_rebuild_manifest(
        editable_img=editable,
        page_idx=0,
        background_source=str(background),
        background_path=str(background) + ".clean.png",
    )

    assert manifest["formula_inventory"] == [
        {
            "id": "formula_1",
            "text": r"\sum_i x_i",
            "decision": "existing-formula-fallback",
            "editable": False,
        }
    ]



def test_asset_sheet_contact_sheet_layout(tmp_path):
    from services.export_service import ExportService
    from PIL import Image, ImageDraw

    icon1 = tmp_path / 'icon1.png'
    img1 = Image.new('RGBA', (60, 60), (255, 0, 0, 255))
    ImageDraw.Draw(img1).ellipse([5, 5, 55, 55], fill=(0, 128, 0, 255))
    img1.save(icon1)

    icon2 = tmp_path / 'icon2.png'
    img2 = Image.new('RGBA', (40, 40), (0, 0, 255, 255))
    ImageDraw.Draw(img2).rectangle([5, 5, 35, 35], fill=(255, 255, 0, 255))
    img2.save(icon2)

    elements = [
        {'id': 'a', 'image_path': str(icon1), 'box_px': [0, 0, 60, 60]},
        {'id': 'b', 'image_path': str(icon2), 'box_px': [0, 0, 40, 40]},
    ]

    sheet_path, grid = ExportService._create_foreground_asset_contact_sheet(
        elements, tmp_path, padding=8, columns=3
    )

    sheet = Image.open(sheet_path)
    assert sheet.mode == 'RGBA'
    assert sheet.size[0] >= 60 and sheet.size[1] >= 60
    assert len(grid) == 2
    assert grid[0]['id'] == 'a'
    red_pixels = sum(1 for x in range(sheet.size[0]) for y in range(sheet.size[1]) if sheet.getpixel((x, y))[0] > 200)
    assert red_pixels > 0


def test_asset_sheet_split_from_processed(tmp_path):
    from services.export_service import ExportService
    from PIL import Image, ImageDraw

    processed = Image.new('RGBA', (180, 80), (0, 0, 0, 0))
    ImageDraw.Draw(processed).ellipse([5, 5, 55, 55], fill=(0, 200, 0, 255))
    ImageDraw.Draw(processed).rectangle([73, 5, 113, 45], fill=(200, 200, 0, 255))
    processed_path = tmp_path / 'processed.png'
    processed.save(processed_path)

    grid = [
        {'id': 'a', 'x': 0, 'y': 0, 'w': 60, 'h': 60},
        {'id': 'b', 'x': 68, 'y': 0, 'w': 40, 'h': 40},
    ]

    assets = ExportService._split_processed_asset_sheet(str(processed_path), grid, tmp_path)

    assert len(assets) == 2
    assert assets[0]['id'] == 'a'
    assert os.path.exists(assets[0]['image_path'])
    assert assets[1]['id'] == 'b'
    a_img = Image.open(assets[0]['image_path'])
    assert a_img.mode == 'RGBA'

import os


class FakeImageEditingProvider:
    def generate_image(self, prompt=None, ref_images=None, **kwargs):
        from PIL import Image, ImageDraw
        result = Image.new("RGBA", (180, 80), (0, 0, 0, 0))
        draw = ImageDraw.Draw(result)
        draw.ellipse([5, 5, 55, 55], fill=(0, 200, 0, 255))
        draw.rectangle([73, 5, 113, 45], fill=(200, 200, 0, 255))
        return result


def test_asset_sheet_full_pipeline_with_fake_provider(tmp_path):
    from services.export_service import ExportService
    from unittest.mock import MagicMock
    from PIL import Image, ImageDraw

    icon_path = tmp_path / "icon.png"
    img = Image.new("RGBA", (30, 30), (255, 0, 0, 255))
    ImageDraw.Draw(img).ellipse([2, 2, 28, 28], fill=(0, 128, 0, 255))
    img.save(icon_path)

    bbox = MagicMock()
    bbox.x0 = 10; bbox.y0 = 10; bbox.x1 = 40; bbox.y1 = 40

    elem = MagicMock()
    elem.element_type = "image"
    elem.element_id = "icon_1"
    elem.image_path = str(icon_path)
    elem.is_icon = True
    elem.bbox = bbox
    elem._parent_width = 300
    elem._parent_height = 120
    elem.children = []
    elem.metadata = {}

    editable_img = MagicMock()
    editable_img.elements = [elem]
    editable_img.image_path = str(tmp_path / "slide.png")
    editable_img.width = 300
    editable_img.height = 120

    provider = FakeImageEditingProvider()
    assets = ExportService._run_asset_sheet_separation(
        editable_img=editable_img,
        output_dir=tmp_path,
        high_fidelity_editable=True,
        image_editing_provider=provider,
    )

    assert len(assets) == 1
    assert "icon_1" in assets
    assert os.path.exists(assets["icon_1"])


def test_asset_sheet_only_collects_confirmed_icons(tmp_path):
    icon_path = tmp_path / "icon.png"
    photo_path = tmp_path / "photo.png"
    Image.new("RGBA", (30, 30), (255, 0, 0, 255)).save(icon_path)
    Image.new("RGB", (80, 60), (10, 20, 30)).save(photo_path)

    icon = EditableImageStub.Element(
        str(icon_path), element_id="icon", content=None,
        element_type="image", is_icon=True,
    )
    photo = EditableImageStub.Element(
        str(photo_path), element_id="photo", content=None,
        element_type="image", is_icon=False,
    )

    collected = ExportService._collect_foreground_image_elements([icon, photo])

    assert [item["id"] for item in collected] == ["icon"]


def test_asset_sheet_failure_returns_no_replacement_and_warning(tmp_path):
    icon_path = tmp_path / "icon.png"
    Image.new("RGBA", (30, 30), (255, 0, 0, 255)).save(icon_path)
    editable = EditableImageStub(str(icon_path))
    editable.elements = [
        EditableImageStub.Element(
            str(icon_path), element_id="icon", content=None,
            element_type="image", is_icon=True,
        )
    ]

    class FailingProvider:
        def generate_image(self, **kwargs):
            raise RuntimeError("provider unavailable")

    from services.export_service import ExportWarnings
    warnings = ExportWarnings()
    assets = ExportService._run_asset_sheet_separation(
        editable_img=editable,
        output_dir=tmp_path,
        high_fidelity_editable=True,
        image_editing_provider=FailingProvider(),
        warnings=warnings,
    )

    assert assets == {}
    assert any("前景分离失败" in warning for warning in warnings.other_warnings)


def test_high_fidelity_manifest_records_processed_asset(tmp_path):
    background = tmp_path / "slide.png"
    icon_path = tmp_path / "icon.png"
    output = tmp_path / "high-fidelity.pptx"
    Image.new("RGB", (300, 120), "white").save(background)
    Image.new("RGBA", (30, 30), (255, 0, 0, 255)).save(icon_path)
    editable = EditableImageStub(str(background))
    editable.elements = [
        EditableImageStub.Element(
            str(icon_path),
            element_id="icon",
            content=None,
            bbox=EditableImageStub.BBox(10, 10, 40, 40),
            element_type="image",
            is_icon=True,
        )
    ]

    _, warnings = ExportService.create_editable_pptx_with_recursive_analysis(
        editable_images=[editable],
        output_file=str(output),
        slide_width_pixels=300,
        slide_height_pixels=120,
        export_high_fidelity_editable=True,
        image_editing_provider=FakeImageEditingProvider(),
        fail_fast=True,
    )

    manifest = json.loads(
        (Path(warnings.rebuild_artifacts_dir) / "page_001" / "manifest.json").read_text(encoding="utf-8")
    )
    assert manifest["page_strategy"]["asset_sheet_separation"] == "completed"
    assert manifest["images"][0]["path"].endswith("asset_icon.png")
    assert manifest["asset_provenance"][0]["source_type"] == "asset-sheet-separated"
