import io
from pathlib import Path

import fitz
from PIL import Image
from pptx import Presentation

from services.export_service import ExportService
from utils.pptx_builder import PPTXBuilder


def _make_image(path):
    image = Image.new("RGB", (320, 180), "white")
    image.save(path, format="JPEG")


def test_health_and_root_endpoints_use_easyslide_brand(client):
    health_response = client.get("/health")
    root_response = client.get("/")

    assert health_response.status_code == 200
    assert root_response.status_code == 200

    health_data = health_response.get_json()
    root_data = root_response.get_json()

    assert health_data["message"] == "EasySlide API is running"
    assert "Banana" not in health_data["message"]
    assert root_data["name"] == "EasySlide API"
    assert "EasySlide" in root_data["description"]
    assert "Banana" not in root_data["name"]


def test_exported_pptx_metadata_uses_easyslide(tmp_path):
    image_path = tmp_path / "slide.jpg"
    _make_image(image_path)

    pptx_bytes = ExportService.create_pptx_from_images([str(image_path)])
    prs = Presentation(io.BytesIO(pptx_bytes))

    assert prs.core_properties.author == "easyslide"
    assert prs.core_properties.last_modified_by == "easyslide"


def test_editable_pptx_builder_metadata_uses_easyslide():
    builder = PPTXBuilder()
    prs = builder.create_presentation()

    assert prs.core_properties.author == "easyslide"
    assert prs.core_properties.last_modified_by == "easyslide"


def test_exported_pdf_metadata_uses_easyslide():
    source_doc = fitz.open()
    source_doc.new_page()
    pdf_bytes = source_doc.tobytes()
    source_doc.close()

    branded_bytes = ExportService._add_pdf_metadata(pdf_bytes)
    branded_doc = fitz.open(stream=branded_bytes, filetype="pdf")
    metadata = branded_doc.metadata
    xmp = branded_doc.get_xml_metadata()
    branded_doc.close()

    assert metadata["author"] == "easyslide"
    assert metadata["producer"] == "easyslide"
    assert metadata["creator"] == "easyslide"
    assert "easyslide" in xmp
    assert "banana-slides" not in xmp


def test_backend_start_scripts_use_easyslide_brand():
    backend_dir = Path(__file__).resolve().parents[2]

    for script_name in ("run.bat", "run.sh"):
        script_text = (backend_dir / script_name).read_text(encoding="utf-8")
        assert "EasySlide API Server" in script_text
        assert "Banana Slides" not in script_text
        assert "🍌" not in script_text
