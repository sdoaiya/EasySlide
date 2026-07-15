"""Page-role hints shared by image generation entry points."""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any, Mapping


ROLE_LABELS = {
    'cover': '封面页',
    'agenda': '目录页',
    'section': '章节分隔页',
    'data': '数据/图表页',
    'content': '普通内容页',
    'ending': '结束页',
}


def infer_image_page_role(page_index: int, total_pages: int, page_data: Mapping[str, Any] | None = None, part: str | None = None) -> str:
    """Infer a stable visual role without changing persisted page data."""
    index = max(1, int(page_index or 1))
    total = max(index, int(total_pages or index))
    data = page_data or {}
    title = str(data.get('title') or '').lower()
    points = ' '.join(str(item) for item in (data.get('points') or []))
    searchable = f'{title} {points}'.lower()

    if index == 1:
        return 'cover'
    if index == total:
        return 'ending'
    if any(token in searchable for token in ('目录', '目次', 'contents', 'agenda')):
        return 'agenda'
    if part and index > 1 and any(token in title for token in ('章节', '篇章', 'section', 'chapter')):
        return 'section'
    if any(token in searchable for token in ('数据', '指标', '图表', '业绩', '统计', 'dashboard', 'chart', 'kpi', 'data')):
        return 'data'
    return 'content'


def append_image_page_role_hint(requirements: str | None, role: str) -> str | None:
    """Append a non-destructive role constraint to existing image requirements."""
    base = (requirements or '').strip()
    label = ROLE_LABELS.get(role, ROLE_LABELS['content'])
    hint = (
        f'本页视觉角色：{label}。请保持参考模板的色彩、字体层级和留白语言，'
        f'并使用适合{label}的构图密度；不要把本页生成成其他页面角色。'
    )
    if hint in base:
        return base or None
    return f'{base}\n\n{hint}' if base else hint


def resolve_template_reference_path(template_pack_id: str | None, role: str, fallback_path: str | None) -> str | None:
    """Resolve a role-specific local reference when one exists, preserving legacy fallback."""
    if not template_pack_id or not template_pack_id.startswith('gorden-'):
        return fallback_path

    slug = template_pack_id.removeprefix('gorden-')
    roots = []
    configured_root = os.getenv('TEMPLATE_PACKS_DIR')
    if configured_root:
        roots.append(Path(configured_root))
    bundled_root = getattr(sys, '_MEIPASS', None)
    if bundled_root:
        roots.append(Path(bundled_root) / 'template-packs' / 'gorden')
    roots.append(Path(__file__).resolve().parents[2] / 'frontend' / 'public' / 'template-packs' / 'gorden')

    pack_dir = next((root / slug for root in roots if (root / slug).is_dir()), None)
    if not pack_dir:
        return fallback_path

    for filename in (f'{role}.webp', f'{role}.png', 'reference.webp', 'reference.png'):
        candidate = pack_dir / filename
        if candidate.is_file() and candidate.stat().st_size > 0:
            return str(candidate)
    return fallback_path
