"""Thin adapter between legacy PPT pages and the unified PPT workspace."""

import json

from models import db
from models.project import normalize_native_image_settings
from services.project_workspace_service import save_workspace_revision


_READY_STAGES = {'COMPLETED', 'IMAGES_GENERATED', 'NATIVE_DECK_GENERATED'}


def get_ppt_workspace(project):
    return next(
        (workspace for workspace in project.workspaces if workspace.kind == 'ppt'),
        None,
    )


def get_ppt_settings(project) -> dict:
    workspace = get_ppt_workspace(project)
    if not workspace:
        raise ValueError('ppt workspace is missing')
    stored = json.loads(workspace.settings_json or '{}')
    return {
        'render_mode': stored.get('render_mode', 'image'),
        'native_theme': stored.get('native_theme'),
        'image_aspect_ratio': stored.get('image_aspect_ratio', '16:9'),
        'native_image_settings': normalize_native_image_settings(
            stored.get('native_image_settings')
        ),
    }


def get_ppt_status(project) -> str:
    workspace = get_ppt_workspace(project)
    if not workspace:
        raise ValueError('ppt workspace is missing')
    return workspace.stage or ('COMPLETED' if workspace.state == 'ready' else 'DRAFT')


def set_ppt_status(project, status: str):
    workspace = get_ppt_workspace(project)
    if not workspace or workspace.current_version_id is None:
        raise ValueError('ppt workspace is not initialized')
    workspace.stage = status
    workspace.state = 'ready' if status in _READY_STAGES else 'draft'
    return workspace


def _page_manifest(page) -> dict:
    current_image = page.image_versions.filter_by(is_current=True).first()
    return {
        'page_id': page.id,
        'order_index': page.order_index,
        'status': page.status,
        'image_version_id': current_image.id if current_image else None,
        'native_layout': page.native_layout,
    }


def build_ppt_manifest(project, operation: str, changed_page_ids=()) -> dict:
    pages = sorted(project.pages, key=lambda page: page.order_index)
    return {
        'schema_version': 1,
        'page_refs': [page.id for page in pages],
        'pages': [_page_manifest(page) for page in pages],
        'operation': operation,
        'changed_page_ids': list(dict.fromkeys(changed_page_ids)),
    }


def record_ppt_revision(
    project,
    operation: str,
    *,
    changed_page_ids=(),
    source_type='manual',
    expected_revision=None,
):
    workspace = get_ppt_workspace(project)
    if not workspace or workspace.current_version_id is None:
        raise ValueError('ppt workspace is not initialized')
    db.session.flush()
    version = save_workspace_revision(
        workspace,
        build_ppt_manifest(project, operation, changed_page_ids),
        json.loads(workspace.settings_json or '{}'),
        expected_revision=workspace.revision if expected_revision is None else expected_revision,
        source_type=source_type,
    )
    workspace.source_kind = 'ppt'
    workspace.source_revision = version.revision
    return version


def update_ppt_settings(
    project,
    patch: dict,
    *,
    expected_revision=None,
    record_revision=True,
):
    workspace = get_ppt_workspace(project)
    if not workspace or workspace.current_version_id is None:
        raise ValueError('ppt workspace is not initialized')
    settings = json.loads(workspace.settings_json or '{}')
    settings.update(patch)
    workspace.settings_json = json.dumps(
        settings,
        ensure_ascii=False,
        sort_keys=True,
        separators=(',', ':'),
    )
    if not record_revision:
        return workspace
    return record_ppt_revision(
        project,
        'ppt.settings',
        expected_revision=expected_revision,
    )


def propose_ppt_to_spine(project, target_base_revision: int):
    from services.content_sync_service import create_sync_proposal

    workspace = get_ppt_workspace(project)
    if not workspace or workspace.current_version_id is None:
        raise ValueError('ppt workspace is not initialized')
    spine_document = json.loads(project.content_spine.document_json)
    sections = {
        section['section_id']: section
        for section in spine_document.get('sections', [])
    }
    items = []
    for page in sorted(project.pages, key=lambda item: item.order_index):
        outline = page.get_outline_content() or {}
        description = page.get_description_content() or {}
        section_id = f'ppt.page:{page.id}'
        summary = description.get('text') or description.get('summary') or ''
        if isinstance(description.get('text_content'), list):
            summary = '\n'.join(
                str(item) for item in description['text_content'] if str(item).strip()
            )
        candidate = {
            'section_id': section_id,
            'title': str(outline.get('title') or f'第 {page.order_index + 1} 页'),
            'summary': str(summary),
            'key_points': [
                str(item) for item in outline.get('points', []) if str(item).strip()
            ],
            'fact_refs': [],
            'source_refs': [],
        }
        before = sections.get(section_id)
        if before == candidate:
            continue
        items.append({
            'item_id': f'{section_id}.structure',
            'path': f'/sections/{section_id}',
            'operation': 'replace' if before else 'add',
            'change_type': 'structure',
            'before': before,
            'after': candidate,
            'source_ref': page.id,
        })
    if not items:
        raise ValueError('No structured PPT changes to propose')
    return create_sync_proposal(
        project,
        source_kind='ppt',
        target_kind='spine',
        source_revision=workspace.revision,
        target_base_revision=target_base_revision,
        diff={'schema_version': 1, 'items': items},
        reason='PPT structured content update',
    )
