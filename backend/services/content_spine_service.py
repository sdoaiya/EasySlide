"""Validation and revision rules for the shared Content Spine."""

import hashlib
import json
import re
import sys
from pathlib import Path

from jsonschema import Draft202012Validator

from models import ContentSpine


_ROOT = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parents[2]))
_SCHEMA_PATH = _ROOT / 'shared' / 'content' / 'content-spine.schema.json'
_VALIDATOR = Draft202012Validator(json.loads(_SCHEMA_PATH.read_text(encoding='utf-8')))


class SpineRevisionConflict(ValueError):
    pass


_SOURCE_FIELDS = {
    'idea_prompt': 'prompt',
    'outline_text': 'outline',
    'description_text': 'description',
}


def canonical_json(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def document_hash(document) -> str:
    return hashlib.sha256(canonical_json(document).encode('utf-8')).hexdigest()


def validate_spine_document(document) -> dict:
    errors = sorted(_VALIDATOR.iter_errors(document), key=lambda error: list(error.path))
    if errors:
        error = errors[0]
        path = '/' + '/'.join(str(part) for part in error.path)
        raise ValueError(f'Invalid Content Spine at {path}: {error.message}')
    return document


def get_spine_sections(document: dict) -> list[dict]:
    """Return structured sections, with a deterministic first-pass fallback for raw sources."""
    sections = document.get('sections') or []
    if sections:
        return sections

    sources = document.get('sources') or []
    source = next(
        (item for kind in ('outline', 'description', 'prompt')
         for item in sources if item.get('kind') == kind and str(item.get('content') or '').strip()),
        None,
    )
    if not source:
        return []

    text = str(source.get('content') or '').strip()
    blocks = [item.strip() for item in re.split(r'\n\s*\n+', text) if item.strip()]
    if not blocks:
        blocks = [item.strip() for item in text.splitlines() if item.strip()]
    heading = re.compile(
        r'^第\s*[0-9一二三四五六七八九十]+\s*(?:页|章节|部分)?\s*[:：.\-]?\s*|'
        r'^(?:page|slide)\s*\d+\s*[:：.\-]?\s*',
        re.IGNORECASE,
    )
    if len(blocks) == 1:
        lines = [item.strip() for item in text.splitlines() if item.strip()]
        heading_blocks = []
        for line in lines:
            if heading.match(line) and heading_blocks and heading_blocks[-1]:
                heading_blocks.append([])
            if not heading_blocks:
                heading_blocks.append([])
            heading_blocks[-1].append(line)
        if len(heading_blocks) > 1:
            blocks = ['\n'.join(item) for item in heading_blocks]
    result = []
    for index, block in enumerate(blocks[:24], start=1):
        lines = [item.strip() for item in block.splitlines() if item.strip()]
        if not lines:
            continue
        title = re.sub(
            r'^(?:第\s*[0-9一二三四五六七八九十]+\s*(?:页|章节|部分)?|(?:page|slide)\s*\d+)\s*[:：.\-]?\s*',
            '',
            lines[0],
            flags=re.IGNORECASE,
        ).strip() or lines[0]
        points = [
            re.sub(r'^[-*•]\s*', '', line).strip()
            for line in lines[1:]
            if re.match(r'^[-*•]\s*', line)
        ]
        body = ' '.join(
            line for line in lines[1:]
            if not re.match(r'^[-*•]\s*', line)
        ).strip()
        result.append({
            'section_id': f'section.{index}',
            'title': title[:255],
            'summary': (body or title)[:2000],
            'key_points': points[:12],
            'fact_refs': [],
            'source_refs': [source.get('source_id')] if source.get('source_id') else [],
        })
    return result


def build_initial_spine_document(data: dict) -> dict:
    topic = (
        data.get('idea_prompt')
        or data.get('outline_text')
        or data.get('description_text')
        or data.get('project_title')
        or 'Untitled project'
    )
    sources = []
    for field, kind in (
        ('idea_prompt', 'prompt'),
        ('outline_text', 'outline'),
        ('description_text', 'description'),
    ):
        if data.get(field):
            sources.append({
                'source_id': f'input.{field}',
                'kind': kind,
                'ref': f'input/{field}',
                'title': field,
                'content': str(data[field]),
            })
    audience = str(data.get('audience') or '')
    goal = str(data.get('goal') or '')
    needs_confirmation = []
    if not audience:
        needs_confirmation.append('/audience')
    if not goal:
        needs_confirmation.append('/goal')
    document = {
        'schema_version': 1,
        'topic': {'value': str(topic), 'needs_confirmation': not bool(data.get('idea_prompt'))},
        'audience': {'value': audience, 'needs_confirmation': not bool(audience)},
        'goal': {'value': goal, 'needs_confirmation': not bool(goal)},
        'sources': sources,
        'research': [],
        'viewpoints': [],
        'facts': [],
        'sections': [],
        'narrative': {'opening': '', 'progression': [], 'conclusion': ''},
        'needs_confirmation': needs_confirmation,
    }
    return validate_spine_document(document)


def create_spine(project_id: str, data: dict) -> ContentSpine:
    document = build_initial_spine_document(data)
    return ContentSpine(
        project_id=project_id,
        revision=1,
        confirmed_revision=0,
        status='draft',
        document_json=canonical_json(document),
        content_hash=document_hash(document),
    )


def revise_spine(spine: ContentSpine, document: dict, expected_revision: int) -> ContentSpine:
    if spine.revision != expected_revision:
        raise SpineRevisionConflict(
            f'Content Spine revision changed: expected {expected_revision}, got {spine.revision}'
        )
    validate_spine_document(document)
    spine.revision += 1
    spine.status = 'draft'
    spine.document_json = canonical_json(document)
    spine.content_hash = document_hash(document)
    return spine


def get_spine_source_fields(project) -> dict:
    if not project.content_spine:
        raise ValueError('Content Spine is missing')
    document = json.loads(project.content_spine.document_json)
    by_kind = {
        source['kind']: source.get('content', '')
        for source in document.get('sources', [])
        if source.get('kind') in _SOURCE_FIELDS.values()
    }
    return {
        'idea_prompt': by_kind.get('prompt') or document['topic']['value'],
        'outline_text': by_kind.get('outline') or '',
        'description_text': by_kind.get('description') or '',
    }


def update_spine_source_fields(spine: ContentSpine, patch: dict) -> ContentSpine:
    unknown = set(patch) - set(_SOURCE_FIELDS)
    if unknown:
        raise ValueError(f'Unsupported Content Spine source fields: {", ".join(sorted(unknown))}')
    document = json.loads(spine.document_json)
    sources = document['sources']
    for field, value in patch.items():
        text = '' if value is None else str(value)
        kind = _SOURCE_FIELDS[field]
        source = next((item for item in sources if item['kind'] == kind), None)
        if source:
            source['content'] = text
        else:
            sources.append({
                'source_id': f'input.{field}',
                'kind': kind,
                'ref': f'input/{field}',
                'title': field,
                'content': text,
            })
        if field == 'idea_prompt':
            document['topic'] = {'value': text, 'needs_confirmation': not bool(text)}
    return revise_spine(spine, document, expected_revision=spine.revision)


def confirm_spine(spine: ContentSpine, expected_revision: int) -> ContentSpine:
    if spine.revision != expected_revision:
        raise SpineRevisionConflict(
            f'Content Spine revision changed: expected {expected_revision}, got {spine.revision}'
        )
    document = json.loads(spine.document_json)
    if not document.get('sections'):
        sections = get_spine_sections(document)
        if sections:
            document['sections'] = sections
            spine.document_json = canonical_json(document)
            spine.content_hash = document_hash(document)
    validate_spine_document(document)
    spine.confirmed_revision = spine.revision
    spine.status = 'confirmed'
    return spine


def spine_to_dict(spine: ContentSpine) -> dict:
    document = json.loads(spine.document_json)
    return {
        'id': spine.id,
        'project_id': spine.project_id,
        'revision': spine.revision,
        'confirmed_revision': spine.confirmed_revision,
        'status': spine.status,
        'document': document,
        'preview_sections': get_spine_sections(document),
        'content_hash': spine.content_hash,
    }


def get_project_brief(project) -> dict:
    """Map the legacy content spine document to the project brief contract."""
    spine = project.content_spine
    document = json.loads(spine.document_json) if spine else {}
    return {
        'title': str(document.get('topic', {}).get('value') or project.project_title or ''),
        'topic': str(document.get('topic', {}).get('value') or ''),
        'audience': str(document.get('audience', {}).get('value') or ''),
        'goal': str(document.get('goal', {}).get('value') or ''),
        'tone': str(document.get('tone', {}).get('value') or ''),
        'source_text': next(
            (str(item.get('content') or '') for item in (document.get('sources') or [])
             if str(item.get('content') or '').strip()),
            '',
        ),
        'source_revision': spine.revision if spine else 0,
    }


def update_project_brief(project, payload: dict) -> dict:
    """Update brief fields on the underlying spine document (semantic alias)."""
    spine = project.content_spine
    if not spine:
        raise ValueError('项目简报不可用')
    document = json.loads(spine.document_json)
    for field in ('topic', 'audience', 'goal', 'tone'):
        if field in payload:
            value = str(payload[field] or '').strip()
            document[field] = {'value': value, 'needs_confirmation': not bool(value)}
    validate_spine_document(document)
    spine.document_json = canonical_json(document)
    spine.content_hash = document_hash(document)
    return get_project_brief(project)


def resolve_initial_workspace(project, requested_kind=None) -> str:
    """Resolve the target workspace for navigation.

    Legacy ``last_workspace == 'spine'`` maps to the first initialized
    workspace (PPT preferred), otherwise the requested kind or ``ppt``.
    """
    if requested_kind in {'ppt', 'video', 'podcast'}:
        return requested_kind
    last = getattr(project, 'last_workspace', None)
    if last in {'ppt', 'video', 'podcast'}:
        return last
    for workspace in (project.workspaces or []):
        if workspace.state != 'uninitialized':
            return workspace.kind
    return 'ppt'


def optimize_positioning(values: dict, provider=None) -> dict:
    """Sharpen topic/audience/goal wording without persisting anything.

    Returns only suggestions; callers decide whether to save. Raises
    ``ValueError`` for malformed provider output so the controller can map
    it to a stable error code.
    """
    if provider is None:
        from services.ai_service_manager import get_ai_service
        provider = get_ai_service().text_provider

    prompt = f'''你是内容策略编辑，请优化下面这组跨 PPT、视频、播客共用的内容主线定位。
只优化主题、目标受众、内容目标的表达，让它们更具体、可执行、彼此一致；不要臆造事实，不要改写章节、引用或素材。
请只返回 JSON，不要 Markdown 代码块，字段必须是 topic、audience、goal、rationale。
当前定位：
主题：{values.get('topic') or '待补充'}
受众：{values.get('audience') or '待补充'}
目标：{values.get('goal') or '待补充'}
'''
    raw = provider.generate_text(prompt, thinking_budget=256)
    text = re.sub(r'<think>.*?</think>\s*', '', str(raw or ''), flags=re.DOTALL).strip()
    start, end = text.find('{'), text.rfind('}')
    if start < 0 or end <= start:
        raise ValueError('AI 未返回有效 JSON')
    result = json.loads(text[start:end + 1])
    if not isinstance(result, dict):
        raise ValueError('AI 返回结果必须是对象')
    optimized = {}
    for field in ('topic', 'audience', 'goal'):
        value = result.get(field, values.get(field, ''))
        if not isinstance(value, str):
            raise ValueError(f'AI 返回的 {field} 无效')
        optimized[field] = value.strip()[:1000]
    rationale = result.get('rationale', '')
    if not isinstance(rationale, str):
        rationale = ''
    return {**optimized, 'rationale': rationale.strip()[:600]}
