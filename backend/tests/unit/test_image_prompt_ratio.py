"""Test that image generation prompt uses the correct aspect ratio."""
from services.prompts import get_image_generation_prompt


class TestImagePromptAspectRatio:
    def test_default_ratio_is_16_9(self):
        prompt = get_image_generation_prompt(
            page_desc="Test page",
            outline_text="Test outline",
            current_section="Section 1",
        )
        assert "16:9比例" in prompt

    def test_custom_ratio_4_3(self):
        prompt = get_image_generation_prompt(
            page_desc="Test page",
            outline_text="Test outline",
            current_section="Section 1",
            aspect_ratio="4:3",
        )
        assert "4:3比例" in prompt
        assert "16:9比例" not in prompt

    def test_custom_ratio_1_1(self):
        prompt = get_image_generation_prompt(
            page_desc="Test page",
            outline_text="Test outline",
            current_section="Section 1",
            aspect_ratio="1:1",
        )
        assert "1:1比例" in prompt
        assert "16:9比例" not in prompt

    def test_default_prompt_avoids_over_rendering_language(self):
        prompt = get_image_generation_prompt(
            page_desc="Test page",
            outline_text="Test outline",
            current_section="Section 1",
        )

        assert "单一清晰的视觉焦点" in prompt
        assert "次要物体不超过三个" in prompt
        assert "现实尺度" in prompt
        assert "文字清晰锐利" in prompt
        assert "4K分辨率" not in prompt
        assert "最完美的构图" not in prompt

    def test_template_prompt_preserves_layout_while_allowing_palette_variant(self):
        prompt = get_image_generation_prompt(
            page_desc="Test page",
            outline_text="Test outline",
            current_section="Section 1",
            has_template=True,
        )

        assert "复用模板图片的版式结构" in prompt
        assert "配色可由额外要求中的模板配色变体替换" in prompt
        assert "配色和设计语言和模板图片严格相似" not in prompt
