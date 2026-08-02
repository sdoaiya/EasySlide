"""Workspace generation runs: create, freeze sources, transitions, publish.

Implements the reconstruction plan §3.3 / §4.1 state machine. Generation
execution itself (AI tasks) lands in a later stage; this service owns the
persistence contract, source snapshot freezing, staleness detection and
the idempotent publish transaction.
"""

import json
from datetime import datetime

from models import (
    ProjectWorkspace,
    WorkspaceGenerationRun,
    WorkspaceVersion,
    db,
)
from services.project_brief_service import get_project_brief_snapshot, snapshot_hash
from services.project_workspace_service import validate_workspace_document

# state machine transitions; a state not listed accepts no outgoing edges
_STATUS_TRANSITIONS = {
    'PENDING': {'RUNNING', 'CANCELLED'},
    'RUNNING': {'PAUSED', 'REVIEW_READY', 'FAILED', 'CANCELLED'},
    'PAUSED': {'RUNNING', 'CANCELLED'},
    'REVIEW_READY': {'PUBLISHING', 'STALE', 'PENDING'},
    'PUBLISHING': {'PUBLISHED', 'FAILED'},
    'STALE': {'PUBLISHING', 'PENDING'},
    'FAILED': {'PENDING'},
    'CANCELLED': set(),
    'PUBLISHED': set(),
}

VALID_TARGET_KINDS = {'video', 'podcast'}
VALID_SOURCE_KINDS = {'brief', 'ppt'}
VALID_MODES = {'direct', 'preserve', 'ai_adapt'}
VALID_OPERATIONS = {'generate', 'polish', 'shorten', 'expand', 'regenerate'}


class GenerationRunError(ValueError):
    pass


class GenerationRunStateError(GenerationRunError):
    pass


class GenerationAlreadyActive(GenerationRunError):
    pass


class SourceSnapshotChanged(GenerationRunError):
    pass


class FeatureDisabled(GenerationRunError):
    pass


def canonical_json(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def _active_run_exists(project_id: str, target_workspace_kind: str) -> bool:
    return db.session.query(WorkspaceGenerationRun.id).filter_by(
        project_id=project_id,
        target_workspace_kind=target_workspace_kind,
    ).filter(
        WorkspaceGenerationRun.status.in_(
            {'PENDING', 'RUNNING', 'PAUSED', 'PUBLISHING'},
        ),
    ).first() is not None


def _target_workspace(project, kind: str) -> ProjectWorkspace:
    workspace = next(
        (item for item in project.workspaces if item.kind == kind), None,
    )
    if not workspace:
        raise GenerationRunError(f'{kind} 工作区不存在')
    return workspace


def build_ppt_source_snapshot(project, *, page_ids=None) -> dict:
    """Freeze selected PPT pages with versions and content hashes (§3.4).

    The snapshot is immutable by contract: callers store it as-is and never
    mutate it after creation.
    """
    pages = [page for page in (project.pages or [])]
    if page_ids:
        wanted = set(page_ids)
        pages = [page for page in pages if page.id in wanted]
        missing = sorted(wanted - {page.id for page in pages})
        if missing:
            raise GenerationRunError(f'页面不存在: {", ".join(missing)}')
    ppt = _target_workspace(project, 'ppt')
    frozen_pages = []
    for page in sorted(pages, key=lambda item: item.order_index):
        outline = page.get_outline_content() or {}
        description = page.get_description_content() or {}
        narration = page.get_narration_segments() or page.narration_text or ''
        frozen_pages.append({
            'page_id': page.id,
            'order_index': page.order_index,
            'page_revision': page.revision if hasattr(page, 'revision') else 0,
            'title': str(outline.get('title') or ''),
            'outline': outline,
            'description': description,
            'narration_version_id': page.current_narration_version_id,
            'narration': narration,
            'visual_kind': 'native_scene' if page.native_layout else 'image',
            'visual_ref': page.native_layout or page.generated_image_path or page.cached_image_path,
            'visual_revision': 0,
            'source_hash': '',
        })
    for item in frozen_pages:
        item['source_hash'] = snapshot_hash(item)
    payload = {
        'schema_version': 1,
        'source_kind': 'ppt',
        'workspace_id': ppt.id,
        'workspace_version_id': ppt.current_version_id,
        'workspace_revision': ppt.revision,
        'project_title': project.project_title or '',
        'pages': frozen_pages,
    }
    payload['content_hash'] = snapshot_hash(payload)
    return payload


def create_generation_run(project, *, target_workspace_kind, source_kind, mode,
                          operation='generate', options=None, page_ids=None,
                          parent_run_id=None) -> WorkspaceGenerationRun:
    """Create a PENDING generation run with a frozen source snapshot.

    The run only freezes input data; it never writes the formal workspace.
    """
    if target_workspace_kind not in VALID_TARGET_KINDS:
        raise GenerationRunError('目标工作区只支持 video 或 podcast')
    if source_kind not in VALID_SOURCE_KINDS:
        raise GenerationRunError('源类型只支持 brief 或 ppt')
    if mode not in VALID_MODES:
        raise GenerationRunError('无效的适配方式')
    if operation not in VALID_OPERATIONS:
        raise GenerationRunError('无效的生成操作')
    _target_workspace(project, target_workspace_kind)
    if _active_run_exists(project.id, target_workspace_kind):
        raise GenerationAlreadyActive(f'{target_workspace_kind} 工作区已有活动生成运行')

    if source_kind == 'ppt':
        ppt = _target_workspace(project, 'ppt')
        snapshot = build_ppt_source_snapshot(project, page_ids=page_ids)
        source_workspace_id = ppt.id
        source_version_id = ppt.current_version_id
        source_revision = ppt.revision
    else:
        snapshot = get_project_brief_snapshot(project)
        source_workspace_id = None
        source_version_id = None
        source_revision = int(snapshot.get('revision') or 0)

    target = _target_workspace(project, target_workspace_kind)
    run = WorkspaceGenerationRun(
        project_id=project.id,
        target_workspace_kind=target_workspace_kind,
        source_kind=source_kind,
        source_workspace_id=source_workspace_id,
        source_version_id=source_version_id,
        source_revision=source_revision,
        source_snapshot_json=canonical_json(snapshot),
        source_snapshot_hash=snapshot['content_hash'],
        parent_run_id=parent_run_id,
        mode=mode,
        operation=operation,
        options_json=canonical_json(options or {}),
        status='PENDING',
        target_workspace_id=target.id,
    )
    db.session.add(run)
    db.session.flush()
    return run


def transition_run(run: WorkspaceGenerationRun, next_status: str) -> WorkspaceGenerationRun:
    allowed = _STATUS_TRANSITIONS.get(run.status, set())
    if next_status not in allowed:
        raise GenerationRunStateError(
            f'生成运行状态不允许从 {run.status} 转换到 {next_status}'
        )
    run.status = next_status
    if next_status == 'PUBLISHED':
        run.published_at = datetime.utcnow()
    return run


def mark_stale_if_source_changed(run: WorkspaceGenerationRun, project) -> bool:
    """Mark REVIEW_READY runs STALE when their source version moved on.

    The candidate document is never silently replaced; users choose to
    publish the old candidate or regenerate from the current source.
    """
    if run.status != 'REVIEW_READY':
        return False
    try:
        if run.source_kind == 'ppt':
            stored = json.loads(run.source_snapshot_json)
            current_snapshot = build_ppt_source_snapshot(
                project,
                page_ids=[item.get('page_id') for item in (stored.get('pages') or [])],
            )
        else:
            current_snapshot = get_project_brief_snapshot(project)
    except (GenerationRunError, ValueError, TypeError):
        # 源页面被删除或源快照损坏时视为源已变化，绝不改写候选内容。
        run.status = 'STALE'
        return True
    if current_snapshot.get('content_hash') != run.source_snapshot_hash:
        run.status = 'STALE'
        return True
    return False


def set_candidate(run: WorkspaceGenerationRun, document: dict) -> WorkspaceGenerationRun:
    """Attach a generated candidate; the candidate must be REVIEW_READY-able."""
    candidate_hash = snapshot_hash(document)
    run.candidate_document_json = canonical_json(document)
    run.candidate_hash = candidate_hash
    run.error_code = None
    run.error_message = None
    return run


def publish_run(run: WorkspaceGenerationRun, project) -> WorkspaceGenerationRun:
    """Publish the candidate as a new formal workspace version (§4.1).

    The WorkspaceVersion creation, workspace pointer update and run state
    change happen in one transaction. Publishing is idempotent: repeating
    the request returns the same published version.
    """
    if run.status == 'PUBLISHED' and run.published_version_id:
        return run
    if run.status not in {'REVIEW_READY', 'STALE', 'PUBLISHING'}:
        raise GenerationRunStateError(
            f'只有可审查候选可以发布，当前状态 {run.status}'
        )
    if not run.candidate_document_json:
        raise GenerationRunError('生成运行还没有候选文档')

    workspace = ProjectWorkspace.query.filter_by(id=run.target_workspace_id).one_or_none()
    if not workspace:
        raise GenerationRunError('目标工作区不存在')

    document = json.loads(run.candidate_document_json)
    # 候选文档是 V2 超集（script/voice/transition dict/独立标题），正式工作区
    # 按 V1 契约存储：发布时降级为 V1 形状，编辑器读取时再升级（§4.1/阶段2）
    if workspace.kind == 'video':
        from services.video_workspace_service import downgrade_video_document_v2_to_v1
        document = downgrade_video_document_v2_to_v1(document)
    elif workspace.kind == 'podcast':
        from services.podcast_service import downgrade_podcast_document_v2_to_v1
        document = downgrade_podcast_document_v2_to_v1(document)
    validate_workspace_document(workspace.kind, document)
    options = json.loads(run.options_json or '{}')
    settings = options.get('workspace_settings') or {}

    run.status = 'PUBLISHING'
    db.session.flush()
    try:
        version = WorkspaceVersion(
            workspace_id=workspace.id,
            revision=workspace.revision + 1,
            document_json=canonical_json(document),
            settings_json=canonical_json(settings),
            content_hash=snapshot_hash({'document': document, 'settings': settings}),
            source_type='ai',
            parent_version_id=workspace.current_version_id,
        )
        db.session.add(version)
        db.session.flush()
        workspace.revision = version.revision
        workspace.current_version_id = version.id
        workspace.document_json = version.document_json
        workspace.settings_json = version.settings_json
        workspace.state = 'ready'
        # 来源语义受 project_workspaces.source_kind 枚举约束；brief 来源记为
        # manual，真实来源由 generation run（source_ref=generation-run:...）保留。
        workspace.source_kind = 'ppt' if run.source_kind == 'ppt' else 'manual'
        workspace.source_revision = run.source_revision
        workspace.source_ref = f'generation-run:{run.id}'
        run.status = 'PUBLISHED'
        run.published_version_id = version.id
        run.published_at = datetime.utcnow()
        db.session.commit()
    except Exception:
        db.session.rollback()
        run = db.session.get(WorkspaceGenerationRun, run.id)
        run.status = 'FAILED'
        run.error_code = 'PUBLISH_FAILED'
        db.session.commit()
        raise
    return run


def build_candidate_document(run: WorkspaceGenerationRun) -> tuple[dict, list[str]]:
    """Build the candidate document from the run's frozen snapshot.

    Returns ``(document, item_ids)``. Stage 2 uses the mechanical first-pass
    builders; AI adaptation for PPT → video and direct generation lands in
    later stages without changing the pipeline contract.
    """
    from services.podcast_service import build_podcast_document_from_brief
    from services.video_workspace_service import (
        build_video_document_from_brief,
        build_video_document_from_ppt_snapshot,
    )

    snapshot = json.loads(run.source_snapshot_json)
    options = json.loads(run.options_json or '{}')
    if run.source_kind == 'ppt':
        document = build_video_document_from_ppt_snapshot(snapshot, options)
    elif run.target_workspace_kind == 'video':
        document = build_video_document_from_brief(snapshot, options)
    else:
        document = build_podcast_document_from_brief(snapshot, options)
    # 候选文档是 V2 超集：V1 形状的 builder 输出在此增强 voice/script/
    # transition/独立标题等阶段 2 契约字段（正式工作区发布时再降级 V1）
    if run.target_workspace_kind == 'video':
        from services.video_workspace_service import enrich_video_candidate_document
        document = enrich_video_candidate_document(document, options)
    elif 'segments' in document:
        from services.podcast_service import enrich_podcast_candidate_document
        document = enrich_podcast_candidate_document(document)
    item_ids = [
        str(item.get('scene_id') or item.get('segment_id'))
        for item in (document.get('scenes') or document.get('segments') or [])
    ]
    return document, item_ids


def apply_candidate_optimization(run: WorkspaceGenerationRun) -> tuple[dict, list[str]]:
    """Build an optimized child candidate from the parent's frozen candidate.

    Child runs (``parent_run_id`` set) never touch the parent candidate or
    the live source; each requested item is rewritten by the text provider
    with the user instruction, and items the provider cannot rewrite keep
    their original text (outcome recorded in task progress).
    """
    from services.prompts import get_video_scene_optimize_prompt

    if not run.parent_run_id:
        raise GenerationRunError('只有子运行可以执行候选优化')
    parent = WorkspaceGenerationRun.query.get(run.parent_run_id)
    if not parent or not parent.candidate_document_json:
        raise GenerationRunError('父运行没有可优化的候选')
    base = json.loads(parent.candidate_document_json)
    options = json.loads(run.options_json or '{}')
    item_ids = list(options.get('item_ids') or [])
    instruction = str(options.get('instruction') or '')
    operation = run.operation or 'polish'
    style_profile_id = str(options.get('style_profile_id') or '')
    expressiveness_id = str(options.get('expressiveness_id') or '')

    def _rewrite(item: dict) -> dict:
        if 'narration' in item:
            base_text = str(item.get('narration', {}).get('text') or '')
        else:
            base_text = str(item.get('text') or '')
        if not base_text.strip():
            return item
        prompt = get_video_scene_optimize_prompt(
            operation=operation,
            scene_title=str(item.get('title') or ''),
            base_text=base_text,
            instruction=instruction,
            style_profile_id=style_profile_id,
            expressiveness_id=expressiveness_id,
        )
        from services.ai_service_manager import get_ai_service

        raw = str(get_ai_service().text_provider.generate_text(prompt) or '').strip()
        if raw.startswith('```'):
            raw = raw.split('\n', 1)[-1].rsplit('```', 1)[0].strip()
        try:
            result = json.loads(raw)
            text = str(result.get('text') or '').strip()
        except (TypeError, ValueError):
            # 供应商返回不可解析内容时保留原文，不污染候选
            return item
        if not text:
            return item
        updated = json.loads(canonical_json(item))
        if 'narration' in updated:
            updated['narration'] = {**updated['narration'], 'text': text}
            if 'subtitles' in updated and isinstance(updated['subtitles'], dict):
                updated['subtitles'] = {**updated['subtitles'], 'text': text}
        else:
            updated['text'] = text
        return updated

    if 'scenes' in base:
        scenes = []
        for scene in base['scenes']:
            item_id = str(scene.get('scene_id') or '')
            scenes.append(_rewrite(scene) if item_id in item_ids else scene)
        document = {**base, 'scenes': scenes}
        item_ids = [str(scene.get('scene_id') or '') for scene in base['scenes']]
    elif 'segments' in base:
        segments = []
        for segment in base['segments']:
            item_id = str(segment.get('segment_id') or '')
            segments.append(_rewrite(segment) if item_id in item_ids else segment)
        document = {**base, 'segments': segments}
        item_ids = [str(segment.get('segment_id') or '') for segment in base['segments']]
    else:
        document = base
    return document, item_ids


def generation_error_code(exc: Exception) -> str:
    """Map provider failures to the stable run error contract."""
    upstream_status = getattr(getattr(exc, 'response', None), 'status_code', None)
    if upstream_status == 429:
        return 'RATE_LIMIT_EXCEEDED'
    return 'GENERATION_FAILED'


def generation_error_message(exc: Exception) -> str:
    upstream_status = getattr(getattr(exc, 'response', None), 'status_code', None)
    if upstream_status == 429:
        return 'AI 服务当前请求过于频繁，请稍后重试，或在设置中切换文本模型。'
    return str(exc) or '生成候选失败'
