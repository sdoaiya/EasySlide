"""Core creation and initialization rules for content-project workspaces."""

import hashlib
import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator

from models import Material, Page, ProjectWorkspace, Task, WorkspaceVersion, db
from services.content_spine_service import canonical_json, document_hash
from services.video_workspace_service import (
    build_video_document_from_ppt,
    build_video_document_from_spine,
)
from services.podcast_service import build_podcast_document_from_spine


WORKSPACE_KINDS = ('ppt', 'video', 'podcast')
_SCHEMA_ROOT = Path(
    getattr(sys, '_MEIPASS', Path(__file__).resolve().parents[2])
) / 'shared' / 'content'
_WORKSPACE_VALIDATORS = {
    kind: Draft202012Validator(json.loads(
        (_SCHEMA_ROOT / f'{kind}-workspace.schema.json').read_text(encoding='utf-8')
    ))
    for kind in ('video', 'podcast')
}


class SpineNotConfirmed(ValueError):
    pass


def create_workspace_set(project_id: str) -> list[ProjectWorkspace]:
    return [
        ProjectWorkspace(
            project_id=project_id,
            kind=kind,
            state='uninitialized',
            stage=None,
            revision=0,
            source_kind='manual',
            settings_json=canonical_json({}),
        )
        for kind in WORKSPACE_KINDS
    ]


def workspace_to_dict(workspace: ProjectWorkspace) -> dict:
    return {
        'id': workspace.id,
        'project_id': workspace.project_id,
        'kind': workspace.kind,
        'state': workspace.state,
        'stage': workspace.stage,
        'revision': workspace.revision,
        'current_version_id': workspace.current_version_id,
        'source_kind': workspace.source_kind,
        'source_revision': workspace.source_revision,
        'settings': json.loads(workspace.settings_json or '{}'),
        'document': json.loads(workspace.document_json) if workspace.document_json else None,
    }


def _workspace_document(
    kind: str,
    spine_document: dict,
    settings: dict,
    *,
    ppt_page_refs: list[str] | None = None,
) -> dict:
    if kind == 'ppt':
        return {'schema_version': 1, 'page_refs': list(ppt_page_refs or [])}
    if kind == 'video':
        return build_video_document_from_spine(spine_document, settings)
    return build_podcast_document_from_spine(spine_document, settings)


def _ensure_ppt_pages(project_id: str, spine_document: dict) -> list[Page]:
    existing = Page.query.filter_by(project_id=project_id).order_by(Page.order_index).all()
    if existing:
        return existing
    pages = []
    # 只物化已确认/已生成的结构化章节；raw-source 回退只用于预览，
    # 否则未生成大纲时会把整段简报误切成一条伪大纲页
    sections = spine_document.get('sections') or []
    for index, section in enumerate(sections):
        title = str(section.get('title') or '').strip() or f'第 {index + 1} 页'
        page = Page(
            project_id=project_id,
            order_index=index,
            status='DESCRIPTION_GENERATED' if section.get('summary') else 'DRAFT',
        )
        page.set_outline_content({
            'title': title,
            'points': [str(item) for item in section.get('key_points', []) if str(item).strip()],
        })
        if section.get('summary'):
            page.set_description_content({'text': str(section['summary'])})
        db.session.add(page)
        pages.append(page)
    db.session.flush()
    return pages


def validate_workspace_document(kind: str, document: dict) -> None:
    validator = _WORKSPACE_VALIDATORS.get(kind)
    if not validator:
        return
    errors = sorted(validator.iter_errors(document), key=lambda error: list(error.path))
    if errors:
        error = errors[0]
        path = '/' + '/'.join(str(part) for part in error.path)
        raise ValueError(f'Invalid {kind} workspace at {path}: {error.message}')
    _validate_workspace_material_refs(kind, document)


def _validate_workspace_material_refs(kind: str, document: dict) -> None:
    if kind == 'video':
        for scene in document.get('scenes') or []:
            visual = scene.get('visual') or {}
            visual_ref = visual.get('source_ref')
            if visual.get('kind') in {'image', 'material'}:
                _require_material_ref(visual_ref, {'image'}, 'video visual')
            elif visual.get('kind') == 'video':
                _require_material_ref(visual_ref, {'video'}, 'video visual')
            for cue in scene.get('audio_cues') or []:
                _require_material_ref(cue.get('asset_ref') or cue.get('source_ref'), {'audio'}, 'video audio cue')
    elif kind == 'podcast':
        for segment in document.get('segments') or []:
            source_ref = segment.get('source_ref')
            if source_ref:
                _require_material_ref(source_ref, {'audio', 'transcript'}, 'podcast segment')


def preflight_video_audio_materials(project_id: str, document: dict) -> list[dict]:
    """Freeze and validate audio materials referenced by a video workspace."""
    refs = {
        cue.get('asset_ref')
        for scene in document.get('scenes') or []
        for cue in scene.get('audio_cues') or []
        if isinstance(cue, dict) and str(cue.get('asset_ref') or '').startswith('/files/')
    }
    if not refs:
        return []
    materials = Material.query.filter(Material.url.in_(refs)).all()
    by_url = {material.url: material for material in materials}
    result = []
    for ref in sorted(refs):
        material = by_url.get(ref)
        if not material or material.project_id not in {None, project_id}:
            raise ValueError(f'视频音频素材不可用: {ref}')
        if material.media_kind != 'audio':
            raise ValueError(f'视频音频素材类型不匹配: {ref}')
        if not str(material.license_status or '').strip():
            raise ValueError(f'视频音频素材缺少授权状态: {ref}')
        result.append({
            'asset_ref': ref,
            'relative_path': material.relative_path,
            'purpose': material.purpose or 'audio',
        })
    return result


def _require_material_ref(ref: str | None, allowed_kinds: set[str], label: str) -> None:
    if not ref or not str(ref).startswith('/files/'):
        return
    material = Material.query.filter_by(url=ref).first()
    if not material:
        raise ValueError(f'Invalid {label} material reference: not found')
    if (material.media_kind or 'image') not in allowed_kinds:
        allowed = ', '.join(sorted(allowed_kinds))
        raise ValueError(f'Invalid {label} material reference: expected {allowed}, got {material.media_kind}')


def queue_workspace_initialization(
    project,
    workspace_kind: str,
    *,
    settings=None,
    require_confirmed: bool,
) -> Task:
    if workspace_kind not in WORKSPACE_KINDS:
        raise ValueError('Invalid workspace kind')
    spine = project.content_spine
    if not spine:
        raise ValueError('Content Spine is missing')
    if require_confirmed and spine.status != 'confirmed':
        raise SpineNotConfirmed('Confirm the Content Spine before initializing another workspace')
    workspace = next((item for item in project.workspaces if item.kind == workspace_kind), None)
    if not workspace:
        raise ValueError(f'{workspace_kind} workspace is missing')
    if workspace.state != 'uninitialized':
        raise ValueError(f'{workspace_kind} workspace is already initialized')
    for task in project.tasks:
        if task.task_type != 'INITIALIZE_CONTENT_WORKSPACE' or task.status not in {
            'PENDING', 'PROCESSING', 'PAUSED',
        }:
            continue
        resume = task.get_progress().get('_resume', {})
        if resume.get('kwargs', {}).get('workspace_kind') == workspace_kind:
            raise ValueError(f'{workspace_kind} workspace initialization is already active')
    # Keep the workspace shell honest while the immutable snapshot is being built.
    # The state remains uninitialized so editors cannot consume a partial document;
    # stage is the user-visible lifecycle marker.
    workspace.stage = 'QUEUED'
    frozen_document = json.loads(spine.document_json)
    task = Task(
        project_id=project.id,
        task_type='INITIALIZE_CONTENT_WORKSPACE',
        status='PENDING',
    )
    task.set_progress({
        'total': 1,
        'completed': 0,
        'failed': 0,
        'stage': 'queued',
        '_resume': {
            'kind': 'content-workspace',
            'kwargs': {
                'project_id': project.id,
                'workspace_kind': workspace_kind,
                'spine_revision': spine.revision,
                'spine_hash': spine.content_hash,
                'spine_document': frozen_document,
                'settings': settings or {},
            },
        },
    })
    return task


def initialize_workspace_from_snapshot(
    project_id: str,
    workspace_kind: str,
    spine_revision: int,
    spine_hash: str,
    spine_document: dict,
    settings: dict,
) -> ProjectWorkspace:
    if document_hash(spine_document) != spine_hash:
        raise ValueError('Frozen Content Spine hash does not match')
    workspace = ProjectWorkspace.query.filter_by(
        project_id=project_id,
        kind=workspace_kind,
    ).one()
    if workspace.current_version_id:
        return workspace
    ppt_pages = _ensure_ppt_pages(project_id, spine_document) if workspace_kind == 'ppt' else []
    document = _workspace_document(
        workspace_kind,
        spine_document,
        settings,
        ppt_page_refs=[page.id for page in ppt_pages],
    )
    validate_workspace_document(workspace_kind, document)
    document_json = canonical_json(document)
    settings_json = canonical_json(settings)
    content_hash = hashlib.sha256(canonical_json({
        'document': document,
        'settings': settings,
    }).encode('utf-8')).hexdigest()
    version = WorkspaceVersion(
        workspace_id=workspace.id,
        revision=1,
        document_json=document_json,
        settings_json=settings_json,
        content_hash=content_hash,
        source_type='sync',
    )
    db.session.add(version)
    db.session.flush()
    workspace.state = 'draft'
    if workspace_kind == 'ppt':
        workspace.stage = 'DRAFT'
    workspace.revision = 1
    workspace.current_version_id = version.id
    workspace.source_kind = 'spine'
    workspace.source_revision = spine_revision
    workspace.source_ref = f'content-spine:{project_id}'
    workspace.settings_json = settings_json
    workspace.document_json = document_json
    return workspace


def initialize_video_workspace_from_ppt(project, settings=None) -> ProjectWorkspace:
    ppt = next((item for item in project.workspaces if item.kind == 'ppt'), None)
    video = next((item for item in project.workspaces if item.kind == 'video'), None)
    if not ppt or not ppt.current_version_id:
        raise ValueError('PPT workspace is not initialized')
    if not video or video.state != 'uninitialized':
        raise ValueError('video workspace is already initialized')
    video_settings = dict(settings or {})
    ppt_settings = json.loads(ppt.settings_json or '{}')
    video_settings.setdefault(
        'aspect_ratio',
        ppt_settings.get('image_aspect_ratio', '16:9'),
    )
    document = build_video_document_from_ppt(project, video_settings)
    save_workspace_revision(
        video,
        document,
        video_settings,
        expected_revision=0,
        source_type='sync',
    )
    video.source_kind = 'ppt'
    video.source_revision = ppt.revision
    video.source_ref = f'ppt-workspace:{ppt.id}'
    return video


class WorkspaceRevisionConflict(ValueError):
    pass


def version_to_dict(version: WorkspaceVersion) -> dict:
    return {
        'id': version.id,
        'workspace_id': version.workspace_id,
        'revision': version.revision,
        'document': json.loads(version.document_json),
        'settings': json.loads(version.settings_json or '{}'),
        'content_hash': version.content_hash,
        'source_type': version.source_type,
        'parent_version_id': version.parent_version_id,
        'created_at': version.created_at.isoformat() if version.created_at else None,
    }


def save_workspace_revision(
    workspace: ProjectWorkspace,
    document: dict,
    settings: dict,
    *,
    expected_revision: int,
    source_type: str,
    parent_version_id: str | None = None,
) -> WorkspaceVersion:
    if workspace.revision != expected_revision:
        raise WorkspaceRevisionConflict(
            f'Workspace revision changed: expected {expected_revision}, got {workspace.revision}'
        )
    validate_workspace_document(workspace.kind, document)
    document_json = canonical_json(document)
    settings_json = canonical_json(settings)
    version = WorkspaceVersion(
        workspace_id=workspace.id,
        revision=workspace.revision + 1,
        document_json=document_json,
        settings_json=settings_json,
        content_hash=hashlib.sha256(canonical_json({
            'document': document,
            'settings': settings,
        }).encode('utf-8')).hexdigest(),
        source_type=source_type,
        parent_version_id=parent_version_id or workspace.current_version_id,
    )
    db.session.add(version)
    db.session.flush()
    workspace.revision = version.revision
    workspace.current_version_id = version.id
    workspace.document_json = document_json
    workspace.settings_json = settings_json
    workspace.state = 'draft'
    return version


def restore_workspace_version(
    workspace: ProjectWorkspace,
    version: WorkspaceVersion,
    *,
    expected_revision: int,
) -> WorkspaceVersion:
    if version.workspace_id != workspace.id:
        raise ValueError('Workspace version does not belong to this workspace')
    return save_workspace_revision(
        workspace,
        json.loads(version.document_json),
        json.loads(version.settings_json or '{}'),
        expected_revision=expected_revision,
        source_type='restore',
        parent_version_id=version.id,
    )
