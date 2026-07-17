from PIL import Image

from services.image_generation_quality import assess_generated_image, summarize_generation_quality


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
