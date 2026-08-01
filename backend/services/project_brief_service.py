"""Project brief snapshot adapter (reconstruction plan §3.1).

The project brief is the input for every direct generation. New business
services and tasks must only call :func:`get_project_brief_snapshot`; they
must not accept ``spine_revision`` / ``spine_hash`` / ``spine_document``
parameters. The adapter currently composes the DTO from the legacy
``content_spines`` storage so historical data keeps working unchanged.
"""

import hashlib
import json

from models import ReferenceFile

BRIEF_SCHEMA_VERSION = 1


def canonical_json(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def _document(project) -> dict:
    spine = project.content_spine
    if not spine:
        return {}
    try:
        document = json.loads(spine.document_json or '{}')
    except (TypeError, ValueError):
        return {}
    return document if isinstance(document, dict) else {}


def get_project_brief_snapshot(project) -> dict:
    """Build a stable, hashable brief snapshot for a project.

    The snapshot is pure data: freezing it never creates or modifies
    workspaces, tasks or spine records.
    """
    document = _document(project)
    topic = str(document.get('topic', {}).get('value') or '')
    source_text = next(
        (str(item.get('content') or '') for item in (document.get('sources') or [])
         if str(item.get('content') or '').strip()),
        '',
    )
    reference_file_ids = [
        str(item.id)
        for item in ReferenceFile.query.filter_by(project_id=project.id).all()
    ]
    payload = {
        'schema_version': BRIEF_SCHEMA_VERSION,
        'project_id': project.id,
        'title': str(project.project_title or topic or ''),
        'topic': topic,
        'source_text': source_text,
        'audience': str(document.get('audience', {}).get('value') or ''),
        'goal': str(document.get('goal', {}).get('value') or ''),
        'tone': str(document.get('tone', {}).get('value') or ''),
        'language': str(document.get('language', {}).get('value') or ''),
        'reference_file_ids': reference_file_ids,
        'revision': project.content_spine.revision if project.content_spine else 0,
    }
    snapshot = dict(payload)
    snapshot['content_hash'] = hashlib.sha256(
        canonical_json(payload).encode('utf-8')
    ).hexdigest()
    return snapshot


def snapshot_hash(payload: dict) -> str:
    """Hash a frozen snapshot payload using canonical JSON (SHA-256)."""
    return hashlib.sha256(canonical_json(payload).encode('utf-8')).hexdigest()
