import pytest
from PIL import Image

from services.image_generation_quality import (
    ImageQualityControlError,
    assess_generated_image,
    build_quality_repair_requirements,
    generate_image_until_quality_passes,
    normalize_quality_issues,
    summarize_generation_quality,
)


def test_quality_repair_constraints_are_whitelisted_and_actionable():
    issues = normalize_quality_issues([
        'near_blank',
        'near_blank',
        'unknown-injected-text',
        'resolution_mismatch',
    ])

    assert issues == ['near_blank', 'resolution_mismatch']
    requirements = build_quality_repair_requirements(issues)
    assert '质量检测修复要求' in requirements
    assert '不要输出空白页' in requirements
    assert '低分辨率' in requirements
    assert 'unknown-injected-text' not in requirements


def test_quality_check_passes_non_blank_matching_image():
    image = Image.new('RGB', (1600, 900), 'white')
    for x in range(800):
        for y in range(450):
            image.putpixel((x, y), (20, 80, 160))

    result = assess_generated_image(image, '16:9')

    assert result['status'] == 'passed'
    assert result['issues'] == []
    assert result['checks']['aspect_ratio_matches'] is True


def test_quality_check_warns_for_blank_and_wrong_aspect_ratio():
    result = assess_generated_image(Image.new('RGB', (1000, 1000), 'white'), '16:9')

    assert result['status'] == 'warning'
    assert 'aspect_ratio_mismatch' in result['issues']
    assert 'near_blank' in result['issues']


def test_quality_check_warns_for_fully_transparent_image():
    result = assess_generated_image(Image.new('RGBA', (1600, 900), (1, 2, 3, 0)), '16:9')

    assert result['status'] == 'warning'
    assert 'transparent_or_empty' in result['issues']


def test_quality_check_records_resolution_warning():
    image = Image.new('RGB', (1600, 900), 'white')
    image.paste((0, 0, 0), (0, 0, 800, 450))

    result = assess_generated_image(image, '16:9', resolution_matches=False)

    assert result['status'] == 'warning'
    assert 'resolution_mismatch' in result['issues']


def test_quality_summary_ignores_pages_without_checks_and_counts_issues():
    summary = summarize_generation_quality([
        {'qa': {'status': 'passed', 'issues': []}},
        {'qa': {'status': 'warning', 'issues': ['near_blank', 'resolution_mismatch']}},
        {'status': 'failed'},
    ])

    assert summary == {
        'checked': 2,
        'passed': 1,
        'warnings': 1,
        'issue_counts': {'near_blank': 1, 'resolution_mismatch': 1},
    }


def test_quality_gate_skips_review_when_disabled():
    generated = Image.new('RGB', (16, 9), 'blue')
    reviews = []

    result = generate_image_until_quality_passes(
        generate_image=lambda: generated,
        review_image=lambda image: reviews.append(image) or {'passed': False},
        enabled=False,
    )

    assert result is generated
    assert reviews == []


def test_quality_gate_retries_until_review_passes():
    generated = [
        Image.new('RGB', (16, 9), 'red'),
        Image.new('RGB', (16, 9), 'green'),
    ]
    reviews = iter([
        {'passed': False, 'issues': ['文字乱码'], 'reason': '文字不可读'},
        {'passed': True, 'issues': [], 'reason': '可用'},
    ])

    result = generate_image_until_quality_passes(
        generate_image=lambda: generated.pop(0),
        review_image=lambda _image: next(reviews),
        enabled=True,
        max_attempts=3,
    )

    assert result.getpixel((0, 0)) == (0, 128, 0)


def test_quality_gate_raises_actionable_error_after_max_attempts():
    attempts = 0

    def generate():
        nonlocal attempts
        attempts += 1
        return Image.new('RGB', (16, 9), 'red')

    with pytest.raises(ImageQualityControlError, match='文字不可读'):
        generate_image_until_quality_passes(
            generate_image=generate,
            review_image=lambda _image: {
                'passed': False,
                'issues': ['文字乱码'],
                'reason': '文字不可读',
            },
            enabled=True,
            max_attempts=3,
        )

    assert attempts == 3
