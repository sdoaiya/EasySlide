import os
import json
from pathlib import Path
from zipfile import ZipFile

from PIL import Image

from services.export_service import ExportError, ExportService
from services.image_editability.text_attribute_extractors import (
    CaptionModelTextAttributeExtractor,
    TextStyleResult,
)


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


def test_batch_style_parser_preserves_exact_font_family_and_effects():
    extractor = CaptionModelTextAttributeExtractor(ai_service=None)

    results = extractor._parse_batch_result(
        [
            {
                "element_id": "text_0",
                "font_family": " 方正书宋_GBK ",
                "font_effects": {
                    "gradient": {
                        "start_color": "#F9E7A5",
                        "end_color": "#B8892F",
                        "angle": 90,
                    },
                    "outline": {"color": "#4A2F00", "width_pt": 1.25, "opacity": 0.8},
                    "shadow": {
                        "color": "#000000",
                        "opacity": 0.45,
                        "blur_pt": 3,
                        "distance_pt": 2,
                        "angle": 45,
                    },
                    "glow": {"color": "#FFD76A", "opacity": 0.55, "radius_pt": 4},
                    "transparency": 0.1,
                },
                "character_spacing_pt": 1.2,
            },
            {
                "element_id": "text_1",
                "font_family": 123,
                "font_effects": "invalid",
                "character_spacing_pt": "invalid",
            },
        ],
        [{"element_id": "text_0"}, {"element_id": "text_1"}],
    )

    assert results["text_0"].font_family == "方正书宋_GBK"
    assert results["text_0"].font_effects["gradient"]["end_color"] == "#B8892F"
    assert results["text_0"].character_spacing_pt == 1.2
    assert results["text_1"].font_family is None
    assert results["text_1"].font_effects == {}
    assert results["text_1"].character_spacing_pt is None


def test_font_style_prompts_request_exact_name_and_supported_effects():
    from services.prompts import (
        get_batch_text_attribute_extraction_prompt,
        get_text_attribute_extraction_prompt,
    )

    prompts = (
        get_text_attribute_extraction_prompt(),
        get_batch_text_attribute_extraction_prompt("[]"),
    )

    for prompt in prompts:
        assert "精确字体名称" in prompt
        assert "font_effects" in prompt
        assert "character_spacing_pt" in prompt
        assert "只能从" not in prompt


def test_editable_export_applies_recognized_font_family_and_effects(tmp_path):
    class FontExtractor:
        def extract_batch_with_full_image(self, full_image, text_elements, **kwargs):
            return {
                elem["element_id"]: TextStyleResult(
                    font_family="方正书宋_GBK",
                    font_effects={
                        "gradient": {
                            "start_color": "#F9E7A5",
                            "end_color": "#B8892F",
                            "angle": 90,
                        },
                        "outline": {"color": "#4A2F00", "width_pt": 1.25, "opacity": 0.8},
                        "shadow": {
                            "color": "#000000",
                            "opacity": 0.45,
                            "blur_pt": 3,
                            "distance_pt": 2,
                            "angle": 45,
                        },
                        "glow": {"color": "#FFD76A", "opacity": 0.55, "radius_pt": 4},
                        "transparency": 0.1,
                    },
                    character_spacing_pt=1.2,
                    confidence=0.9,
                )
                for elem in text_elements
            }

    background = tmp_path / "font-slide.png"
    output = tmp_path / "font-restored.pptx"
    Image.new("RGB", (300, 120), "white").save(background)

    ExportService.create_editable_pptx_with_recursive_analysis(
        editable_images=[EditableImageStub(str(background))],
        output_file=str(output),
        slide_width_pixels=300,
        slide_height_pixels=120,
        text_attribute_extractor=FontExtractor(),
        fail_fast=True,
    )

    with ZipFile(output) as archive:
        slide_xml = archive.read("ppt/slides/slide1.xml").decode("utf-8")

    assert '<a:latin typeface="方正书宋_GBK"/>' in slide_xml
    assert '<a:ea typeface="方正书宋_GBK"/>' in slide_xml
    assert 'spc="120"' in slide_xml
    assert '<a:gradFill' in slide_xml
    assert '<a:srgbClr val="F9E7A5"><a:alpha val="90000"/></a:srgbClr>' in slide_xml
    assert '<a:srgbClr val="B8892F"><a:alpha val="90000"/></a:srgbClr>' in slide_xml
    assert '<a:ln w="15875">' in slide_xml
    assert '<a:glow rad="50800">' in slide_xml
    assert '<a:outerShdw blurRad="38100" dist="25400" dir="2700000"' in slide_xml


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
    assert manifest["text_boxes"][0] == {
        **manifest["text_boxes"][0],
        "z_order": 1,
        "editable": True,
        "confidence": None,
        "render_decision": "editable_text_over_clean_region",
        "fallback_reason": None,
        "editable_text_added": True,
    }
    assert manifest["elements"][0]["id"] == "text_0"
    assert all(isinstance(value, bool) for value in manifest["quality_checks"].values())
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


def test_rebuild_validation_rejects_raster_text_region_with_editable_text():
    validation = ExportService._validate_page_rebuild_manifest({
        "background_strategy": {"mode": "source-preserving-local-cleanup"},
        "quality_checks": {
            "font_size_calibrated": True,
            "visual_inventory_matched": True,
            "background_strategy_checked": True,
            "shape_corner_geometry_checked": True,
        },
        "elements": [{
            "id": "complex_0",
            "z_order": 1,
            "editable": False,
            "confidence": 0.8,
            "render_decision": "raster_region_with_text",
            "fallback_reason": "missing_inpainted_background",
            "editable_text_added": True,
        }],
        "text_boxes": [],
        "images": [],
    })

    assert validation["passed"] is False
    assert any("重复文字" in error for error in validation["errors"])


def test_complex_raster_fallback_suppresses_descendant_editable_text(tmp_path):
    background = tmp_path / "slide.png"
    region = tmp_path / "complex-region.png"
    output = tmp_path / "complex-fallback.pptx"
    Image.new("RGB", (300, 120), "white").save(background)
    Image.new("RGB", (130, 80), "gray").save(region)
    editable = EditableImageStub(str(background))
    child = EditableImageStub.Element(
        str(region),
        element_id="nested_text",
        content="must not be duplicated",
        bbox=EditableImageStub.BBox(20, 20, 120, 45),
    )
    parent = EditableImageStub.Element(
        str(region),
        element_id="complex_0",
        content=None,
        bbox=EditableImageStub.BBox(10, 10, 140, 90),
        element_type="image",
    )
    parent.children = [child]
    parent.inpainted_background_path = None
    editable.elements = [parent]

    _, warnings = ExportService.create_editable_pptx_with_recursive_analysis(
        editable_images=[editable],
        output_file=str(output),
        slide_width_pixels=300,
        slide_height_pixels=120,
        fail_fast=True,
    )

    manifest_dir = Path(warnings.rebuild_artifacts_dir) / "page_001"
    manifest = json.loads((manifest_dir / "manifest.json").read_text(encoding="utf-8"))
    validation = json.loads((manifest_dir / "validation.json").read_text(encoding="utf-8"))
    decisions = {item["id"]: item for item in manifest["elements"]}

    assert decisions["complex_0"]["render_decision"] == "raster_region_with_text"
    assert decisions["complex_0"]["fallback_reason"] == "missing_inpainted_background"
    assert decisions["complex_0"]["editable_text_added"] is False
    assert decisions["nested_text"]["render_decision"] == "skipped_due_parent_raster_fallback"
    assert decisions["nested_text"]["editable_text_added"] is False
    assert validation == {"passed": True, "errors": []}

    with ZipFile(output) as archive:
        slide_xml = archive.read("ppt/slides/slide1.xml").decode("utf-8")
    assert "must not be duplicated" not in slide_xml


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


def test_formula_inventory_matches_actual_readable_text_fallback(tmp_path):
    background = tmp_path / "slide.png"
    output = tmp_path / "formula-fallback.pptx"
    Image.new("RGB", (300, 120), "white").save(background)
    editable = EditableImageStub(str(background))
    editable.elements = [
        EditableImageStub.Element(
            str(background),
            element_id="formula_unsupported",
            content=r"\unsupported{x}",
            element_type="equation",
        )
    ]

    _, warnings = ExportService.create_editable_pptx_with_recursive_analysis(
        editable_images=[editable],
        output_file=str(output),
        slide_width_pixels=300,
        slide_height_pixels=120,
        fail_fast=True,
    )

    manifest = json.loads(
        (Path(warnings.rebuild_artifacts_dir) / "page_001" / "manifest.json").read_text(encoding="utf-8")
    )
    formula = manifest["formula_inventory"][0]
    decision = next(item for item in manifest["elements"] if item["id"] == "formula_unsupported")

    assert formula["decision"] == "existing-formula-fallback"
    assert formula["editable"] is False
    assert decision["render_decision"] == "editable_text_over_clean_region"
    assert decision["fallback_reason"] == "unsupported_native_formula"
    assert decision["editable_text_added"] is True



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


def test_asset_sheet_opaque_matte_is_converted_to_transparency(tmp_path):
    icon_path = tmp_path / "icon.png"
    Image.new("RGB", (30, 30), "red").save(icon_path)
    editable = EditableImageStub(str(icon_path))
    editable.elements = [
        EditableImageStub.Element(
            str(icon_path), element_id="icon", content=None,
            element_type="image", is_icon=True,
        )
    ]

    class OpaqueMatteProvider:
        def generate_image(self, ref_images=None, **kwargs):
            from PIL import ImageDraw

            result = Image.new("RGB", ref_images[0].size, "white")
            ImageDraw.Draw(result).ellipse([16, 16, 38, 38], fill=(0, 128, 0))
            return result

    from services.export_service import ExportWarnings
    warnings = ExportWarnings()
    assets = ExportService._run_asset_sheet_separation(
        editable_img=editable,
        output_dir=tmp_path,
        high_fidelity_editable=True,
        image_editing_provider=OpaqueMatteProvider(),
        warnings=warnings,
    )

    asset = Image.open(assets["icon"]).convert("RGBA")
    assert asset.getchannel("A").getextrema()[0] == 0
    assert asset.getpixel((15, 15))[3] == 255
    assert warnings.other_warnings == []


def test_export_warnings_deduplicate_identical_messages():
    from services.export_service import ExportWarnings

    warnings = ExportWarnings()
    warnings.add_warning("same warning")
    warnings.add_warning("same warning")

    assert warnings.other_warnings == ["same warning"]


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


def test_high_fidelity_asset_sheet_creates_page_dir_with_external_background(tmp_path):
    background = tmp_path / "slide.png"
    clean_background = tmp_path / "clean.png"
    icon_path = tmp_path / "icon.png"
    output = tmp_path / "external-bg.pptx"
    Image.new("RGB", (300, 120), "white").save(background)
    Image.new("RGB", (300, 120), "white").save(clean_background)
    Image.new("RGBA", (30, 30), (255, 0, 0, 255)).save(icon_path)

    editable = EditableImageStub(str(background))
    editable.clean_background = str(clean_background)
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
        image_editing_provider=None,
        fail_fast=True,
    )

    page_dir = Path(warnings.rebuild_artifacts_dir) / "page_001"
    assert (page_dir / "foreground_asset_sheet.png").exists()
    assert (page_dir / "manifest.json").exists()
