"""Validation and lookup for the native slide layout contract."""

import json
import sys
from copy import deepcopy
from pathlib import Path


_root = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parents[2]))
DEFAULT_MANIFEST = _root / 'shared' / 'native-deck' / 'layout-manifest.json'
NATIVE_METADATA_FIELDS = {'__media_prompts', '__unmapped_content', '__animation', '__design_intent'}

PAGE_KIND_ROLE_MAP = {
    'data': ('data', 'metrics', 'trend', 'distribution', 'report'),
    'process': ('process', 'actions', 'breakdown'),
    'case': ('case', 'statement', 'report'),
    'image': ('image', 'case', 'statement'),
    'comparison': ('comparison', 'relationship', 'distribution'),
    'risk': ('risks', 'breakdown', 'context'),
    'quote': ('quote', 'statement', 'context'),
    'timeline': ('timeline', 'process', 'actions'),
    'funnel': ('funnel', 'process', 'distribution'),
    'architecture': ('architecture', 'relationship', 'breakdown'),
    'profile': ('profile', 'case', 'statement'),
    'closing': ('closing', 'actions', 'result', 'end'),
    'cover': ('cover',),
    'content': ('statement', 'context', 'breakdown', 'report'),
}

PAGE_KIND_KEYWORDS = (
    ('risk', ('风险', '问题', '挑战', '瓶颈', '限制', '合规', '边界', 'risk', 'issue')),
    ('quote', ('引用', '金句', '原话', '访谈', '观点摘录', 'quote', 'quotation')),
    ('timeline', ('时间轴', '历程', '里程碑', '年度计划', '季度计划', 'timeline', 'milestone')),
    ('funnel', ('漏斗', '转化', '筛选', '转化率', 'funnel', 'conversion')),
    ('architecture', ('架构', '体系', '层级', '模块关系', 'architecture', 'system layers')),
    ('profile', ('人物', '团队成员', '负责人', '专家介绍', 'profile', 'biography')),
    ('process', ('流程', '步骤', '路径', '机制', '路线', '阶段', '节奏', '推进', '闭环', 'process', 'roadmap', 'timeline')),
    ('data', ('数据', '指标', '趋势', '增长', '下降', '占比', '比例', '分布', '榜单', '金额', '同比', '环比', '图表', '统计', 'score', 'metric', 'data')),
    ('image', ('图片', '照片', '视觉', '素材', '产品图', '展示', '海报', 'image', 'photo', 'visual')),
    ('case', ('案例', '客户', '项目', '实践', '场景', '样板', '试点', 'case', 'customer')),
    ('comparison', ('对比', '比较', '差异', '矩阵', '关系', '协同', '选择', 'comparison', 'matrix')),
)

VISUAL_BRIEF_BY_PAGE_KIND = {
    'cover': {
        'information_focus': 'theme',
        'composition': 'hero',
        'media_direction': 'dominant',
        'motion_direction': 'establishing',
    },
    'closing': {
        'information_focus': 'conclusion',
        'composition': 'closure',
        'media_direction': 'minimal',
        'motion_direction': 'settling',
    },
    'data': {
        'information_focus': 'data',
        'composition': 'comparison',
        'media_direction': 'minimal',
        'motion_direction': 'revealing',
    },
    'process': {
        'information_focus': 'process',
        'composition': 'sequence',
        'media_direction': 'supportive',
        'motion_direction': 'progressive',
    },
    'case': {
        'information_focus': 'evidence',
        'composition': 'spotlight',
        'media_direction': 'supportive',
        'motion_direction': 'revealing',
    },
    'image': {
        'information_focus': 'visual',
        'composition': 'spotlight',
        'media_direction': 'dominant',
        'motion_direction': 'revealing',
    },
    'comparison': {
        'information_focus': 'difference',
        'composition': 'comparison',
        'media_direction': 'minimal',
        'motion_direction': 'revealing',
    },
    'risk': {
        'information_focus': 'risk',
        'composition': 'hierarchy',
        'media_direction': 'minimal',
        'motion_direction': 'progressive',
    },
    'quote': {
        'information_focus': 'voice',
        'composition': 'editorial',
        'media_direction': 'minimal',
        'motion_direction': 'revealing',
    },
    'timeline': {
        'information_focus': 'time',
        'composition': 'sequence',
        'media_direction': 'minimal',
        'motion_direction': 'progressive',
    },
    'funnel': {
        'information_focus': 'conversion',
        'composition': 'hierarchy',
        'media_direction': 'minimal',
        'motion_direction': 'progressive',
    },
    'architecture': {
        'information_focus': 'system',
        'composition': 'hierarchy',
        'media_direction': 'minimal',
        'motion_direction': 'revealing',
    },
    'profile': {
        'information_focus': 'person',
        'composition': 'spotlight',
        'media_direction': 'supportive',
        'motion_direction': 'revealing',
    },
    'content': {
        'information_focus': 'message',
        'composition': 'hierarchy',
        'media_direction': 'supportive',
        'motion_direction': 'revealing',
    },
}

VISUAL_SYSTEM_BY_PAGE_KIND = {
    'cover': 'editorial',
    'closing': 'editorial',
    'data': 'signal',
    'process': 'route',
    'case': 'spotlight',
    'image': 'spotlight',
    'comparison': 'contrast',
    'risk': 'caution',
    'quote': 'editorial',
    'timeline': 'route',
    'funnel': 'route',
    'architecture': 'contrast',
    'profile': 'spotlight',
    'content': 'editorial',
}

class NativeDeckService:
    def __init__(self, manifest_path=None):
        manifest = json.loads(Path(manifest_path or DEFAULT_MANIFEST).read_text(encoding='utf-8'))
        layouts = manifest.get('layouts', [])
        self._layouts = {item['layout']: item for item in layouts}
        if len(self._layouts) != len(layouts):
            raise ValueError('布局 ID 不能重复')

    def list_layouts(self, role=None, needs_media=None, theme=None):
        layouts = list(self._layouts.values())
        if theme:
            layouts = [item for item in layouts if item['theme'] == theme]
        if role:
            if role == 'content':
                layouts = [item for item in layouts if 'cover' not in item['roles']]
            elif role == 'end':
                layouts = [item for item in layouts if 'end' in item['roles'] or 'closing' in item['roles']]
            else:
                layouts = [item for item in layouts if role in item['roles']]
        if needs_media is not None:
            layouts = [item for item in layouts if bool(item['mediaSlots']) is needs_media]
        return layouts

    def resolve_theme(self, preferred=None, layout_ids=None, default='theme01'):
        """Resolve a usable native theme, preserving an existing page theme for old projects."""
        if preferred and self.list_layouts(theme=preferred):
            return preferred
        for layout_id in layout_ids or []:
            if not layout_id:
                continue
            try:
                return self._get_layout(layout_id)['theme']
            except ValueError:
                continue
        if default and self.list_layouts(theme=default):
            return default
        first = next(iter(self._layouts.values()), None)
        return first['theme'] if first else default

    def build_page_plan(self, *, outline=None, role='content'):
        """Classify a page before asking the model, following the Huashu planning-first flow."""
        context = self._outline_context(outline)
        page_kind = self._page_kind(context, role)
        preferred_roles = list(PAGE_KIND_ROLE_MAP.get(page_kind, PAGE_KIND_ROLE_MAP['content']))
        text = self._context_text(context)
        needs_media = page_kind == 'image' or any(token in text for token in ('图片', '照片', '视觉', '素材', '产品图', 'image', 'photo', 'visual'))
        density = 'high' if len(context['points']) >= 5 else 'medium' if len(context['points']) >= 3 else 'low'
        visual_brief = VISUAL_BRIEF_BY_PAGE_KIND.get(page_kind, VISUAL_BRIEF_BY_PAGE_KIND['content'])
        return {
            'design_engine': 'huashu_dashi_native',
            'page_kind': page_kind,
            'preferred_roles': preferred_roles,
            'needs_media': needs_media,
            'content_density': density,
            'page_goal': self._page_goal(page_kind),
            **visual_brief,
            'visual_system': VISUAL_SYSTEM_BY_PAGE_KIND.get(page_kind, 'editorial'),
            'quality_checks': ['single_message', 'no_template_copy', 'contract_safe'],
        }

    def select_layout_candidates(self, *, theme=None, role='content', outline=None, used_layouts=None, recent_layouts=None, limit=8):
        """Return a small, intent-matched Dashi candidate set for one native page."""
        plan = self.build_page_plan(outline=outline, role=role)
        themed = self.list_layouts(role=role, theme=theme) or self.list_layouts(theme=theme)
        if not themed:
            return []
        used = set(used_layouts or [])
        recent = list(recent_layouts or [])[-3:]
        alternatives = [item for item in themed if item.get('layout') != recent[-1]] if recent else []
        if alternatives:
            themed = alternatives

        def score(layout):
            roles = set(layout.get('roles') or [])
            layout_id = layout.get('layout')
            value = 0
            for index, preferred in enumerate(plan['preferred_roles']):
                if preferred in roles:
                    value += max(4, 24 - index * 3)
            has_media = bool(layout.get('mediaSlots'))
            if plan['needs_media'] and has_media:
                value += 18
            elif not plan['needs_media'] and not has_media:
                value += 6
            elif not plan['needs_media'] and has_media:
                value -= 14
            value += min(len(layout.get('propShapes') or {}), 12)
            if layout_id in used:
                value -= 4
            if layout_id in recent:
                value -= 18
            if recent and layout_id == recent[-1]:
                value -= 42
            return value

        return sorted(themed, key=lambda item: (-score(item), item.get('layout', '')))[:limit]

    def build_deck_design_plan(self, *, outlines=None, theme=None, style_hint=None, project_topic=None):
        """Create one deterministic Huashu brief shared by every page in a deck."""
        source = list(outlines or [])
        page_plans = []
        for index, outline in enumerate(source):
            role = 'cover' if index == 0 else 'end' if index == len(source) - 1 else 'content'
            page_plans.append(self.build_page_plan(outline=outline, role=role))
        visual_sequence = [plan['visual_system'] for plan in page_plans]
        return {
            'design_engine': 'huashu_native' if theme == 'core01' else 'huashu_dashi_native',
            'project_topic': (project_topic or '').strip(),
            'theme': theme,
            'style_direction': (style_hint or '').strip(),
            'page_count': len(source),
            'narrative_arc': ['establish', 'develop', 'resolve'],
            'visual_sequence': visual_sequence,
            'layout_rhythm': '同一布局不连续出现；相邻页面在构图或信息密度上至少有一项变化；内容匹配优先于机械去重',
            'typography_system': '标题、正文、辅助信息保持三级层级，同级文字使用统一字号与字重',
            'color_system': '使用一个主强调色和一个辅助强调色，强调色只服务结论、数据和路径节点',
            'media_system': '只在图片能提供证据、场景或主体信息时使用，不用无意义装饰图填空',
            'quality_bar': ['single_message', 'deck_consistency', 'layout_variety', 'copy_fit', 'contract_safe'],
        }

    def evaluate_slide_quality(self, *, layout, props, outline=None, recent_layouts=None):
        """Return a compact, deterministic quality report for a generated slide."""
        self.validate_props(layout, props)
        context = self._outline_context(outline)
        rendered_text = json.dumps(props, ensure_ascii=False)
        covered = [point for point in context['points'] if point and point in rendered_text]
        coverage = 1.0 if not context['points'] else len(covered) / len(context['points'])
        issues = []
        if list(recent_layouts or [])[-1:] == [layout]:
            issues.append('consecutive_layout_repeat')
        if coverage < 0.5:
            issues.append('low_outline_coverage')
        contract = self._get_layout(layout)
        if any(slot.get('required') and self._is_empty_value(props.get(slot.get('key'))) for slot in contract.get('mediaSlots', [])):
            issues.append('missing_required_media')
        text_values = self._all_text_values(props)
        if sum(len(value) for value in text_values) > 650:
            issues.append('overloaded_page')
        if any(
            isinstance(value, list)
            and len([item for item in value if isinstance(item, str) and item]) != len(set(item for item in value if isinstance(item, str) and item))
            for value in props.values()
        ):
            issues.append('duplicated_list_content')
        return {
            'status': 'pass' if not issues else 'warning',
            'score': max(0, 100 - len(issues) * 15),
            'outline_coverage': round(coverage, 2),
            'issues': issues,
            'checks': ['contract_safe', 'layout_variety', 'outline_coverage', 'required_media', 'content_density', 'duplicate_content'],
        }

    @classmethod
    def _all_text_values(cls, value):
        if isinstance(value, str):
            return [value]
        if isinstance(value, list):
            return [item for child in value for item in cls._all_text_values(child)]
        if isinstance(value, dict):
            return [item for key, child in value.items() if not str(key).startswith('__') for item in cls._all_text_values(child)]
        return []

    def validate_props(self, layout, props):
        contract = self._get_layout(layout)
        if not isinstance(props, dict):
            raise ValueError('页面属性必须是对象')

        controls = {item.get('publicKey') or item['key']: item for item in contract.get('controls', [])}
        unknown = set(props) - set(contract['propShapes']) - set(controls) - NATIVE_METADATA_FIELDS
        if unknown:
            raise ValueError(f"未知字段: {', '.join(sorted(unknown))}")

        for key, value in props.items():
            if value is None:
                continue
            if key in NATIVE_METADATA_FIELDS:
                self._validate_metadata(key, value)
                continue
            if key in contract['propShapes']:
                self._validate_shape(key, value, contract['propShapes'][key], contract)
            else:
                self._validate_control(key, value, controls[key])

        for path, budget in contract.get('copyBudgets', {}).items():
            for value in self._path_values(props, path):
                if isinstance(value, str) and len(value) > budget['maxChars']:
                    raise ValueError(f'{path} 超出 {budget["maxChars"]} 字限制')
        if layout == 'core01_chart' and props.get('spec'):
            self._validate_flint_chart_spec(props['spec'])
        return True

    @staticmethod
    def _validate_flint_chart_spec(value):
        if not isinstance(value, str) or len(value) > 200_000:
            raise ValueError('spec 必须是 200KB 以内的 JSON 文本')
        try:
            spec = json.loads(value)
        except (TypeError, json.JSONDecodeError) as exc:
            raise ValueError('spec 不是有效 JSON') from exc
        data = spec.get('data') if isinstance(spec, dict) else None
        chart_spec = spec.get('chart_spec') if isinstance(spec, dict) else None
        has_data = isinstance(data, dict) and (
            isinstance(data.get('values'), list) or isinstance(data.get('url'), str)
        )
        if not has_data:
            raise ValueError('spec 缺少 data.values 或 data.url')
        if not isinstance(chart_spec, dict) or not isinstance(chart_spec.get('chartType'), str):
            raise ValueError('spec 缺少 chart_spec.chartType')
        if not isinstance(chart_spec.get('encodings'), dict):
            raise ValueError('spec 缺少 chart_spec.encodings')

    @staticmethod
    def _validate_metadata(key, value):
        if not isinstance(value, dict):
            raise ValueError(f'{key} 必须是对象')
        if key == '__media_prompts' and any(not isinstance(item_key, str) or not isinstance(item_value, str) for item_key, item_value in value.items()):
            raise ValueError('__media_prompts 必须使用文本键值')
        if len(json.dumps(value, ensure_ascii=False)) > 100_000:
            raise ValueError(f'{key} 内容过大')

    def normalize_slide(self, layout, props):
        self.validate_props(layout, props)
        contract = self._get_layout(layout)
        normalized = deepcopy(contract.get('defaultProps') or {})
        for key, value in props.items():
            if value is None and key in normalized:
                # Preserve a usable layout default when generation omits a field.
                continue
            if value is None:
                normalized[key] = self._blank_value(contract['propShapes'].get(key))
            elif self._is_empty_value(value) and key in normalized:
                # Keep the layout's usable default when a model omits a field
                # or returns an empty value. Explicit non-empty user content
                # still always wins.
                continue
            else:
                normalized[key] = value
        return {'layout': layout, 'theme': contract['theme'], 'props': normalized}

    @staticmethod
    def _is_empty_value(value):
        return value is None or value == '' or value == []

    def fill_outline_props(self, layout, props, outline):
        """Use page outline text as a safe fallback when the model returns sparse props."""
        if not isinstance(props, dict):
            props = {}
        contract = self._get_layout(layout)
        context = self._outline_context(outline)
        defaults = contract.get('defaultProps') or {}
        fallback = {
            key: self._outline_value_for_shape(key, shape, context, default_value=defaults.get(key))
            for key, shape in contract.get('propShapes', {}).items()
        }
        fallback = {
            key: value
            for key, value in fallback.items()
            if not self._is_empty_value(value)
        }
        merged = self._merge_missing_values(fallback, props)
        # 清洗模型返回的 media 值：非项目素材路径（外部 URL/文本）清为占位空串，
        # 否则 normalize 校验会让整页生成失败
        for key, shape in contract.get('propShapes', {}).items():
            if shape == 'media':
                value = merged.get(key)
                if isinstance(value, str) and value and not value.startswith(('/files/', 'data:', 'assets/')):
                    merged[key] = ''
            elif isinstance(shape, list) and 'media' in shape:
                values = merged.get(key)
                if isinstance(values, list):
                    merged[key] = [
                        item if (isinstance(item, str) and (not item or item.startswith(('/files/', 'data:', 'assets/')))) else ''
                        for item in values
                    ]
        for key, limits in contract.get('arrayLimits', {}).items():
            value = merged.get(key)
            if not isinstance(value, list) or not value:
                continue
            minimum = int(limits.get('min') or 0)
            maximum = int(limits.get('max') or len(value))
            value = value[:maximum]
            source = deepcopy(value)
            if all(isinstance(item, str) for item in value):
                for candidate in [*context['points'], context['title'], context['section']]:
                    if len(value) >= minimum:
                        break
                    if candidate and candidate not in value:
                        value.append(candidate)
            while len(value) < minimum:
                value.append(
                    f'{context["section"]} {len(value) + 1}'
                    if all(isinstance(item, str) for item in value)
                    else deepcopy(source[len(value) % len(source)])
                )
            merged[key] = value
        return merged

    def fit_copy_budgets(self, layout, props):
        """Trim model-generated copy to the selected layout's hard limits."""
        fitted = deepcopy(props)
        for path, budget in self._get_layout(layout).get('copyBudgets', {}).items():
            self._trim_path(fitted, path.split('.'), budget['maxChars'])
        return fitted

    def build_fallback_slide(self, *, outline=None, layout_candidates=None, design_intent=None):
        """Return a contract-safe editable slide when a model response cannot be used."""
        candidates = [item for item in layout_candidates or [] if isinstance(item, dict) and item.get('layout')]
        if not candidates:
            raise ValueError('没有可用原生布局可供回退')
        layout = candidates[0]['layout']
        intent = deepcopy(design_intent) if isinstance(design_intent, dict) else {}
        intent['generation_fallback'] = True
        props = self.fill_outline_props(layout, {}, outline)
        props['__design_intent'] = intent
        return self.normalize_slide(layout, self.fit_copy_budgets(layout, props))

    def build_design_intent(
        self,
        *,
        outline=None,
        theme=None,
        role='content',
        style_hint=None,
        project_topic=None,
        layout_candidates=None,
        deck_plan=None,
        page_index=None,
        recent_layouts=None,
    ):
        """Build a small Huashu-style planning brief for native Dashi generation."""
        context = self._outline_context(outline)
        candidates = layout_candidates if isinstance(layout_candidates, list) else []
        has_media = any(item.get('mediaSlots') for item in candidates if isinstance(item, dict))
        page_plan = self.build_page_plan(outline=outline, role=role)
        classic_native = theme == 'core01'
        page_plan['design_engine'] = 'huashu_native' if classic_native else 'huashu_dashi_native'
        visual_direction = (style_hint or '').strip() or (
            '采用 Huashu 的编辑型版式：先建立单一信息主张，再用标题、编号、规则线和留白建立阅读节奏；强调色只用于关键结论，不用装饰填空；优先使用清晰的结构块和可编辑文本，不做千篇一律的卡片堆叠'
            if classic_native else '跟随所选主题，保持克制、清晰、可编辑'
        )
        role_label = {
            'cover': '封面，需要快速建立主题、场景和可信度',
            'end': '收束页，需要形成结论、行动或下一步',
        }.get(role, '正文页，需要服务单一信息角色，不堆砌无关内容')
        return {
            'mode': page_plan['design_engine'],
            'design_engine': page_plan['design_engine'],
            'theme': theme,
            'page_title': context['title'],
            'project_topic': (project_topic or '').strip(),
            'narrative_role': role_label,
            'visual_direction': visual_direction,
            'content_signals': [context['title'], *context['points']][:6],
            'page_plan': page_plan,
            'candidate_layouts': [item.get('layout') for item in candidates[:8] if isinstance(item, dict)],
            'deck_plan': deepcopy(deck_plan) if isinstance(deck_plan, dict) else {},
            'deck_position': {
                'index': page_index,
                'recent_layouts': list(recent_layouts or [])[-3:],
            },
            'layout_strategy': (
                '优先选择能承载当前页面叙事角色的内容原生布局；采用编辑型信息层级、留白和视觉锚点；保持 layout + props 可编辑契约'
                if classic_native else '优先选择能承载当前页面叙事角色的主题原生布局，保持 layout + props 可编辑契约'
            ),
            'media_strategy': '如候选布局包含媒体槽，媒体应服务页面重点；没有真实素材时只生成主题相关主体图，不覆盖用户素材'
            if has_media else '本页优先使用文字、数据和结构表达，不强行增加装饰图片',
            'anti_template_constraints': [
                '不要保留候选布局默认行业文案、默认数字或默认公司名',
                '不要为了填满画面编造无来源数据',
                '不要添加自由 HTML、CSS、className 或非契约字段',
                '避免通用 AI 味装饰，所有元素必须服务页面主题',
            ],
        }

    def _get_layout(self, layout):
        try:
            return self._layouts[layout]
        except KeyError as exc:
            raise ValueError(f'未知布局: {layout}') from exc

    @classmethod
    def _page_kind(cls, context, role):
        if role == 'cover':
            return 'cover'
        if role == 'end':
            return 'closing'
        text = cls._context_text(context)
        for page_kind, keywords in PAGE_KIND_KEYWORDS:
            if any(keyword in text for keyword in keywords):
                return page_kind
        return 'content'

    @staticmethod
    def _page_goal(page_kind):
        return {
            'cover': '建立主题、场景和可信度，避免堆满细节',
            'closing': '收束观点并给出结论或下一步',
            'data': '让关键数据、指标或趋势成为页面主角',
            'process': '用清晰步骤解释推进路径或机制',
            'case': '用具体案例承载问题、动作和结果',
            'image': '让图片或视觉主体服务页面重点',
            'comparison': '突出差异、关系或选择逻辑',
            'risk': '清晰呈现风险、挑战和应对边界',
            'quote': '突出关键原话或核心观点，并保留可信来源',
            'timeline': '按时间顺序呈现里程碑和阶段变化',
            'funnel': '展示逐层筛选、转化或收敛关系',
            'architecture': '解释系统层级、模块边界和结构关系',
            'profile': '突出人物、角色和与主题相关的关键信息',
        }.get(page_kind, '围绕单一观点组织内容，避免模板化堆砌')

    @staticmethod
    def _context_text(context):
        return ' '.join([
            str(context.get('title') or ''),
            str(context.get('summary') or ''),
            str(context.get('section') or ''),
            *[str(item) for item in context.get('points') or []],
        ]).lower()

    @classmethod
    def _outline_context(cls, outline):
        outline = outline if isinstance(outline, dict) else {}
        title = cls._first_text(outline, ('title', 'heading', 'name', 'topic')) or '未命名页面'
        points = cls._outline_points(outline)
        summary = (
            cls._first_text(outline, ('summary', 'description', 'desc', 'content', 'notes'))
            or (points[0] if points else title)
        )
        section = cls._first_text(outline, ('part', 'section', 'chapter', 'category')) or '重点'
        return {
            'title': title,
            'summary': summary,
            'section': section,
            'points': points or [summary],
        }

    @classmethod
    def _first_text(cls, value, keys):
        if not isinstance(value, dict):
            return ''
        for key in keys:
            item = value.get(key)
            if isinstance(item, str) and item.strip():
                return item.strip()
        return ''

    @classmethod
    def _outline_points(cls, outline):
        if not isinstance(outline, dict):
            return []
        candidates = []
        for key in ('points', 'bullets', 'items', 'children', 'sections'):
            value = outline.get(key)
            if isinstance(value, list):
                candidates.extend(value)
        points = []
        for item in candidates:
            if isinstance(item, str) and item.strip():
                points.append(item.strip())
            elif isinstance(item, dict):
                text = cls._first_text(item, ('title', 'heading', 'name', 'summary', 'description', 'content'))
                if text:
                    points.append(text)
        return points[:8]

    @classmethod
    def _outline_value_for_shape(cls, key, shape, context, index=0, default_value=None):
        if shape == 'media':
            return None
        if shape == 'string':
            return cls._outline_text_for_key(key, context, index)
        if shape == 'number':
            return None
        if shape == 'boolean':
            return None
        if shape == 'string[]':
            count = len(default_value) if isinstance(default_value, list) and default_value else min(len(context['points']), 4)
            return [context['points'][item_index % len(context['points'])] for item_index in range(max(1, count))]
        if isinstance(shape, list):
            item_shape = shape[0] if shape else 'string'
            count = len(default_value) if isinstance(default_value, list) and default_value else min(len(context['points']), 4)
            return [
                cls._outline_value_for_shape(
                    key,
                    item_shape,
                    context,
                    item_index,
                    default_value=default_value[item_index] if isinstance(default_value, list) and item_index < len(default_value) else None,
                )
                for item_index in range(max(1, count))
            ]
        if isinstance(shape, dict):
            nested = {}
            for child_key, child_shape in shape.items():
                child_default = default_value.get(child_key) if isinstance(default_value, dict) else None
                child_value = cls._outline_value_for_shape(child_key, child_shape, context, index, default_value=child_default)
                if not cls._is_empty_value(child_value):
                    nested[child_key] = child_value
            return nested
        return None

    @classmethod
    def _outline_text_for_key(cls, key, context, index=0):
        normalized = key.lower()
        point = context['points'][index % len(context['points'])]
        if any(token in normalized for token in ('title', 'heading', 'name', 'topic')):
            return context['title']
        if any(token in normalized for token in ('kicker', 'eyebrow', 'section', 'chapter', 'part', 'brand')):
            return context['section']
        if any(token in normalized for token in ('subtitle', 'summary', 'lead', 'desc', 'body', 'copy', 'note', 'caption', 'cap')):
            return context['summary']
        if normalized in {'k', 'label', 'key', 'tag', 'step', 'period'}:
            return f'要点 {index + 1}'
        if normalized in {'v', 'value', 'text', 'content', 'point'}:
            return point
        if any(token in normalized for token in ('label', 'tag', 'meta')):
            return f'要点 {index + 1}'
        if any(token in normalized for token in ('value', 'text', 'point', 'item')):
            return point
        return point

    @classmethod
    def _merge_missing_values(cls, fallback, primary):
        if not isinstance(primary, dict):
            return deepcopy(fallback)
        merged = deepcopy(fallback)
        for key, value in primary.items():
            if isinstance(value, dict) and isinstance(merged.get(key), dict):
                merged[key] = cls._merge_missing_values(merged[key], value)
            elif cls._is_empty_value(value):
                merged.setdefault(key, value)
            else:
                merged[key] = value
        return merged

    def _validate_shape(self, key, value, shape, contract):
        if shape == 'string' and not isinstance(value, str):
            raise ValueError(f'{key} 必须是文本')
        if shape == 'number' and (isinstance(value, bool) or not isinstance(value, (int, float))):
            raise ValueError(f'{key} 必须是数字')
        if shape == 'boolean' and not isinstance(value, bool):
            raise ValueError(f'{key} 必须是布尔值')
        # media 允许空串占位（等待批量生成/上传填充）；非空值必须是项目素材路径
        if shape == 'media' and (not isinstance(value, str) or (value and not value.startswith(('/files/', 'data:', 'assets/')))):
            raise ValueError(f'{key} 必须使用项目素材路径')
        if shape == 'string[]':
            shape = ['string']
        if isinstance(shape, list):
            if not isinstance(value, list):
                raise ValueError(f'{key} 必须是数组')
            meta = next((item for item in contract.get('arrayMeta', []) if item['key'] == key), None)
            legacy = contract.get('arrayLimits', {}).get(key)
            minimum = (meta or {}).get('min') if meta else (legacy or {}).get('min')
            maximum = (meta or {}).get('max') if meta else (legacy or {}).get('max')
            if minimum is not None and len(value) < minimum or maximum is not None and len(value) > maximum:
                raise ValueError(f'{key} 数量不符合布局要求')
            for index, item in enumerate(value):
                item_shape = shape[index] if len(shape) > 1 and index < len(shape) else shape[0] if shape else 'string'
                self._validate_shape(f'{key}[{index}]', item, item_shape, contract)
        if isinstance(shape, dict):
            if not isinstance(value, dict):
                raise ValueError(f'{key} 必须是对象')
            unknown = set(value) - set(shape)
            if unknown:
                raise ValueError(f'{key} 包含未知字段: {", ".join(sorted(unknown))}')
            for child_key, child_value in value.items():
                self._validate_shape(f'{key}.{child_key}', child_value, shape[child_key], contract)

    @staticmethod
    def _validate_control(key, value, control):
        control_type = control.get('type')
        if control_type == 'toggle' and not isinstance(value, bool):
            raise ValueError(f'{key} 必须是布尔值')
        if control_type in {'range', 'number'}:
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise ValueError(f'{key} 必须是数字')
            if control.get('min') is not None and value < control['min'] or control.get('max') is not None and value > control['max']:
                raise ValueError(f'{key} 超出允许范围')

    @staticmethod
    def _path_values(props, path):
        values = [props]
        for segment in path.split('.'):
            is_array = segment.endswith('[]')
            key = segment[:-2] if is_array else segment
            next_values = []
            for value in values:
                if not isinstance(value, dict) or key not in value:
                    continue
                child = value[key]
                if is_array and isinstance(child, list):
                    next_values.extend(child)
                elif not is_array:
                    next_values.append(child)
            values = next_values
        return values

    @classmethod
    def _trim_path(cls, value, segments, maximum):
        if not segments or not isinstance(value, dict):
            return
        segment, *rest = segments
        is_array = segment.endswith('[]')
        key = segment[:-2] if is_array else segment
        child = value.get(key)
        if is_array:
            if isinstance(child, list):
                if rest:
                    for item in child:
                        cls._trim_path(item, rest, maximum)
                else:
                    value[key] = [item[:maximum] if isinstance(item, str) else item for item in child]
        elif rest:
            cls._trim_path(child, rest, maximum)
        elif isinstance(child, str):
            value[key] = child[:maximum]

    @classmethod
    def _blank_value(cls, shape):
        if shape is None or shape in ('string', 'media'):
            return ''
        if shape == 'number':
            return 0
        if shape == 'boolean':
            return False
        if shape == 'string[]' or isinstance(shape, list):
            return []
        if isinstance(shape, dict):
            return {key: cls._blank_value(value) for key, value in shape.items()}
        return ''
