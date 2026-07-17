from PIL import ImageStat


def _expected_ratio(aspect_ratio):
    try:
        width, height = str(aspect_ratio).split(':', 1)
        return float(width) / float(height)
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def assess_generated_image(image, aspect_ratio=None, resolution_matches=True):
    """Return cheap, deterministic checks without rejecting usable generated images."""
    width, height = image.size
    issues = []
    checks = {
        'decodable': width > 0 and height > 0,
        'resolution_matches': bool(resolution_matches),
        'aspect_ratio_matches': True,
        'has_visible_content': True,
        'has_visual_variation': True,
    }

    expected = _expected_ratio(aspect_ratio)
    if expected and width > 0 and height > 0:
        actual = width / height
        checks['aspect_ratio_matches'] = abs(actual - expected) / expected <= 0.03
        if not checks['aspect_ratio_matches']:
            issues.append('aspect_ratio_mismatch')

    sample = image.copy()
    sample.thumbnail((96, 96))
    if 'A' in sample.getbands():
        alpha = ImageStat.Stat(sample.getchannel('A'))
        checks['has_visible_content'] = alpha.extrema[0][1] > 2
        if not checks['has_visible_content']:
            issues.append('transparent_or_empty')

    rgb = sample.convert('RGB')
    stats = ImageStat.Stat(rgb)
    checks['has_visual_variation'] = max(stats.stddev) >= 1.5
    if not checks['has_visual_variation']:
        brightness = sum(stats.mean) / len(stats.mean)
        issues.append('near_blank' if brightness >= 250 or brightness <= 5 else 'near_solid_color')

    if not checks['resolution_matches']:
        issues.append('resolution_mismatch')

    return {
        'status': 'passed' if not issues else 'warning',
        'width': width,
        'height': height,
        'checks': checks,
        'issues': issues,
    }


def summarize_generation_quality(pages):
    issue_counts = {}
    checked = 0
    warnings = 0
    for page in pages or []:
        qa = page.get('qa') if isinstance(page, dict) else None
        if not isinstance(qa, dict):
            continue
        checked += 1
        if qa.get('status') == 'warning':
            warnings += 1
        for issue in qa.get('issues') or []:
            issue_counts[issue] = issue_counts.get(issue, 0) + 1
    return {
        'checked': checked,
        'passed': checked - warnings,
        'warnings': warnings,
        'issue_counts': issue_counts,
    }
