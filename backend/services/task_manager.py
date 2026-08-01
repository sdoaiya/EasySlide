"""
Task Manager - handles background tasks using ThreadPoolExecutor
No need for Celery or Redis, uses in-memory task tracking
"""
import logging
import json
import os
import shutil
import tempfile
import threading
from concurrent.futures import (
    FIRST_COMPLETED,
    TimeoutError as FutureTimeoutError,
    ThreadPoolExecutor,
    as_completed,
    wait,
)
from contextlib import contextmanager
from typing import Callable, List, Dict, Any, Optional
from datetime import datetime
from math import gcd
import time
from sqlalchemy import func
from sqlalchemy.exc import OperationalError
from PIL import Image, ImageDraw, ImageFilter
from models import db, Task, Page, Project, Material, PageImageVersion, Settings
from services.image_generation_manifest import (
    persist_image_generation_manifest,
    update_manifest_page,
    write_prompt_snapshot,
)
from services.image_generation_quality import (
    assess_generated_image,
    generate_image_until_quality_passes,
    summarize_generation_quality,
)
from services.ai_service_manager import get_ai_service
from services.content_spine_service import (
    get_spine_source_fields,
    update_spine_source_fields,
)
from services.ppt_workspace_service import (
    get_ppt_settings,
    get_ppt_status,
    record_ppt_revision,
    set_ppt_status,
    update_ppt_settings,
)
from utils import get_filtered_pages
from utils.image_utils import check_image_resolution

logger = logging.getLogger(__name__)


def _is_edge_tts_voice_name(voice: str) -> bool:
    """校验 edge-tts 音色名的语言前缀格式。"""
    if not voice or '-' not in voice:
        return False
    locale = voice.split('-', 1)[0]
    return locale.isalpha() and locale.islower() and 2 <= len(locale) <= 3


def _set_export_task_progress(task: Task, progress: dict):
    """Update progress without discarding restart data saved by the controller."""
    resume = task.get_progress().get('_resume')
    if resume:
        progress['_resume'] = resume
    task.set_progress(progress)


def _wait_if_task_paused(task_id: str):
    """Pause cooperatively at task progress boundaries."""
    while True:
        db.session.expire_all()
        task = Task.query.get(task_id)
        if not task or task.status != 'PAUSED':
            return
        time.sleep(0.25)


def _is_task_paused(task_id: str) -> bool:
    db.session.expire_all()
    task = Task.query.get(task_id)
    return bool(task and task.status == 'PAUSED')


def _wait_if_export_task_paused(task_id: str):
    _wait_if_task_paused(task_id)


def _set_image_task_progress(task: Task, progress: dict, upload_folder=None):
    """Keep restart metadata while updating live image-generation progress."""
    current = task.get_progress()
    for key in (
        'generation_id', 'manifest_version', 'manifest_path', 'project_id',
        'created_at', 'requested_page_ids', 'page_ids', 'image_options',
        'style_snapshot', 'pages',
    ):
        if key not in progress and key in current:
            progress[key] = current[key]
    task.set_progress(progress)
    if upload_folder and progress.get('generation_id') and progress.get('project_id'):
        persist_image_generation_manifest(upload_folder, progress)


def get_image_prompt_field_names() -> set:
    """读取设置中允许进入文生图 prompt 的额外字段名。"""
    try:
        settings = Settings.get_settings()
        return set(settings.get_image_prompt_extra_fields())
    except Exception as e:
        logger.warning("Failed to retrieve image prompt extra fields; using defaults: %s", e)
        return set(Settings.DEFAULT_IMAGE_PROMPT_FIELDS)


def get_image_quality_control_enabled() -> bool:
    """Return the optional multimodal image gate setting, defaulting to off."""
    try:
        return bool(Settings.get_settings().enable_image_quality_control)
    except Exception as exc:
        logger.warning("Failed to retrieve image quality-control setting; disabling gate: %s", exc)
        return False


def _image_scene_enabled(app) -> bool:
    return bool(
        app
        and app.config.get('IMAGE_SCENE_ENABLED', False)
        and app.config.get('HYPERFRAMES_ENABLED', False)
    )


def _prepare_image_scene_version(
    image,
    *,
    project_id,
    page_id,
    page_data,
    description,
    page_index,
    file_service,
    app,
):
    from services.hyperframes_renderer import HyperframesRuntime
    from services.image_scene_service import (
        create_image_scene_artifacts,
        fit_image_scene_background,
    )

    title = str((page_data or {}).get('title') or f'第 {page_index} 页').strip()
    body_lines = _image_scene_body_lines(page_data, description)
    electron = os.environ.get('EASYSLIDE_ELECTRON_EXECUTABLE')
    if electron:
        runtime = HyperframesRuntime.for_packaged(electron)
    else:
        project_root = Path(__file__).resolve().parents[2]
        runtime = HyperframesRuntime.for_development(
            project_root,
            browser_path=os.environ.get('HYPERFRAMES_BROWSER_PATH'),
        )
    background = fit_image_scene_background(image)
    try:
        artifacts = create_image_scene_artifacts(
            page_id=page_id,
            background_image=background,
            title=title,
            body_lines=body_lines,
            chart_data=_image_scene_chart_data(page_data),
            output_directory=(
                Path(file_service.upload_folder) / project_id / 'image-scenes' / page_id
            ),
            runtime=runtime,
            ffmpeg_path=app.config.get('FFMPEG_PATH', 'ffmpeg'),
        )
    finally:
        background.close()
    with Image.open(artifacts['hero_path']) as hero:
        version_image = hero.copy()
    return version_image, artifacts


def _image_scene_body_lines(page_data, description):
    lines = []
    for key in ('subtitle', 'content', 'key_points', 'points'):
        value = (page_data or {}).get(key)
        values = list(value.values()) if isinstance(value, dict) else value
        if isinstance(values, str):
            values = values.splitlines()
        if isinstance(values, (list, tuple)):
            for item in values:
                text = str(item).strip()
                if text and text not in lines:
                    lines.append(text[:120])
    if not lines:
        lines = [line.strip()[:120] for line in str(description or '').splitlines() if line.strip()]
    return lines[:6]


def _image_scene_chart_data(page_data):
    data = page_data or {}
    for key in ('chart_data', 'chartData', 'chart', 'metrics'):
        value = data.get(key)
        if isinstance(value, (list, dict)):
            return value
    return None


def recover_historical_image_scenes_task(
    task_id,
    project_id,
    version_ids,
    file_service,
    app,
    force=False,
):
    if app is None:
        raise ValueError('Flask app instance must be provided')
    with app.app_context():
        from services.historical_image_scene_service import (
            create_historical_image_scene_artifacts,
        )
        from services.hyperframes_renderer import HyperframesRuntime
        from services.image_editability import ImageEditabilityService, ServiceConfig

        task = db.session.get(Task, task_id)
        if not task:
            return
        task.status = 'PROCESSING'
        progress = {'total': len(version_ids), 'completed': 0, 'failed': 0, 'pages': []}
        resume = task.get_progress().get('_resume')
        if resume:
            progress['_resume'] = resume
        task.set_progress(progress)
        db.session.commit()
        try:
            config = ServiceConfig.from_defaults(
                upload_folder=str(file_service.upload_folder),
                ai_service=get_ai_service(),
                max_depth=1,
            )
            editability = ImageEditabilityService(config)
            electron = os.environ.get('EASYSLIDE_ELECTRON_EXECUTABLE')
            runtime = (
                HyperframesRuntime.for_packaged(electron)
                if electron
                else HyperframesRuntime.for_development(
                    Path(__file__).resolve().parents[2],
                    browser_path=os.environ.get('HYPERFRAMES_BROWSER_PATH'),
                )
            )
            for version_id in version_ids:
                _wait_if_task_paused(task_id)
                version = db.session.get(PageImageVersion, version_id)
                if not version or not version.page or version.page.project_id != project_id:
                    progress['failed'] += 1
                    progress['pages'].append({
                        'version_id': version_id,
                        'status': 'failed',
                        'reason': '图片版本不存在',
                    })
                    continue
                if version.scene_status == 'ready' and not force:
                    progress['completed'] += 1
                    progress['pages'].append({
                        'page_id': version.page_id,
                        'version_id': version.id,
                        'status': 'skipped',
                        'level': _scene_level(version.scene_error, 'L0'),
                    })
                    continue

                version.scene_status = 'building'
                version.scene_error = None
                db.session.commit()
                try:
                    editable = editability.make_image_editable(
                        file_service.get_absolute_path(version.image_path)
                    )
                    artifacts = create_historical_image_scene_artifacts(
                        page_id=version.page_id,
                        editable_image=editable,
                        output_directory=(
                            Path(file_service.upload_folder)
                            / project_id
                            / 'historical-image-scenes'
                            / version.page_id
                            / version.id
                        ),
                        runtime=runtime,
                        ffmpeg_path=app.config.get('FFMPEG_PATH', 'ffmpeg'),
                    )
                    scene_ref = artifacts.get('scene_manifest_ref')
                    version.scene_manifest_path = scene_ref['path'] if scene_ref else None
                    version.scene_manifest_sha256 = scene_ref['sha256'] if scene_ref else None
                    version.scene_status = 'ready' if scene_ref else 'degraded'
                    version.scene_quality_score = (
                        round(1 - artifacts['visual_difference'], 4)
                        if scene_ref else None
                    )
                    version.scene_schema_version = 1 if scene_ref else None
                    version.scene_error = f"{artifacts['level']}: {artifacts['reason']}"
                    progress['completed'] += 1
                    progress['pages'].append({
                        'page_id': version.page_id,
                        'version_id': version.id,
                        'status': version.scene_status,
                        'level': artifacts['level'],
                        'reason': artifacts['reason'],
                    })
                except Exception as exc:
                    logger.exception(
                        'Historical image scene recovery failed for version %s',
                        version.id,
                    )
                    version.scene_status = 'failed'
                    version.scene_error = f'L3: {exc}'
                    progress['failed'] += 1
                    progress['pages'].append({
                        'page_id': version.page_id,
                        'version_id': version.id,
                        'status': 'failed',
                        'level': 'L3',
                        'reason': str(exc),
                    })
                db.session.commit()
                task = db.session.get(Task, task_id)
                task.set_progress(progress)
                db.session.commit()

            task = db.session.get(Task, task_id)
            task.status = 'COMPLETED'
            task.completed_at = datetime.utcnow()
            task.set_progress(progress)
            db.session.commit()
        except Exception as exc:
            logger.warning('Historical image scene recovery unavailable: %s', exc)
            progress['completed'] = 0
            progress['failed'] = 0
            progress['pages'] = []
            for version_id in version_ids:
                version = db.session.get(PageImageVersion, version_id)
                if not version or not version.page or version.page.project_id != project_id:
                    progress['failed'] += 1
                    continue
                version.scene_status = 'degraded'
                version.scene_manifest_path = None
                version.scene_manifest_sha256 = None
                version.scene_quality_score = None
                version.scene_schema_version = None
                version.scene_error = f'L3: 拆层服务不可用（{exc}）'
                progress['completed'] += 1
                progress['pages'].append({
                    'page_id': version.page_id,
                    'version_id': version.id,
                    'status': 'degraded',
                    'level': 'L3',
                    'reason': str(exc),
                })
            task = db.session.get(Task, task_id)
            if task:
                task.status = 'COMPLETED'
                task.error_message = None
                task.completed_at = datetime.utcnow()
                task.set_progress(progress)
                db.session.commit()


def _scene_level(scene_error, fallback):
    value = str(scene_error or '')
    return (
        value.split(':', 1)[0]
        if value.startswith(('L0:', 'L1:', 'L2:', 'L3:', 'L4:'))
        else fallback
    )


def review_generated_image(ai_service, image, prompt, page_desc, page_outline, page_index):
    """Persist a short-lived JPEG because multimodal providers review file paths."""
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as temp_file:
            temp_path = temp_file.name
        image.convert('RGB').save(temp_path, format='JPEG', quality=95)
        return ai_service.review_generated_slide_image(
            temp_path,
            prompt,
            page_desc,
            page_outline=page_outline,
            page_index=page_index,
        )
    finally:
        if temp_path:
            try:
                os.unlink(temp_path)
            except OSError:
                logger.warning("Failed to remove temporary image review file: %s", temp_path)


def _get_page_template_path(page: Page, file_service) -> Optional[str]:
    if not page.template_image_path:
        return None
    path = file_service.upload_folder / page.template_image_path.replace('\\', '/')
    return str(path) if path.exists() and path.is_file() else None


def _append_page_template_style(extra_requirements: Optional[str], page: Page) -> Optional[str]:
    style = (page.template_style_text or '').strip()
    if not style:
        return extra_requirements
    return f"{extra_requirements or ''}\n\n本页模板风格要求：\n{style}"


def prepare_page_for_image_generation(page: Page, file_service) -> bool:
    """Return whether a page needs generation, clearing stale file references."""
    image_path = page.generated_image_path
    if not image_path:
        return True
    if file_service.file_exists(image_path):
        try:
            with Image.open(file_service.get_absolute_path(image_path)) as image:
                image.verify()
            return False
        except (OSError, ValueError):
            logger.warning("Ignoring invalid generated image for page %s: %s", page.id, image_path)
    page.generated_image_path = None
    page.cached_image_path = None
    return True


def get_renovation_source_image_path(page: Page, file_service) -> Optional[str]:
    """Return the rendered original PDF page for a renovation project, if present."""
    source_path = file_service.get_absolute_path(
        f"{page.project_id}/pages/page_{page.order_index + 1}_original.png"
    )
    return source_path if os.path.isfile(source_path) else None


def is_renovation_project(project: Optional[Project]) -> bool:
    return bool(project and project.creation_type in {'renovation', 'ppt_renovation'})


def _append_extra_fields(
    desc_text: Optional[str],
    desc_content: Optional[dict],
    allowed_fields: Optional[set] = None,
) -> str:
    """将 extra_fields 拼接到描述文本末尾，供图片生成 prompt 使用。"""
    safe_desc = (desc_text or "").strip()
    if not desc_content or not isinstance(desc_content, dict):
        return safe_desc
    extra_fields = desc_content.get('extra_fields')
    if not extra_fields or not isinstance(extra_fields, dict):
        return safe_desc
    allowed = allowed_fields if allowed_fields is not None else get_image_prompt_field_names()
    parts = []
    if safe_desc:
        parts.append(safe_desc)
    for name, value in extra_fields.items():
        if value is not None and str(value).strip() != "" and name in allowed:
            parts.append(f"{name}：{value}")
    return '\n'.join(parts)
from pathlib import Path
from services.pdf_service import split_pdf_to_pages


class ResourceLimiter:
    """Thread-safe concurrency limiter for a shared external resource."""

    def __init__(self, name: str, capacity: int):
        self.name = name
        self.capacity = max(1, int(capacity))
        self._in_use = 0
        self._condition = threading.Condition()

    def update_capacity(self, capacity: int):
        new_capacity = max(1, int(capacity))
        with self._condition:
            if new_capacity == self.capacity:
                return
            logger.info(f"Updating {self.name} limiter: {self.capacity} -> {new_capacity}")
            self.capacity = new_capacity
            self._condition.notify_all()

    @contextmanager
    def slot(self, label: str, on_acquire: Optional[Callable[[], None]] = None):
        waited = False
        with self._condition:
            while self._in_use >= self.capacity:
                if not waited:
                    waited = True
                    logger.info(
                        f"{self.name} limiter full ({self._in_use}/{self.capacity}), "
                        f"waiting: {label}"
                    )
                self._condition.wait(timeout=0.5)

            self._in_use += 1

        if waited:
            logger.info(f"{self.name} limiter slot acquired: {label}")

        try:
            if on_acquire:
                on_acquire()
            yield
        finally:
            with self._condition:
                self._in_use -= 1
                self._condition.notify()


class TaskManager:
    """Simple task manager using ThreadPoolExecutor"""
    
    def __init__(self, max_workers: int = 4):
        """Initialize task manager"""
        self.executor = ThreadPoolExecutor(max_workers=max_workers)
        self.active_tasks = {}  # task_id -> Future
        self.lock = threading.Lock()
        self.max_workers = max_workers
    
    def submit_task(self, task_id: str, func: Callable, *args, **kwargs):
        """Submit a background task"""
        with self.lock:
            executor = self.executor

        future = executor.submit(func, task_id, *args, **kwargs)
        
        with self.lock:
            self.active_tasks[task_id] = future
        
        # Add callback to clean up when done and log exceptions
        future.add_done_callback(lambda f: self._task_done_callback(task_id, f))
    
    def _task_done_callback(self, task_id: str, future):
        """Handle task completion and log any exceptions"""
        try:
            # Check if task raised an exception
            exception = future.exception()
            if exception:
                logger.error(f"Task {task_id} failed with exception: {exception}", exc_info=exception)
        except Exception as e:
            logger.error(f"Error in task callback for {task_id}: {e}", exc_info=True)
        finally:
            self._cleanup_task(task_id)
    
    def _cleanup_task(self, task_id: str):
        """Clean up completed task"""
        with self.lock:
            if task_id in self.active_tasks:
                del self.active_tasks[task_id]
    
    def is_task_active(self, task_id: str) -> bool:
        """Check if task is still running"""
        with self.lock:
            return task_id in self.active_tasks
    
    def shutdown(self):
        """Shutdown the executor"""
        self.executor.shutdown(wait=True)

    def update_max_workers(self, max_workers: int):
        """Replace the shared executor so new tasks use a higher/lower ceiling."""
        new_max_workers = max(1, int(max_workers))
        old_executor = None

        with self.lock:
            if new_max_workers == self.max_workers:
                return

            logger.info(f"Updating background task pool size: {self.max_workers} -> {new_max_workers}")
            old_executor = self.executor
            self.executor = ThreadPoolExecutor(max_workers=new_max_workers)
            self.max_workers = new_max_workers

        if old_executor is not None:
            old_executor.shutdown(wait=False, cancel_futures=False)


def _compute_background_worker_target(description_workers: int, image_workers: int) -> int:
    """Keep the shared task pool from becoming the product-level bottleneck."""
    return max(8, int(description_workers) + int(image_workers) + 4)


# Global task manager and resource limiters
task_manager = TaskManager(max_workers=max(8, int(os.getenv('MAX_BACKGROUND_TASK_WORKERS', '16'))))
image_resource_limiter = ResourceLimiter("image", int(os.getenv('MAX_IMAGE_WORKERS', '20')))
text_resource_limiter = ResourceLimiter("text", int(os.getenv('MAX_DESCRIPTION_WORKERS', '20')))


def sync_resource_limits(description_workers: int, image_workers: int):
    """Apply the latest runtime settings to shared concurrency controls."""
    task_manager.update_max_workers(
        _compute_background_worker_target(description_workers, image_workers)
    )
    image_resource_limiter.update_capacity(image_workers)
    text_resource_limiter.update_capacity(description_workers)


def generate_workspace_candidate_task(
    task_id: str,
    run_id: str,
    app=None,
):
    """Generate a workspace candidate from a frozen run snapshot (阶段2).

    The task input only carries the run id; the frozen source snapshot and
    options are read from the run record, never from live project state.
    Progress only reports stage/total/completed/failed/item_ids.
    """
    from contextlib import nullcontext

    from models import WorkspaceGenerationRun
    from services.workspace_generation_service import (
        GenerationRunStateError,
        build_candidate_document,
        generation_error_code,
        generation_error_message,
        set_candidate,
        transition_run,
    )

    context = app.app_context() if app else nullcontext()
    with context:
        task = db.session.get(Task, task_id)
        if not task or task.status == 'CANCELLED':
            return
        run = db.session.get(WorkspaceGenerationRun, run_id)
        if not run:
            task.status = 'FAILED'
            task.error_message = '生成运行不存在，无法继续'
            task.completed_at = datetime.utcnow()
            db.session.commit()
            return
        if run.status == 'CANCELLED':
            task.status = 'CANCELLED'
            task.completed_at = datetime.utcnow()
            db.session.commit()
            return
        task.status = 'PROCESSING'
        progress = task.get_progress()
        progress.update({'stage': 'generating', 'total': 1, 'completed': 0, 'failed': 0})
        task.set_progress(progress)
        try:
            if run.status in {'PENDING', 'PAUSED'}:
                transition_run(run, 'RUNNING')
        except GenerationRunStateError:
            task.status = 'CANCELLED'
            task.completed_at = datetime.utcnow()
            db.session.commit()
            return
        db.session.commit()
        try:
            _wait_if_task_paused(task_id)
            task = db.session.get(Task, task_id)
            run = db.session.get(WorkspaceGenerationRun, run_id)
            if not task or task.status == 'CANCELLED' or run.status == 'CANCELLED':
                return
            document, item_ids = build_candidate_document(run)
            set_candidate(run, document)
            transition_run(run, 'REVIEW_READY')
            progress = task.get_progress()
            progress.update({
                'stage': 'review_ready',
                'total': 1,
                'completed': 1,
                'failed': 0,
                'item_ids': item_ids,
            })
            task.set_progress(progress)
            task.status = 'COMPLETED'
            task.completed_at = datetime.utcnow()
            db.session.commit()
        except Exception as exc:
            db.session.rollback()
            task = db.session.get(Task, task_id)
            run = db.session.get(WorkspaceGenerationRun, run_id)
            if task:
                progress = task.get_progress()
                progress.update({'stage': 'failed', 'failed': 1})
                task.set_progress(progress)
                task.status = 'FAILED'
                task.error_message = generation_error_message(exc)
                task.completed_at = datetime.utcnow()
            if run:
                run.status = 'FAILED'
                run.error_code = generation_error_code(exc)
                run.error_message = generation_error_message(exc)
            db.session.commit()
            raise


def initialize_content_workspace_task(
    task_id: str,
    project_id: str,
    workspace_kind: str,
    spine_revision: int,
    spine_hash: str,
    spine_document: dict,
    settings: dict,
    app=None,
):
    """Initialize one workspace from the immutable Spine snapshot saved in Task."""
    from contextlib import nullcontext
    from models import ProjectWorkspace
    from services.project_workspace_service import initialize_workspace_from_snapshot

    context = app.app_context() if app else nullcontext()
    with context:
        task = db.session.get(Task, task_id)
        if not task or task.status == 'CANCELLED':
            return
        task.status = 'PROCESSING'
        progress = task.get_progress()
        progress['stage'] = 'initializing_workspace'
        task.set_progress(progress)
        workspace = ProjectWorkspace.query.filter_by(
            project_id=project_id,
            kind=workspace_kind,
        ).one_or_none()
        if workspace and not workspace.current_version_id:
            workspace.stage = 'INITIALIZING'
        db.session.commit()
        try:
            _wait_if_task_paused(task_id)
            task = db.session.get(Task, task_id)
            if not task or task.status == 'CANCELLED':
                return
            initialize_workspace_from_snapshot(
                project_id,
                workspace_kind,
                spine_revision,
                spine_hash,
                spine_document,
                settings,
            )
            progress = task.get_progress()
            progress.update({
                'completed': 1,
                'failed': 0,
                'stage': 'completed',
                'workspace_kind': workspace_kind,
            })
            task.set_progress(progress)
            task.status = 'COMPLETED'
            task.completed_at = datetime.utcnow()
            workspace = ProjectWorkspace.query.filter_by(
                project_id=project_id,
                kind=workspace_kind,
            ).one_or_none()
            if workspace and workspace.current_version_id:
                workspace.stage = 'DRAFT'
            db.session.commit()
        except Exception as exc:
            db.session.rollback()
            task = db.session.get(Task, task_id)
            if task:
                progress = task.get_progress()
                progress.update({'failed': 1, 'stage': 'failed'})
                task.set_progress(progress)
                task.status = 'FAILED'
                workspace = ProjectWorkspace.query.filter_by(
                    project_id=project_id,
                    kind=workspace_kind,
                ).one_or_none()
                if workspace and not workspace.current_version_id:
                    workspace.stage = 'FAILED'
                task.error_message = str(exc)
                task.completed_at = datetime.utcnow()
                db.session.commit()
            raise


def generate_narration_candidates_task(
    task_id: str,
    project_id: str,
    page_ids: List[str],
    operation: str,
    *,
    instruction: str = '',
    selection=None,
    generation_config=None,
    app=None,
):
    """Create AI candidates sequentially; task progress contains IDs and outcomes only."""
    from contextlib import nullcontext
    from services.narration_service import (
        NarrationLocked,
        NarrationRevisionConflict,
        create_ai_narration_candidate,
        ensure_legacy_narration_version,
        provider_metadata,
    )
    from services.prompts import get_narration_candidate_prompt

    def parse_result(raw):
        value = str(raw or '').strip()
        if value.startswith('```'):
            value = value.split('\n', 1)[-1].rsplit('```', 1)[0].strip()
        result = json.loads(value)
        if not isinstance(result, dict):
            raise ValueError('invalid AI narration result')
        return result

    context = app.app_context() if app else nullcontext()
    with context:
        task = db.session.get(Task, task_id)
        if not task or task.status == 'CANCELLED':
            return
        task.status = 'PROCESSING'
        db.session.commit()

        progress = task.get_progress()
        progress.setdefault('pages', [])
        for page_id in page_ids:
            _wait_if_task_paused(task_id)
            db.session.expire_all()
            task = db.session.get(Task, task_id)
            if not task or task.status == 'CANCELLED':
                return

            page = db.session.get(Page, page_id)
            if not page or page.project_id != project_id:
                outcome = {'page_id': page_id, 'status': 'failed', 'reason': 'page_not_found'}
            elif page.narration_locked:
                outcome = {'page_id': page_id, 'status': 'skipped', 'reason': 'locked'}
            else:
                try:
                    current = ensure_legacy_narration_version(page)
                    db.session.commit()
                    base = current
                    if not base and operation != 'generate':
                        raise ValueError('missing_base_version')
                    payload = {
                        'operation': operation,
                        'base_revision': int(page.narration_revision or 0),
                        'base_version_id': base.id if base else None,
                        'instruction': instruction,
                        'selection': selection,
                        'generation_config': generation_config,
                    }
                    prompt = get_narration_candidate_prompt(
                        operation=operation,
                        base_text=base.text if base else '',
                        source={
                            'outline': page.get_outline_content() or {},
                            'description': page.get_description_content() or {},
                            'page_order': page.order_index + 1,
                        },
                        instruction=instruction,
                        selection=selection,
                        generation_config=generation_config,
                    )
                    result = parse_result(get_ai_service().text_provider.generate_text(prompt))
                    _wait_if_task_paused(task_id)
                    db.session.expire_all()
                    task = db.session.get(Task, task_id)
                    page = db.session.get(Page, page_id)
                    if not task or task.status == 'CANCELLED':
                        db.session.rollback()
                        return
                    if page.narration_locked:
                        outcome = {
                            'page_id': page_id,
                            'status': 'skipped',
                            'reason': 'locked_before_write',
                        }
                    else:
                        source_type = (
                            'ai_generated' if operation == 'generate'
                            else 'converted' if operation.startswith('convert_')
                            else 'ai_polished'
                        )
                        candidate = create_ai_narration_candidate(
                            page,
                            payload=payload,
                            result=result,
                            source_type=source_type,
                            provider_meta=provider_metadata(get_ai_service().text_provider),
                        )
                        db.session.commit()
                        outcome = {
                            'page_id': page_id,
                            'status': 'candidate',
                            'candidate_id': candidate.id,
                        }
                except (NarrationLocked, NarrationRevisionConflict):
                    db.session.rollback()
                    outcome = {'page_id': page_id, 'status': 'skipped', 'reason': 'changed_before_write'}
                except Exception as exc:
                    db.session.rollback()
                    reason = 'missing_base_version' if str(exc) == 'missing_base_version' else 'ai_service_error'
                    outcome = {'page_id': page_id, 'status': 'failed', 'reason': reason}

            progress['pages'].append(outcome)
            progress['completed'] = len(progress['pages'])
            progress['failed'] = sum(item['status'] == 'failed' for item in progress['pages'])
            progress['skipped'] = sum(item['status'] == 'skipped' for item in progress['pages'])
            task = db.session.get(Task, task_id)
            if not task or task.status == 'CANCELLED':
                return
            task.set_progress(progress)
            db.session.commit()

        task = db.session.get(Task, task_id)
        if task and task.status != 'CANCELLED':
            task.status = 'COMPLETED'
            task.completed_at = datetime.utcnow()
            db.session.commit()


def save_image_with_version(
    image,
    project_id: str,
    page_id: str,
    file_service,
    page_obj=None,
    image_format: str = 'PNG',
    scene_manifest_ref=None,
    scene_status=None,
    scene_quality_score=None,
    scene_schema_version=None,
    scene_error=None,
) -> tuple[str, int]:
    """
    保存图片并创建历史版本记录的公共函数

    Args:
        image: PIL Image 对象
        project_id: 项目ID
        page_id: 页面ID
        file_service: FileService 实例
        page_obj: Page 对象（可选，如果提供则更新页面状态）
        image_format: 图片格式，默认 PNG

    Returns:
        tuple: (image_path, version_number) - 图片路径和版本号

    这个函数会：
    1. 计算下一个版本号（使用 MAX 查询确保安全）
    2. 标记所有旧版本为非当前版本
    3. 保存图片到最终位置
    4. 生成并保存压缩的缓存图片
    5. 创建新版本记录
    6. 如果提供了 page_obj，更新页面状态和图片路径
    """
    # 使用 MAX 查询确保版本号安全（即使有版本被删除也不会重复）
    allowed_scene_statuses = {'missing', 'building', 'ready', 'degraded', 'failed'}
    resolved_scene_status = scene_status or ('ready' if scene_manifest_ref else 'missing')
    if resolved_scene_status not in allowed_scene_statuses:
        raise ValueError(f'Invalid image scene status: {resolved_scene_status}')
    scene_path = None
    scene_sha256 = None
    if scene_manifest_ref is not None:
        if not isinstance(scene_manifest_ref, dict):
            raise ValueError('Scene Manifest reference must be an object')
        if scene_manifest_ref.get('page_id') not in (None, page_id):
            raise ValueError('Scene Manifest page does not match image version')
        scene_path = scene_manifest_ref.get('path')
        scene_sha256 = str(scene_manifest_ref.get('sha256') or '').lower()
        if not isinstance(scene_path, str) or not scene_path:
            raise ValueError('Scene Manifest reference is missing path')
        if len(scene_sha256) != 64 or any(char not in '0123456789abcdef' for char in scene_sha256):
            raise ValueError('Scene Manifest reference has an invalid SHA-256')

    max_version = db.session.query(func.max(PageImageVersion.version_number)).filter_by(page_id=page_id).scalar() or 0
    next_version = max_version + 1

    # 批量更新：标记所有旧版本为非当前版本（使用单条 SQL 更高效）
    PageImageVersion.query.filter_by(page_id=page_id).update({'is_current': False})

    # 保存原图到最终位置（使用版本号）
    image_path = file_service.save_generated_image(
        image, project_id, page_id,
        version_number=next_version,
        image_format=image_format
    )

    # 生成并保存压缩的缓存图片（用于前端快速显示）
    cached_image_path = file_service.save_cached_image(
        image, project_id, page_id,
        version_number=next_version,
        quality=85
    )

    # 创建新版本记录
    new_version = PageImageVersion(
        page_id=page_id,
        image_path=image_path,
        version_number=next_version,
        is_current=True,
        scene_manifest_path=scene_path,
        scene_manifest_sha256=scene_sha256,
        scene_status=resolved_scene_status,
        scene_quality_score=scene_quality_score,
        scene_schema_version=scene_schema_version,
        scene_error=scene_error,
    )
    db.session.add(new_version)

    # 如果提供了 page_obj，更新页面状态和图片路径
    if page_obj:
        page_obj.generated_image_path = image_path
        page_obj.cached_image_path = cached_image_path
        page_obj.status = 'COMPLETED'
        page_obj.updated_at = datetime.utcnow()

    _commit_with_retry()

    logger.debug(f"Page {page_id} image saved as version {next_version}: {image_path}, cached: {cached_image_path}")

    return image_path, next_version


def _commit_with_retry(max_retries=5, base_delay=0.5):
    for attempt in range(max_retries):
        try:
            db.session.commit()
            return
        except OperationalError as e:
            if "database is locked" in str(e) and attempt < max_retries - 1:
                db.session.rollback()
                delay = base_delay * (2 ** attempt)
                logger.warning(f"Database locked, retrying commit in {delay:.1f}s (attempt {attempt + 1}/{max_retries})")
                time.sleep(delay)
            else:
                raise


SUPPORTED_IMAGE_ASPECT_RATIOS = (
    '1:1',
    '1:4',
    '1:8',
    '2:3',
    '3:2',
    '3:4',
    '4:1',
    '4:3',
    '4:5',
    '5:4',
    '8:1',
    '9:16',
    '16:9',
    '21:9',
)


def _aspect_ratio_from_size(width: int, height: int) -> str:
    """Map arbitrary pixel dimensions to the nearest provider-supported aspect ratio."""
    safe_width = max(1, width)
    safe_height = max(1, height)
    divisor = gcd(safe_width, safe_height)
    normalized = f"{safe_width // divisor}:{safe_height // divisor}"
    if normalized in SUPPORTED_IMAGE_ASPECT_RATIOS:
        return normalized

    source_ratio = safe_width / safe_height
    return min(
        SUPPORTED_IMAGE_ASPECT_RATIOS,
        key=lambda candidate: abs(source_ratio - (int(candidate.split(':')[0]) / int(candidate.split(':')[1]))),
    )


def _normalize_selection_bbox(selection: dict, image_size: tuple[int, int]) -> tuple[int, int, int, int]:
    """Clamp a selection rectangle into source image bounds."""
    width, height = image_size
    x0 = max(0, min(int(selection['x']), width - 1))
    y0 = max(0, min(int(selection['y']), height - 1))
    x1 = max(x0 + 1, min(x0 + int(selection['width']), width))
    y1 = max(y0 + 1, min(y0 + int(selection['height']), height))
    return x0, y0, x1, y1


def _create_marked_reference_image(source_image: Image.Image, bbox: tuple[int, int, int, int]) -> Image.Image:
    """Highlight the selected region so edit models can focus on it reliably."""
    marked = source_image.convert('RGB').copy()
    draw = ImageDraw.Draw(marked, 'RGBA')
    outline_width = max(4, min(source_image.size) // 120)
    draw.rectangle(bbox, fill=(0, 0, 0, 190), outline=(255, 255, 255, 255), width=outline_width)
    return marked


def _blend_region_into_source(
    source_image: Image.Image,
    edited_image: Image.Image,
    bbox: tuple[int, int, int, int],
    feather_radius: int = 12,
) -> Image.Image:
    """Blend only the selected region from the edited result back into the source image."""
    if edited_image.size != source_image.size:
        edited_image = edited_image.resize(source_image.size, Image.Resampling.LANCZOS)

    source_rgb = source_image.convert('RGB')
    edited_rgb = edited_image.convert('RGB')
    mask = Image.new('L', source_rgb.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rectangle(bbox, fill=255)
    if feather_radius > 0:
        mask = mask.filter(ImageFilter.GaussianBlur(radius=feather_radius))
    return Image.composite(edited_rgb, source_rgb, mask)


def _build_region_edit_instruction(prompt: str, operation: str) -> str:
    """Create a focused prompt for region-based edits using a marked reference image."""
    cleaned_prompt = (prompt or '').strip()
    if operation == 'erase_region':
        user_goal = cleaned_prompt or "移除黑色标记区域中的主体内容，并自然补全背景纹理与光影。"
        return (
            "用户会提供两张参考图：一张原图，一张带有黑色实心选区标记的图。\n"
            "请只处理黑色标记区域，将该区域内容移除，并根据周围视觉自然补全。\n"
            "黑色区域之外的构图、文字、光影、色调尽量保持不变。\n"
            f"额外要求：{user_goal}"
        )

    return (
        "用户会提供两张参考图：一张原图，一张带有黑色实心选区标记的图。\n"
        "请重点修改黑色标记区域，严格围绕该区域执行用户指令。\n"
        "未标记区域尽量保持原样，不要无关改动整体构图。\n"
        f"用户编辑要求：{cleaned_prompt}"
    )


def generate_native_deck_task(task_id: str, project_id: str, ai_service, page_ids=None, app=None):
    """Generate validated native slide specs from existing page outlines."""
    if app is None:
        raise ValueError('Flask app instance must be provided')

    from services.native_deck_service import NativeDeckService
    from services.prompts import get_native_slide_prompt

    with app.app_context():
        try:
            task = db.session.get(Task, task_id)
            project = db.session.get(Project, project_id)
            if not task or not project:
                return
            if get_ppt_settings(project)['render_mode'] != 'native':
                raise ValueError('只有原生可编辑项目可以生成原生页面')

            all_pages = Page.query.filter_by(project_id=project_id).order_by(Page.order_index).all()
            total_page_count = len(all_pages)
            selected_page_ids = set(page_ids or [])
            pages = [page for page in all_pages if not selected_page_ids or page.id in selected_page_ids]
            service = NativeDeckService()
            theme = service.resolve_theme(
                get_ppt_settings(project)['native_theme'],
                [page.native_layout for page in all_pages],
            )
            update_ppt_settings(project, {'native_theme': theme})
            deck_plan = service.build_deck_design_plan(
                outlines=[page.get_outline_content() for page in all_pages],
                theme=theme,
                style_hint=project.template_style,
                project_topic=get_spine_source_fields(project)['idea_prompt'],
            )
            task.status = 'PROCESSING'
            task.set_progress({'total': len(pages), 'completed': 0, 'failed': 0, 'failed_page_ids': [], 'warnings': [], 'quality_warnings': []})
            db.session.commit()

            completed = 0
            failed = 0
            failed_page_ids = []
            warnings = []
            quality_warnings = []
            used_layouts = set()
            first_order = pages[0].order_index if pages else 0
            layout_history = [
                page.native_layout for page in all_pages
                if page.order_index < first_order and page.native_layout
            ][-3:]
            for index, page in enumerate(pages):
                _wait_if_export_task_paused(task_id)
                db.session.expire_all()
                task = db.session.get(Task, task_id)
                if not task or task.status in {'FAILED', 'CANCELLED'}:
                    return
                role = 'cover' if page.order_index == 0 else 'end' if page.order_index == total_page_count - 1 else 'content'
                try:
                    outline = page.get_outline_content()
                    candidates = service.select_layout_candidates(
                        theme=theme,
                        role=role,
                        outline=outline,
                        used_layouts=used_layouts,
                        recent_layouts=layout_history,
                        limit=8,
                    )
                    design_intent = service.build_design_intent(
                        outline=outline,
                        theme=theme,
                        role=role,
                        style_hint=project.template_style,
                        project_topic=get_spine_source_fields(project)['idea_prompt'],
                        layout_candidates=candidates,
                        deck_plan=deck_plan,
                        page_index=page.order_index,
                        recent_layouts=layout_history,
                    )
                    prompt = get_native_slide_prompt(
                        outline,
                        candidates,
                        project.template_style,
                        design_intent=design_intent,
                    )
                    with text_resource_limiter.slot(f'native-deck project={project_id} page={page.id}'):
                        result = ai_service.generate_json(prompt)
                    if not isinstance(result, dict) or set(result) != {'layout', 'props'}:
                        raise ValueError('模型必须返回 layout 和 props')
                    if result['layout'] not in {item['layout'] for item in candidates}:
                        raise ValueError('模型返回了候选范围外的布局')
                    merged_props = service.fill_outline_props(result['layout'], result['props'], outline)
                    fitted_props = service.fit_copy_budgets(result['layout'], merged_props)
                    design_intent['quality_report'] = service.evaluate_slide_quality(
                        layout=result['layout'],
                        props=fitted_props,
                        outline=outline,
                        recent_layouts=layout_history,
                    )
                    if design_intent['quality_report']['status'] == 'warning':
                        quality_warnings.append({
                            'page_id': page.id,
                            'page_number': page.order_index + 1,
                            'score': design_intent['quality_report']['score'],
                            'issues': design_intent['quality_report']['issues'],
                        })
                    fitted_props['__design_intent'] = design_intent
                    slide = service.normalize_slide(result['layout'], fitted_props)
                    page.snapshot_native_version()
                    page.native_layout = slide['layout']
                    page.set_native_props(slide['props'])
                    page.status = 'NATIVE_GENERATED'
                    used_layouts.add(slide['layout'])
                    layout_history.append(slide['layout'])
                    completed += 1
                except Exception as exc:
                    failed += 1
                    failed_page_ids.append(page.id)
                    warnings.append(f'第 {index + 1} 页: {exc}')
                    existing_props = page.get_native_props()
                    if page.native_layout and existing_props:
                        # A failed retry must never replace an already editable page.
                        used_layouts.add(page.native_layout)
                        layout_history.append(page.native_layout)
                        completed += 1
                        task.set_progress({
                            'total': len(pages),
                            'completed': completed,
                            'failed': failed,
                            'failed_page_ids': failed_page_ids,
                            'warnings': warnings,
                            'quality_warnings': quality_warnings,
                        })
                        db.session.commit()
                        continue
                    try:
                        fallback = service.build_fallback_slide(
                            outline=page.get_outline_content(),
                            layout_candidates=service.select_layout_candidates(
                                theme=theme,
                                role=role,
                                outline=page.get_outline_content(),
                                used_layouts=used_layouts,
                                recent_layouts=layout_history,
                                limit=8,
                            ),
                            design_intent=service.build_design_intent(
                                outline=page.get_outline_content(),
                                theme=theme,
                                role=role,
                                style_hint=project.template_style,
                                project_topic=get_spine_source_fields(project)['idea_prompt'],
                                deck_plan=deck_plan,
                                page_index=page.order_index,
                                recent_layouts=layout_history,
                            ),
                        )
                    except Exception:
                        if not project.export_allow_partial:
                            raise
                    else:
                        page.snapshot_native_version()
                        page.native_layout = fallback['layout']
                        page.set_native_props(fallback['props'])
                        page.status = 'NATIVE_GENERATED'
                        used_layouts.add(fallback['layout'])
                        layout_history.append(fallback['layout'])
                        quality_warnings.append({
                            'page_id': page.id,
                            'page_number': page.order_index + 1,
                            'score': 70,
                            'issues': ['generation_fallback'],
                        })
                        completed += 1

                task.set_progress({
                    'total': len(pages),
                    'completed': completed,
                    'failed': failed,
                    'failed_page_ids': failed_page_ids,
                    'warnings': warnings,
                    'quality_warnings': quality_warnings,
                })
                db.session.commit()

            task.status = 'COMPLETED'
            task.completed_at = datetime.utcnow()
            set_ppt_status(project, 'NATIVE_DECK_GENERATED')
            record_ppt_revision(
                project,
                'native.generate',
                changed_page_ids=[page.id for page in pages],
                source_type='ai',
            )
            db.session.commit()
        except Exception as exc:
            db.session.rollback()
            task = db.session.get(Task, task_id)
            if task:
                task.status = 'FAILED'
                task.error_message = str(exc)
                task.completed_at = datetime.utcnow()
                db.session.commit()


def generate_descriptions_task(task_id: str, project_id: str, ai_service,
                               project_context, outline: List[Dict],
                               max_workers: int = 5, app=None,
                               language: str = None,
                               detail_level: str = 'default'):
    """
    Background task for generating page descriptions
    Based on demo.py gen_desc() with parallel processing

    Note: app instance MUST be passed from the request context

    Args:
        task_id: Task ID
        project_id: Project ID
        ai_service: AI service instance
        project_context: ProjectContext object containing all project information
        outline: Complete outline structure
        max_workers: Maximum number of parallel workers
        app: Flask app instance
        language: Output language (zh, en, ja, auto)
        detail_level: Description detail level (concise/default/detailed)
    """
    if app is None:
        raise ValueError("Flask app instance must be provided")
    
    # 在整个任务中保持应用上下文
    with app.app_context():
        try:
            # 重要：在后台线程开始时就获取task和设置状态
            task = Task.query.get(task_id)
            if not task:
                logger.error(f"Task {task_id} not found")
                return
            
            task.status = 'PROCESSING'
            db.session.commit()
            logger.info(f"Task {task_id} status updated to PROCESSING")
            
            # Flatten outline to get pages
            pages_data = ai_service.flatten_outline(outline)
            
            # Get all pages for this project
            pages = Page.query.filter_by(project_id=project_id).order_by(Page.order_index).all()
            
            if len(pages) != len(pages_data):
                raise ValueError("Page count mismatch")
            
            # Mark all pages as GENERATING_DESCRIPTION before starting
            for page in pages:
                page.status = 'GENERATING_DESCRIPTION'

            # Initialize progress
            task.set_progress({
                "total": len(pages),
                "completed": 0,
                "failed": 0
            })
            db.session.commit()

            # Generate descriptions in parallel
            completed = 0
            failed = 0
            
            def generate_single_desc(page_id, page_outline, page_index):
                """
                Generate description for a single page
                注意：只传递 page_id（字符串），不传递 ORM 对象，避免跨线程会话问题
                """
                # 关键修复：在子线程中也需要应用上下文
                with app.app_context():
                    try:
                        # Get singleton AI service instance
                        from services.ai_service_manager import get_ai_service
                        ai_service = get_ai_service()
                        
                        with text_resource_limiter.slot(
                            f"description project={project_id} page={page_id}"
                        ):
                            desc_result = ai_service.generate_page_description(
                                project_context, outline, page_outline, page_index,
                                language=language,
                                detail_level=detail_level
                            )

                        # generate_page_description returns dict with text + optional extra_fields
                        desc_content = {
                            "text": desc_result['text'],
                            "generated_at": datetime.utcnow().isoformat()
                        }
                        if desc_result.get('extra_fields'):
                            desc_content['extra_fields'] = desc_result['extra_fields']
                        
                        return (page_id, desc_content, None)
                    except Exception as e:
                        import traceback
                        error_detail = traceback.format_exc()
                        logger.error(f"Failed to generate description for page {page_id}: {error_detail}")
                        return (page_id, None, str(e))
            
            # Use ThreadPoolExecutor for parallel generation
            # 关键：提前提取 page.id，不要传递 ORM 对象到子线程
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = [
                    executor.submit(generate_single_desc, page.id, page_data, i)
                    for i, (page, page_data) in enumerate(zip(pages, pages_data), 1)
                ]
                
                # Process results as they complete
                for future in as_completed(futures):
                    page_id, desc_content, error = future.result()
                    
                    db.session.expire_all()
                    
                    # Update page in database
                    page = Page.query.get(page_id)
                    if page:
                        if error:
                            page.status = 'FAILED'
                            failed += 1
                        else:
                            page.set_description_content(desc_content)
                            page.status = 'DESCRIPTION_GENERATED'
                            completed += 1
                        
                        db.session.commit()
                    
                    # Update task progress
                    task = Task.query.get(task_id)
                    if task:
                        task.update_progress(completed=completed, failed=failed)
                        db.session.commit()
                        logger.info(f"Description Progress: {completed}/{len(pages)} pages completed")
            
            # Mark task as completed
            task = Task.query.get(task_id)
            if task:
                task.status = 'COMPLETED'
                task.completed_at = datetime.utcnow()
                db.session.commit()
                logger.info(f"Task {task_id} COMPLETED - {completed} pages generated, {failed} failed")
            
            # Update project status
            from models import Project
            project = Project.query.get(project_id)
            if project and failed == 0:
                set_ppt_status(project, 'DESCRIPTIONS_GENERATED')
                record_ppt_revision(
                    project,
                    'description.generate',
                    changed_page_ids=[page.id for page in pages],
                    source_type='ai',
                )
                db.session.commit()
                logger.info(f"Project {project_id} status updated to DESCRIPTIONS_GENERATED")
        
        except Exception as e:
            # Mark task as failed
            task = Task.query.get(task_id)
            if task:
                task.status = 'FAILED'
                task.error_message = str(e)
                task.completed_at = datetime.utcnow()
                db.session.commit()


def generate_images_task(task_id: str, project_id: str, ai_service, file_service,
                        outline: List[Dict], use_template: bool = True, 
                        max_workers: int = 8, aspect_ratio: str = "16:9",
                        resolution: str = "2K", app=None,
                        extra_requirements: str = None,
                        language: str = None,
                        page_ids: list = None,
                        image_prompt_field_names: Optional[set] = None):
    """
    Background task for generating page images
    Based on demo.py gen_images_parallel()
    
    Note: app instance MUST be passed from the request context
    
    Args:
        language: Output language (zh, en, ja, auto)
        page_ids: Optional list of page IDs to generate (if not provided, generates all pages)
    """
    if app is None:
        raise ValueError("Flask app instance must be provided")
    
    with app.app_context():
        try:
            from services.image_template_profiles import (
                append_image_layout_hint,
                append_image_page_role_hint,
                append_template_visual_profile_hint,
                infer_image_layout_family,
                infer_image_page_role,
                resolve_template_reference_path,
            )
            # Update task status to PROCESSING
            task = Task.query.get(task_id)
            if not task:
                return

            _wait_if_task_paused(task_id)
            db.session.expire_all()
            task = Task.query.get(task_id)
            if not task:
                return
            task.status = 'PROCESSING'
            db.session.commit()
            
            # Get pages for this project (filtered by page_ids if provided)
            pages = get_filtered_pages(project_id, page_ids)
            total_page_count = Page.query.filter_by(project_id=project_id).count()
            all_pages_data = ai_service.flatten_outline(outline)
            image_prompt_field_names = (
                image_prompt_field_names
                if image_prompt_field_names is not None
                else get_image_prompt_field_names()
            )

            # Build mapping from order_index to page_data so filtered pages
            # get matched to the correct outline entry (not just first N)
            pages_data_by_index = {i: pd for i, pd in enumerate(all_pages_data)}
            
            # 注意：不在任务开始时获取模板路径，而是在每个子线程中动态获取
            # 这样可以确保即使用户在上传新模板后立即生成，也能使用最新模板
            
            # Initialize progress
            _set_image_task_progress(task, {
                "total": len(pages),
                "completed": 0,
                "failed": 0,
                "status": "processing",
            }, file_service.upload_folder)
            db.session.commit()
            
            # Generate images in parallel
            completed = 0
            failed = 0
            resolution_mismatched = 0  # Count of resolution mismatches
            
            def generate_single_image(page_id, page_data, page_index):
                """
                Generate image for a single page
                注意：只传递 page_id（字符串），不传递 ORM 对象，避免跨线程会话问题
                """
                # 关键修复：在子线程中也需要应用上下文
                with app.app_context():
                    try:
                        if _is_task_paused(task_id):
                            return (
                                page_id,
                                None,
                                None,
                                None,
                                {'status': 'paused'},
                            )
                        logger.debug(f"Starting image generation for page {page_id}, index {page_index}")
                        # Get page from database in this thread
                        page_obj = Page.query.get(page_id)
                        if not page_obj:
                            raise ValueError(f"Page {page_id} not found")
                        project_obj = Project.query.get(project_id)
                        renovation_source_path = get_renovation_source_image_path(page_obj, file_service)
                        renovating = is_renovation_project(project_obj) and bool(renovation_source_path)
                        had_image_reference = bool(page_obj.generated_image_path)
                        if not renovating and not prepare_page_for_image_generation(page_obj, file_service):
                            return (
                                page_id,
                                page_obj.generated_image_path,
                                None,
                                None,
                                {
                                    'status': 'skipped_existing',
                                    'output_path': page_obj.generated_image_path,
                                },
                            )
                        if had_image_reference:
                            db.session.commit()
                        
                        def mark_generating():
                            page_for_update = Page.query.get(page_id)
                            if page_for_update:
                                page_for_update.status = 'GENERATING'
                                db.session.commit()
                                logger.debug(f"Page {page_id} status updated to GENERATING")

                        with image_resource_limiter.slot(
                            f"project={project_id} page={page_id}",
                            on_acquire=mark_generating,
                        ):
                            if _is_task_paused(task_id):
                                return (
                                    page_id,
                                    None,
                                    None,
                                    None,
                                    {'status': 'paused'},
                                )
                            # Get description content
                            desc_content = page_obj.get_description_content()
                            if not desc_content:
                                raise ValueError("No description content for page")
                            
                            # 获取描述文本（可能是 text 字段或 text_content 数组）
                            desc_text = desc_content.get('text', '')
                            if not desc_text and desc_content.get('text_content'):
                                # 如果 text 字段不存在，尝试从 text_content 数组获取
                                text_content = desc_content.get('text_content', [])
                                if isinstance(text_content, list):
                                    desc_text = '\n'.join(text_content)
                                else:
                                    desc_text = str(text_content)

                            # 将 extra_fields 拼入描述文本供图片生成使用
                            desc_text = _append_extra_fields(desc_text, desc_content, image_prompt_field_names)

                            logger.debug(f"Got description text for page {page_id}: {desc_text[:100]}...")
                            
                            # 从当前页面的描述内容中提取图片 URL
                            page_additional_ref_images = []
                            has_material_images = False
                            
                            # 从描述文本中提取图片
                            if desc_text:
                                image_urls = ai_service.extract_image_urls_from_markdown(desc_text)
                                if image_urls:
                                    logger.info(f"Found {len(image_urls)} image(s) in page {page_id} description")
                                    page_additional_ref_images = image_urls
                                    has_material_images = True
                            
                            # 在子线程中动态获取模板路径，确保使用最新模板
                            role = getattr(page_obj, 'template_selection_role', None) or infer_image_page_role(
                                page_obj.order_index + 1,
                                total_page_count,
                                page_data,
                                page_obj.part,
                            )
                            layout_family = getattr(page_obj, 'template_selection_layout', None) or infer_image_layout_family(
                                role,
                                page_obj.order_index + 1,
                                page_data,
                            )
                            page_ref_image_path = None
                            page_template_path = None
                            if use_template:
                                page_template_path = _get_page_template_path(page_obj, file_service)
                                page_ref_image_path = page_template_path
                                if not page_template_path:
                                    page_ref_image_path = file_service.get_template_path(project_id)
                                    page_ref_image_path = resolve_template_reference_path(
                                        getattr(project_obj, 'template_pack_id', None),
                                        role,
                                        page_ref_image_path,
                                    )
                                # 注意：如果有风格描述，即使没有模板图片也允许生成
                                # 这个检查已经在 controller 层完成，这里不再检查

                            if renovating:
                                if page_ref_image_path:
                                    page_additional_ref_images.insert(0, page_ref_image_path)
                                page_ref_image_path = renovation_source_path
                                has_material_images = True
                            
                            # Generate image prompt
                            page_extra_requirements = append_image_page_role_hint(extra_requirements, role)
                            page_extra_requirements = append_image_layout_hint(
                                page_extra_requirements,
                                layout_family,
                            )
                            page_extra_requirements = append_template_visual_profile_hint(
                                page_extra_requirements,
                                getattr(project_obj, 'template_pack_id', None) if use_template and not page_template_path else None,
                            )
                            if use_template:
                                page_extra_requirements = _append_page_template_style(page_extra_requirements, page_obj)
                            if renovating:
                                page_extra_requirements = (
                                    f"{page_extra_requirements or ''}\n\nPPT 翻新要求：随附的首张参考图是原始第"
                                    f"{page_obj.order_index + 1}页。保留其中的事实、文字层级、数据关系和核心素材，"
                                    "但重新组织版式并提升视觉质量；不要忽略原页参考图。"
                                )
                            if _image_scene_enabled(app):
                                from services.image_scene_service import append_image_scene_background_requirements

                                page_extra_requirements = append_image_scene_background_requirements(
                                    page_extra_requirements,
                                )

                            prompt = ai_service.generate_image_prompt(
                                outline, page_data, desc_text, page_obj.order_index + 1,
                                has_material_images=has_material_images,
                                extra_requirements=page_extra_requirements,
                                language=language,
                                has_template=use_template,
                                aspect_ratio=aspect_ratio
                            )
                            task_progress = Task.query.get(task_id).get_progress()
                            page_manifest = next(
                                (
                                    item for item in task_progress.get('pages', [])
                                    if item.get('page_id') == page_id
                                ),
                                {},
                            )
                            prompt_snapshot = write_prompt_snapshot(
                                file_service.upload_folder,
                                project_id,
                                task_progress.get('generation_id', task_id),
                                page_id,
                                page_manifest.get('attempt', 1),
                                prompt,
                            )
                            logger.debug(f"Generated image prompt for page {page_id}")
                            
                            # Generate image
                            if _is_task_paused(task_id):
                                return (
                                    page_id,
                                    None,
                                    None,
                                    None,
                                    {'status': 'paused'},
                                )
                            logger.info(f"🎨 Calling AI service to generate image for page {page_index}/{len(pages)}...")
                            quality_control = {'enabled': get_image_quality_control_enabled(), 'attempts': 0, 'review': None}

                            def generate_candidate():
                                quality_control['attempts'] += 1
                                return ai_service.generate_image(
                                    prompt, page_ref_image_path, aspect_ratio, resolution,
                                    additional_ref_images=page_additional_ref_images if page_additional_ref_images else None
                                )

                            def review_candidate(candidate):
                                review = review_generated_image(
                                    ai_service, candidate, prompt, desc_text, page_data, page_obj.order_index + 1
                                )
                                quality_control['review'] = review
                                return review

                            image = generate_image_until_quality_passes(
                                generate_candidate,
                                review_candidate,
                                enabled=quality_control['enabled'],
                                max_attempts=3,
                            )
                        logger.info(f"✅ Image generated successfully for page {page_index}")
                        
                        if not image:
                            raise ValueError("Failed to generate image")
                        
                        # Check resolution for all providers
                        actual_res, is_match = check_image_resolution(image, resolution)
                        if not is_match:
                            logger.warning(f"Resolution mismatch for page {page_index}: requested {resolution}, got {actual_res}")
                        
                        # 优化：直接在子线程中计算版本号并保存到最终位置
                        # 每个页面独立，使用数据库事务保证版本号原子性，避免临时文件
                        qa = assess_generated_image(image, aspect_ratio, resolution_matches=is_match)
                        version_image = image
                        scene_artifacts = None
                        if _image_scene_enabled(app):
                            version_image, scene_artifacts = _prepare_image_scene_version(
                                image,
                                project_id=project_id,
                                page_id=page_id,
                                page_data=page_data,
                                description=desc_text,
                                page_index=page_obj.order_index + 1,
                                file_service=file_service,
                                app=app,
                            )
                            qa = scene_artifacts['quality']
                        try:
                            image_path, next_version = save_image_with_version(
                                version_image,
                                project_id,
                                page_id,
                                file_service,
                                page_obj=page_obj,
                                scene_manifest_ref=(
                                    scene_artifacts['scene_manifest_ref'] if scene_artifacts else None
                                ),
                                scene_quality_score=(
                                    1.0 if scene_artifacts else None
                                ),
                                scene_schema_version=(1 if scene_artifacts else None),
                            )
                        finally:
                            if version_image is not image:
                                version_image.close()
                        
                        return (
                            page_id,
                            image_path,
                            None,
                            not is_match,
                            {
                                'status': 'completed',
                                'version_number': next_version,
                                'current_version': next_version,
                                'output_path': image_path,
                                'prompt_path': prompt_snapshot['path'],
                                'prompt_hash': prompt_snapshot['sha256'],
                                'visual_role': role,
                                'layout_family': layout_family,
                                'qa': qa,
                                'quality_control': quality_control,
                            },
                        )
                        
                    except Exception as e:
                        import traceback
                        error_detail = traceback.format_exc()
                        logger.error(f"Failed to generate image for page {page_id}: {error_detail}")
                        return (
                            page_id,
                            None,
                            str(e),
                            None,
                            {'status': 'failed', 'error': str(e)},
                        )
            
            paused = False

            def handle_image_result(future):
                nonlocal completed, failed, resolution_mismatched
                page_id, image_path, error, is_mismatched, manifest_update = future.result()
                is_paused_page = manifest_update.get('status') == 'paused'
                is_skipped_existing_page = manifest_update.get('status') == 'skipped_existing'

                if is_mismatched:
                    resolution_mismatched += 1

                db.session.expire_all()

                # Update page in database (主要是为了更新失败状态)
                page = Page.query.get(page_id)
                if page:
                    if is_paused_page:
                        if not page.generated_image_path:
                            page.status = 'QUEUED'
                            db.session.commit()
                    elif is_skipped_existing_page:
                        completed += 1
                    elif error:
                        page.status = 'FAILED'
                        failed += 1
                        db.session.commit()
                    else:
                        # 图片已在子线程中保存并创建版本记录，这里只需要更新计数
                        completed += 1
                        # 刷新页面对象以获取最新状态
                        db.session.refresh(page)

                # Update task progress
                task = Task.query.get(task_id)
                if task:
                    progress = task.get_progress()
                    progress['completed'] = completed
                    progress['failed'] = failed
                    update_manifest_page(
                        progress,
                        page_id,
                        **({'status': 'queued'} if is_paused_page else manifest_update),
                    )
                    # 第一次检测到不匹配时设置警告
                    if resolution_mismatched > 0 and 'warning_message' not in progress:
                        progress['warning_message'] = "图片返回分辨率与设置不符，建议使用gemini格式以避免此问题"
                    _set_image_task_progress(task, progress, file_service.upload_folder)
                    db.session.commit()
                    logger.info(f"Image Progress: {completed}/{len(pages)} pages completed")

            # Use ThreadPoolExecutor for parallel generation. Submit lazily so pause
            # can stop new pages from entering the queue.
            page_iter = iter(enumerate(pages, 1))
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                running = set()

                def submit_next_page():
                    if _is_task_paused(task_id):
                        return False
                    try:
                        i, page = next(page_iter)
                    except StopIteration:
                        return False
                    running.add(executor.submit(
                        generate_single_image, page.id,
                        pages_data_by_index.get(page.order_index, {}), i
                    ))
                    return True

                for _ in range(max_workers):
                    if not submit_next_page():
                        break

                while running:
                    done, running = wait(running, return_when=FIRST_COMPLETED)
                    for future in done:
                        handle_image_result(future)

                    if _is_task_paused(task_id):
                        paused = True
                        for future in running:
                            future.cancel()
                        for future in as_completed(running):
                            if not future.cancelled():
                                handle_image_result(future)
                        break

                    while len(running) < max_workers and submit_next_page():
                        pass

            if paused:
                task = Task.query.get(task_id)
                if task:
                    progress = task.get_progress()
                    progress['status'] = 'paused'
                    _set_image_task_progress(task, progress, file_service.upload_folder)
                    db.session.commit()
                    logger.info(f"Task {task_id} PAUSED - {completed} images generated, {failed} failed")
                return
            
            # Mark task as completed
            task = Task.query.get(task_id)
            if task:
                task.status = 'COMPLETED'
                task.completed_at = datetime.utcnow()
                progress = task.get_progress()
                progress['status'] = 'completed' if failed == 0 else 'completed_with_errors'
                quality_summary = summarize_generation_quality(progress.get('pages'))
                progress['quality_summary'] = quality_summary
                if quality_summary['warnings']:
                    progress['warning_message'] = (
                        f"图片已生成，其中 {quality_summary['warnings']} 页存在质量提醒，"
                        "可在任务详情中查看并单页重试。"
                    )
                _set_image_task_progress(task, progress, file_service.upload_folder)
                if resolution_mismatched > 0:
                    logger.warning(f"Task {task_id} has {resolution_mismatched} resolution mismatches")
                db.session.commit()
                logger.info(f"Task {task_id} COMPLETED - {completed} images generated, {failed} failed")
            
            # Update project status
            project = Project.query.get(project_id)
            if project:
                set_ppt_status(
                    project,
                    'COMPLETED' if failed == 0 else 'DESCRIPTIONS_GENERATED',
                )
                record_ppt_revision(
                    project,
                    'image.generate_batch',
                    changed_page_ids=[page.id for page in pages],
                    source_type='ai',
                )
                db.session.commit()
                logger.info(
                    f"Project {project_id} PPT status updated to {get_ppt_status(project)}"
                )
        
        except Exception as e:
            # Mark task as failed
            task = Task.query.get(task_id)
            if task:
                task.status = 'FAILED'
                task.error_message = str(e)
                task.completed_at = datetime.utcnow()
                failed_page_ids = task.get_progress().get('page_ids')
                if isinstance(failed_page_ids, list):
                    Page.query.filter(
                        Page.id.in_(failed_page_ids),
                        Page.generated_image_path.is_(None),
                    ).update({'status': 'FAILED'}, synchronize_session=False)
                project = Project.query.get(project_id)
                if project:
                    set_ppt_status(project, 'DESCRIPTIONS_GENERATED')
                db.session.commit()


def generate_single_page_image_task(task_id: str, project_id: str, page_id: str, 
                                    ai_service, file_service, outline: List[Dict],
                                    use_template: bool = True, aspect_ratio: str = "16:9",
                                    resolution: str = "2K", app=None,
                                    extra_requirements: str = None,
                                    language: str = None,
                                    image_prompt_field_names: Optional[set] = None):
    """
    Background task for generating a single page image
    
    Note: app instance MUST be passed from the request context
    """
    if app is None:
        raise ValueError("Flask app instance must be provided")
    
    with app.app_context():
        try:
            from services.image_template_profiles import (
                append_image_layout_hint,
                append_image_page_role_hint,
                append_template_visual_profile_hint,
                infer_image_layout_family,
                infer_image_page_role,
                resolve_template_reference_path,
            )
            # Update task status to PROCESSING
            task = Task.query.get(task_id)
            if not task:
                return
            
            task.status = 'PENDING'
            db.session.commit()
            
            # Get page from database
            page = Page.query.get(page_id)
            if not page or page.project_id != project_id:
                raise ValueError(f"Page {page_id} not found")
            
            # Single-page requests should only flip to GENERATING after they acquire
            # a real image-generation slot.
            page.status = 'QUEUED'
            db.session.commit()
            
            # Get description content
            desc_content = page.get_description_content()
            if not desc_content:
                raise ValueError("No description content for page")
            image_prompt_field_names = (
                image_prompt_field_names
                if image_prompt_field_names is not None
                else get_image_prompt_field_names()
            )
            
            # 获取描述文本（可能是 text 字段或 text_content 数组）
            desc_text = desc_content.get('text', '')
            if not desc_text and desc_content.get('text_content'):
                text_content = desc_content.get('text_content', [])
                if isinstance(text_content, list):
                    desc_text = '\n'.join(text_content)
                else:
                    desc_text = str(text_content)

            # 将 extra_fields 拼入描述文本供图片生成使用
            desc_text = _append_extra_fields(desc_text, desc_content, image_prompt_field_names)

            project = Project.query.get(project_id)
            renovation_source_path = get_renovation_source_image_path(page, file_service)
            renovating = is_renovation_project(project) and bool(renovation_source_path)

            # 从描述文本中提取图片 URL
            additional_ref_images = []
            has_material_images = False
            
            if desc_text:
                image_urls = ai_service.extract_image_urls_from_markdown(desc_text)
                if image_urls:
                    logger.info(f"Found {len(image_urls)} image(s) in page {page_id} description")
                    additional_ref_images = image_urls
                    has_material_images = True
            
            # Get template path if use_template
            ref_image_path = None
            page_template_path = None
            if use_template:
                page_template_path = _get_page_template_path(page, file_service)
                ref_image_path = page_template_path or file_service.get_template_path(project_id)
                # 注意：如果有风格描述，即使没有模板图片也允许生成
                # 这个检查已经在 controller 层完成，这里不再检查
            
            # Generate image prompt
            page_data = page.get_outline_content() or {}
            if page.part:
                page_data['part'] = page.part

            total_pages = Page.query.filter_by(project_id=project_id).count()
            role = getattr(page, 'template_selection_role', None) or infer_image_page_role(page.order_index + 1, total_pages, page_data, page.part)
            layout_family = getattr(page, 'template_selection_layout', None) or infer_image_layout_family(role, page.order_index + 1, page_data)
            ref_image_path = resolve_template_reference_path(
                None if page_template_path else getattr(project, 'template_pack_id', None),
                role,
                ref_image_path,
            )

            if renovating:
                if ref_image_path:
                    additional_ref_images.insert(0, ref_image_path)
                ref_image_path = renovation_source_path
                has_material_images = True

            page_extra_requirements = append_image_page_role_hint(extra_requirements, role)
            page_extra_requirements = append_image_layout_hint(page_extra_requirements, layout_family)
            page_extra_requirements = append_template_visual_profile_hint(
                page_extra_requirements,
                getattr(project, 'template_pack_id', None) if use_template and not page_template_path else None,
            )
            if use_template:
                page_extra_requirements = _append_page_template_style(page_extra_requirements, page)
            if renovating:
                page_extra_requirements = (
                    f"{page_extra_requirements or ''}\n\nPPT 翻新要求：随附的首张参考图是原始第"
                    f"{page.order_index + 1}页。保留其中的事实、文字层级、数据关系和核心素材，"
                    "但重新组织版式并提升视觉质量；不要忽略原页参考图。"
                )
            if _image_scene_enabled(app):
                from services.image_scene_service import append_image_scene_background_requirements

                page_extra_requirements = append_image_scene_background_requirements(
                    page_extra_requirements,
                )

            prompt = ai_service.generate_image_prompt(
                outline, page_data, desc_text, page.order_index + 1,
                has_material_images=has_material_images,
                extra_requirements=page_extra_requirements,
                language=language,
                has_template=use_template,
                aspect_ratio=aspect_ratio
            )
            task_progress = task.get_progress()
            page_manifest = next(
                (
                    item for item in task_progress.get('pages', [])
                    if item.get('page_id') == page_id
                ),
                {},
            )
            prompt_snapshot = write_prompt_snapshot(
                file_service.upload_folder,
                project_id,
                task_progress.get('generation_id', task_id),
                page_id,
                page_manifest.get('attempt', 1),
                prompt,
            )

            def mark_generating():
                task_obj = Task.query.get(task_id)
                if task_obj:
                    task_obj.status = 'PROCESSING'
                    progress = task_obj.get_progress()
                    progress['status'] = 'processing'
                    _set_image_task_progress(task_obj, progress, file_service.upload_folder)
                    db.session.commit()
                page_obj = Page.query.get(page_id)
                if page_obj:
                    page_obj.status = 'GENERATING'
                    db.session.commit()
            
            with image_resource_limiter.slot(
                f"project={project_id} page={page_id}",
                on_acquire=mark_generating,
            ):
                # Generate image
                logger.info(f"🎨 Generating image for page {page_id}...")
                quality_control = {'enabled': get_image_quality_control_enabled(), 'attempts': 0, 'review': None}

                def generate_candidate():
                    quality_control['attempts'] += 1
                    return ai_service.generate_image(
                        prompt, ref_image_path, aspect_ratio, resolution,
                        additional_ref_images=additional_ref_images if additional_ref_images else None
                    )

                def review_candidate(candidate):
                    review = review_generated_image(
                        ai_service, candidate, prompt, desc_text, page_data, page.order_index + 1
                    )
                    quality_control['review'] = review
                    return review

                image = generate_image_until_quality_passes(
                    generate_candidate,
                    review_candidate,
                    enabled=quality_control['enabled'],
                    max_attempts=3,
                )
            
            if not image:
                raise ValueError("Failed to generate image")
            
            actual_res, is_match = check_image_resolution(image, resolution)
            if not is_match:
                logger.warning(
                    "Resolution mismatch for page %s: requested %s, got %s",
                    page_id,
                    resolution,
                    actual_res,
                )
            qa = assess_generated_image(image, aspect_ratio, resolution_matches=is_match)
            version_image = image
            scene_artifacts = None
            if _image_scene_enabled(app):
                version_image, scene_artifacts = _prepare_image_scene_version(
                    image,
                    project_id=project_id,
                    page_id=page_id,
                    page_data=page_data,
                    description=desc_text,
                    page_index=page.order_index + 1,
                    file_service=file_service,
                    app=app,
                )
                qa = scene_artifacts['quality']

            # 保存同源 hero 并在同一数据库事务中绑定最终 Scene Manifest。
            try:
                image_path, next_version = save_image_with_version(
                    version_image,
                    project_id,
                    page_id,
                    file_service,
                    page_obj=page,
                    scene_manifest_ref=(
                        scene_artifacts['scene_manifest_ref'] if scene_artifacts else None
                    ),
                    scene_quality_score=(1.0 if scene_artifacts else None),
                    scene_schema_version=(1 if scene_artifacts else None),
                )
            finally:
                if version_image is not image:
                    version_image.close()
            
            # Mark task as completed
            task.status = 'COMPLETED'
            task.completed_at = datetime.utcnow()
            progress = task.get_progress()
            progress.update({
                "total": 1,
                "completed": 1,
                "failed": 0,
                "status": "completed",
            })
            update_manifest_page(
                progress,
                page_id,
                status='completed',
                version_number=next_version,
                current_version=next_version,
                output_path=image_path,
                prompt_path=prompt_snapshot['path'],
                prompt_hash=prompt_snapshot['sha256'],
                visual_role=role,
                layout_family=layout_family,
                qa=qa,
                quality_control=quality_control,
            )
            progress['quality_summary'] = summarize_generation_quality(progress.get('pages'))
            if progress['quality_summary']['warnings']:
                progress['warning_message'] = "当前页面存在质量提醒，可调整描述后单页重试。"
            _set_image_task_progress(task, progress, file_service.upload_folder)
            record_ppt_revision(
                page.project,
                'image.generate',
                changed_page_ids=[page.id],
                source_type='ai',
            )
            db.session.commit()
            
            logger.info(f"✅ Task {task_id} COMPLETED - Page {page_id} image generated")
        
        except Exception as e:
            import traceback
            error_detail = traceback.format_exc()
            logger.error(f"Task {task_id} FAILED: {error_detail}")
            
            # Mark task as failed
            task = Task.query.get(task_id)
            if task:
                task.status = 'FAILED'
                task.error_message = str(e)
                task.completed_at = datetime.utcnow()
                progress = task.get_progress()
                progress['status'] = 'failed'
                for page_manifest in progress.get('pages', []):
                    if page_manifest.get('status') not in {'completed', 'failed'}:
                        page_manifest['status'] = 'failed'
                        page_manifest['error'] = str(e)
                _set_image_task_progress(
                    task,
                    progress,
                    getattr(file_service, 'upload_folder', None),
                )
                db.session.commit()
            
            # Update page status
            page = Page.query.get(page_id)
            if page:
                page.status = 'FAILED'
                db.session.commit()


def edit_page_image_task(task_id: str, project_id: str, page_id: str,
                         edit_instruction: str, ai_service, file_service,
                         aspect_ratio: str = "16:9", resolution: str = "2K",
                         original_description: str = None,
                         additional_ref_images: List[str] = None,
                         temp_dir: str = None, app=None):
    """
    Background task for editing a page image
    
    Note: app instance MUST be passed from the request context
    """
    if app is None:
        raise ValueError("Flask app instance must be provided")
    
    with app.app_context():
        try:
            # Update task status to PROCESSING
            task = Task.query.get(task_id)
            if not task:
                return
            
            # Get page from database
            page = Page.query.get(page_id)
            if not page or page.project_id != project_id:
                raise ValueError(f"Page {page_id} not found")
            
            if not page.generated_image_path:
                raise ValueError("Page must have generated image first")
            
            # Get current image path
            current_image_path = file_service.get_absolute_path(page.generated_image_path)
            
            def mark_generating():
                task_obj = Task.query.get(task_id)
                if task_obj:
                    task_obj.status = 'PROCESSING'
                    db.session.commit()
                page_obj = Page.query.get(page_id)
                if page_obj:
                    page_obj.status = 'GENERATING'
                    db.session.commit()

            # Edit image
            logger.info(f"🎨 Editing image for page {page_id}...")
            try:
                with image_resource_limiter.slot(
                    f"edit project={project_id} page={page_id}",
                    on_acquire=mark_generating,
                ):
                    image = ai_service.edit_image(
                        edit_instruction,
                        current_image_path,
                        aspect_ratio,
                        resolution,
                        original_description=original_description,
                        additional_ref_images=additional_ref_images if additional_ref_images else None
                    )
            finally:
                # Clean up temp directory if created
                if temp_dir:
                    import shutil
                    from pathlib import Path
                    temp_path = Path(temp_dir)
                    if temp_path.exists():
                        shutil.rmtree(temp_dir)
            
            if not image:
                raise ValueError("Failed to edit image")
            
            # 保存编辑后的图片并创建历史版本记录
            image_path, next_version = save_image_with_version(
                image, project_id, page_id, file_service, page_obj=page
            )
            
            # Mark task as completed
            task.status = 'COMPLETED'
            task.completed_at = datetime.utcnow()
            task.set_progress({
                "total": 1,
                "completed": 1,
                "failed": 0
            })
            record_ppt_revision(
                page.project,
                'image.edit',
                changed_page_ids=[page.id],
                source_type='manual',
            )
            db.session.commit()
            
            logger.info(f"✅ Task {task_id} COMPLETED - Page {page_id} image edited")
        
        except Exception as e:
            import traceback
            error_detail = traceback.format_exc()
            logger.error(f"Task {task_id} FAILED: {error_detail}")
            
            # Clean up temp directory on error
            if temp_dir:
                import shutil
                from pathlib import Path
                temp_path = Path(temp_dir)
                if temp_path.exists():
                    shutil.rmtree(temp_dir)
            
            # Mark task as failed
            task = Task.query.get(task_id)
            if task:
                task.status = 'FAILED'
                task.error_message = str(e)
                task.completed_at = datetime.utcnow()
                progress = task.get_progress()
                progress.update({'failed': 1, 'status': 'failed'})
                try:
                    update_manifest_page(progress, page_id, status='failed', error=str(e))
                except KeyError:
                    pass
                _set_image_task_progress(
                    task,
                    progress,
                    getattr(file_service, 'upload_folder', None),
                )
                db.session.commit()
            
            # Update page status
            page = Page.query.get(page_id)
            if page:
                page.status = 'FAILED'
                db.session.commit()


def generate_material_image_task(task_id: str, project_id: str, prompt: str,
                                 ai_service, file_service,
                                 ref_image_path: str = None,
                                 additional_ref_images: List[str] = None,
                                 aspect_ratio: str = "16:9",
                                 resolution: str = "2K",
                                 temp_dir: str = None, app=None):
    """
    Background task for generating a material image
    复用核心的generate_image逻辑，但保存到Material表而不是Page表
    
    Note: app instance MUST be passed from the request context
    project_id can be None for global materials (but Task model requires a project_id,
    so we use a special value 'global' for task tracking)
    """
    if app is None:
        raise ValueError("Flask app instance must be provided")
    
    with app.app_context():
        try:
            # Update task status to PENDING until a real image slot is acquired
            task = Task.query.get(task_id)
            if not task:
                return
            
            task.status = 'PENDING'
            db.session.commit()

            def mark_processing():
                task_obj = Task.query.get(task_id)
                if task_obj:
                    task_obj.status = 'PROCESSING'
                    db.session.commit()
            
            # Generate image (复用核心逻辑)
            logger.info(f"🎨 Generating material image with prompt: {prompt[:100]}...")
            with image_resource_limiter.slot(
                f"material-generate project={project_id} task={task_id}",
                on_acquire=mark_processing,
            ):
                image = ai_service.generate_image(
                    prompt=prompt,
                    ref_image_path=ref_image_path,
                    aspect_ratio=aspect_ratio,
                    resolution=resolution,
                    additional_ref_images=additional_ref_images or None,
                )
            
            if not image:
                raise ValueError("Failed to generate image")
            
            # 处理project_id：如果为'global'或None，转换为None
            actual_project_id = None if (project_id == 'global' or project_id is None) else project_id
            
            # Save generated material image
            relative_path = file_service.save_material_image(image, actual_project_id)
            relative = Path(relative_path)
            filename = relative.name
            
            # Construct frontend-accessible URL
            image_url = file_service.get_file_url(actual_project_id, 'materials', filename)
            
            # Save material info to database
            material = Material(
                project_id=actual_project_id,
                filename=filename,
                relative_path=relative_path,
                url=image_url
            )
            db.session.add(material)
            
            # Mark task as completed
            task.status = 'COMPLETED'
            task.completed_at = datetime.utcnow()
            task.set_progress({
                "total": 1,
                "completed": 1,
                "failed": 0,
                "material_id": material.id,
                "image_url": image_url
            })
            db.session.commit()
            
            logger.info(f"✅ Task {task_id} COMPLETED - Material {material.id} generated")
        
        except Exception as e:
            import traceback
            error_detail = traceback.format_exc()
            logger.error(f"Task {task_id} FAILED: {error_detail}")
            
            # Mark task as failed
            task = Task.query.get(task_id)
            if task:
                task.status = 'FAILED'
                task.error_message = str(e)
                task.completed_at = datetime.utcnow()
                db.session.commit()
        
        finally:
            if temp_dir:
                import shutil
                temp_path = Path(temp_dir)
                if temp_path.exists():
                    shutil.rmtree(temp_dir, ignore_errors=True)


def process_material_image_task(
    task_id: str,
    project_id: str,
    operation: str,
    prompt: str,
    ai_service,
    file_service,
    source_image_path: str = None,
    ref_image_path: str = None,
    additional_ref_images: List[str] = None,
    aspect_ratio: str = "16:9",
    resolution: str = "2K",
    selection: Optional[dict] = None,
    apply_mode: str = "overlay_selection",
    temp_dir: str = None,
    app=None,
):
    """Unified material processing task for generate/edit/region-edit workflows."""
    if app is None:
        raise ValueError("Flask app instance must be provided")

    with app.app_context():
        try:
            task = Task.query.get(task_id)
            if not task:
                return

            task.status = 'PENDING'
            db.session.commit()

            refs = list(additional_ref_images or [])
            result_image: Optional[Image.Image] = None
            source_image = None
            source_aspect_ratio = aspect_ratio

            if source_image_path:
                source_image = Image.open(source_image_path).convert('RGB')
                source_aspect_ratio = _aspect_ratio_from_size(*source_image.size)

            def mark_processing():
                task_obj = Task.query.get(task_id)
                if task_obj:
                    task_obj.status = 'PROCESSING'
                    db.session.commit()

            with image_resource_limiter.slot(
                f"material-process operation={operation} project={project_id} task={task_id}",
                on_acquire=mark_processing,
            ):
                if operation == 'generate':
                    result_image = ai_service.generate_image(
                        prompt=prompt,
                        ref_image_path=ref_image_path,
                        aspect_ratio=aspect_ratio,
                        resolution=resolution,
                        additional_ref_images=refs if refs else None,
                    )
                elif operation == 'edit_full':
                    if not source_image_path:
                        raise ValueError("source_image_path is required for edit_full")

                    if ref_image_path:
                        refs.insert(0, ref_image_path)

                    result_image = ai_service.edit_image(
                        prompt=prompt,
                        current_image_path=source_image_path,
                        aspect_ratio=source_aspect_ratio,
                        resolution=resolution,
                        additional_ref_images=refs if refs else None,
                    )
                elif operation in {'region_edit', 'erase_region'}:
                    if not source_image or not source_image_path:
                        raise ValueError("source_image_path is required for region operations")
                    if not selection:
                        raise ValueError("selection is required for region operations")

                    bbox = _normalize_selection_bbox(selection, source_image.size)
                    marked_reference = _create_marked_reference_image(source_image, bbox)
                    if not temp_dir:
                        raise ValueError("区域操作需要 temp_dir")

                    marked_reference_path = str(Path(temp_dir) / f"{task_id}_marked_region.png")
                    marked_reference.save(marked_reference_path)
                    refs.insert(0, marked_reference_path)

                    if ref_image_path:
                        refs.insert(0, ref_image_path)

                    instruction = _build_region_edit_instruction(prompt, operation)
                    generated = ai_service.edit_image(
                        prompt=instruction,
                        current_image_path=source_image_path,
                        aspect_ratio=source_aspect_ratio,
                        resolution=resolution,
                        additional_ref_images=refs if refs else None,
                    )

                    if generated is None:
                        raise ValueError("Failed to process region edit")

                    if generated.size != source_image.size:
                        generated = generated.resize(source_image.size, Image.Resampling.LANCZOS)

                    if operation == 'erase_region' or apply_mode == 'overlay_selection':
                        result_image = _blend_region_into_source(source_image, generated, bbox)
                    else:
                        result_image = generated
                else:
                    raise ValueError(f"Unsupported material operation: {operation}")

            if result_image is None:
                raise ValueError("Failed to generate image")

            actual_project_id = None if (project_id == 'global' or project_id is None) else project_id
            relative_path = file_service.save_material_image(result_image, actual_project_id)
            relative = Path(relative_path)
            filename = relative.name
            image_url = file_service.get_file_url(actual_project_id, 'materials', filename)

            material = Material(
                project_id=actual_project_id,
                filename=filename,
                relative_path=relative_path,
                url=image_url
            )
            db.session.add(material)

            task.status = 'COMPLETED'
            task.completed_at = datetime.utcnow()
            task.set_progress({
                "total": 1,
                "completed": 1,
                "failed": 0,
                "operation": operation,
                "apply_mode": apply_mode if operation == 'region_edit' else None,
                "selection": selection if operation in {'region_edit', 'erase_region'} else None,
                "material_id": material.id,
                "image_url": image_url
            })
            db.session.commit()

            logger.info(f"✅ Task {task_id} COMPLETED - Material {material.id} processed via {operation}")

        except Exception as e:
            import traceback
            error_detail = traceback.format_exc()
            logger.error(f"Task {task_id} FAILED: {error_detail}")

            task = Task.query.get(task_id)
            if task:
                task.status = 'FAILED'
                task.error_message = str(e)
                task.completed_at = datetime.utcnow()
                db.session.commit()

        finally:
            if source_image is not None:
                try:
                    source_image.close()
                except Exception:
                    pass
            if temp_dir:
                temp_path = Path(temp_dir)
                if temp_path.exists():
                    shutil.rmtree(temp_dir, ignore_errors=True)


def process_ppt_renovation_task(task_id: str, project_id: str, ai_service,
                                file_service, file_parser_service,
                                keep_layout: bool = False,
                                max_workers: int = 5, app=None,
                                language: str = 'zh'):
    """
    Background task for PPT renovation: parse PDF pages → extract content → fill outline + description

    Flow:
    1. Split PDF → per-page PDFs
    2. Parallel: parse each page PDF → markdown via fileparser
    3. Parallel: AI extract {title, points, description} from each markdown
    4. If keep_layout: parallel caption model describe layout → append to description
    5. Update page.outline_content + page.description_content
    6. Concatenate descriptions → project.description_text
    7. project.status = DESCRIPTIONS_GENERATED

    Args:
        task_id: Task ID
        project_id: Project ID
        ai_service: AI service instance
        file_service: FileService instance
        file_parser_service: FileParserService instance
        keep_layout: Whether to preserve original layout via caption model
        max_workers: Maximum parallel workers
        app: Flask app instance
        language: Output language
    """
    if app is None:
        raise ValueError("Flask app instance must be provided")

    with app.app_context():
        try:
            task = Task.query.get(task_id)
            if not task:
                logger.error(f"Task {task_id} not found")
                return

            task.status = 'PROCESSING'
            db.session.commit()

            from models import Project
            project = Project.query.get(project_id)
            if not project:
                raise ValueError(f"Project {project_id} not found")

            # Get the PDF path from project
            pdf_path = None
            project_dir = Path(app.config['UPLOAD_FOLDER']) / project_id
            # Look for the uploaded PDF file
            for f in (project_dir / "template").iterdir() if (project_dir / "template").exists() else []:
                if f.suffix.lower() == '.pdf':
                    pdf_path = str(f)
                    break

            if not pdf_path:
                raise ValueError("No PDF file found for renovation project")

            # Step 1: Split PDF into per-page PDFs
            split_dir = str(project_dir / "split_pages")
            page_pdfs = split_pdf_to_pages(pdf_path, split_dir)
            logger.info(f"Split PDF into {len(page_pdfs)} pages")

            # Get existing pages
            pages = Page.query.filter_by(project_id=project_id).order_by(Page.order_index).all()

            # Ensure page count matches
            if len(pages) != len(page_pdfs):
                logger.warning(f"Page count mismatch: {len(pages)} pages vs {len(page_pdfs)} PDFs. Using min.")
            page_count = min(len(pages), len(page_pdfs))
            if page_count == 0:
                raise ValueError("No pages to process")

            task.set_progress({
                "total": page_count,
                "completed": 0,
                "failed": 0,
                "current_step": "parsing"
            })
            db.session.commit()

            # Process each page as an independent pipeline:
            # parse markdown → AI extract content → (optional layout caption) → write to DB
            from services.material_import_service import import_reference_markdown_images_to_materials
            logger.info("Processing pages (parse → extract → save pipeline)...")
            import threading
            progress_lock = threading.Lock()
            completed = 0
            failed = 0
            extraction_errors = []
            content_results = {}  # index -> {title, points, description}

            def process_single_page(idx, page_pdf_path):
                nonlocal completed, failed
                with app.app_context():
                    try:
                        # Step A: Parse page PDF → markdown
                        filename = os.path.basename(page_pdf_path)
                        _batch_id, md_text, extract_id, error_msg, _failed = file_parser_service.parse_file(page_pdf_path, filename)
                        if error_msg:
                            logger.warning(f"Page {idx} parse warning: {error_msg}")
                        md_text = md_text or ''

                        # Supplement with header/footer from layout.json
                        if extract_id:
                            hf_text = file_parser_service.extract_header_footer_from_layout(extract_id)
                            if hf_text:
                                md_text = hf_text + '\n\n' + md_text

                        if md_text.strip():
                            with progress_lock:
                                imported = import_reference_markdown_images_to_materials(
                                    project_id=project_id,
                                    markdown_content=md_text,
                                    upload_folder=app.config['UPLOAD_FOLDER'],
                                )
                                if imported:
                                    db.session.commit()

                        if not md_text.strip():
                            content = {'title': f'Page {idx + 1}', 'points': [], 'description': ''}
                            error = 'empty_input'
                        else:
                            # Step B: AI extract structured content
                            with text_resource_limiter.slot(
                                f"renovation-extract project={project_id} page-index={idx}"
                            ):
                                content = ai_service.extract_page_content(md_text, language=language)
                            error = None

                        # Step C: Optional layout caption
                        if keep_layout and not error:
                            try:
                                page_obj = pages[idx] if idx < len(pages) else None
                                if page_obj:
                                    image_path = None
                                    if page_obj.cached_image_path:
                                        image_path = file_service.get_absolute_path(page_obj.cached_image_path)
                                    elif page_obj.generated_image_path:
                                        image_path = file_service.get_absolute_path(page_obj.generated_image_path)
                                    if image_path and Path(image_path).exists():
                                        with text_resource_limiter.slot(
                                            f"layout-caption project={project_id} page-index={idx}"
                                        ):
                                            caption = ai_service.generate_layout_caption(image_path)
                                        if caption:
                                            content['description'] += f"\n\n{caption}"
                            except Exception as e:
                                logger.error(f"Layout caption failed for page {idx}: {e}")

                        # Step D: Write to DB immediately
                        content_results[idx] = content
                        page_obj = Page.query.get(pages[idx].id)
                        if page_obj:
                            title = content.get('title', f'Page {idx + 1}')
                            points = content.get('points', [])
                            description = content.get('description', '')

                            page_obj.set_outline_content({
                                'title': title,
                                'points': points
                            })
                            page_obj.set_description_content({
                                "text": description,
                                "generated_at": datetime.utcnow().isoformat()
                            })
                            page_obj.status = 'DESCRIPTION_GENERATED'
                            db.session.commit()

                        with progress_lock:
                            if error and error != 'empty_input':
                                failed += 1
                                extraction_errors.append(error)
                            else:
                                completed += 1
                            task_obj = Task.query.get(task_id)
                            if task_obj:
                                task_obj.update_progress(completed=completed, failed=failed)
                                db.session.commit()

                        logger.info(f"Page {idx} pipeline done (completed={completed}, failed={failed})")

                    except Exception as e:
                        logger.error(f"Pipeline failed for page {idx}: {e}")
                        with progress_lock:
                            failed += 1
                            extraction_errors.append(str(e))
                            task_obj = Task.query.get(task_id)
                            if task_obj:
                                task_obj.update_progress(completed=completed, failed=failed)
                                db.session.commit()

            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = [
                    executor.submit(process_single_page, i, page_pdfs[i])
                    for i in range(page_count)
                ]
                for future in as_completed(futures):
                    future.result()  # propagate any unexpected exceptions

            logger.info(f"All pages processed: {completed} completed, {failed} failed")

            # Fail-fast: any extraction failure aborts the entire task
            if failed > 0:
                reason = extraction_errors[0] if extraction_errors else "empty page content"
                raise ValueError(f"{failed}/{page_count} 页内容提取失败: {reason}")

            # Update project-level aggregated text
            project = Project.query.get(project_id)
            if project:
                all_outlines = []
                all_descriptions = []
                for i in range(page_count):
                    content = content_results.get(i, {})
                    title = content.get('title', '')
                    points = content.get('points', [])
                    description = content.get('description', '')
                    header = f"第{i + 1}页：{title}"
                    if points:
                        all_outlines.append(f"{header}\n" + "\n".join(f"- {p}" for p in points))
                    else:
                        all_outlines.append(header)
                    all_descriptions.append(f"--- 第{i + 1}页 ---\n{description}")
                update_spine_source_fields(project.content_spine, {
                    'outline_text': "\n\n".join(all_outlines),
                    'description_text': "\n\n".join(all_descriptions),
                })
                set_ppt_status(project, 'DESCRIPTIONS_GENERATED')
                project.updated_at = datetime.utcnow()
                record_ppt_revision(
                    project,
                    'renovation.process',
                    changed_page_ids=[page.id for page in project.pages],
                    source_type='ai',
                )

            db.session.commit()

            # Mark task as completed
            task = Task.query.get(task_id)
            if task:
                task.status = 'COMPLETED'
                task.completed_at = datetime.utcnow()
                task.set_progress({
                    "total": page_count,
                    "completed": completed,
                    "failed": failed,
                    "current_step": "done"
                })
                db.session.commit()

            logger.info(f"Task {task_id} COMPLETED - PPT renovation processed {page_count} pages")

        except Exception as e:
            import traceback
            error_detail = traceback.format_exc()
            logger.error(f"Task {task_id} FAILED: {error_detail}")

            task = Task.query.get(task_id)
            if task:
                task.status = 'FAILED'
                task.error_message = str(e)
                task.completed_at = datetime.utcnow()

            # Reset project status so user can retry
            project = Project.query.get(project_id)
            if project:
                set_ppt_status(project, 'DRAFT')

            db.session.commit()


def export_editable_pptx_with_recursive_analysis_task(
    task_id: str,
    project_id: str,
    filename: str,
    file_service,
    page_ids: list = None,
    max_depth: int = 2,
    max_workers: int = 4,
    export_extractor_method: str = 'hybrid',
    export_inpaint_method: str = 'hybrid',
    export_high_fidelity_editable: bool = False,
    enable_icon_subject_extraction: bool = False,
    app=None
):
    """
    使用递归图片可编辑化分析导出可编辑PPTX的后台任务
    
    这是新的架构方法，使用ImageEditabilityService进行递归版面分析。
    与旧方法的区别：
    - 不再假设图片是16:9
    - 支持任意尺寸和分辨率
    - 递归分析图片中的子图和图表
    - 更智能的坐标映射和元素提取
    - 不需要 ai_service（使用 ImageEditabilityService 和 MinerU）
    
    Args:
        task_id: 任务ID
        project_id: 项目ID
        filename: 输出文件名
        file_service: 文件服务实例
        page_ids: 可选的页面ID列表（如果提供，只导出这些页面）
        max_depth: 最大递归深度
        max_workers: 并发处理数
        export_extractor_method: 组件提取方法 ('mineru' 或 'hybrid')
        export_inpaint_method: 背景修复方法 ('generative', 'baidu', 'hybrid')
        app: Flask应用实例
    """
    logger.info(f"🚀 Task {task_id} started: export_editable_pptx_with_recursive_analysis (project={project_id}, depth={max_depth}, workers={max_workers}, extractor={export_extractor_method}, inpaint={export_inpaint_method}, high_fidelity={export_high_fidelity_editable})")
    
    if app is None:
        raise ValueError("Flask app instance must be provided")
    
    with app.app_context():
        import os
        from datetime import datetime
        from PIL import Image
        from models import Project
        from services.export_service import ExportService, ExportError

        logger.info(f"开始递归分析导出任务 {task_id} for project {project_id}")

        try:
            _wait_if_export_task_paused(task_id)
            task = Task.query.get(task_id)
            if not task:
                return
            task.status = 'PROCESSING'
            db.session.commit()

            # Get project
            project = Project.query.get(project_id)
            if not project:
                raise ValueError(f'Project {project_id} not found')

            # 读取项目的导出设置：是否允许返回半成品
            export_allow_partial = project.export_allow_partial or False
            export_high_fidelity_editable = bool(
                export_high_fidelity_editable or project.export_high_fidelity_editable
            )
            fail_fast = not export_allow_partial
            logger.info(f"导出设置: export_allow_partial={export_allow_partial}, fail_fast={fail_fast}")

            # IMPORTANT: Expire cached objects to ensure fresh data from database
            # This prevents reading stale generated_image_path after page regeneration
            db.session.expire_all()

            # Get pages (filtered by page_ids if provided)
            pages = get_filtered_pages(project_id, page_ids)
            if not pages:
                raise ValueError('No pages found for project')
            
            image_paths = []
            for page in pages:
                if page.generated_image_path:
                    img_path = file_service.get_absolute_path(page.generated_image_path)
                    if os.path.exists(img_path):
                        image_paths.append(img_path)
            
            if not image_paths:
                raise ValueError('No generated images found for project')
            
            logger.info(f"找到 {len(image_paths)} 张图片")
            
            # 初始化任务进度（包含消息日志）
            task = Task.query.get(task_id)
            _set_export_task_progress(task, {
                "total": 100,  # 使用百分比
                "completed": 0,
                "failed": 0,
                "current_step": "准备中...",
                "percent": 0,
                "messages": ["🚀 开始导出可编辑PPTX..."]  # 消息日志
            })
            db.session.commit()
            
            # 进度回调函数 - 更新数据库中的进度
            progress_messages = ["🚀 开始导出可编辑PPTX..."]
            max_messages = 10  # 最多保留最近10条消息
            
            def progress_callback(step: str, message: str, percent: int):
                """更新任务进度到数据库"""
                nonlocal progress_messages
                try:
                    _wait_if_export_task_paused(task_id)
                    # 添加新消息到日志
                    new_message = f"[{step}] {message}"
                    progress_messages.append(new_message)
                    # 只保留最近的消息
                    if len(progress_messages) > max_messages:
                        progress_messages = progress_messages[-max_messages:]
                    
                    # 更新数据库
                    task = Task.query.get(task_id)
                    if task:
                        _set_export_task_progress(task, {
                            "total": 100,
                            "completed": percent,
                            "failed": 0,
                            "current_step": message,
                            "percent": percent,
                            "messages": progress_messages.copy()
                        })
                        db.session.commit()
                except Exception as e:
                    logger.warning(f"更新进度失败: {e}")
            
            # Step 1: 准备工作
            logger.info("Step 1: 准备工作...")
            progress_callback("准备", f"找到 {len(image_paths)} 张幻灯片图片", 2)
            
            # 准备输出路径
            exports_dir = os.path.join(app.config['UPLOAD_FOLDER'], project_id, 'exports')
            os.makedirs(exports_dir, exist_ok=True)
            
            # Handle filename collision
            if not filename.endswith('.pptx'):
                filename += '.pptx'
            
            output_path = os.path.join(exports_dir, filename)
            if os.path.exists(output_path):
                base_name = filename.rsplit('.', 1)[0]
                timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
                filename = f"{base_name}_{timestamp}.pptx"
                output_path = os.path.join(exports_dir, filename)
                logger.info(f"文件名冲突，使用新文件名: {filename}")
            
            # 获取第一张图片的尺寸作为参考
            first_img = Image.open(image_paths[0])
            slide_width, slide_height = first_img.size
            first_img.close()
            
            logger.info(f"幻灯片尺寸: {slide_width}x{slide_height}")
            logger.info(f"递归深度: {max_depth}, 并发数: {max_workers}")
            progress_callback("准备", f"幻灯片尺寸: {slide_width}×{slide_height}", 3)
            
            # Step 2: 创建文字属性提取器
            from services.image_editability import TextAttributeExtractorFactory
            text_attribute_extractor = None
            style_extractor_warning = None
            try:
                text_attribute_extractor = TextAttributeExtractorFactory.create_caption_model_extractor()
                progress_callback("准备", "文字属性提取器已初始化", 5)
            except Exception as e:
                logger.warning("文字属性提取器初始化失败，使用默认文本样式: %s", e)
                style_extractor_warning = "文本样式模型初始化失败，已使用默认文本样式继续导出"
                progress_callback("准备", style_extractor_warning, 5)

            # Step 2.5: create image editing provider for high-fidelity asset-sheet separation
            image_editing_provider = None
            image_editing_warning = None
            if export_high_fidelity_editable:
                try:
                    from services.ai_providers import get_image_provider
                    from models.settings import Settings
                    from config import Config
                    settings = Settings.query.first()
                    model = (settings.image_model if settings else None) or Config.IMAGE_MODEL
                    image_editing_provider = get_image_provider(model=model)
                    progress_callback("准备", f"图像编辑模型已初始化（{model}）", 5)
                except Exception as e:
                    logger.warning("无法初始化图像编辑 provider: %s", e)
                    image_editing_warning = "高保真前景分离模型初始化失败，本次将保留原始图片元素"

            
            # Step 3: 调用导出方法（使用项目的导出设置）
            logger.info(f"Step 3: 创建可编辑PPTX (extractor={export_extractor_method}, inpaint={export_inpaint_method}, fail_fast={fail_fast})...")
            progress_callback("配置", f"提取方法: {export_extractor_method}, 背景修复: {export_inpaint_method}", 6)

            try:
                _, export_warnings = ExportService.create_editable_pptx_with_recursive_analysis(
                    image_paths=image_paths,
                    output_file=output_path,
                    slide_width_pixels=slide_width,
                    slide_height_pixels=slide_height,
                    max_depth=max_depth,
                    max_workers=max_workers,
                    text_attribute_extractor=text_attribute_extractor,
                    progress_callback=progress_callback,
                    export_extractor_method=export_extractor_method,
                    export_inpaint_method=export_inpaint_method,
                    export_high_fidelity_editable=export_high_fidelity_editable,
                    image_editing_provider=image_editing_provider,
                    enable_icon_subject_extraction=False,
                    fail_fast=fail_fast
                )
            except ExportError as e:
                if (
                    e.error_type != 'layout_analysis'
                    or export_inpaint_method == 'none'
                    or e.details.get('pending_pages')
                ):
                    raise
                progress_callback("背景修复", "版面元素已识别，背景修复阶段异常；跳过背景修复重试导出", 40)
                _, export_warnings = ExportService.create_editable_pptx_with_recursive_analysis(
                    image_paths=image_paths,
                    output_file=output_path,
                    slide_width_pixels=slide_width,
                    slide_height_pixels=slide_height,
                    max_depth=max_depth,
                    max_workers=max_workers,
                    text_attribute_extractor=text_attribute_extractor,
                    progress_callback=progress_callback,
                    export_extractor_method=export_extractor_method,
                    export_inpaint_method='none',
                    export_high_fidelity_editable=export_high_fidelity_editable,
                    image_editing_provider=image_editing_provider,
                    enable_icon_subject_extraction=False,
                    fail_fast=fail_fast
                )
                export_warnings.add_warning("背景修复失败，已跳过背景修复生成可编辑PPTX")

            for warning in (style_extractor_warning, image_editing_warning):
                if warning and warning not in export_warnings.other_warnings:
                    export_warnings.add_warning(warning)
            
            logger.info(f"✓ 可编辑PPTX已创建: {output_path}")
            
            # Step 4: 标记任务完成
            download_path = f"/files/{project_id}/exports/{filename}"
            
            # 添加完成消息
            progress_messages.append("✅ 导出完成！")
            
            # 添加警告信息（如果有）
            warning_messages = []
            if export_warnings and export_warnings.has_warnings():
                warning_messages = export_warnings.to_summary()
                progress_messages.extend(warning_messages)
                logger.warning(f"导出有 {len(warning_messages)} 条警告")
            
            task = Task.query.get(task_id)
            if task:
                _wait_if_export_task_paused(task_id)
                db.session.refresh(task)
                task.status = 'COMPLETED'
                task.completed_at = datetime.utcnow()
                _set_export_task_progress(task, {
                    "total": 100,
                    "completed": 100,
                    "failed": 0,
                    "current_step": "✓ 导出完成",
                    "percent": 100,
                    "messages": progress_messages,
                    "download_url": download_path,
                    "filename": filename,
                    "method": "recursive_analysis",
                    "max_depth": max_depth,
                    "warnings": warning_messages,  # 单独的警告列表
                    "warning_details": export_warnings.to_dict() if export_warnings else {}  # 详细警告信息
                })
                db.session.commit()
                logger.info(f"✓ 任务 {task_id} 完成 - 递归分析导出成功（深度={max_depth}）")

        except ExportError as e:
            # 导出错误（fail_fast 模式下的详细错误）
            import traceback
            error_detail = traceback.format_exc()
            logger.error(f"✗ 任务 {task_id} 导出失败: {e.message}")
            logger.error(f"错误类型: {e.error_type}, 详情: {e.details}")

            # 标记任务失败，包含详细错误信息
            task = Task.query.get(task_id)
            if task:
                if task.status == 'PAUSED':
                    return
                task.status = 'FAILED'
                # 构建详细的错误消息
                error_message = f"{e.message}"
                if e.help_text:
                    error_message += f"\n\n💡 {e.help_text}"
                task.error_message = error_message
                task.completed_at = datetime.utcnow()
                # 在 progress 中保存详细错误信息
                _set_export_task_progress(task, {
                    "total": 100,
                    "completed": 0,
                    "failed": 1,
                    "current_step": "导出失败",
                    "percent": 0,
                    "error_type": e.error_type,
                    "error_details": e.details,
                    "help_text": e.help_text
                })
                db.session.commit()

        except Exception as e:
            import traceback
            error_detail = traceback.format_exc()
            logger.error(f"✗ 任务 {task_id} 失败: {error_detail}")

            # 标记任务失败
            task = Task.query.get(task_id)
            if task:
                if task.status == 'PAUSED':
                    return
                task.status = 'FAILED'
                task.error_message = str(e)
                task.completed_at = datetime.utcnow()
                db.session.commit()


def export_video_task(
    task_id: str,
    project_id: str,
    filename: str,
    file_service,
    voice: str = 'zh-CN-XiaoxiaoNeural',
    rate: str = '+0%',
    speed: float = 1.0,
    generate_narration: bool = True,
    enable_ken_burns: bool = False,
    ken_burns_style: str = 'auto',
    include_no_image_pages: bool = False,
    page_ids: list = None,
    language: str = 'zh',
    narration_config: dict | None = None,
    narration_mode: str | None = None,
    speakers: list | None = None,
    tts_provider: str = 'edge',
    auto_emotion: bool = True,
    director_plan: dict | None = None,
    pronunciation_lexicon: list | None = None,
    narration_preferences: dict | None = None,
    narration_snapshot_path: str | None = None,
    narration_snapshot_hash: str | None = None,
    frame_paths: list[str] | None = None,
    frame_sequences: list[list[str]] | None = None,
    scene_manifests: list[dict] | None = None,
    native_scene_bundles: list[dict] | None = None,
    app=None,
):
    """
    后台任务：导出 TTS 播报视频 (MP4)

    流程:
      0-20%  为缺少旁白的页面生成 narration_text（AI）
      20-50% 逐页生成 TTS 音频（Edge TTS 或 Fish Audio）
      50-90% 逐页创建 Ken Burns 视频片段（FFmpeg）
      90-100% 合成最终 MP4
    """
    if app is None:
        raise ValueError("Flask app instance must be provided")

    with app.app_context():
        import os
        from models import Project, Settings
        from services.tts_video_service import (
            generate_narration_video,
            check_ffmpeg_available,
            check_ffmpeg_ass_filter_available,
            create_placeholder_frame,
            get_default_voice,
        )

        _settings = Settings.get_settings()
        tts_provider = str(tts_provider or 'edge').strip().lower()
        if tts_provider not in {'edge', 'fish_audio'}:
            raise RuntimeError(f'不支持的 TTS 引擎: {tts_provider}')
        fish_api_key = ''
        fish_model = app.config.get('FISH_AUDIO_MODEL', 's2.1-pro-free')
        if tts_provider == 'fish_audio':
            fish_api_key = str(
                _settings.fish_audio_api_key or app.config.get('FISH_AUDIO_API_KEY') or ''
            ).strip()
            if not fish_api_key:
                raise RuntimeError('Fish Audio API Key 未配置，请先在设置中保存并验证。')
        # 非 edge-tts 音色名回退到本地默认音色，避免历史任务数据中断导出。
        if tts_provider == 'edge' and voice and not _is_edge_tts_voice_name(voice):
            fallback_voice = get_default_voice(language, dict(app.config))
            logger.warning(
                f"[export_video] 请求音色 {voice!r} 不是有效的 edge-tts 音色名，"
                f"已回退到本地默认音色 {fallback_voice!r}"
            )
            voice = fallback_voice
        logger.info(f"[export_video] provider={tts_provider!r}, voice={voice!r}")

        progress_messages = ["🚀 开始导出讲解视频..."]
        max_messages = 10

        def progress_callback(step: str, message: str, percent: int):
            """进度回调 — percent 范围对应 generate_narration_video 的内部进度 (20-95%)"""
            nonlocal progress_messages
            try:
                _wait_if_export_task_paused(task_id)
                new_message = f"[{step}] {message}"
                progress_messages.append(new_message)
                if len(progress_messages) > max_messages:
                    progress_messages = progress_messages[-max_messages:]

                # 将内部 0-100% 映射到总体 20-95%
                mapped_pct = int(20 + percent * 0.75)
                mapped_pct = min(mapped_pct, 95)

                task = Task.query.get(task_id)
                if task:
                    _set_export_task_progress(task, {
                        "total": 100,
                        "completed": mapped_pct,
                        "failed": 0,
                        "current_step": message,
                        "percent": mapped_pct,
                        "messages": progress_messages.copy(),
                    })
                    db.session.commit()
            except Exception as e:
                logger.warning(f"更新进度失败: {e}")

        placeholder_dir = None
        artifact_directory = None
        try:
            _wait_if_export_task_paused(task_id)
            task = Task.query.get(task_id)
            if not task:
                logger.error(f"Task {task_id} not found")
                return

            project = Project.query.get(project_id)
            if not project:
                raise ValueError(f"Project {project_id} not found")

            narration_snapshot = None
            snapshot_pages = {}
            snapshot_scene_manifests = None
            snapshot_native_scene_bundles = None
            snapshot_scene_levels = []
            if narration_snapshot_path:
                from services.video_export_snapshot import load_video_export_snapshot

                narration_snapshot = load_video_export_snapshot(
                    narration_snapshot_path,
                    narration_snapshot_hash or '',
                )
                if narration_snapshot.get('project_id') != project_id:
                    raise RuntimeError('视频导出快照与当前项目不匹配')
                if 'scene_manifests' in narration_snapshot:
                    snapshot_scene_manifests = narration_snapshot['scene_manifests']
                if 'native_scene_bundles' in narration_snapshot:
                    snapshot_native_scene_bundles = narration_snapshot['native_scene_bundles']
                if isinstance(narration_snapshot.get('scene_levels'), list):
                    snapshot_scene_levels = narration_snapshot['scene_levels']
                snapshot_pages = {
                    item['page_id']: item
                    for item in narration_snapshot.get('pages', [])
                    if isinstance(item, dict) and item.get('page_id')
                }
                snapshot_page_ids = [
                    item['page_id']
                    for item in narration_snapshot.get('pages', [])
                    if isinstance(item, dict) and item.get('page_id')
                ]
                if page_ids is None:
                    page_ids = snapshot_page_ids
                elif snapshot_page_ids and page_ids != snapshot_page_ids:
                    raise RuntimeError('视频导出页面顺序与不可变快照不一致')

            if snapshot_scene_manifests is not None:
                if scene_manifests is not None and scene_manifests != snapshot_scene_manifests:
                    raise RuntimeError('场景清单引用与视频导出快照不一致')
                effective_scene_manifests = snapshot_scene_manifests
            else:
                # Legacy tasks created before scene refs entered the immutable snapshot.
                effective_scene_manifests = scene_manifests

            scene_manifest_refs_by_page = {}
            if effective_scene_manifests is not None:
                if not isinstance(effective_scene_manifests, list):
                    raise RuntimeError('场景清单引用必须是数组')
                if effective_scene_manifests:
                    from services.scene_manifest import load_scene_manifest

                    if not page_ids or len(effective_scene_manifests) != len(page_ids):
                        raise RuntimeError('场景清单数量与导出页面不一致')
                    for reference, page_id in zip(effective_scene_manifests, page_ids):
                        if reference is None:
                            continue
                        load_scene_manifest(reference, page_id)
                        scene_manifest_refs_by_page[page_id] = reference

            if snapshot_native_scene_bundles is not None:
                if native_scene_bundles is not None and native_scene_bundles != snapshot_native_scene_bundles:
                    raise RuntimeError('原生场景包引用与视频导出快照不一致')
                effective_native_scene_bundles = snapshot_native_scene_bundles
            else:
                # Legacy tasks created before bundle refs entered the immutable snapshot.
                effective_native_scene_bundles = native_scene_bundles

            native_scene_bundle_refs_by_page = {}
            if effective_native_scene_bundles is not None:
                if not isinstance(effective_native_scene_bundles, list):
                    raise RuntimeError('原生场景包引用必须是数组')
                if effective_native_scene_bundles:
                    from services.native_scene_bundle import load_native_scene_bundle

                    if not page_ids or len(effective_native_scene_bundles) != len(page_ids):
                        raise RuntimeError('原生场景包数量与导出页面不一致')
                    if not effective_scene_manifests or len(effective_scene_manifests) != len(page_ids):
                        raise RuntimeError('原生场景包缺少对应的场景清单')
                    for bundle_ref, scene_ref, page_id in zip(
                        effective_native_scene_bundles,
                        effective_scene_manifests,
                        page_ids,
                    ):
                        if bundle_ref is None and scene_ref is None:
                            continue
                        if bundle_ref is None or scene_ref is None:
                            raise RuntimeError('原生场景包与场景清单的逐页降级位置不一致')
                        load_native_scene_bundle(bundle_ref, page_id, scene_ref['sha256'])
                        native_scene_bundle_refs_by_page[page_id] = bundle_ref

            scene_levels_by_page = {
                item['page_id']: item
                for item in snapshot_scene_levels
                if isinstance(item, dict) and item.get('page_id')
            }

            export_allow_partial = project.export_allow_partial or False
            fail_fast = not export_allow_partial
            if pronunciation_lexicon is None:
                pronunciation_lexicon = project.get_pronunciation_lexicon()
            if narration_preferences is None:
                narration_preferences = project.get_narration_preferences()
            logger.info(f"视频导出设置: export_allow_partial={export_allow_partial}, fail_fast={fail_fast}")
            configured_narration_mode = (
                narration_config.get('narration_mode')
                if isinstance(narration_config, dict)
                else None
            )
            video_narration_mode = (
                narration_mode
                if narration_mode in {'single', 'dialogue'}
                else configured_narration_mode
                if configured_narration_mode in {'single', 'dialogue'}
                else 'single'
            )
            video_speakers = speakers or (
                narration_config.get('speakers', [])
                if isinstance(narration_config, dict)
                else []
            )

            task.status = 'PROCESSING'
            _set_export_task_progress(task, {
                "total": 100,
                "completed": 0,
                "failed": 0,
                "current_step": "准备中...",
                "percent": 0,
                "messages": progress_messages,
            })
            db.session.commit()

            # 检查 FFmpeg
            ffmpeg_path = app.config.get('FFMPEG_PATH', 'ffmpeg')
            if not check_ffmpeg_available(ffmpeg_path):
                raise RuntimeError(
                    "FFmpeg 未安装或不在 PATH 中。请安装 FFmpeg 以使用视频导出功能。"
                )

            progress_callback("准备", "FFmpeg 可用", 2)
            if not check_ffmpeg_ass_filter_available(ffmpeg_path):
                progress_callback("准备", "当前 FFmpeg 缺少 ASS 字幕滤镜，若需字幕请先安装带 libass 的版本", 3)

            # 获取页面
            pages = get_filtered_pages(project_id, page_ids)
            if not pages:
                raise ValueError("没有找到可导出的页面")
            if narration_snapshot and {page.id for page in pages} != set(snapshot_pages):
                raise RuntimeError('视频导出快照页面范围与当前任务不一致')

            # 构建页面列表：有图片的用实际图片，无图片的根据选项处理
            valid_pages = []

            if frame_sequences is not None:
                if len(frame_sequences) != len(pages):
                    raise ValueError('浏览器视频帧数量与页面数量不一致')
                missing_frames = [path for sequence in frame_sequences for path in sequence if not os.path.isfile(path)]
                if missing_frames:
                    raise ValueError('浏览器视频帧已丢失，请重新发起导出')
                valid_pages = list(zip(pages, frame_sequences))
            elif frame_paths is not None:
                if len(frame_paths) != len(pages):
                    raise ValueError('浏览器视频帧数量与页面数量不一致')
                missing_frames = [path for path in frame_paths if not os.path.isfile(path)]
                if missing_frames:
                    raise ValueError('浏览器视频帧已丢失，请重新发起导出')
                valid_pages = list(zip(pages, frame_paths))

            if frame_paths is None and frame_sequences is None and include_no_image_pages:
                video_width = app.config.get('VIDEO_OUTPUT_WIDTH', 1920)
                video_height = app.config.get('VIDEO_OUTPUT_HEIGHT', 1080)
                placeholder_dir = os.path.join(app.config['UPLOAD_FOLDER'], project_id, 'exports', f'_placeholder_{task_id}')
                os.makedirs(placeholder_dir, exist_ok=True)

            if frame_paths is None and frame_sequences is None:
                for page in pages:
                    if page.generated_image_path:
                        img_path = file_service.get_absolute_path(page.generated_image_path)
                        if os.path.exists(img_path):
                            valid_pages.append((page, img_path))
                            continue

                    if include_no_image_pages:
                        # 为无图页面生成占位帧
                        outline_content = page.get_outline_content() or {}
                        title = outline_content.get('title', f'Page {page.order_index + 1}')
                        placeholder_path = os.path.join(placeholder_dir, f'placeholder_{page.order_index:03d}.png')
                        try:
                            create_placeholder_frame(
                                placeholder_path, title=title,
                                width=video_width, height=video_height,
                                ffmpeg_path=ffmpeg_path,
                            )
                            valid_pages.append((page, placeholder_path))
                        except Exception as e:
                            logger.warning(f"生成占位帧失败 (page {page.id}): {e}")

            if not valid_pages:
                raise ValueError("没有找到可导出的页面（无图片且未启用占位帧）")

            progress_callback("准备", f"找到 {len(valid_pages)} 页幻灯片", 5)

            # ── Step 1: 生成缺失的旁白 ──
            generated_snapshot_narrations = {}
            has_pending_snapshot_pages = any(
                entry.get('pending_generation')
                for entry in snapshot_pages.values()
            )
            if generate_narration and (not narration_snapshot or has_pending_snapshot_pages):
                from services.prompts import (
                    get_dialogue_narration_generation_prompt,
                    get_narration_generation_prompt,
                    normalize_narration_generation_config,
                    parse_dialogue_narration_result,
                    parse_narration_generation_result,
                )
                from services.narration_service import (
                    has_dialogue_speakers,
                    normalize_speakers,
                    narration_config_hash,
                    narration_source_hash,
                    page_narration_is_current,
                    set_page_narration,
                )

                narration_generated = 0
                project_topic = (
                    get_spine_source_fields(project)['idea_prompt'].strip()
                    if project else ''
                )
                normalized_narration_config = normalize_narration_generation_config(
                    narration_config,
                    fallback_topic=project_topic,
                )
                effective_mode = narration_mode if narration_mode in {'single', 'dialogue'} else normalized_narration_config.get('narration_mode', 'single')
                effective_speakers = normalize_speakers(
                    speakers or normalized_narration_config.get('speakers'),
                    default_voice=voice,
                )
                video_narration_mode = effective_mode
                video_speakers = effective_speakers
                normalized_narration_config['narration_mode'] = effective_mode
                normalized_narration_config['speakers'] = effective_speakers
                current_config_hash = narration_config_hash(
                    normalized_narration_config,
                    effective_mode,
                    effective_speakers,
                )
                image_prompt_field_names = get_image_prompt_field_names()

                # 收集需要生成旁白的页面
                pages_needing_narration = []  # list of (page, page_index_in_valid, desc_text)
                for i, (page, _) in enumerate(valid_pages):
                    snapshot_entry = snapshot_pages.get(page.id)
                    if snapshot_entry:
                        if snapshot_entry.get('silent'):
                            continue
                        if snapshot_entry.get('text') or snapshot_entry.get('segments'):
                            continue
                    source_hash = narration_source_hash(
                        page,
                        normalized_narration_config,
                        effective_mode,
                        effective_speakers,
                    )
                    has_segments = bool(page.get_narration_segments())
                    has_narration = bool((page.get_narration_text() or '').strip() or has_segments)
                    dialogue_ready = effective_mode != 'dialogue' or has_dialogue_speakers(page.get_narration_segments())
                    if has_narration:
                        # Legacy pages have no hashes; stamp them without an extra AI call.
                        if (not page.narration_source_hash or not page.narration_config_hash) and effective_mode == 'single':
                            page.narration_source_hash = source_hash
                            page.narration_config_hash = current_config_hash
                            page.narration_status = page.narration_status or 'READY'
                        elif page_narration_is_current(page, source_hash, current_config_hash) and dialogue_ready:
                            continue
                    frozen_source = snapshot_entry.get('source', {}) if snapshot_entry else {}
                    desc_content = frozen_source.get('description') or page.get_description_content()
                    desc_text = ''
                    if desc_content:
                        desc_text = desc_content.get('text', '')
                        if not desc_text and desc_content.get('text_content'):
                            tc = desc_content.get('text_content', [])
                            desc_text = '\n'.join(tc) if isinstance(tc, list) else str(tc)
                        desc_text = _append_extra_fields(desc_text, desc_content, image_prompt_field_names)

                    outline_content = frozen_source.get('outline') or page.get_outline_content() or {}
                    if not desc_text:
                        title = outline_content.get('title', '')
                        points = outline_content.get('points', [])
                        if title or points:
                            desc_text = f'{title}\n' + '\n'.join(f'- {p}' for p in points)

                    if not desc_text:
                        if fail_fast or effective_mode == 'dialogue':
                            raise RuntimeError(
                                f"第 {page.order_index + 1} 页缺少可生成旁白的描述内容，当前项目未开启“允许返回半成品”，无法导出视频。"
                            )
                        continue

                    pages_needing_narration.append((page, i + 1, outline_content, desc_text, source_hash))

                if pages_needing_narration:
                    progress_callback("旁白", f"正在生成 {len(pages_needing_narration)} 页旁白...", 5)
                    try:
                        from services.ai_service_manager import get_ai_service

                        ai_service = get_ai_service()
                        prompt_pages = [
                            {
                                'page_index': seq,
                                'title': outline.get('title', ''),
                                'points': outline.get('points', []),
                                'description_text': desc_text,
                            }
                        for _, seq, outline, desc_text, _ in pages_needing_narration
                        ]
                        prompt_builder = (
                            get_dialogue_narration_generation_prompt
                            if effective_mode == 'dialogue'
                            else get_narration_generation_prompt
                        )
                        prompt = prompt_builder(prompt_pages, language=language, config=normalized_narration_config)
                        result = ai_service.text_provider.generate_text(prompt)
                        parsed = (
                            parse_dialogue_narration_result(result)
                            if effective_mode == 'dialogue'
                            else parse_narration_generation_result(result)
                        )

                        for page, seq, _, _, source_hash in pages_needing_narration:
                            narration = parsed.get(seq, '')
                            if effective_mode == 'dialogue' and not has_dialogue_speakers(narration):
                                raise RuntimeError(
                                    f"第 {page.order_index + 1} 页未生成有效的双人旁白分段，已停止导出。"
                                )
                            if narration:
                                if narration_snapshot:
                                    from services.narration_service import normalize_narration_segments, segments_to_text

                                    normalized = normalize_narration_segments(
                                        narration if isinstance(narration, list) else None,
                                        fallback_text=narration if isinstance(narration, str) else None,
                                    )
                                    generated_snapshot_narrations[page.id] = {
                                        'text': segments_to_text(normalized),
                                        'segments': normalized,
                                    }
                                else:
                                    set_page_narration(
                                        page,
                                        text=narration if isinstance(narration, str) else None,
                                        segments=narration if isinstance(narration, list) else None,
                                        source_hash=source_hash,
                                        config_hash=current_config_hash,
                                    )
                                narration_generated += 1
                            elif fail_fast:
                                raise RuntimeError(
                                    f"第 {page.order_index + 1} 页旁白生成结果为空，当前项目未开启“允许返回半成品”，已停止导出。"
                                )
                        if not narration_snapshot:
                            db.session.commit()

                    except RuntimeError:
                        raise
                    except Exception as e:
                        if fail_fast or effective_mode == 'dialogue':
                            raise RuntimeError(f"旁白生成失败，已停止导出: {e}") from e
                        logger.warning(f"批量生成旁白失败: {e}")

                progress_callback("旁白", f"已生成 {narration_generated} 页旁白", 20)

            progress_callback("旁白", "旁白准备完成", 20)

            # ── Step 2: 构建 pages_data ──
            pages_data = []
            missing_narration_pages = []
            for page, image_source in valid_pages:
                stage_image_paths = image_source if isinstance(image_source, list) else [image_source]
                img_path = stage_image_paths[-1]
                snapshot_entry = snapshot_pages.get(page.id)
                generated_entry = generated_snapshot_narrations.get(page.id)
                if snapshot_entry:
                    narration = (generated_entry or snapshot_entry).get('text') or ''
                    narration_segments = (generated_entry or snapshot_entry).get('segments') or []
                    explicit_silent = bool(snapshot_entry.get('silent'))
                else:
                    db.session.refresh(page)
                    narration = page.narration_text
                    narration_segments = page.get_narration_segments()
                    explicit_silent = False
                if not explicit_silent and not narration_segments and not str(narration or '').strip():
                    missing_narration_pages.append(page.order_index + 1)
                logger.info(
                    f"[视频导出] 页面 {page.order_index + 1}: "
                    f"title={((page.get_outline_content() or {}).get('title', ''))[:30]}, "
                    f"narration={narration[:50] if narration else '(无)'}, "
                    f"image={'有图' if page.generated_image_path else '占位帧'}"
                )
                pages_data.append({
                    'image_path': img_path,
                    'narration_text': narration,
                    'narration_segments': narration_segments,
                    'narration_mode': video_narration_mode,
                    'speakers': video_speakers,
                    'page_index': page.order_index,
                    'title': (page.get_outline_content() or {}).get('title', ''),
                    'page_id': page.id,
                    'render_mode': get_ppt_settings(project)['render_mode'],
                    'scene_manifest_ref': scene_manifest_refs_by_page.get(page.id),
                    'native_scene_bundle_ref': native_scene_bundle_refs_by_page.get(page.id),
                    'scene_level': scene_levels_by_page.get(page.id, {}).get('level'),
                    'scene_level_reason': scene_levels_by_page.get(page.id, {}).get('reason'),
                    'native_animation': (page.get_native_props() or {}).get('__animation', {}),
                    'stage_image_paths': stage_image_paths if len(stage_image_paths) > 1 else [],
                    'allow_silent': explicit_silent,
                })

            if missing_narration_pages and (fail_fast or video_narration_mode == 'dialogue'):
                pages = '、'.join(str(idx) for idx in missing_narration_pages)
                raise RuntimeError(
                    f"以下页面缺少旁白文本：第 {pages} 页。当前项目未开启“允许返回半成品”，已停止导出。"
                )

            # ── Step 3: 生成视频 ──
            exports_dir = os.path.join(app.config['UPLOAD_FOLDER'], project_id, 'exports')
            os.makedirs(exports_dir, exist_ok=True)

            if not filename.endswith('.mp4'):
                filename += '.mp4'

            output_path = os.path.join(exports_dir, filename)
            if os.path.exists(output_path):
                base_name = filename.rsplit('.', 1)[0]
                timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
                filename = f"{base_name}_{timestamp}.mp4"
                output_path = os.path.join(exports_dir, filename)

            video_width = app.config.get('VIDEO_OUTPUT_WIDTH', 1920)
            video_height = app.config.get('VIDEO_OUTPUT_HEIGHT', 1080)
            video_fps = app.config.get('VIDEO_FPS', 25)
            silent_duration = app.config.get('DEFAULT_SILENT_CLIP_DURATION', 3.0)
            captured_frame_paths = frame_paths or [
                path for sequence in (frame_sequences or []) for path in sequence
            ]
            expected_native_directory = os.path.abspath(
                os.path.join(exports_dir, f'_native_video_{task_id}'),
            )
            artifact_directory = (
                expected_native_directory
                if any(
                    os.path.abspath(os.path.dirname(path)) == expected_native_directory
                    for path in captured_frame_paths
                )
                else os.path.join(exports_dir, f'_video_export_{task_id}')
            )
            os.makedirs(artifact_directory, exist_ok=True)

            quality_report = generate_narration_video(
                pages_data=pages_data,
                output_path=output_path,
                voice=voice,
                rate=rate,
                width=video_width,
                height=video_height,
                fps=video_fps,
                enable_ken_burns=enable_ken_burns,
                ken_burns_style=ken_burns_style,
                ffmpeg_path=ffmpeg_path,
                progress_callback=progress_callback,
                silent_duration=silent_duration,
                fail_fast=fail_fast,
                speed=speed,
                narration_mode=video_narration_mode,
                speakers=video_speakers,
                tts_provider=tts_provider,
                fish_api_key=fish_api_key,
                fish_model=fish_model,
                auto_emotion=bool(auto_emotion),
                director_plan=director_plan,
                pronunciation_lexicon=pronunciation_lexicon,
                narration_preferences=narration_preferences,
                language=language,
                hyperframes_enabled=bool(app.config.get('HYPERFRAMES_ENABLED', False)),
                hyperframes_executable=os.environ.get('EASYSLIDE_ELECTRON_EXECUTABLE'),
                artifact_directory=artifact_directory,
                project_id=project_id,
                narration_snapshot_path=narration_snapshot_path,
                narration_snapshot_hash=narration_snapshot_hash,
            )

            # ── Step 4: 标记完成 ──
            download_path = f"/files/{project_id}/exports/{filename}"
            progress_messages.append("✅ 视频导出完成！")

            task = Task.query.get(task_id)
            if task:
                _wait_if_export_task_paused(task_id)
                db.session.refresh(task)
                task.status = 'COMPLETED'
                task.completed_at = datetime.utcnow()
                _set_export_task_progress(task, {
                    "total": 100,
                    "completed": 100,
                    "failed": 0,
                    "current_step": "✓ 导出完成",
                    "percent": 100,
                    "messages": progress_messages,
                    "download_url": download_path,
                    "filename": filename,
                    "quality_report": quality_report or {},
                })
                db.session.commit()
                logger.info(f"✅ 任务 {task_id} 完成 - 视频已导出: {output_path}")

        except Exception as e:
            import traceback
            error_detail = traceback.format_exc()
            logger.error(f"✗ 视频导出任务 {task_id} 失败: {error_detail}")

            db.session.rollback()
            task = Task.query.get(task_id)
            if task:
                if task.status == 'PAUSED':
                    return
                task.status = 'FAILED'
                task.error_message = str(e)
                task.completed_at = datetime.utcnow()
                db.session.commit()

        finally:
            # 清理占位帧临时目录
            if placeholder_dir and os.path.exists(placeholder_dir):
                import shutil
                shutil.rmtree(placeholder_dir, ignore_errors=True)
            captured_frame_paths = frame_paths or [path for sequence in (frame_sequences or []) for path in sequence]
            if captured_frame_paths:
                db.session.rollback()
                task = Task.query.get(task_id)
                # Completed and failed exports retain reproducibility inputs; cancelled work is discarded.
                if not task or task.status == 'CANCELLED':
                    import shutil
                    for directory in {os.path.dirname(path) for path in captured_frame_paths}:
                        if os.path.basename(directory) == f'_native_video_{task_id}':
                            shutil.rmtree(directory, ignore_errors=True)
            if artifact_directory:
                db.session.rollback()
                task = Task.query.get(task_id)
                if not task or task.status == 'CANCELLED':
                    import shutil
                    shutil.rmtree(artifact_directory, ignore_errors=True)


def export_video_workspace_task(
    task_id: str,
    project_id: str,
    filename: str,
    snapshot_path: str,
    snapshot_hash: str,
    voice: str = 'zh-CN-XiaoxiaoNeural',
    rate: str = '+0%',
    enable_ken_burns: bool = False,
    render_profile: str = 'final',
    source_proof_task_id: str | None = None,
    workspace_version_id: str | None = None,
    app=None,
):
    """Render a frozen video-workspace document through the existing video engine."""
    if app is None:
        raise ValueError('Flask app instance must be provided')
    placeholder_dir = None
    try:
        with app.app_context():
            from services.tts_video_service import (
                check_ffmpeg_available,
                create_placeholder_frame,
                generate_narration_video,
            )
            from services.video_workspace_export_snapshot import load_video_workspace_export_snapshot

            task = Task.query.get(task_id)
            if not task:
                raise ValueError('视频工作区导出任务不存在')
            _wait_if_export_task_paused(task_id)
            task = Task.query.get(task_id)
            task.status = 'PROCESSING'
            _set_export_task_progress(task, {'total': 100, 'completed': 0, 'failed': 0, 'percent': 0, 'current_step': '准备视频工作区导出'})
            db.session.commit()
            ffmpeg_path = app.config.get('FFMPEG_PATH', 'ffmpeg')
            if not check_ffmpeg_available(ffmpeg_path):
                raise RuntimeError('FFmpeg 未安装或不在 PATH 中。请安装 FFmpeg 以使用视频导出功能。')
            render_profile = str(render_profile or 'final').strip().lower()
            if render_profile not in {'proof', 'final'}:
                raise ValueError('render_profile must be proof or final')
            snapshot = load_video_workspace_export_snapshot(snapshot_path, snapshot_hash)
            items = snapshot['render_items']
            director_plan = {
                'version': 1,
                'preset': 'workspace',
                'config': {'subtitle_mode': 'standard'},
                'pages': [],
            }
            for item in items:
                animation = item.get('animation') or {}
                intensity = str(animation.get('intensity') or 'subtle')
                director_plan['pages'].append({
                    'page_index': item.get('page_index', 0),
                    'motion': {
                        'effect': 'zoom_in' if intensity != 'none' else 'static',
                        'intensity': intensity,
                    },
                    'transition': {
                        'type': item.get('transition') or 'cut',
                        'duration_ms': 420 if item.get('transition') not in {None, 'cut'} else 0,
                    },
                    'audio': {
                        'normalize_loudness': True,
                        'cues': item.get('audio_cues') or [],
                    },
                })
            if render_profile == 'proof':
                width, height, fps = 960, 540, 15
            else:
                width = app.config.get('VIDEO_OUTPUT_WIDTH', 1920)
                height = app.config.get('VIDEO_OUTPUT_HEIGHT', 1080)
                fps = app.config.get('VIDEO_FPS', 25)
            placeholder_dir = os.path.join(app.config['UPLOAD_FOLDER'], project_id, 'exports', f'_workspace_placeholder_{task_id}')
            os.makedirs(placeholder_dir, exist_ok=True)
            fallback_scenes = []
            for index, item in enumerate(items):
                if item.get('image_path') and os.path.isfile(item['image_path']):
                    continue
                item['image_path'] = os.path.join(placeholder_dir, f'{index:04d}.png')
                create_placeholder_frame(item['image_path'], title=item['title'], width=width, height=height, ffmpeg_path=ffmpeg_path)
                fallback_scenes.append({'scene_id': item['scene_id'], 'reason': item['fallback_reason'] or 'missing_image'})

            def progress_callback(_step, message, percent):
                current = Task.query.get(task_id)
                if current:
                    _wait_if_export_task_paused(task_id)
                    _set_export_task_progress(current, {'total': 100, 'completed': percent, 'failed': 0, 'percent': percent, 'current_step': message})
                    db.session.commit()

            exports_dir = os.path.join(app.config['UPLOAD_FOLDER'], project_id, 'exports')
            os.makedirs(exports_dir, exist_ok=True)
            output_path = os.path.join(exports_dir, filename if filename.endswith('.mp4') else f'{filename}.mp4')
            quality_report = generate_narration_video(
                pages_data=items, output_path=output_path, voice=voice, rate=rate,
                width=width, height=height, fps=fps,
                enable_ken_burns=enable_ken_burns or any(
                    (item.get('animation') or {}).get('intensity') not in {None, 'none'}
                    for item in items
                ),
                director_plan=director_plan,
                narration_mode=next(
                    (item.get('narration_mode') for item in items if item.get('narration_mode') == 'dialogue'),
                    'single',
                ),
                ffmpeg_path=ffmpeg_path,
                progress_callback=progress_callback,
                silent_duration=app.config.get('DEFAULT_SILENT_CLIP_DURATION', 3.0),
                fail_fast=True, hyperframes_enabled=True,
                artifact_directory=os.path.join(exports_dir, f'_video_workspace_{task_id}'),
                project_id=project_id,
            )
            task = Task.query.get(task_id)
            _wait_if_export_task_paused(task_id)
            task.status = 'COMPLETED'
            task.completed_at = datetime.utcnow()
            _set_export_task_progress(task, {
                'total': 100, 'completed': 100, 'failed': 0, 'percent': 100,
                'current_step': '✓ 视频工作区导出完成',
                'download_url': f'/files/{project_id}/exports/{os.path.basename(output_path)}',
                'quality_report': quality_report or {}, 'fallback_scenes': fallback_scenes,
                'workspace_version': snapshot['workspace_version'],
                'render_profile': render_profile,
                'source_proof_task_id': source_proof_task_id,
            })
            db.session.commit()
    except Exception as exc:
        db.session.rollback()
        task = Task.query.get(task_id)
        if task and task.status != 'PAUSED':
            task.status = 'FAILED'
            task.error_message = str(exc)
            task.completed_at = datetime.utcnow()
            db.session.commit()
        logger.exception('视频工作区导出任务 %s 失败', task_id)
    finally:
        if placeholder_dir:
            shutil.rmtree(placeholder_dir, ignore_errors=True)


def _run_podcast_tts_with_timeout(call, timeout_seconds: float):
    executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix='podcast-tts')
    future = executor.submit(call)
    try:
        result = future.result(timeout=max(float(timeout_seconds), 0.1))
    except FutureTimeoutError as exc:
        future.cancel()
        # ponytail: requests cannot be killed mid-call; replace with cancellable client if TTS throughput matters.
        executor.shutdown(wait=False, cancel_futures=True)
        raise TimeoutError(f'Fish Audio 播客合成超过 {timeout_seconds:g} 秒未完成') from exc
    executor.shutdown(wait=True)
    return result


def _fish_tts_timeout_config(app, name: str, default: float) -> float:
    return float(os.environ.get(name) or app.config.get(name, default) or default)


def _start_podcast_tts_watchdog(app, task_id: str, timeout_seconds: float):
    def fail_task():
        with app.app_context():
            task = Task.query.get(task_id)
            if task and task.status in {'PENDING', 'PROCESSING', 'RUNNING'}:
                task.status = 'FAILED'
                task.error_message = f'Fish Audio 播客合成超过 {timeout_seconds:g} 秒未完成'
                task.completed_at = datetime.utcnow()
                db.session.commit()

    # ponytail: watchdog may leave the provider request running; move Fish TTS to a killable process if volume grows.
    timer = threading.Timer(max(float(timeout_seconds), 0.1), fail_task)
    timer.daemon = True
    timer.start()
    return timer


def export_podcast_workspace_task(
    task_id: str, project_id: str, filename: str, snapshot_path: str, snapshot_hash: str, app=None,
):
    """Synthesize exactly the podcast document frozen by the export request."""
    if app is None:
        raise ValueError('Flask app instance must be provided')
    try:
        with app.app_context():
            from services.podcast_export_service import (
                load_podcast_export_snapshot,
                preflight_podcast_materials,
            )
            from services.tts_video_service import generate_fish_narration_audio_sync

            task = Task.query.get(task_id)
            if not task:
                raise ValueError('播客工作区导出任务不存在')
            task.status = 'PROCESSING'
            _set_export_task_progress(task, {'total': 100, 'completed': 0, 'failed': 0, 'percent': 0, 'current_step': '准备播客工作区导出'})
            db.session.commit()
            _wait_if_export_task_paused(task_id)
            snapshot = load_podcast_export_snapshot(snapshot_path, snapshot_hash)
            preflight_podcast_materials(project_id, snapshot)
            if snapshot.get('export_config', {}).get('tts_provider') != 'fish_audio':
                raise ValueError('播客工作区当前仅支持 Fish Audio 导出')
            api_key = str(app.config.get('FISH_AUDIO_API_KEY') or os.environ.get('FISH_AUDIO_API_KEY') or '').strip()
            if not api_key:
                settings = Settings.get_settings()
                api_key = str(settings.fish_audio_api_key or '').strip()
            if not api_key:
                raise ValueError('Fish Audio API Key 未配置，请先在设置中保存并验证')
            exports_dir = os.path.join(app.config['UPLOAD_FOLDER'], project_id, 'exports')
            working_dir = os.path.join(exports_dir, f'_podcast_workspace_{task_id}')
            speakers = [{'id': item['speaker_id'], 'name': item['name'], 'voice': item['voice_ref']} for item in snapshot['speakers']]
            total_timeout = _fish_tts_timeout_config(app, 'FISH_AUDIO_TTS_TOTAL_TIMEOUT', 360)
            request_timeout = (
                min(_fish_tts_timeout_config(app, 'FISH_AUDIO_TTS_CONNECT_TIMEOUT', 15), total_timeout),
                min(_fish_tts_timeout_config(app, 'FISH_AUDIO_TTS_READ_TIMEOUT', 300), total_timeout),
            )
            _set_export_task_progress(task, {
                'percent': 5,
                'current_step': f'正在 Fish Audio 合成播客（超时 {total_timeout:g}s）',
            })
            db.session.commit()
            watchdog = _start_podcast_tts_watchdog(app, task_id, total_timeout)
            try:
                audio_path, duration, _durations = _run_podcast_tts_with_timeout(
                    lambda: generate_fish_narration_audio_sync(
                        segments=snapshot['segments'], speakers=speakers, narration_mode=snapshot['format'],
                        cache_dir=os.path.join(app.config['UPLOAD_FOLDER'], 'audio_cache'), working_dir=working_dir,
                        api_key=api_key, model=app.config.get('FISH_AUDIO_MODEL', 's2.1-pro-free'),
                        api_base=str(os.environ.get('FISH_AUDIO_API_BASE') or app.config.get('FISH_AUDIO_API_BASE', 'https://api.fish.audio')),
                        ffmpeg_path=app.config.get('FFMPEG_PATH', 'ffmpeg'),
                        request_timeout=request_timeout,
                        total_timeout=total_timeout,
                    ),
                    total_timeout,
                )
            finally:
                watchdog.cancel()
            _wait_if_export_task_paused(task_id)
            task = Task.query.get(task_id)
            if task and task.status == 'FAILED':
                return
            os.makedirs(exports_dir, exist_ok=True)
            output_path = os.path.join(exports_dir, filename)
            from services.podcast_export_service import (
                check_podcast_audio_peak,
                mix_podcast_audio,
                write_podcast_export_sidecars,
            )
            cover_asset = snapshot.get('export_config', {}).get('cover_asset') or {}
            cover_path = None
            if cover_asset.get('relative_path'):
                cover_path = os.path.abspath(os.path.join(app.config['UPLOAD_FOLDER'], cover_asset['relative_path']))
            metadata = {
                'title': snapshot.get('title'),
                'artist': ', '.join(item.get('name', '') for item in snapshot.get('speakers', []) if item.get('name')),
                'album': snapshot.get('title'),
                'comment': json.dumps({
                    'chapters': [
                        {'index': index + 1, 'title': item.get('text', '')[:80]}
                        for index, item in enumerate(snapshot.get('segments', []))
                    ],
                }, ensure_ascii=False, separators=(',', ':')),
            }
            duration = mix_podcast_audio(
                narration_path=audio_path, output_path=output_path, document=snapshot,
                audio_assets=snapshot.get('export_config', {}).get('audio_assets', []),
                upload_root=app.config['UPLOAD_FOLDER'], ffmpeg_path=app.config.get('FFMPEG_PATH', 'ffmpeg'),
                metadata=metadata, cover_path=cover_path,
                audio_mix=snapshot.get('audio_mix'),
            )
            _wait_if_export_task_paused(task_id)
            sidecars = write_podcast_export_sidecars(output_path=output_path, snapshot=snapshot, cover_path=cover_path)
            peak_db = check_podcast_audio_peak(output_path, app.config.get('FFMPEG_PATH', 'ffmpeg'))
            _wait_if_export_task_paused(task_id)
            task = Task.query.get(task_id)
            task.status = 'COMPLETED'
            task.completed_at = datetime.utcnow()
            _set_export_task_progress(task, {'total': 100, 'completed': 100, 'failed': 0, 'percent': 100, 'current_step': '✓ 播客工作区导出完成', 'download_url': f'/files/{project_id}/exports/{os.path.basename(output_path)}', 'workspace_version': snapshot['workspace_version'], 'audio_mix_manifest_hash': (snapshot.get('audio_mix') or {}).get('manifest_hash'), 'duration_seconds': duration, 'peak_db': peak_db, 'sidecars': {key: f'/files/{project_id}/exports/{os.path.basename(value)}' for key, value in sidecars.items()}})
            db.session.commit()
    except Exception as exc:
        with app.app_context():
            db.session.rollback()
            task = Task.query.get(task_id)
            if task and task.status != 'PAUSED':
                task.status = 'FAILED'
                task.error_message = str(exc)
                task.completed_at = datetime.utcnow()
                db.session.commit()
        logger.exception('播客工作区导出任务 %s 失败', task_id)
