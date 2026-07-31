"""Reviewable, revision-bound synchronization between content workspaces."""

import copy
import json
import sys
from datetime import datetime
from pathlib import Path

from jsonschema import Draft202012Validator

from models import ContentSyncProposal, ProjectWorkspace, WorkspaceVersion, db
from services.content_spine_service import (
    canonical_json,
    revise_spine,
    spine_to_dict,
    validate_spine_document,
)
from services.project_workspace_service import (
    save_workspace_revision,
    validate_workspace_document,
    version_to_dict,
    workspace_to_dict,
)


SYNC_KINDS = ('spine', 'ppt', 'video', 'podcast')
_ROOT = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parents[2]))
_SCHEMA_PATH = _ROOT / 'shared' / 'content' / 'sync-diff.schema.json'
_VALIDATOR = Draft202012Validator(json.loads(_SCHEMA_PATH.read_text(encoding='utf-8')))


class SyncRevisionConflict(ValueError):
    pass


class SyncProposalStateError(ValueError):
    pass


def _workspace(project, kind: str) -> ProjectWorkspace:
    workspace = next((item for item in project.workspaces if item.kind == kind), None)
    if not workspace or workspace.current_version_id is None or workspace.document_json is None:
        raise ValueError(f'{kind} workspace is not initialized')
    return workspace


def _revision(project, kind: str) -> int:
    return project.content_spine.revision if kind == 'spine' else _workspace(project, kind).revision


def _document(project, kind: str) -> dict:
    raw = project.content_spine.document_json if kind == 'spine' else _workspace(project, kind).document_json
    return json.loads(raw)


def _resolution(proposal: ContentSyncProposal) -> dict:
    value = json.loads(proposal.resolution_json or '{}')
    return {
        'applied_item_ids': list(value.get('applied_item_ids', [])),
        'rejected_item_ids': list(value.get('rejected_item_ids', [])),
        'target_revision': value.get('target_revision', proposal.target_base_revision),
        'applications': list(value.get('applications', [])),
    }


def _validate_diff(diff: dict) -> None:
    errors = sorted(_VALIDATOR.iter_errors(diff), key=lambda error: list(error.path))
    if errors:
        error = errors[0]
        path = '/' + '/'.join(str(part) for part in error.path)
        raise ValueError(f'Invalid sync diff at {path}: {error.message}')
    ids = [item['item_id'] for item in diff['items']]
    if len(ids) != len(set(ids)):
        raise ValueError('Sync diff item_id values must be unique')


def _decode_pointer(path: str) -> list[str]:
    return [part.replace('~1', '/').replace('~0', '~') for part in path[1:].split('/')]


def _list_index(values: list, token: str, *, allow_new: bool = False) -> int:
    if token.isdigit():
        return int(token)
    for index, value in enumerate(values):
        if value == token or (
            isinstance(value, dict)
            and token in {
                value.get('section_id'),
                value.get('scene_id'),
                value.get('segment_id'),
                value.get('page_id'),
                value.get('id'),
            }
        ):
            return index
    if allow_new:
        return len(values)
    raise KeyError(token)


def _apply_item(document: dict, item: dict) -> None:
    parts = _decode_pointer(item['path'])
    parent = document
    for part in parts[:-1]:
        parent = parent[_list_index(parent, part)] if isinstance(parent, list) else parent[part]
    key = parts[-1]
    operation = item['operation']
    if isinstance(parent, list):
        if operation == 'add':
            parent.insert(
                len(parent) if key == '-' else _list_index(parent, key, allow_new=True),
                copy.deepcopy(item['after']),
            )
        elif operation == 'remove':
            parent.pop(_list_index(parent, key))
        else:
            parent[_list_index(parent, key)] = copy.deepcopy(item['after'])
    elif operation == 'remove':
        del parent[key]
    else:
        parent[key] = copy.deepcopy(item['after'])


def _value_at(document: dict, path: str):
    value = document
    for part in _decode_pointer(path):
        value = value[_list_index(value, part)] if isinstance(value, list) else value[part]
    return value


def _assert_before(document: dict, items: list[dict]) -> None:
    try:
        for item in items:
            if item['operation'] != 'add' and _value_at(document, item['path']) != item['before']:
                raise ValueError(f"before value changed at {item['path']}")
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise ValueError(f'Invalid sync diff path: {exc}') from exc


def _preview(document: dict, items: list[dict]) -> dict:
    result = copy.deepcopy(document)
    try:
        for item in items:
            _apply_item(result, item)
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise ValueError(f'Invalid sync diff path: {exc}') from exc
    return result


def _validate_target(kind: str, document: dict) -> None:
    if kind == 'spine':
        validate_spine_document(document)
    else:
        validate_workspace_document(kind, document)


def create_sync_proposal(
    project,
    *,
    source_kind: str,
    target_kind: str,
    source_revision: int,
    target_base_revision: int,
    diff: dict,
    reason: str | None = None,
) -> ContentSyncProposal:
    if source_kind not in SYNC_KINDS or target_kind not in SYNC_KINDS or source_kind == target_kind:
        raise ValueError('source_kind and target_kind must be different valid sync kinds')
    if _revision(project, source_kind) != source_revision:
        raise SyncRevisionConflict('Source revision changed')
    if _revision(project, target_kind) != target_base_revision:
        raise SyncRevisionConflict('Target revision changed')
    _validate_diff(diff)
    target_document = _document(project, target_kind)
    _assert_before(target_document, diff['items'])
    preview = _preview(target_document, diff['items'])
    _validate_target(target_kind, preview)
    proposal = ContentSyncProposal(
        project=project,
        source_kind=source_kind,
        target_kind=target_kind,
        source_revision=source_revision,
        target_base_revision=target_base_revision,
        diff_json=canonical_json(diff),
        resolution_json=canonical_json({
            'applied_item_ids': [],
            'rejected_item_ids': [],
            'target_revision': target_base_revision,
            'applications': [],
        }),
        reason=reason,
        status='pending',
    )
    db.session.add(proposal)
    return proposal


def proposal_to_dict(proposal: ContentSyncProposal) -> dict:
    return {
        'id': proposal.id,
        'project_id': proposal.project_id,
        'source_kind': proposal.source_kind,
        'target_kind': proposal.target_kind,
        'source_revision': proposal.source_revision,
        'target_base_revision': proposal.target_base_revision,
        'diff': json.loads(proposal.diff_json),
        'resolution': _resolution(proposal),
        'reason': proposal.reason,
        'status': proposal.status,
        'created_at': proposal.created_at.isoformat() if proposal.created_at else None,
        'resolved_at': proposal.resolved_at.isoformat() if proposal.resolved_at else None,
    }


def _pending_items(proposal: ContentSyncProposal, resolution: dict) -> list[dict]:
    resolved = set(resolution['applied_item_ids']) | set(resolution['rejected_item_ids'])
    return [
        item for item in json.loads(proposal.diff_json)['items']
        if item['item_id'] not in resolved
    ]


def _assert_active(proposal: ContentSyncProposal) -> None:
    if proposal.status not in {'pending', 'partially_applied'}:
        raise SyncProposalStateError(f'Proposal is already {proposal.status}')


def _assert_current(proposal: ContentSyncProposal, resolution: dict, base_revision: int) -> None:
    project = proposal.project
    if _revision(project, proposal.source_kind) != proposal.source_revision:
        proposal.status = 'stale'
        proposal.resolved_at = datetime.utcnow()
        raise SyncRevisionConflict('Source revision changed; proposal is stale')
    current_target = _revision(project, proposal.target_kind)
    if current_target != resolution['target_revision'] or current_target != base_revision:
        proposal.status = 'stale'
        proposal.resolved_at = datetime.utcnow()
        raise SyncRevisionConflict('Target revision changed; proposal is stale')


def apply_sync_proposal(
    proposal: ContentSyncProposal,
    *,
    selected_item_ids: list[str],
    base_revision: int,
) -> dict:
    _assert_active(proposal)
    resolution = _resolution(proposal)
    _assert_current(proposal, resolution, base_revision)
    selected = set(selected_item_ids)
    pending = _pending_items(proposal, resolution)
    pending_ids = {item['item_id'] for item in pending}
    if not selected or not selected <= pending_ids:
        raise ValueError('selected_item_ids must contain unresolved proposal items')
    items = [item for item in pending if item['item_id'] in selected]
    target_document = _document(proposal.project, proposal.target_kind)
    _assert_before(target_document, items)
    document = _preview(target_document, items)
    _validate_target(proposal.target_kind, document)

    if proposal.target_kind == 'spine':
        target = revise_spine(
            proposal.project.content_spine,
            document,
            expected_revision=base_revision,
        )
        target_result = {'spine': spine_to_dict(target)}
        version_id = None
        target_revision = target.revision
    else:
        workspace = _workspace(proposal.project, proposal.target_kind)
        version = save_workspace_revision(
            workspace,
            document,
            json.loads(workspace.settings_json or '{}'),
            expected_revision=base_revision,
            source_type='sync',
        )
        target_result = {
            'workspace': workspace_to_dict(workspace),
            'version': version_to_dict(version),
        }
        version_id = version.id
        target_revision = workspace.revision

    resolution['applied_item_ids'].extend(item['item_id'] for item in items)
    resolution['target_revision'] = target_revision
    resolution['applications'].append({
        'item_ids': [item['item_id'] for item in items],
        'target_revision': target_revision,
        'version_id': version_id,
    })
    remaining = _pending_items(proposal, resolution)
    proposal.status = 'partially_applied' if remaining else 'applied'
    proposal.resolved_at = None if remaining else datetime.utcnow()
    proposal.resolution_json = canonical_json(resolution)
    return {'proposal': proposal_to_dict(proposal), **target_result}


def reject_sync_proposal(
    proposal: ContentSyncProposal,
    *,
    selected_item_ids: list[str] | None = None,
) -> ContentSyncProposal:
    _assert_active(proposal)
    resolution = _resolution(proposal)
    pending = _pending_items(proposal, resolution)
    pending_ids = {item['item_id'] for item in pending}
    selected = set(selected_item_ids or pending_ids)
    if not selected or not selected <= pending_ids:
        raise ValueError('selected_item_ids must contain unresolved proposal items')
    resolution['rejected_item_ids'].extend(
        item['item_id'] for item in pending if item['item_id'] in selected
    )
    remaining = _pending_items(proposal, resolution)
    if remaining:
        proposal.status = 'partially_applied' if resolution['applied_item_ids'] else 'pending'
    else:
        proposal.status = 'applied' if resolution['applied_item_ids'] else 'rejected'
        proposal.resolved_at = datetime.utcnow()
    proposal.resolution_json = canonical_json(resolution)
    return proposal


def restore_workspace(project, kind: str, version_id: str, base_revision: int) -> dict:
    from services.project_workspace_service import restore_workspace_version

    workspace = _workspace(project, kind)
    version = db.session.get(WorkspaceVersion, version_id)
    if not version:
        raise ValueError('Workspace version not found')
    restored = restore_workspace_version(
        workspace,
        version,
        expected_revision=base_revision,
    )
    return {
        'workspace': workspace_to_dict(workspace),
        'version': version_to_dict(restored),
    }
