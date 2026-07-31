from typing import Callable, Optional

from PIL import Image, ImageStat


class ImageQualityControlError(ValueError):
    """Raised when generated images repeatedly fail the optional review gate."""


def _format_review_failure(review: Optional[dict]) -> str:
    if not review:
        return '质量控制未通过'
    issues = review.get('issues') or []
    if isinstance(issues, str):
        issues = [issues]
    elif not isinstance(issues, list):
        issues = []
    reason = str(review.get('reason') or '').strip()
    details = '；'.join(str(issue).strip() for issue in issues if str(issue).strip())
    if reason and details:
        return f'{reason}（{details}）'
    return reason or details or '质量控制未通过'


def generate_image_until_quality_passes(
    generate_image: Callable[[], Optional[Image.Image]],
    review_image: Callable[[Image.Image], dict],
    *,
    enabled: bool = False,
    max_attempts: int = 3,
) -> Image.Image:
    """Generate an image and only return a reviewed version when the gate is enabled."""
    attempts = max(1, int(max_attempts)) if enabled else 1
    last_review = None
    last_error = None

    for _attempt in range(attempts):
        image = None
        try:
            image = generate_image()
            if image is None:
                raise ValueError('图片生成未返回结果')
            if not enabled:
                return image

            review = review_image(image)
            if not isinstance(review, dict):
                raise ValueError('图片质量检查返回了无效结果')
            last_review = review
            last_error = None
            if review.get('passed') is True:
                return image
        except Exception as exc:
            last_error = exc
            last_review = None
            if not enabled:
                raise
        if image is not None:
            image.close()

    if last_review:
        raise ImageQualityControlError(
            f'图片质量控制未通过：{_format_review_failure(last_review)}。请调整页面描述或提示词后重试。'
        )
    if last_error:
        raise ImageQualityControlError(
            f'图片质量控制失败：{last_error}。请调整页面描述或提示词后重试。'
        ) from last_error
    raise ImageQualityControlError('图片质量控制未通过。请调整页面描述或提示词后重试。')


QUALITY_REPAIR_CONSTRAINTS = {
    'aspect_ratio_mismatch': '严格输出与目标画幅一致的页面构图，保持整个页面边缘完整，不要输出方形或其他比例的画布。',
    'resolution_mismatch': '使用目标输出分辨率生成清晰的演示页面，避免低分辨率、缩略图或被放大的模糊画面。',
    'near_blank': '页面必须包含清晰可见的主体、层级和足够的视觉变化，不要输出空白页、纯白页或只有背景的页面。',
    'near_solid_color': '避免单一纯色铺满画面，加入与页面主题相关且边缘清晰的主体和信息层次。',
    'transparent_or_empty': '输出完整不透明的演示页面，填充背景并确保主体可见，不要输出透明画布或空图。',
}


def normalize_quality_issues(value):
    if not isinstance(value, (list, tuple, set)):
        return []
    return list(dict.fromkeys(
        str(issue).strip()
        for issue in value
        if str(issue).strip() in QUALITY_REPAIR_CONSTRAINTS
    ))


def build_quality_repair_requirements(value):
    issues = normalize_quality_issues(value)
    if not issues:
        return ''
    lines = [QUALITY_REPAIR_CONSTRAINTS[issue] for issue in issues]
    return (
        '\n\n质量检测修复要求（本次是针对上一版质量问题的重新生成，必须优先修复）：\n'
        + '\n'.join(f'- {line}' for line in lines)
    )


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
