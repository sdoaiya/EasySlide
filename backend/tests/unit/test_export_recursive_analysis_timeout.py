import time

import pytest
from PIL import Image

from services.export_service import ExportError, ExportService


class _SlowImageEditabilityService:
    def __init__(self, _config):
        pass

    def make_image_editable(self, _image_path):
        time.sleep(0.2)
        raise AssertionError("analysis should have timed out first")


def test_recursive_analysis_reports_stalled_layout_analysis(tmp_path, monkeypatch):
    image_path = tmp_path / "slide.png"
    Image.new("RGB", (120, 80), "white").save(image_path)
    progress_events = []

    monkeypatch.setattr(
        "services.image_editability.ServiceConfig.from_defaults",
        lambda **_kwargs: object(),
    )
    monkeypatch.setattr(
        "services.image_editability.ImageEditabilityService",
        _SlowImageEditabilityService,
    )

    with pytest.raises(ExportError) as exc_info:
        ExportService.create_editable_pptx_with_recursive_analysis(
            image_paths=[str(image_path)],
            max_workers=1,
            progress_callback=lambda step, message, percent: progress_events.append(
                (step, message, percent)
            ),
            analysis_status_interval_seconds=0.01,
            analysis_stall_timeout_seconds=0.03,
        )

    assert exc_info.value.error_type == "layout_analysis"
    assert "版面分析超过" in exc_info.value.message
    assert any("仍在分析" in message for _step, message, _percent in progress_events)
