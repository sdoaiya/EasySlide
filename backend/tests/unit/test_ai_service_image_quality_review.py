"""AI image review normalization tests."""

from unittest.mock import MagicMock

import pytest

from services.ai_service import AIService


def _service_with_review_result(result):
    service = AIService.__new__(AIService)
    service.generate_json_with_image = MagicMock(return_value=result)
    return service


def test_review_generated_slide_image_normalizes_provider_result():
    service = _service_with_review_result({
        'passed': 'yes',
        'issues': 'minor artifact',
        'reason': ' usable ',
    })

    review = service.review_generated_slide_image(
        'candidate.jpg',
        'generation prompt',
        'page description',
        page_outline={'title': 'Page'},
        page_index=2,
    )

    assert review == {
        'passed': True,
        'issues': ['minor artifact'],
        'reason': 'usable',
    }
    service.generate_json_with_image.assert_called_once()


def test_review_generated_slide_image_unwraps_single_item_list():
    service = _service_with_review_result([{'passed': 0, 'issues': [], 'reason': 'bad text'}])

    review = service.review_generated_slide_image('candidate.jpg', 'prompt', 'description')

    assert review['passed'] is False
    assert review['reason'] == 'bad text'


def test_review_generated_slide_image_rejects_non_object_result():
    service = _service_with_review_result('passed')

    with pytest.raises(ValueError, match='non-object'):
        service.review_generated_slide_image('candidate.jpg', 'prompt', 'description')
