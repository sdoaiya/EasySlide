"""
Unit tests for FileParserService provider-specific behavior.
"""

import os
import tempfile
import io
import json
import zipfile
import requests
from pathlib import Path
from unittest.mock import MagicMock, patch

from PIL import Image

from services.ai_providers.ocr.paddle_ocr_provider import PaddleOCRProvider
from services.file_parser_service import FileParserService


def _create_temp_image() -> str:
    with tempfile.NamedTemporaryFile(prefix='caption_test_', suffix='.png', delete=False) as tmp:
        Image.new('RGB', (20, 20), color='green').save(tmp.name)
        return tmp.name


def test_generate_single_caption_uses_provider_factory():
    """Caption generation should delegate to the provider factory's generate_with_image."""
    image_path = _create_temp_image()
    try:
        service = FileParserService(
            mineru_token='test-token',
            image_caption_model='gpt-4.1-mini',
            provider_format='openai',
        )

        mock_provider = MagicMock()
        mock_provider.generate_with_image.return_value = '示例描述'

        with patch('utils.path_utils.find_mineru_file_with_prefix', return_value=Path(image_path)):
            with patch.object(service, '_get_caption_provider', return_value=mock_provider):
                caption = service._generate_single_caption('/files/mineru/demo.png')

        assert caption == '示例描述'
        mock_provider.generate_with_image.assert_called_once()
        call_args = mock_provider.generate_with_image.call_args
        assert '描述' in call_args[0][0]
    finally:
        if os.path.exists(image_path):
            os.remove(image_path)


def test_can_generate_captions_returns_false_when_factory_fails():
    """_can_generate_captions should return False when the provider factory raises."""
    service = FileParserService(
        mineru_token='test-token',
        provider_format='lazyllm',
    )
    with patch(
        'services.file_parser_service.FileParserService._get_caption_provider',
        side_effect=ValueError("no key"),
    ):
        assert service._can_generate_captions() is False


def test_can_generate_captions_returns_true_when_factory_succeeds():
    """_can_generate_captions should return True when the provider factory returns a provider."""
    service = FileParserService(
        mineru_token='test-token',
        provider_format='openai',
    )
    mock_provider = MagicMock()
    with patch.object(service, '_get_caption_provider', return_value=mock_provider):
        assert service._can_generate_captions() is True


def test_generate_single_caption_vertex_uses_provider_factory():
    """Vertex provider should also go through the factory (the original bug)."""
    image_path = _create_temp_image()
    try:
        service = FileParserService(
            mineru_token='test-token',
            image_caption_model='gemini-2.0-flash',
            provider_format='vertex',
        )

        mock_provider = MagicMock()
        mock_provider.generate_with_image.return_value = '顶点描述'

        with patch('utils.path_utils.find_mineru_file_with_prefix', return_value=Path(image_path)):
            with patch.object(service, '_get_caption_provider', return_value=mock_provider):
                caption = service._generate_single_caption('/files/mineru/demo.png')

        assert caption == '顶点描述'
        mock_provider.generate_with_image.assert_called_once()
    finally:
        if os.path.exists(image_path):
            os.remove(image_path)


def test_download_markdown_uses_configured_upload_folder(tmp_path):
    service = FileParserService(
        mineru_token='test-token',
        provider_format='openai',
        upload_folder=tmp_path / 'runtime_uploads',
    )

    zip_bytes = io.BytesIO()
    with zipfile.ZipFile(zip_bytes, 'w') as z:
        z.writestr('full.md', '# ok')

    response = MagicMock()
    response.content = zip_bytes.getvalue()
    response.raise_for_status.return_value = None

    with patch.object(service, '_mineru_request', return_value=response):
        markdown, extract_id, error = service._download_markdown('https://example.test/result.zip')

    assert error is None
    assert markdown == '# ok'
    assert (tmp_path / 'runtime_uploads' / 'mineru_files' / extract_id / 'full.md').exists()


def test_mineru_requests_ignore_system_proxy_by_default(monkeypatch):
    monkeypatch.delenv('MINERU_USE_SYSTEM_PROXY', raising=False)

    service = FileParserService(mineru_token='test-token')

    assert service._mineru_session.trust_env is False


def test_mineru_requests_can_opt_into_system_proxy(monkeypatch):
    monkeypatch.setenv('MINERU_USE_SYSTEM_PROXY', 'true')

    service = FileParserService(mineru_token='test-token')

    assert service._mineru_session.trust_env is True


def test_download_markdown_retries_incomplete_download(tmp_path):
    service = FileParserService(
        mineru_token='test-token',
        provider_format='openai',
        upload_folder=tmp_path / 'runtime_uploads',
    )

    zip_bytes = io.BytesIO()
    with zipfile.ZipFile(zip_bytes, 'w') as z:
        z.writestr('full.md', '# retried')

    response = MagicMock()
    response.content = zip_bytes.getvalue()
    response.raise_for_status.return_value = None

    with (
        patch.object(
            service,
            '_mineru_request',
            side_effect=[
                requests.exceptions.ChunkedEncodingError('connection broken'),
                response,
            ],
        ) as request,
        patch('services.file_parser_service.time.sleep') as sleep,
    ):
        markdown, extract_id, error = service._download_markdown('https://example.test/result.zip')

    assert error is None
    assert markdown == '# retried'
    assert request.call_count == 2
    sleep.assert_called_once_with(2)
    assert (tmp_path / 'runtime_uploads' / 'mineru_files' / extract_id / 'full.md').exists()


def test_paddle_ocr_result_persists_images_and_rewrites_markdown_urls(tmp_path):
    response = MagicMock()
    response.text = json.dumps({
        'result': {
            'layoutParsingResults': [{
                'markdown': {
                    'text': '![图表](imgs/chart.png)',
                    'images': {'imgs/chart.png': 'data:image/png;base64,aW1hZ2U='},
                },
            }],
        },
    })
    response.raise_for_status.return_value = None
    image_dir = tmp_path / 'uploads' / 'mineru_files' / 'extract123'

    with patch('services.ai_providers.ocr.paddle_ocr_provider.requests.get', return_value=response):
        result = PaddleOCRProvider('token')._load_jsonl_result(
            'https://example.test/result.jsonl',
            image_dir=image_dir,
            image_url_prefix='/files/mineru/extract123',
        )

    assert result['markdown_content'] == '![图表](/files/mineru/extract123/imgs/chart.png)'
    assert (image_dir / 'imgs' / 'chart.png').read_bytes() == b'image'
