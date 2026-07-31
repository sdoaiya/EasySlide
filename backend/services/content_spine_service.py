"""Validation and revision rules for the shared Content Spine."""

import hashlib
import json
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
    validate_spine_document(json.loads(spine.document_json))
    spine.confirmed_revision = spine.revision
    spine.status = 'confirmed'
    return spine


def spine_to_dict(spine: ContentSpine) -> dict:
    return {
        'id': spine.id,
        'project_id': spine.project_id,
        'revision': spine.revision,
        'confirmed_revision': spine.confirmed_revision,
        'status': spine.status,
        'document': json.loads(spine.document_json),
        'content_hash': spine.content_hash,
    }
