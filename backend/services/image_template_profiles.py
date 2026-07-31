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

ROLE_HINTS = {
    'cover': '低密度、大标题、强主视觉，突出主题和副标题；主体尽量位于画面中央安全区，给标题和副标题留出干净空间，避免堆满小字。',
    'agenda': '清晰目录结构，使用编号、章节卡片或时间线，层级明确。',
    'section': '大标题、少量关键词和过渡视觉，形成章节分隔感。',
    'data': '信息密度遵循结构化设置，优先使用 KPI、图表或对比结构，禁止占位符和虚构数据。',
    'content': '信息密度遵循结构化设置，按内容选择图文并列、流程、对比或矩阵结构，避免单调三卡片重复。',
    'ending': '总结、结论和下一步行动明确，画面收束，避免生成新的正文分析页。',
}

GORDEN_TEMPLATE_VISUAL_PROFILES = {
    'minimal-business-summary': '极简商务总结风：深蓝白配色、留白充足、清晰章节编号、细线分割、克制图标和稳重标题层级。',
    'red-patriot-youth': '新时代红色教育风：党政红与金色点缀、飘带和传统纹样、庄重但年轻化，避免卡通化和娱乐化。',
    'cute-orange-class': '暖橙卡通教学风：手绘插画、圆润卡片、亲和活泼、低压教学氛围，保持文字清晰可读。',
    'quarterly-illust': '蓝灰酸性插画风：Y2K 互联网感、蓝色强调、黑白插画、轻微实验感构图，避免杂乱涂鸦。',
    'geometric-summary': '多彩几何工作总结风：几何切片、强对比色块、结构化数字视觉、活力但保持商务可读性。',
    'red-patriot-general': '红色爱国通用风：党政红、金色书法、绸缎飘带、正式庄重，适合主题教育和汇报场景。',
    'red-teaching-framework': '高级红色教学框架风：红色教学图解、流程链路、模块分层、较高信息密度，逻辑关系清楚。',
    'red-teaching-models': '红色数智教学图解风：漏斗、齿轮、鱼骨、放射图等模型化表达，正式且具有数智教育感。',
    'thesis-novice': '墨绿学术方法论风：克制稳重、方法论框架、适中信息密度、学术答辩式标题和小节结构。',
    'premium-corp': '高级大厂商务风：酱红与深蓝灰、战略运营表达、强层级卡片、质感背景和克制装饰。',
    'architecture-deck': '深蓝架构图风：系统拓扑、流程关系、节点连线、技术蓝白配色，强调结构和工程可信度。',
    'mckinsey-style': '麦肯锡咨询风：金字塔逻辑、漏斗和对比结构、专业克制配色、结论先行的信息表达。',
    'report-massive-models': '深蓝复盘模型风：SWOT、PDCA、鱼骨、复盘矩阵，商务蓝白底，模型关系明确。',
    'report-massive-charts': '深蓝数据业绩风：漏斗、树状、齿轮、财务销售分析图，数据表达清晰且商务克制。',
    'thesis-formula': '暖米色学术公式风：暖米背景、深蓝正文、研究意义、现状、方法结构，正式但不沉闷。',
    'top-thesis': '酒红名校开题风：酒红学术、正式稳重、章节公式清晰，避免商业海报感。',
    'data-viz-deck': '数据可视化风：深蓝与砖红、数据仪表盘、KPI、折线柱状饼图和指标卡，深色高对比但文字必须清晰。',
    'report-massive-reports': '深蓝工作汇报风：工作汇报、竞聘述职、金字塔逻辑、稳重商务蓝白版式。',
    'report-savior': '综合商业汇报风：深蓝亮红、商业全场景、丰富逻辑图解、强标题和明确结论。',
    'operations-deck': '运营产品汇报风：深蓝亮蓝、私域运营、产品运营、数据看板、流程和增长指标并重。',
    'competition-speech': '竞聘述职风：深蓝砖红、晋升答辩、项目复盘、成果指标和能力模型表达清楚。',
}

LAYOUT_FAMILY_HINTS = {
    'hero': '主视觉封面：大标题与单一视觉焦点，避免卡片堆叠',
    'numbered_index': '编号目录：使用清晰编号和章节分组',
    'chapter_marker': '章节标记：大章节号、短标题与充足留白',
    'timeline': '时间线 timeline：沿单一方向组织阶段、日期和里程碑',
    'process': '流程 process：使用有方向的步骤链路和箭头关系',
    'comparison': '对比 comparison：使用左右或上下对照，保持维度一致',
    'matrix': '矩阵 matrix：使用二维象限或规则网格组织分类',
    'funnel': '漏斗 funnel：按层级或转化阶段逐级收敛',
    'dashboard': '仪表盘 dashboard：突出 KPI、图表和关键结论',
    'split_visual': '图文分栏 split visual：主图与文字形成明确主次',
    'bento': '模块化 bento：使用不同尺度的信息模块形成节奏',
    'summary_actions': '总结行动：聚合核心结论与下一步行动',
}

ROLE_LAYOUT_FAMILIES = {
    'cover': ('hero',),
    'agenda': ('numbered_index', 'timeline'),
    'section': ('chapter_marker',),
    'data': ('dashboard', 'comparison', 'funnel'),
    'content': ('split_visual', 'bento', 'process', 'comparison', 'matrix'),
    'ending': ('summary_actions',),
}

LAYOUT_KEYWORDS = (
    ('timeline', ('时间线', '里程碑', '阶段', '历程', 'timeline', 'milestone')),
    ('process', ('流程', '步骤', '路径', '链路', 'process', 'workflow')),
    ('comparison', ('对比', '比较', '差异', '优劣', 'comparison', 'versus', ' vs ')),
    ('matrix', ('矩阵', '象限', 'swot', 'matrix', 'quadrant')),
    ('funnel', ('漏斗', '转化', 'funnel', 'conversion')),
    ('dashboard', ('指标', '数据', '业绩', 'kpi', 'dashboard', 'metrics')),
)


def infer_image_layout_family(
    role: str,
    page_index: int,
    page_data: Mapping[str, Any] | None = None,
) -> str:
    """Choose a stable layout while varying adjacent pages of the same role."""
    data = page_data or {}
    searchable = ' '.join((
        str(data.get('title') or ''),
        ' '.join(str(item) for item in (data.get('points') or [])),
    )).lower()
    for family, keywords in LAYOUT_KEYWORDS:
        if any(keyword in searchable for keyword in keywords):
            return family
    families = ROLE_LAYOUT_FAMILIES.get(role, ROLE_LAYOUT_FAMILIES['content'])
    return families[(max(1, int(page_index or 1)) - 1) % len(families)]


def append_image_layout_hint(requirements: str | None, layout_family: str) -> str | None:
    """Append one layout constraint without duplicating it on retries."""
    base = (requirements or '').strip()
    detail = LAYOUT_FAMILY_HINTS.get(layout_family)
    if not detail:
        return base or None
    hint = f'本页版式家族：{layout_family}。{detail}。不得退化为连续页面重复的通用三卡片布局。'
    if hint in base:
        return base or None
    return f'{base}\n\n{hint}' if base else hint


def has_gorden_template_pack(template_pack_id: str | None) -> bool:
    """Return whether a bundled Gorden pack can provide image-mode visual guidance."""
    if not template_pack_id or not template_pack_id.startswith('gorden-'):
        return False
    return template_pack_id.removeprefix('gorden-') in GORDEN_TEMPLATE_VISUAL_PROFILES


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
    role_hint = ROLE_HINTS.get(role, ROLE_HINTS['content'])
    hint = (
        f'本页视觉角色：{label}。请保持参考模板的色彩、字体层级和留白语言，'
        f'并使用适合{label}的构图密度。{role_hint}不要把本页生成成其他页面角色。'
    )
    if hint in base:
        return base or None
    return f'{base}\n\n{hint}' if base else hint


def append_template_visual_profile_hint(requirements: str | None, template_pack_id: str | None) -> str | None:
    """Append a structured visual DNA hint for bundled image-mode template packs."""
    base = (requirements or '').strip()
    if not template_pack_id or not template_pack_id.startswith('gorden-'):
        return base or None

    slug = template_pack_id.removeprefix('gorden-')
    profile = GORDEN_TEMPLATE_VISUAL_PROFILES.get(slug)
    if not profile:
        return base or None

    hint = (
        f'模板视觉DNA：{profile}'
        '生成时必须把它作为整页图片的视觉骨架，优先保持模板的色彩、版式密度、图表语言、标题层级和留白节奏；'
        '只替换为当前页面内容，不复制模板示例文字。'
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
