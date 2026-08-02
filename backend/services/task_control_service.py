"""Shared task control service (reconstruction plan §5.4/阶段1).

暂停/继续/取消/重试必须同时更新 Task 与关联的 WorkspaceGenerationRun，
不再允许只改 Run 状态而后台 worker 继续执行。任务控制能力由服务端
统一计算，前端不再硬编码哪些 task type 可以暂停。
"""

from models import WorkspaceGenerationRun, db

PAUSABLE_TASK_TYPES = {
    'GENERATE_DESCRIPTIONS',
    'GENERATE_IMAGES',
    'NARRATION_AI_BATCH',
    'GENERATE_WORKSPACE_CANDIDATE',
    'EXPORT_VIDEO_WORKSPACE',
    'EXPORT_PODCAST_WORKSPACE',
    'INITIALIZE_CONTENT_WORKSPACE',
}

CATEGORY_BY_TYPE = {
    'GENERATE_DESCRIPTIONS': 'generate',
    'GENERATE_IMAGES': 'generate',
    'NARRATION_AI_BATCH': 'optimize',
    'GENERATE_WORKSPACE_CANDIDATE': 'generate',
    'EXPORT_VIDEO_WORKSPACE': 'export',
    'EXPORT_PODCAST_WORKSPACE': 'export',
    'INITIALIZE_CONTENT_WORKSPACE': 'initialize',
}

WORKSPACE_KIND_BY_TYPE = {
    'GENERATE_DESCRIPTIONS': 'ppt',
    'GENERATE_IMAGES': 'ppt',
    'NARRATION_AI_BATCH': 'ppt',
    'EXPORT_VIDEO_WORKSPACE': 'video',
    'EXPORT_PODCAST_WORKSPACE': 'podcast',
}


def _related_run(task_id: str) -> WorkspaceGenerationRun | None:
    return WorkspaceGenerationRun.query.filter_by(task_id=task_id).first()


def _set_run_status(run, status: str) -> None:
    """原子控制契约：控制服务直接设置 Run 状态，避免状态机拒绝合法控制动作。

    已发布的正式版本绝不回退；其余状态由控制动作权威决定。
    """
    if run and run.status != 'PUBLISHED' and run.status != status:
        run.status = status


def pause_task(task) -> None:
    """Pause the task and its related generation run atomically."""
    if task.status in {'PENDING', 'PROCESSING', 'RUNNING'}:
        task.status = 'PAUSED'
        _set_run_status(_related_run(task.id), 'PAUSED')


def cancel_task(task) -> None:
    """Cancel the task and its related generation run atomically."""
    if task.status not in {'COMPLETED', 'CANCELLED'}:
        task.status = 'CANCELLED'
        _set_run_status(_related_run(task.id), 'CANCELLED')


def _resubmit(task) -> None:
    """Re-submit a task from its frozen ``_resume`` kwargs."""
    from services.task_manager import task_manager

    resume = task.get_progress().get('_resume') if isinstance(task.get_progress(), dict) else None
    if not isinstance(resume, dict) or not isinstance(resume.get('kwargs'), dict):
        return
    kind = resume.get('kind')
    kwargs = dict(resume['kwargs'])
    if kind == 'workspace-candidate':
        from services.task_manager import generate_workspace_candidate_task
        run_id = kwargs.get('run_id')
        if not run_id:
            return
        from flask import current_app
        task_manager.submit_task(
            task.id,
            generate_workspace_candidate_task,
            run_id=run_id,
            app=current_app._get_current_object(),
        )
    elif kind == 'content-workspace':
        from controllers.content_workspace_controller import submit_workspace_task
        submit_workspace_task(task.id, **kwargs)


def resume_task(task) -> None:
    """Resume a task: active worker flips to PROCESSING, otherwise resubmit."""
    from services.task_manager import task_manager

    if task.status in {'PAUSED', 'FAILED'}:
        if task_manager.is_task_active(task.id):
            task.status = 'PROCESSING'
            task.error_message = None
        else:
            task.status = 'PENDING'
            task.error_message = None
            task.completed_at = None
            _resubmit(task)
        _set_run_status(_related_run(task.id), 'RUNNING')


def retry_task(task) -> None:
    """Retry a failed task with the same frozen input; never duplicate output."""
    from services.task_manager import task_manager

    if task.status not in {'FAILED', 'CANCELLED', 'COMPLETED'}:
        return
    task.status = 'PENDING'
    task.error_message = None
    task.completed_at = None
    _set_run_status(_related_run(task.id), 'PENDING')
    _resubmit(task)


def task_capabilities(task) -> dict:
    """Server-computed control capabilities for a task."""
    status = task.status
    pausable = task.task_type in PAUSABLE_TASK_TYPES
    retry = status in {'FAILED', 'CANCELLED'}
    if not retry and status == 'COMPLETED':
        # REVIEW_READY 运行可以重新生成候选（冻结快照不变）
        run = _related_run(task.id)
        if run and run.status == 'REVIEW_READY':
            retry = True
    return {
        'pause': pausable and status in {'PENDING', 'PROCESSING', 'RUNNING'},
        'resume': pausable and status in {'PAUSED', 'FAILED'},
        'cancel': status in {'PENDING', 'PROCESSING', 'RUNNING', 'PAUSED'},
        'retry': retry,
    }


def task_projection(task) -> dict:
    """Unified task projection for the task center and project task panel (§5.2)."""
    progress = task.get_progress() if isinstance(task.get_progress(), dict) else {}
    run = _related_run(task.id)
    status = task.status
    if status in {'PROCESSING', 'RUNNING'}:
        display_status = 'RUNNING'
    else:
        display_status = status
    result = {}
    if run:
        result['run_id'] = run.id
        if run.status in {'REVIEW_READY', 'STALE'}:
            result['route'] = (
                f'/project/{run.project_id}/{run.target_workspace_kind}/review/{run.id}'
            )
        elif run.status == 'PUBLISHED':
            result['route'] = f'/project/{run.project_id}/{run.target_workspace_kind}'
    download_url = progress.get('download_url')
    if download_url:
        result['download_url'] = download_url
    if progress.get('filename'):
        result['filename'] = progress['filename']
    return {
        'task_id': task.id,
        'project_id': task.project_id,
        'task_type': task.task_type,
        'category': progress.get('category') or CATEGORY_BY_TYPE.get(task.task_type, 'export'),
        'workspace_kind': progress.get('workspace_kind') or WORKSPACE_KIND_BY_TYPE.get(task.task_type),
        'operation': progress.get('operation'),
        'status': display_status,
        'progress': {
            'total': progress.get('total', 0),
            'completed': progress.get('completed', 0),
            'percent': progress.get('percent', 0),
            'current_step': progress.get('current_step'),
            'stage': progress.get('stage'),
            'item_ids': progress.get('item_ids'),
        },
        'capabilities': task_capabilities(task),
        'result': result,
        'error_code': progress.get('error_code'),
        'error_message': task.error_message,
        'created_at': task.created_at.isoformat() if task.created_at else None,
        'completed_at': task.completed_at.isoformat() if task.completed_at else None,
    }
