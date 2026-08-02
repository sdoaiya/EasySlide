"""
Project Controller - handles project-related endpoints
"""
import json
import logging
import os
import subprocess
import traceback
from datetime import datetime
from pathlib import Path

from flask import Blueprint, request, jsonify, current_app, Response, stream_with_context
from sqlalchemy import desc
from utils.validators import normalize_aspect_ratio
from sqlalchemy.orm import joinedload
from werkzeug.exceptions import BadRequest
from werkzeug.utils import secure_filename

from models import db, Project, Page, PageImageVersion, Task, ReferenceFile, ProjectWorkspace
from models.project import normalize_native_image_settings
from services import ProjectContext, FileService
from services.ai_service_manager import get_ai_service
from services.image_generation_manifest import (
    build_image_generation_manifest,
    persist_image_generation_manifest,
)
from services.image_template_profiles import has_gorden_template_pack
from services.content_spine_service import (
    get_spine_source_fields,
    optimize_positioning,
    update_spine_source_fields,
)
from services.ppt_workspace_service import (
    get_ppt_settings,
    get_ppt_status,
    record_ppt_revision,
    set_ppt_status,
    update_ppt_settings,
)
from services.task_control_service import (
    cancel_task,
    pause_task,
    retry_task,
    task_projection,
)
from services.task_manager import (
    task_manager,
    generate_descriptions_task,
    generate_images_task,
    process_ppt_renovation_task,
    get_image_prompt_field_names,
    prepare_page_for_image_generation,
    recover_historical_image_scenes_task,
)
from utils import (
    success_response, error_response, not_found, bad_request, rate_limit_error,
    parse_page_ids_from_body, get_filtered_pages
)

logger = logging.getLogger(__name__)

server_task_bp = Blueprint('server_tasks', __name__, url_prefix='/api')

project_bp = Blueprint('projects', __name__, url_prefix='/api/projects')

ASYNC_EXPORT_TASK_TYPES = {
    'EXPORT_EDITABLE_PPTX', 'EXPORT_NATIVE_PPTX', 'EXPORT_NATIVE_PDF',
    'EXPORT_NATIVE_HTML', 'EXPORT_VIDEO', 'EXPORT_VIDEO_WORKSPACE',
    'EXPORT_PODCAST_WORKSPACE', 'GENERATE_NATIVE_DECK',
}
PAUSABLE_TASK_TYPES = ASYNC_EXPORT_TASK_TYPES | {
    'GENERATE_IMAGES', 'INITIALIZE_CONTENT_WORKSPACE', 'RECOVER_IMAGE_SCENES',
    'GENERATE_WORKSPACE_CANDIDATE',
}
MAX_IMAGE_GENERATION_WORKERS = 4
ACTIVE_TASK_STATUSES = {'PENDING', 'PROCESSING', 'RUNNING'}
ACTIVE_PAGE_STATUSES = {'GENERATING_DESCRIPTION', 'QUEUED', 'GENERATING'}
WORKSPACE_ACTIVE_TASK_TYPES = {
    'INITIALIZE_CONTENT_WORKSPACE',
    'EXPORT_VIDEO_WORKSPACE',
    'EXPORT_PODCAST_WORKSPACE',
    'GENERATE_WORKSPACE_CANDIDATE',
}
WORKSPACE_READY_STAGES = {
    'READY', 'COMPLETED', 'EXPORTED', 'FINAL',
    'GENERATED', 'IMAGES_GENERATED', 'NATIVE_DECK_GENERATED',
}


def _page_has_image(page):
    return bool(page.generated_image_path)


def _reset_image_page_after_stale_task(page):
    if page.status not in {'QUEUED', 'GENERATING'} or _page_has_image(page):
        return False
    page.status = 'DESCRIPTION_GENERATED' if page.description_content else 'DRAFT'
    return True


def _derive_image_project_status(project, pages):
    if get_ppt_settings(project)['render_mode'] == 'native':
        return get_ppt_status(project)
    if not pages:
        return get_ppt_status(project)
    if all(page.status in {'COMPLETED', 'NATIVE_GENERATED'} or _page_has_image(page) for page in pages):
        return 'COMPLETED'
    if any(page.description_content for page in pages):
        return 'DESCRIPTIONS_GENERATED'
    if get_spine_source_fields(project)['outline_text'] or any(page.outline_content for page in pages):
        return 'OUTLINE_GENERATED'
    return 'DRAFT'


def _calibrate_stale_image_generation_state(project):
    """Turn DB-only running image tasks into resumable paused tasks before listing."""
    if not any(workspace.kind == 'ppt' for workspace in (project.workspaces or [])):
        return False
    changed = False
    pages = list(project.pages or [])
    if get_ppt_settings(project)['render_mode'] != 'native':
        file_service = FileService(current_app.config['UPLOAD_FOLDER'])
        for page in pages:
            if page.generated_image_path and not file_service.file_exists(page.generated_image_path):
                page.generated_image_path = None
                page.cached_image_path = None
                if page.status == 'COMPLETED':
                    page.status = 'DESCRIPTION_GENERATED' if page.description_content else 'DRAFT'
                changed = True

    tasks = sorted(
        [
            task for task in (project.tasks or [])
            if task.task_type == 'GENERATE_IMAGES'
            and task.status in ACTIVE_TASK_STATUSES
            and not task_manager.is_task_active(task.id)
        ],
        key=lambda task: task.created_at or datetime.min,
        reverse=True,
    )
    if not tasks:
        next_status = _derive_image_project_status(project, pages)
        if (
            get_ppt_settings(project)['render_mode'] != 'native'
            and get_ppt_status(project) != next_status
            and (changed or get_ppt_status(project) == 'GENERATING_IMAGES')
        ):
            set_ppt_status(project, next_status)
            changed = True
        return changed

    for task in tasks:
        progress = task.get_progress()
        progress['status'] = 'paused'
        progress['current_step'] = '生成任务已暂停，可继续生成未完成页面'
        task.set_progress(progress)
        task.status = 'PAUSED'
        task.error_message = task.error_message or '任务未在当前进程中运行，已自动暂停'
        changed = True

    for page in pages:
        changed = _reset_image_page_after_stale_task(page) or changed

    next_status = _derive_image_project_status(project, pages)
    if get_ppt_settings(project)['render_mode'] != 'native' and get_ppt_status(project) != next_status:
        set_ppt_status(project, next_status)
        changed = True

    return changed


def _calibrate_projects_for_listing(projects):
    changed = False
    for project in projects:
        changed = _calibrate_stale_image_generation_state(project) or changed
    if changed:
        db.session.commit()
    return changed


def _workspace_task_matches_kind(task, kind):
    """Return whether a task represents work for the given media workspace."""
    if task.task_type == 'EXPORT_VIDEO_WORKSPACE':
        return kind == 'video'
    if task.task_type == 'EXPORT_PODCAST_WORKSPACE':
        return kind == 'podcast'
    if task.task_type == 'INITIALIZE_CONTENT_WORKSPACE':
        progress = task.get_progress()
        return (
            progress.get('workspace_kind') == kind
            or progress.get('_resume', {}).get('kwargs', {}).get('workspace_kind') == kind
        )
    return False


def _get_non_ppt_workspace_status(workspace, tasks):
    """Reduce video/podcast workspace state to generating, completed, or draft."""
    stage = str(workspace.stage or '').strip().upper()
    if stage.startswith('GENERATING') or stage in {
        'PENDING', 'PROCESSING', 'RUNNING', 'QUEUED', 'EXPORTING',
    }:
        return 'generating'

    matching_tasks = [
        task for task in tasks
        if task.task_type in WORKSPACE_ACTIVE_TASK_TYPES
        and _workspace_task_matches_kind(task, workspace.kind)
    ]
    if any(task.status in ACTIVE_TASK_STATUSES for task in matching_tasks):
        return 'generating'
    if workspace.state == 'ready' or stage in WORKSPACE_READY_STAGES:
        return 'completed'
    # A successful workspace export is a completed deliverable even though
    # the editable workspace itself remains in the draft state.
    if any(
        task.status == 'COMPLETED'
        and task.task_type in {
            f'EXPORT_{workspace.kind.upper()}_WORKSPACE',
        }
        for task in matching_tasks
    ):
        return 'completed'
    return 'in_progress'


def _load_catalog_aggregates(project_ids):
    """Batch-load directory aggregates for one page of projects (no ORM N+1).

    Read-only by contract: never writes, never calibrates. Returns a dict
    keyed by project id with page/workspace/task aggregates and a cover URL.
    """
    from models import Page, ProjectWorkspace, Task, db
    from sqlalchemy import and_, case, func, or_

    aggregates = {
        pid: {
            'page_count': 0,
            'active_page_count': 0,
            'completed_page_count': 0,
            'cover_url': None,
            'workspaces': [],
            'active_task_count': 0,
            'export_completed': set(),
        }
        for pid in project_ids
    }
    if not project_ids:
        return aggregates
    active_statuses = tuple(ACTIVE_PAGE_STATUSES)
    completed_statuses = ('COMPLETED', 'NATIVE_GENERATED')
    current_image = and_(
        PageImageVersion.page_id == Page.id,
        PageImageVersion.is_current.is_(True),
        PageImageVersion.image_path.isnot(None),
    )
    page_rows = (
        db.session.query(
            Page.project_id,
            func.count(Page.id),
            func.sum(case((Page.status.in_(active_statuses), 1), else_=0)),
            func.count(func.distinct(case((or_(
                Page.status.in_(completed_statuses),
                PageImageVersion.id.isnot(None),
            ), Page.id)))),
        )
        .outerjoin(PageImageVersion, current_image)
        .filter(Page.project_id.in_(project_ids))
        .group_by(Page.project_id)
        .all()
    )
    for pid, count, active, completed in page_rows:
        aggregates[pid]['page_count'] = int(count)
        aggregates[pid]['active_page_count'] = int(active or 0)
        aggregates[pid]['completed_page_count'] = int(completed or 0)
    # 每个项目第一张有图的页面作为封面（order_index 最小）：
    # 图片优先来自 page_image_versions 当前版本（真实数据主要存储于此），
    # 兼容历史 generated_image_path 列
    cover_rows = (
        db.session.query(Page.project_id, PageImageVersion.image_path)
        .join(PageImageVersion, PageImageVersion.page_id == Page.id)
        .filter(
            Page.project_id.in_(project_ids),
            PageImageVersion.is_current.is_(True),
            PageImageVersion.image_path.isnot(None),
        )
        .order_by(Page.order_index.asc())
        .all()
    )
    seen_covers = set()
    for pid, path in cover_rows:
        if pid in seen_covers:
            continue
        seen_covers.add(pid)
        aggregates[pid]['cover_url'] = path
    legacy_cover_rows = (
        db.session.query(Page.project_id, Page.generated_image_path)
        .filter(
            Page.project_id.in_(project_ids),
            Page.generated_image_path.isnot(None),
        )
        .order_by(Page.order_index.asc())
        .all()
    )
    for pid, path in legacy_cover_rows:
        if pid in seen_covers:
            continue
        seen_covers.add(pid)
        aggregates[pid]['cover_url'] = path
    for workspace in ProjectWorkspace.query.filter(
        ProjectWorkspace.project_id.in_(project_ids),
    ).all():
        aggregates[workspace.project_id]['workspaces'].append(workspace)
    active_task_statuses = tuple(ACTIVE_TASK_STATUSES)
    task_rows = (
        db.session.query(Task.project_id, Task.task_type, Task.status)
        .filter(
            Task.project_id.in_(project_ids),
            Task.status.in_(active_task_statuses + ('COMPLETED',)),
        )
        .all()
    )
    for pid, task_type, status in task_rows:
        if status == 'COMPLETED':
            if task_type.startswith('EXPORT_'):
                aggregates[pid]['export_completed'].add(task_type)
            continue
        aggregates[pid]['active_task_count'] += 1
    return aggregates


def _non_ppt_workspace_status_aggregate(workspace, agg):
    """Reduce video/podcast workspace state to generating/completed/draft."""
    stage = str(workspace.stage or '').strip().upper()
    if stage.startswith('GENERATING') or stage in {
        'PENDING', 'PROCESSING', 'RUNNING', 'QUEUED', 'EXPORTING',
    }:
        return 'generating'
    export_type = f'EXPORT_{workspace.kind.upper()}_WORKSPACE'
    if workspace.kind in {'video', 'podcast'} and export_type in agg['export_completed']:
        return 'completed'
    if workspace.state == 'ready' or stage in WORKSPACE_READY_STAGES:
        return 'completed'
    return 'draft'


def _bucket_from_aggregate(agg) -> str:
    """Dashboard status bucket computed from lightweight aggregates only."""
    ppt_stage = None
    has_ppt = False
    workspace_statuses = []
    for workspace in agg['workspaces']:
        if workspace.kind == 'ppt':
            has_ppt = True
            ppt_stage = str(workspace.stage or '').strip().upper()
        else:
            workspace_statuses.append(_non_ppt_workspace_status_aggregate(workspace, agg))
    if (
        ppt_stage in {'GENERATING_DESCRIPTIONS', 'GENERATING_IMAGES'}
        or agg['active_page_count'] > 0
        or 'generating' in workspace_statuses
        or agg['active_task_count'] > 0
    ):
        return 'generating'
    if (
        ppt_stage in {'COMPLETED', 'NATIVE_DECK_GENERATED'}
        or 'completed' in workspace_statuses
        or agg['export_completed']
    ):
        return 'completed'
    if (
        agg['page_count'] > 0
        and agg['completed_page_count'] == agg['page_count']
    ):
        return 'completed'
    return 'in_progress'


def _project_summary(project, agg) -> dict:
    """Lightweight list DTO: no pages, no descriptions, no workspace docs."""
    workspace_states = {
        workspace.kind: workspace.state
        for workspace in agg['workspaces']
    }
    cover_url = agg['cover_url']
    if not cover_url:
        for workspace in agg['workspaces']:
            if getattr(workspace, 'cover_url', None):
                cover_url = workspace.cover_url
                break
    if cover_url and not cover_url.startswith(('/files/', 'http://', 'https://')):
        # image_path 是相对 uploads 的路径（bce7ff91-.../pages/x.png）：
        # 与详情接口一致，转成可访问的 /files/ URL
        from pathlib import Path
        cover_url = f'/files/{project.id}/pages/{Path(cover_url).name}'
    return {
        'project_id': project.id,
        'title': project.project_title or project.idea_prompt or '未命名项目',
        'updated_at': project.updated_at.isoformat() if project.updated_at else None,
        'created_at': project.created_at.isoformat() if project.created_at else None,
        'cover_url': cover_url,
        'workspace_states': workspace_states,
        # 轻量工作区列表：只含 kind/state，不含工作区文档
        'workspaces': [
            {'kind': workspace.kind, 'state': workspace.state}
            for workspace in sorted(agg['workspaces'], key=lambda item: item.kind)
        ],
        'last_workspace': getattr(project, 'last_workspace', None),
        'dashboard_status': _bucket_from_aggregate(agg),
        'page_count': agg['page_count'],
        'active_task_count': agg['active_task_count'],
    }


def _get_project_dashboard_stats():
    """SQL-aggregated dashboard counters; read-only, never instantiates all rows."""
    from models import Project, db
    from sqlalchemy import and_, case, func, or_

    total = db.session.query(func.count(Project.id)).scalar() or 0
    if total == 0:
        return {'total': 0, 'completed': 0, 'generating': 0, 'in_progress': 0}
    completed_statuses = ('COMPLETED', 'NATIVE_GENERATED')
    page_rows = (
        db.session.query(
            Page.project_id,
            func.count(Page.id),
            func.sum(case((Page.status.in_(tuple(ACTIVE_PAGE_STATUSES)), 1), else_=0)),
            func.count(func.distinct(case((or_(
                Page.status.in_(completed_statuses),
                PageImageVersion.id.isnot(None),
            ), Page.id)))),
        )
        .outerjoin(PageImageVersion, and_(
            PageImageVersion.page_id == Page.id,
            PageImageVersion.is_current.is_(True),
            PageImageVersion.image_path.isnot(None),
        ))
        .group_by(Page.project_id)
        .all()
    )
    active_pages = {pid for pid, _total, active, _completed in page_rows if active}
    completed_page_projects = {
        pid for pid, page_total, _active, completed_pages in page_rows
        if page_total and page_total == completed_pages
    }
    task_rows = (
        db.session.query(Task.project_id)
        .filter(Task.status.in_(tuple(ACTIVE_TASK_STATUSES)))
        .distinct()
        .all()
    )
    active_task_projects = {pid for (pid,) in task_rows}
    export_rows = (
        db.session.query(Task.project_id)
        .filter(
            Task.task_type.like('EXPORT_%'),
            Task.status == 'COMPLETED',
        )
        .distinct()
        .all()
    )
    exported_projects = {pid for (pid,) in export_rows}
    workspace_rows = (
        db.session.query(ProjectWorkspace.project_id, ProjectWorkspace.kind, ProjectWorkspace.stage, ProjectWorkspace.state)
        .all()
    )
    by_project = {}
    for pid, kind, stage, state in workspace_rows:
        by_project.setdefault(pid, []).append((kind, str(stage or '').strip().upper(), state))
    generating = set(active_pages) | set(active_task_projects)
    for pid, rows in by_project.items():
        if pid in generating:
            continue
        for kind, stage, state in rows:
            if kind == 'ppt':
                if stage in {'GENERATING_DESCRIPTIONS', 'GENERATING_IMAGES'}:
                    generating.add(pid)
                    break
            elif stage.startswith('GENERATING') or stage in {
                'PENDING', 'PROCESSING', 'RUNNING', 'QUEUED', 'EXPORTING',
            }:
                generating.add(pid)
                break
    completed_projects = set()
    for pid in set(by_project) | completed_page_projects | exported_projects:
        if pid in generating:
            continue
        rows = by_project.get(pid, [])
        for kind, stage, state in rows:
            if kind == 'ppt' and stage in {'COMPLETED', 'NATIVE_DECK_GENERATED'}:
                completed_projects.add(pid)
                break
            if kind != 'ppt' and (state == 'ready' or stage in WORKSPACE_READY_STAGES):
                completed_projects.add(pid)
                break
        else:
            if pid in exported_projects or pid in completed_page_projects:
                completed_projects.add(pid)
    completed = len(completed_projects)
    return {
        'total': total,
        'completed': completed,
        'generating': len(generating),
        'in_progress': max(total - completed - len(generating), 0),
    }


def _resolve_image_generation_workers(requested, configured):
    """Keep image-model fan-out within the provider-safe product limit."""
    try:
        value = int(configured if requested is None else requested)
    except (TypeError, ValueError):
        value = MAX_IMAGE_GENERATION_WORKERS
    return min(MAX_IMAGE_GENERATION_WORKERS, max(1, value))


IMAGE_DENSITY_HINTS = {
    'sparse': ('极简', '只保留一个核心主体，次要主体不超过一个、环境道具不超过两个；背景复杂度低，关闭装饰元素并最大化留白'),
    'standard': ('克制', '保持一个视觉焦点，次要主体不超过两个、环境道具不超过三个；背景简单，装饰元素仅在页面明确需要时出现'),
    'rich': ('丰富', '允许多层信息和辅助元素，但仍只保留一个视觉焦点；辅助元素不超过四个，背景不得喧宾夺主或挤占文字区'),
}

IMAGE_STYLE_HINTS = {
    'theme': ('跟随模板', '优先延续当前模板或项目既有视觉风格'),
    'business': ('商务简洁', '克制、清晰、适合汇报，避免奢侈品广告感和夸张装饰'),
    'tech': ('科技编辑风', '使用冷静的现代科技视觉和清晰信息层级；除非页面内容明确要求，不使用霓虹、全息界面或漂浮光效'),
    'photo': ('真实商业摄影', '使用可信的真实场景、自然材质、合理比例和自然接触阴影；默认平视、中广角、自然景深，大部分元素清晰，保留轻微自然相机纹理而非重胶片颗粒'),
    'flat': ('扁平商务插画', '使用干净色块、清晰边缘和低复杂度图形，不使用伪 3D 光泽或塑料渐变'),
}

IMAGE_COMPOSITION_HINTS = {
    'auto': ('自动适配', '依据本页角色和内容选择构图，确保文字区与视觉区互不争抢'),
    'text-left': ('左文右图', '核心视觉集中在右侧约 40% 区域，左侧约 45% 为文字安全区，重要物体不得进入左侧文字区'),
    'text-right': ('右文左图', '核心视觉集中在左侧约 40% 区域，右侧约 45% 为文字安全区，重要物体不得进入右侧文字区'),
    'center': ('居中主视觉', '主体居中并保持清晰层级，标题与正文使用独立且不重叠的安全区域'),
    'full-bleed': ('全画面', '视觉可铺满画面，但文字必须位于低噪声区域并保持足够对比度'),
}

IMAGE_RESTRAINT_HINTS = {
    'standard': ('标准', '控制饱和度和视觉噪声，不添加随机光点、无意义装饰、页面正文之外的文字或水印'),
    'strong': ('强力', '使用自然或柔和商业光，保持现实尺度、统一光源和自然接触阴影；避免霓虹、全息界面、体积光、电影调色、塑料材质和广告式完美'),
    'documentary': ('纪实', '保持普通工作日氛围、自然间距与轻微不对称，允许合理使用痕迹；人物不摆拍、不强制微笑、不直视镜头，不过度磨皮'),
}

IMAGE_VISUAL_PALETTES = {
    'default': ('跟随模板', ''),
    'enterprise_blue': ('企业蓝', '主色使用企业蓝，辅助色使用青绿，整体保持冷静、可信、商业汇报感'),
    'teal': ('青绿', '主色使用青绿，辅助色使用克制暖金，整体更清爽、自然、专业'),
    'black_gold': ('黑金', '使用黑金高端配色，背景和文字保持高对比，避免廉价金属质感'),
    'orange_gray': ('橙灰', '使用橙色重点和中性灰结构，整体更有行动感但不过度活泼'),
    'custom': ('自定义', ''),
}

IMAGE_CHART_THEMES = {
    'clean': '图表保持清爽、低噪声、易读，弱化网格和装饰',
    'consulting': '图表使用咨询报告风格，突出结论、对比、桥接关系和关键标注',
    'contrast': '图表使用高对比表达，重点数字和差异必须醒目',
    'executive': '图表服务高管摘要，减少细碎数据，强化结论层级',
}

IMAGE_MEDIA_STYLES = {
    'auto': '图片素材跟随页面内容和模板角色',
    'photo': '优先写实商业照片，真实场景和主体明确',
    'illustration': '使用克制插画，避免卡通、廉价 3D 和无意义装饰',
    'product': '突出产品、业务主体或解决方案对象，背景简洁',
    'none': '尽量不用装饰图片，优先以排版、色块、图表和文本层级完成页面',
}

IMAGE_TONES = {
    'strategy': '表达偏战略咨询，强调判断、路径和取舍',
    'sales': '表达偏销售方案，强调价值、场景和行动',
    'government': '表达偏政府汇报，稳健、正式、少夸张',
    'technical': '表达偏技术方案，强调结构、机制和可验证性',
    'research': '表达偏研究报告，强调证据、定义和边界',
}


def _normalize_image_generation_choice(value, choices, default):
    if isinstance(value, str) and value.strip() in choices:
        return value.strip()
    return default


def _clean_image_style_prompt(value):
    if not isinstance(value, str):
        return ''
    return value.strip()[:500]


def _resolve_image_generation_options(options):
    density = _normalize_image_generation_choice(
        options.get('image_density') or options.get('density'),
        IMAGE_DENSITY_HINTS,
        'standard',
    )
    style = _normalize_image_generation_choice(
        options.get('image_style') or options.get('style'),
        IMAGE_STYLE_HINTS,
        'theme',
    )
    composition = _normalize_image_generation_choice(
        options.get('image_composition') or options.get('composition'),
        IMAGE_COMPOSITION_HINTS,
        'auto',
    )
    restraint = _normalize_image_generation_choice(
        options.get('image_restraint') or options.get('restraint'),
        IMAGE_RESTRAINT_HINTS,
        'strong',
    )
    custom_prompt = _clean_image_style_prompt(
        options.get('image_style_prompt') or options.get('custom_prompt')
    )
    return density, style, composition, restraint, custom_prompt


def _build_image_generation_settings_prompt(density, style, composition, restraint, custom_prompt):
    density_label, density_hint = IMAGE_DENSITY_HINTS[density]
    style_label, style_hint = IMAGE_STYLE_HINTS[style]
    composition_label, composition_hint = IMAGE_COMPOSITION_HINTS[composition]
    restraint_label, restraint_hint = IMAGE_RESTRAINT_HINTS[restraint]
    lines = [
        "用途：productivity-visual，用于演示文稿页面视觉，不生成独立海报或与页面无关的装饰图。",
        "资产类型：PPT 页面视觉素材；优先服务页面信息层级、文字安全区和投屏可读性。",
        f"视觉密度：{density_label}。{density_hint}。",
        f"视觉风格：{style_label}。{style_hint}。",
        f"构图安全区：{composition_label}。{composition_hint}。",
        f"AI 味抑制：{restraint_label}。{restraint_hint}。",
    ]
    if custom_prompt:
        lines.append(f"用户补充的必须出现、禁止出现或品牌约束：{custom_prompt}")
    return ("\n\n结构化图片生成约束（若与项目补充、模板描述、页面角色或版式提示冲突，以本段为准）：\n"
            + "\n".join(f"- {line}" for line in lines))


def _build_template_visual_preferences_prompt(settings):
    if not isinstance(settings, dict):
        return ''
    palette = settings.get('palette') or 'default'
    chart_theme = settings.get('chart_theme') or 'clean'
    media_style = settings.get('media_style') or 'auto'
    tone = settings.get('tone') or 'strategy'
    palette_label, palette_hint = IMAGE_VISUAL_PALETTES.get(palette, IMAGE_VISUAL_PALETTES['default'])
    lines = [
        f"模板配色变体：{palette_label}。{palette_hint or '保留所选模板的原始色彩体系。'}",
        f"图表表达：{IMAGE_CHART_THEMES.get(chart_theme, IMAGE_CHART_THEMES['clean'])}。",
        f"图片策略：{IMAGE_MEDIA_STYLES.get(media_style, IMAGE_MEDIA_STYLES['auto'])}。",
        f"表达语气：{IMAGE_TONES.get(tone, IMAGE_TONES['strategy'])}。",
    ]
    custom_palette = settings.get('custom_palette') if isinstance(settings.get('custom_palette'), dict) else {}
    if palette == 'custom' and custom_palette:
        colors = ', '.join(f'{key}={value}' for key, value in custom_palette.items())
        lines.append(f"自定义色值：{colors}。在不破坏模板版式识别的前提下替换原模板主辅色。")
    return "\n\n图片模式模板视觉偏好：\n" + "\n".join(f"- {line}" for line in lines)


def _submit_image_generation_task(task, project, pages, options=None):
    """Submit a recoverable batch image task for pages that still need images."""
    options = options or {}
    file_service = FileService(current_app.config['UPLOAD_FOLDER'])
    use_template = options.get('use_template', True)
    image_density, image_style, image_composition, image_restraint, image_style_prompt = _resolve_image_generation_options(options)
    ref_image_path = file_service.get_template_path(project.id) if use_template else None
    has_generation_style = image_style != 'theme' or bool(image_style_prompt)
    has_page_template = any(page.template_image_path or page.template_style_text for page in pages)
    is_renovation = project.creation_type in {'renovation', 'ppt_renovation'}
    if not is_renovation and not ref_image_path and not project.template_style and not has_page_template and not has_gorden_template_pack(project.template_pack_id) and not has_generation_style:
        raise ValueError("请先上传模板图片或添加风格描述。")

    outline = _reconstruct_outline_from_pages(get_filtered_pages(project.id, None))
    max_workers = _resolve_image_generation_workers(
        options.get('max_workers'),
        current_app.config.get('MAX_IMAGE_WORKERS', MAX_IMAGE_GENERATION_WORKERS),
    )
    language = options.get('language', current_app.config.get('OUTPUT_LANGUAGE', 'zh'))
    page_ids = [page.id for page in pages]
    existing_progress = task.get_progress()
    manifest = build_image_generation_manifest(
        task_id=task.id,
        project_id=project.id,
        pages=[
            {
                'page_id': page.id,
                'page_index': page.order_index + 1,
                'current_version': (
                    page.image_versions.first().version_number
                    if page.image_versions.first()
                    else 0
                ),
                'protected': bool(page.generated_image_path),
            }
            for page in pages
        ],
        image_options={
            'use_template': use_template,
            'language': language,
            'max_workers': max_workers,
            'image_density': image_density,
            'image_style': image_style,
            'image_composition': image_composition,
            'image_restraint': image_restraint,
            'image_style_prompt': image_style_prompt,
        },
        style_snapshot={
            'template_pack_id': project.template_pack_id,
            'template_style': project.template_style or '',
            'extra_requirements': project.extra_requirements or '',
            'aspect_ratio': get_ppt_settings(project)['image_aspect_ratio'],
            'resolution': current_app.config['DEFAULT_RESOLUTION'],
        },
        existing=existing_progress,
    )
    manifest.update({
        'total': len(pages),
        'completed': 0,
        'failed': 0,
    })
    persist_image_generation_manifest(current_app.config['UPLOAD_FOLDER'], manifest)
    task.set_progress(manifest)
    task.status = 'PENDING'
    task.error_message = None
    task.completed_at = None
    for page in pages:
        page.status = 'QUEUED'
    db.session.commit()

    combined_requirements = project.extra_requirements or ""
    if project.template_style:
        combined_requirements += f"\n\nppt页面风格描述：\n\n{project.template_style}"
    combined_requirements += _build_image_generation_settings_prompt(
        image_density,
        image_style,
        image_composition,
        image_restraint,
        image_style_prompt,
    )
    combined_requirements += _build_template_visual_preferences_prompt(
        get_ppt_settings(project)['native_image_settings']
    )

    try:
        task_manager.submit_task(
            task.id,
            generate_images_task,
            project.id,
            get_ai_service(),
            file_service,
            outline,
            use_template,
            max_workers,
            get_ppt_settings(project)['image_aspect_ratio'],
            current_app.config['DEFAULT_RESOLUTION'],
            current_app._get_current_object(),
            combined_requirements if combined_requirements.strip() else None,
            language,
            page_ids,
            get_image_prompt_field_names(),
        )
    except Exception as exc:
        task.status = 'FAILED'
        task.error_message = str(exc)
        task.completed_at = datetime.utcnow()
        for page in pages:
            if not page.generated_image_path:
                page.status = 'FAILED'
        db.session.commit()
        raise

    set_ppt_status(project, 'GENERATING_IMAGES')
    db.session.commit()


def _get_project_reference_files_content(project_id: str) -> list:
    """
    Get reference files content for a project
    
    Args:
        project_id: Project ID
        
    Returns:
        List of dicts with 'filename' and 'content' keys
    """
    reference_files = ReferenceFile.query.filter_by(
        project_id=project_id,
        parse_status='completed'
    ).all()
    
    files_content = []
    for ref_file in reference_files:
        if ref_file.markdown_content:
            files_content.append({
                'filename': ref_file.filename,
                'content': ref_file.markdown_content
            })
    
    return files_content


def _reconstruct_outline_from_pages(pages: list) -> list:
    """
    Reconstruct outline structure from Page objects
    
    Args:
        pages: List of Page objects ordered by order_index
        
    Returns:
        Outline structure (list) with optional part grouping
    """
    outline = []
    current_part = None
    current_part_pages = []
    
    for page in pages:
        outline_content = page.get_outline_content()
        if not outline_content:
            continue
            
        page_data = outline_content.copy()
        
        # 如果当前页面属于一个 part
        if page.part:
            # 如果这是新的 part，先保存之前的 part（如果有）
            if current_part and current_part != page.part:
                outline.append({
                    "part": current_part,
                    "pages": current_part_pages
                })
                current_part_pages = []
            
            current_part = page.part
            # 移除 part 字段，因为它在顶层
            if 'part' in page_data:
                del page_data['part']
            current_part_pages.append(page_data)
        else:
            # 如果当前页面不属于任何 part，先保存之前的 part（如果有）
            if current_part:
                outline.append({
                    "part": current_part,
                    "pages": current_part_pages
                })
                current_part = None
                current_part_pages = []
            
            # 直接添加页面
            outline.append(page_data)
    
    # 保存最后一个 part（如果有）
    if current_part:
        outline.append({
            "part": current_part,
            "pages": current_part_pages
        })
    
    return outline


def _smart_merge_pages(project_id, pages_data):
    """Position-based merge: reuse existing pages by index to preserve descriptions/images.

    For each new page at index i:
      - If an old page exists at the same position, update its outline (title/points/part)
        in place, keeping description_content and image fields untouched.
      - If no old page at that position, create a new page.
    Old pages beyond the new page count are deleted.
    """
    old_pages = Page.query.filter_by(project_id=project_id).order_by(Page.order_index).all()
    pages_list = []

    for i, page_data in enumerate(pages_data):
        if i < len(old_pages):
            page = old_pages[i]
        else:
            page = Page(project_id=project_id, status='DRAFT')
            db.session.add(page)

        page.order_index = i
        page.part = page_data.get('part')
        page.set_outline_content({
            'title': page_data.get('title'),
            'points': page_data.get('points', [])
        })
        description_text = page_data.get('description_text')
        if description_text:
            desc_content = {
                'text': description_text,
                'generated_at': datetime.utcnow().isoformat(),
            }
            if page_data.get('extra_fields'):
                desc_content['extra_fields'] = page_data['extra_fields']
            page.set_description_content(desc_content)
            page.status = 'DESCRIPTION_GENERATED'
        elif not page.description_content:
            page.status = 'DRAFT'
        pages_list.append(page)

    for p in old_pages[len(pages_data):]:
        db.session.delete(p)

    return pages_list


@project_bp.route('', methods=['GET'])
def list_projects():
    """
    GET /api/projects - lightweight project catalog (plan §7.5).

    SQL-level pagination and filtering, aggregated summary per project,
    read-only (never commits). Full page/workspace documents stay in
    GET /api/projects/:id.
    """
    try:
        # Parameter validation
        limit = request.args.get('limit', 20, type=int)
        offset = request.args.get('offset', 0, type=int)
        status = request.args.get('status')
        workspace_kind = request.args.get('workspace')
        if status not in {None, 'completed', 'generating', 'in_progress'}:
            return error_response('INVALID_STATUS', '无效的项目状态筛选', 400)
        if workspace_kind not in {None, 'ppt', 'video', 'podcast'}:
            return error_response('INVALID_WORKSPACE', '无效的项目类型筛选', 400)

        # Enforce limits to prevent performance issues
        limit = min(max(1, limit), 100)
        offset = max(0, offset)

        generating_filter = db.or_(
            db.exists().where(db.and_(
                Page.project_id == Project.id,
                Page.status.in_(ACTIVE_PAGE_STATUSES),
            )),
            db.exists().where(db.and_(
                ProjectWorkspace.project_id == Project.id,
                ProjectWorkspace.stage.in_(('GENERATING_DESCRIPTIONS', 'GENERATING_IMAGES')),
            )),
            db.exists().where(db.and_(
                ProjectWorkspace.project_id == Project.id,
                ProjectWorkspace.kind.in_(('video', 'podcast')),
                db.or_(
                    ProjectWorkspace.stage.like('GENERATING%'),
                    ProjectWorkspace.stage.in_(('PENDING', 'PROCESSING', 'RUNNING', 'QUEUED', 'EXPORTING')),
                ),
            )),
            db.exists().where(db.and_(
                Task.project_id == Project.id,
                Task.status.in_(ACTIVE_TASK_STATUSES),
            )),
        )
        current_page_image = db.exists().where(db.and_(
            PageImageVersion.page_id == Page.id,
            PageImageVersion.is_current.is_(True),
            PageImageVersion.image_path.isnot(None),
        ))
        has_pages = db.exists().where(Page.project_id == Project.id)
        has_incomplete_pages = db.exists().where(db.and_(
            Page.project_id == Project.id,
            ~db.or_(
                Page.status.in_(('COMPLETED', 'NATIVE_GENERATED')),
                current_page_image,
            ),
        ))
        completed_filter = db.or_(
            db.and_(has_pages, ~has_incomplete_pages),
            db.exists().where(db.and_(
                ProjectWorkspace.project_id == Project.id,
                db.or_(
                    db.and_(
                        ProjectWorkspace.kind == 'ppt',
                        ProjectWorkspace.stage.in_(('COMPLETED', 'NATIVE_DECK_GENERATED')),
                    ),
                    db.and_(
                        ProjectWorkspace.kind.in_(('video', 'podcast')),
                        db.or_(
                            ProjectWorkspace.state == 'ready',
                            ProjectWorkspace.stage.in_(tuple(WORKSPACE_READY_STAGES)),
                        ),
                    ),
                ),
            )),
            db.exists().where(db.and_(
                Task.project_id == Project.id,
                Task.task_type.like('EXPORT_%'),
                Task.status == 'COMPLETED',
            )),
        )

        query = Project.query.order_by(desc(Project.updated_at))
        if status == 'generating':
            query = query.filter(generating_filter)
        elif status == 'completed':
            query = query.filter(~generating_filter, completed_filter)
        elif status == 'in_progress':
            query = query.filter(~generating_filter, ~completed_filter)
        if workspace_kind:
            if workspace_kind == 'ppt':
                query = query.filter(~db.exists().where(
                    db.and_(
                        ProjectWorkspace.project_id == Project.id,
                        ProjectWorkspace.kind != 'ppt',
                    ),
                ))
            else:
                query = query.filter(db.exists().where(
                    db.and_(
                        ProjectWorkspace.project_id == Project.id,
                        ProjectWorkspace.kind == workspace_kind,
                        ProjectWorkspace.state != 'uninitialized',
                    ),
                ))

        total = query.count()
        projects = query.offset(offset).limit(limit).all()
        aggregates = _load_catalog_aggregates([project.id for project in projects])
        items = [_project_summary(project, aggregates[project.id]) for project in projects]
        return success_response({
            'projects': items,
            'total': total,
            'stats': _get_project_dashboard_stats(),
            'limit': limit,
            'offset': offset,
        })
    except Exception as e:
        logger.error(f"list_projects failed: {str(e)}", exc_info=True)
        return error_response('SERVER_ERROR', str(e), 500)


@project_bp.route('', methods=['POST'])
def create_project():
    """
    POST /api/projects - Create a new project
    
    Request body:
    {
        "creation_type": "idea|outline|descriptions",
        "idea_prompt": "...",  # required for idea type
        "outline_text": "...",  # required for outline type
        "description_text": "...",  # required for descriptions type
        "template_id": "optional"
    }
    """
    try:
        data = request.get_json()
        
        if not data:
            return bad_request("Request body is required")
        
        # creation_type is required
        if 'creation_type' not in data:
            return bad_request("creation_type is required")
        
        creation_type = data.get('creation_type')
        if creation_type == 'description':
            creation_type = 'descriptions'
        
        if creation_type not in ['idea', 'outline', 'descriptions', 'blank']:
            return bad_request("Invalid creation_type")

        render_mode = data.get('render_mode', 'image')
        if render_mode not in ('image', 'native'):
            return bad_request("Invalid render_mode")
        native_theme = data.get('native_theme') or ('theme01' if render_mode == 'native' else None)
        # `target_workspace` is the convergence-plan alias; `initial_workspace`
        # remains accepted for older clients.
        initial_workspace = data.get('target_workspace') or data.get('initial_workspace')
        if initial_workspace is not None and initial_workspace not in ('ppt', 'video', 'podcast'):
            return bad_request('Invalid target_workspace')
        workspace_settings = data.get('workspace_settings') or {}
        if not isinstance(workspace_settings, dict):
            return bad_request('workspace_settings must be an object')

        template_pack_id = data.get('template_pack_id')
        if template_pack_id is not None and (not isinstance(template_pack_id, str) or len(template_pack_id) > 120):
            return bad_request('template_pack_id must be text within 120 characters')
        
        # Validate and set aspect ratio if provided
        image_aspect_ratio = '16:9'
        if 'image_aspect_ratio' in data:
            try:
                image_aspect_ratio = normalize_aspect_ratio(data['image_aspect_ratio'])
            except ValueError as e:
                return bad_request(str(e))
        try:
            native_image_settings = normalize_native_image_settings(
                data.get('native_image_settings')
            )
        except ValueError as exc:
            return bad_request(str(exc))

        # Create project
        project = Project(
            project_title=data.get('project_title'),
            creation_type=creation_type,
            template_style=data.get('template_style'),
            template_pack_id=(template_pack_id.strip() or None) if isinstance(template_pack_id, str) else None,
            status='active',
            last_workspace=initial_workspace or 'ppt',
        )
        try:
            if 'pronunciation_lexicon' in data:
                project.set_pronunciation_lexicon(data['pronunciation_lexicon'])
            if 'narration_preferences' in data:
                project.set_narration_preferences(data['narration_preferences'])
        except ValueError as exc:
            return bad_request(str(exc))

        from controllers.content_workspace_controller import (
            submit_workspace_task,
            workspace_initialization_task_summary,
        )
        from services.content_spine_service import create_spine, spine_to_dict
        from services.project_workspace_service import (
            create_workspace_set,
            initialize_workspace_from_snapshot,
            queue_workspace_initialization,
            workspace_to_dict,
        )

        db.session.add(project)
        db.session.flush()
        project.content_spine = create_spine(project.id, data)
        project.workspaces.extend(create_workspace_set(project.id))
        db.session.flush()
        ppt_workspace_settings = {
            'render_mode': render_mode,
            'native_theme': native_theme,
            'image_aspect_ratio': image_aspect_ratio,
            'native_image_settings': native_image_settings,
            **workspace_settings,
        }

        if initial_workspace:
            if initial_workspace == 'ppt':
                workspace_settings = ppt_workspace_settings
            task = queue_workspace_initialization(
                project,
                initial_workspace,
                settings=workspace_settings,
                require_confirmed=False,
            )
            db.session.add(task)
            db.session.commit()
            try:
                submit_workspace_task(task, current_app._get_current_object())
            except Exception as exc:
                task.status = 'PAUSED'
                task.error_message = str(exc)
                db.session.commit()
            return success_response({
                'project_id': project.id,
                'status': get_ppt_status(project),
                'initial_workspace': initial_workspace,
                'target_workspace': initial_workspace,
                'next_route': (
                    f'/project/{project.id}/ppt/outline'
                    if initial_workspace == 'ppt'
                    else f'/project/{project.id}/{initial_workspace}'
                ),
                'task_id': task.id,
                'task_status': task.status,
                'initialization_task': workspace_initialization_task_summary(task, initial_workspace),
                'spine': spine_to_dict(project.content_spine),
                'workspaces': [workspace_to_dict(item) for item in project.workspaces],
            }, status_code=202)

        spine = project.content_spine
        initialize_workspace_from_snapshot(
            project.id,
            'ppt',
            spine.revision,
            spine.content_hash,
            json.loads(spine.document_json),
            ppt_workspace_settings,
        )
        db.session.commit()
        
        ppt_settings = get_ppt_settings(project)
        return success_response({
            'project_id': project.id,
            'status': get_ppt_status(project),
            'initial_workspace': 'ppt',
            'target_workspace': 'ppt',
            'next_route': f'/project/{project.id}/ppt/outline',
            'render_mode': ppt_settings['render_mode'],
            'native_theme': ppt_settings['native_theme'],
            'native_image_settings': ppt_settings['native_image_settings'],
            'pronunciation_lexicon': project.get_pronunciation_lexicon(),
            'narration_preferences': project.get_narration_preferences(),
            'initialization_task': None,
            'pages': []
        }, status_code=201)
    
    except BadRequest as e:
        # Handle JSON parsing errors (invalid JSON body)
        db.session.rollback()
        logger.warning(f"create_project: Invalid JSON body - {str(e)}")
        return bad_request("Invalid JSON in request body")
    
    except Exception as e:
        db.session.rollback()
        error_trace = traceback.format_exc()
        logger.error(f"create_project failed: {str(e)}", exc_info=True)
        return error_response('SERVER_ERROR', str(e), 500)


@project_bp.route('/brief/optimize', methods=['POST'])
def optimize_project_brief():
    """Stateless project-brief optimization used by the create page.

    Returns suggestions only; never persists and never creates a workspace.
    """
    data = request.get_json() or {}
    if not isinstance(data, dict):
        return bad_request('request body must be an object')
    values = {}
    for field in ('topic', 'audience', 'goal'):
        value = data.get(field)
        if value is None:
            value = ''
        if not isinstance(value, str):
            return bad_request(f'{field} must be a string')
        values[field] = value.strip()
    if not any(values.values()):
        return bad_request('at least one positioning field is required')
    try:
        return success_response(optimize_positioning(values, get_ai_service().text_provider))
    except (ValueError, json.JSONDecodeError) as exc:
        return error_response('AI_SERVICE_ERROR', str(exc), 503)
    except Exception as exc:
        upstream_status = getattr(getattr(exc, 'response', None), 'status_code', None)
        if upstream_status == 429:
            return rate_limit_error('AI 服务当前请求过于频繁，请稍后重试，或在设置中切换文本模型。')
        current_app.logger.exception('Project brief optimization failed')
        return error_response('AI_SERVICE_ERROR', str(exc), 503)


@project_bp.route('/<project_id>', methods=['GET'])
def get_project(project_id):
    """
    GET /api/projects/{project_id} - Get project details
    """
    try:
        # Use eager loading to load project and related pages
        project = Project.query\
            .options(
                joinedload(Project.pages),
                joinedload(Project.tasks),
                joinedload(Project.workspaces),
            )\
            .filter(Project.id == project_id)\
            .first()
        
        if not project:
            return not_found('Project')

        if _calibrate_stale_image_generation_state(project):
            db.session.commit()
        
        return success_response(project.to_dict(include_pages=True))
    
    except Exception as e:
        logger.error(f"get_project failed: {str(e)}", exc_info=True)
        return error_response('SERVER_ERROR', str(e), 500)


@project_bp.route('/<project_id>', methods=['PUT'])
def update_project(project_id):
    """
    PUT /api/projects/{project_id} - Update project
    
    Request body:
    {
        "idea_prompt": "...",
        "pages_order": ["page-uuid-1", "page-uuid-2", ...]
    }
    """
    try:
        # Use eager loading to load project and pages (for page order updates)
        project = Project.query\
            .options(joinedload(Project.pages))\
            .filter(Project.id == project_id)\
            .first()
        
        if not project:
            return not_found('Project')
        
        data = request.get_json()
        ppt_changed = False

        if 'render_mode' in data and data['render_mode'] != get_ppt_settings(project)['render_mode']:
            return bad_request("render_mode cannot be changed after project creation")

        # Update project_title if provided
        if 'project_title' in data:
            project.project_title = data['project_title']
        
        spine_patch = {
            field: data[field]
            for field in ('idea_prompt', 'outline_text', 'description_text')
            if field in data
        }
        if spine_patch:
            update_spine_source_fields(project.content_spine, spine_patch)

        # Update extra_requirements if provided
        if 'extra_requirements' in data:
            project.extra_requirements = data['extra_requirements']

        # Update generation requirements if provided
        if 'outline_requirements' in data:
            project.outline_requirements = data['outline_requirements']
        if 'description_requirements' in data:
            project.description_requirements = data['description_requirements']
        
        # Update template_style if provided
        if 'template_style' in data:
            project.template_style = data['template_style']

        if 'template_pack_id' in data:
            template_pack_id = data['template_pack_id']
            if template_pack_id is not None and (not isinstance(template_pack_id, str) or len(template_pack_id) > 120):
                return bad_request('template_pack_id must be text within 120 characters')
            project.template_pack_id = (template_pack_id.strip() or None) if isinstance(template_pack_id, str) else None

        if 'native_image_settings' in data:
            try:
                native_image_settings = normalize_native_image_settings(data['native_image_settings'])
                if update_ppt_settings(
                    project,
                    {'native_image_settings': native_image_settings},
                    record_revision=False,
                ):
                    ppt_changed = True
            except ValueError as exc:
                return bad_request(str(exc))

        try:
            if 'pronunciation_lexicon' in data:
                project.set_pronunciation_lexicon(data['pronunciation_lexicon'])
            if 'narration_preferences' in data:
                project.set_narration_preferences(data['narration_preferences'])
        except ValueError as exc:
            return bad_request(str(exc))
        
        # Update aspect ratio if provided
        if 'image_aspect_ratio' in data:
            try:
                image_aspect_ratio = normalize_aspect_ratio(data['image_aspect_ratio'])
                if update_ppt_settings(
                    project,
                    {'image_aspect_ratio': image_aspect_ratio},
                    record_revision=False,
                ):
                    ppt_changed = True
            except ValueError as e:
                return bad_request(str(e))

        # Update export settings if provided
        if 'export_extractor_method' in data:
            project.export_extractor_method = data['export_extractor_method']
        if 'export_inpaint_method' in data:
            project.export_inpaint_method = data['export_inpaint_method']
        for field in ('export_allow_partial', 'export_high_fidelity_editable'):
            if field in data and not isinstance(data[field], bool):
                return bad_request(f"{field} must be a boolean")
        if 'export_allow_partial' in data:
            project.export_allow_partial = data['export_allow_partial']
        if 'export_high_fidelity_editable' in data:
            project.export_high_fidelity_editable = data['export_high_fidelity_editable']
        
        # Update page order if provided
        if 'pages_order' in data:
            pages_order = data['pages_order']
            # Optimization: batch query all pages to update, avoiding N+1 queries
            pages_to_update = Page.query.filter(
                Page.id.in_(pages_order),
                Page.project_id == project_id
            ).all()
            
            # Create page_id -> page mapping for O(1) lookup
            pages_map = {page.id: page for page in pages_to_update}
            
            # Batch update order
            for index, page_id in enumerate(pages_order):
                if page_id in pages_map:
                    pages_map[page_id].order_index = index
            ppt_changed = True
        
        project.updated_at = datetime.utcnow()
        if ppt_changed:
            record_ppt_revision(
                project,
                'ppt.update',
                changed_page_ids=data.get('pages_order') or [],
            )
        db.session.commit()
        
        return success_response(project.to_dict(include_pages=True))
    
    except Exception as e:
        db.session.rollback()
        logger.error(f"update_project failed: {str(e)}", exc_info=True)
        return error_response('SERVER_ERROR', str(e), 500)


@project_bp.route('/<project_id>', methods=['DELETE'])
def delete_project(project_id):
    """
    DELETE /api/projects/{project_id} - Delete project
    """
    try:
        project = Project.query.get(project_id)
        
        if not project:
            return not_found('Project')
        
        # Delete project files
        from services import FileService
        file_service = FileService(current_app.config['UPLOAD_FOLDER'])
        file_service.delete_project_files(project_id)
        
        # Delete project from database (cascade will delete pages and tasks)
        db.session.delete(project)
        db.session.commit()
        
        return success_response(message="Project deleted successfully")
    
    except Exception as e:
        db.session.rollback()
        logger.error(f"delete_project failed: {str(e)}", exc_info=True)
        return error_response('SERVER_ERROR', str(e), 500)


@project_bp.route('/<project_id>/generate/outline', methods=['POST'])
def generate_outline(project_id):
    """
    POST /api/projects/{project_id}/generate/outline - Generate outline

    For 'idea' type: Generate outline from idea_prompt
    For 'outline' type: Parse outline_text into structured format
    For 'descriptions' type: Extract outline structure from description_text

    Request body (optional):
    {
        "idea_prompt": "...",  # for idea type
        "language": "zh"  # output language: zh, en, ja, auto
    }
    """
    try:
        project = Project.query.get(project_id)
        
        if not project:
            return not_found('Project')
        
        # Get singleton AI service instance
        ai_service = get_ai_service()
        
        # Get request data and language parameter
        data = request.get_json() or {}
        language = data.get('language', current_app.config.get('OUTPUT_LANGUAGE', 'zh'))
        
        # Get reference files content and create project context
        reference_files_content = _get_project_reference_files_content(project_id)
        if reference_files_content:
            logger.info(f"Found {len(reference_files_content)} reference files for project {project_id}")
            for rf in reference_files_content:
                logger.info(f"  - {rf['filename']}: {len(rf['content'])} characters")
        else:
            logger.info(f"No reference files found for project {project_id}")
        project_context = ProjectContext(project, reference_files_content)

        # 根据项目类型选择不同的处理方式
        if project.creation_type == 'outline':
            # 从大纲生成：解析用户输入的大纲文本
            if not project_context.outline_text:
                return bad_request("outline_text is required for outline type project")
            outline = ai_service.parse_outline_text(project_context, language=language)
        elif project.creation_type == 'descriptions':
            # 从描述生成：从 description_text 提取大纲结构（仅大纲，不含页面描述）
            if not project_context.description_text:
                return bad_request("description_text is required for descriptions type project")

            outline = ai_service.parse_description_to_outline(project_context, language=language)
        else:
            # 一句话生成：从idea生成大纲
            idea_prompt = data.get('idea_prompt') or project_context.idea_prompt
            
            if not idea_prompt:
                return bad_request("idea_prompt is required")
            
            update_spine_source_fields(project.content_spine, {'idea_prompt': idea_prompt})
            project_context = ProjectContext(project, reference_files_content)

            # Create project context and generate outline from idea
            outline = ai_service.generate_outline(project_context, language=language)
        
        # Flatten outline to pages and smart merge with existing
        pages_data = ai_service.flatten_outline(outline)
        pages_list = _smart_merge_pages(project_id, pages_data)

        # Update project status (don't downgrade if all pages already have content)
        if all(p.description_content for p in pages_list) and pages_list:
            set_ppt_status(project, 'DESCRIPTIONS_GENERATED')
        else:
            set_ppt_status(project, 'OUTLINE_GENERATED')
        project.updated_at = datetime.utcnow()
        record_ppt_revision(
            project,
            'outline.generate',
            changed_page_ids=[page.id for page in pages_list],
            source_type='ai',
        )
        
        db.session.commit()
        
        logger.info(f"大纲生成完成: 项目 {project_id}, 创建了 {len(pages_list)} 个页面")
        
        # Return pages
        return success_response({
            'pages': [page.to_dict() for page in pages_list]
        })
    
    except Exception as e:
        db.session.rollback()
        logger.error(f"generate_outline failed: {str(e)}", exc_info=True)
        return error_response('AI_SERVICE_ERROR', str(e), 503)


@project_bp.route('/<project_id>/generate/outline/stream', methods=['POST'])
def generate_outline_stream(project_id):
    """
    POST /api/projects/{project_id}/generate/outline/stream - Stream outline generation via SSE

    Streams pages one-by-one as they are generated. Each page is sent as an SSE event.
    After all pages are streamed, saves them to the database.

    SSE events:
      event: page    — a single page object {index, title, points, part?}
      event: done    — generation complete {total, pages: [...with ids...]}
      event: error   — error occurred {message}
    """
    # Validate project exists before entering the generator
    project = Project.query.get(project_id)
    if not project:
        return not_found('Project')

    data = request.get_json() or {}
    language = data.get('language', current_app.config.get('OUTPUT_LANGUAGE', 'zh'))

    # Capture app reference for use inside the generator (which runs outside request context)
    app = current_app._get_current_object()

    def sse_generate():
        with app.app_context():
            try:
                # Re-fetch project inside app context to attach to this session
                proj = db.session.get(Project, project_id)
                ai_service = get_ai_service()
                reference_files_content = _get_project_reference_files_content(project_id)

                source_fields = get_spine_source_fields(proj)
                # Validate input based on creation type
                if proj.creation_type == 'outline' and not source_fields['outline_text']:
                    yield _sse_event('error', {'message': 'outline_text is required'})
                    return
                if proj.creation_type == 'descriptions' and not source_fields['description_text']:
                    yield _sse_event('error', {'message': 'description_text is required'})
                    return

                # Update idea_prompt if provided
                if proj.creation_type not in ('outline', 'descriptions'):
                    idea_prompt = data.get('idea_prompt') or source_fields['idea_prompt']
                    if not idea_prompt:
                        yield _sse_event('error', {'message': 'idea_prompt is required'})
                        return
                    update_spine_source_fields(proj.content_spine, {'idea_prompt': idea_prompt})

                project_context = ProjectContext(proj, reference_files_content)

                # Stream pages from AI
                streamed_pages = []
                stream_complete = False
                for page_data in ai_service.generate_outline_stream(project_context, language=language):
                    # Check for completion sentinel
                    if '__stream_complete__' in page_data:
                        stream_complete = page_data['__stream_complete__']
                        continue
                    i = len(streamed_pages)
                    streamed_pages.append(page_data)
                    yield _sse_event('page', {
                        'index': i,
                        'title': page_data.get('title', ''),
                        'points': page_data.get('points', []),
                        'part': page_data.get('part'),
                        'description_text': page_data.get('description_text'),
                        'extra_fields': page_data.get('extra_fields'),
                    })

                # Handle lock_page_count: pad with blank pages if needed
                lock_page_count = data.get('lock_page_count', False)
                if lock_page_count:
                    old_pages = Page.query.filter_by(project_id=project_id).order_by(Page.order_index).all()
                    old_count = len(old_pages)
                    new_count = len(streamed_pages)
                    if new_count < old_count:
                        for _ in range(old_count - new_count):
                            streamed_pages.append({'title': '', 'points': []})

                # Save all pages to database
                pages_list = _smart_merge_pages(project_id, streamed_pages)

                if all(p.description_content for p in pages_list) and pages_list:
                    proj.status = 'DESCRIPTIONS_GENERATED'
                else:
                    proj.status = 'OUTLINE_GENERATED'
                proj.updated_at = datetime.utcnow()
                record_ppt_revision(
                    proj,
                    'outline.generate_stream',
                    changed_page_ids=[page.id for page in pages_list],
                    source_type='ai',
                )
                db.session.commit()

                logger.info(f"流式大纲生成完成: 项目 {project_id}, {len(pages_list)} 个页面")

                yield _sse_event('done', {
                    'total': len(pages_list),
                    'pages': [p.to_dict() for p in pages_list],
                    'complete': stream_complete,
                })

            except Exception as e:
                try:
                    db.session.rollback()
                except Exception as rollback_exc:
                    logger.warning(f"Session rollback failed: {rollback_exc}", exc_info=True)
                logger.error(f"generate_outline_stream failed: {str(e)}", exc_info=True)
                yield _sse_event('error', {'message': '生成过程中发生内部错误'})

    return Response(
        stream_with_context(sse_generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache, no-transform',
            'X-Accel-Buffering': 'no',
            'Connection': 'keep-alive',
        },
    )


def _sse_event(event: str, data: dict) -> str:
    """Format a single SSE event."""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@project_bp.route('/<project_id>/generate/from-description', methods=['POST'])
def generate_from_description(project_id):
    """
    POST /api/projects/{project_id}/generate/from-description - Generate outline and page descriptions from description text
    
    This endpoint:
    1. Parses the description_text to extract outline structure
    2. Splits the description_text into individual page descriptions
    3. Creates pages with both outline and description content filled
    4. Sets project status to DESCRIPTIONS_GENERATED
    
    Request body (optional):
    {
        "description_text": "...",  # if not provided, uses project.description_text
        "language": "zh"  # output language: zh, en, ja, auto
    }
    """
    
    try:
        project = Project.query.get(project_id)
        
        if not project:
            return not_found('Project')
        
        if project.creation_type != 'descriptions':
            return bad_request("This endpoint is only for descriptions type projects")
        
        # Get description text and language
        data = request.get_json() or {}
        description_text = (
            data.get('description_text')
            or get_spine_source_fields(project)['description_text']
        )
        language = data.get('language', current_app.config.get('OUTPUT_LANGUAGE', 'zh'))
        
        if not description_text:
            return bad_request("description_text is required")
        
        update_spine_source_fields(
            project.content_spine, {'description_text': description_text}
        )
        
        # Get singleton AI service instance
        ai_service = get_ai_service()
        
        # Get reference files content and create project context
        reference_files_content = _get_project_reference_files_content(project_id)
        project_context = ProjectContext(project, reference_files_content)
        
        logger.info(f"开始从描述生成大纲和页面描述: 项目 {project_id}")
        
        # Step 1: Parse description to outline
        logger.info("Step 1: 解析描述文本到大纲结构...")
        outline = ai_service.parse_description_to_outline(project_context, language=language)
        logger.info(f"大纲解析完成，共 {len(ai_service.flatten_outline(outline))} 页")
        
        # Step 2: Split description into page descriptions
        logger.info("Step 2: 切分描述文本到每页描述...")
        page_descriptions = ai_service.parse_description_to_page_descriptions(project_context, outline, language=language)
        logger.info(f"描述切分完成，共 {len(page_descriptions)} 页")
        
        # Step 3: Flatten outline to pages
        pages_data = ai_service.flatten_outline(outline)
        
        if len(pages_data) != len(page_descriptions):
            logger.warning(f"页面数量不匹配: 大纲 {len(pages_data)} 页, 描述 {len(page_descriptions)} 页")
            # 取较小的数量，避免索引错误
            min_count = min(len(pages_data), len(page_descriptions))
            pages_data = pages_data[:min_count]
            page_descriptions = page_descriptions[:min_count]
        
        # Step 4: Delete existing pages (using ORM session to trigger cascades)
        old_pages = Page.query.filter_by(project_id=project_id).all()
        for old_page in old_pages:
            db.session.delete(old_page)
        
        # Step 5: Create pages with both outline and description
        pages_list = []
        for i, (page_data, page_desc) in enumerate(zip(pages_data, page_descriptions)):
            page = Page(
                project_id=project_id,
                order_index=i,
                part=page_data.get('part'),
                status='DESCRIPTION_GENERATED'  # 直接设置为已生成描述
            )
            
            # Set outline content
            page.set_outline_content({
                'title': page_data.get('title'),
                'points': page_data.get('points', [])
            })
            
            # Set description content
            desc_content = {
                "text": page_desc,
                "generated_at": datetime.utcnow().isoformat()
            }
            page.set_description_content(desc_content)
            
            db.session.add(page)
            pages_list.append(page)
        
        # Update project status
        set_ppt_status(project, 'DESCRIPTIONS_GENERATED')
        project.updated_at = datetime.utcnow()
        record_ppt_revision(
            project,
            'description.import',
            changed_page_ids=[page.id for page in pages_list],
            source_type='ai',
        )
        
        db.session.commit()
        
        logger.info(f"从描述生成完成: 项目 {project_id}, 创建了 {len(pages_list)} 个页面，已填充大纲和描述")
        
        # Return pages
        return success_response({
            'pages': [page.to_dict() for page in pages_list],
            'status': 'DESCRIPTIONS_GENERATED'
        })
    
    except Exception as e:
        db.session.rollback()
        logger.error(f"generate_from_description failed: {str(e)}", exc_info=True)
        return error_response('AI_SERVICE_ERROR', str(e), 503)


@project_bp.route('/<project_id>/generate/descriptions', methods=['POST'])
def generate_descriptions(project_id):
    """
    POST /api/projects/{project_id}/generate/descriptions - Generate descriptions
    
    Request body:
    {
        "max_workers": 5,
        "language": "zh"  # output language: zh, en, ja, auto
    }
    """
    try:
        project = Project.query.get(project_id)
        
        if not project:
            return not_found('Project')
        
        if not project.pages:
            return bad_request("Project must have outline generated first")

        # IMPORTANT: Expire cached objects to ensure fresh data
        db.session.expire_all()
        
        # Get pages
        pages = Page.query.filter_by(project_id=project_id).order_by(Page.order_index).all()
        
        if not pages:
            return bad_request("No pages found for project")
        
        # Reconstruct outline from pages with part structure
        outline = _reconstruct_outline_from_pages(pages)
        
        data = request.get_json() or {}
        # 从配置中读取默认并发数，如果请求中提供了则使用请求的值
        max_workers = data.get('max_workers', current_app.config.get('MAX_DESCRIPTION_WORKERS', 5))
        language = data.get('language', current_app.config.get('OUTPUT_LANGUAGE', 'zh'))
        detail_level = data.get('detail_level', 'default')
        
        # Create task
        task = Task(
            project_id=project_id,
            task_type='GENERATE_DESCRIPTIONS',
            status='PENDING'
        )
        task.set_progress({
            'total': len(pages),
            'completed': 0,
            'failed': 0
        })
        
        db.session.add(task)
        db.session.commit()
        
        # Get singleton AI service instance
        ai_service = get_ai_service()
        
        # Get reference files content and create project context
        reference_files_content = _get_project_reference_files_content(project_id)
        project_context = ProjectContext(project, reference_files_content)
        
        # Get app instance for background task
        app = current_app._get_current_object()
        
        # Submit background task
        task_manager.submit_task(
            task.id,
            generate_descriptions_task,
            project_id,
            ai_service,
            project_context,
            outline,
            max_workers,
            app,
            language,
            detail_level
        )
        
        # Update project status
        set_ppt_status(project, 'GENERATING_DESCRIPTIONS')
        db.session.commit()
        
        return success_response({
            'task_id': task.id,
            'status': 'GENERATING_DESCRIPTIONS',
            'total_pages': len(pages)
        }, status_code=202)
    
    except Exception as e:
        db.session.rollback()
        logger.error(f"generate_descriptions failed: {str(e)}", exc_info=True)
        return error_response('SERVER_ERROR', str(e), 500)


@project_bp.route('/<project_id>/generate/descriptions/stream', methods=['POST'])
def generate_descriptions_stream(project_id):
    """
    POST /api/projects/{project_id}/generate/descriptions/stream - Stream description generation via SSE

    Streams page descriptions one-by-one as they are generated by a single AI call.

    SSE events:
      event: description — {page_index, page_id, text, extra_fields?}
      event: done        — {total, pages: [...]}
      event: error       — {message}
    """
    project = Project.query.get(project_id)
    if not project:
        return not_found('Project')

    if not project.pages:
        return bad_request("Project must have outline generated first")

    data = request.get_json() or {}
    language = data.get('language', current_app.config.get('OUTPUT_LANGUAGE', 'zh'))
    detail_level = data.get('detail_level', 'default')

    app = current_app._get_current_object()

    def sse_generate():
        with app.app_context():
            try:
                proj = db.session.get(Project, project_id)
                ai_service = get_ai_service()
                reference_files_content = _get_project_reference_files_content(project_id)
                project_context = ProjectContext(proj, reference_files_content)

                pages = Page.query.filter_by(project_id=project_id).order_by(Page.order_index).all()
                if not pages:
                    yield _sse_event('error', {'message': 'No pages found for project'})
                    return

                outline = _reconstruct_outline_from_pages(pages)
                flat_pages = ai_service.flatten_outline(outline)

                # Set all pages to GENERATING_DESCRIPTION
                for page in pages:
                    page.status = 'GENERATING_DESCRIPTION'
                proj.status = 'GENERATING_DESCRIPTIONS'
                db.session.commit()

                # Stream descriptions
                for result in ai_service.generate_descriptions_stream(
                    project_context, outline, flat_pages,
                    language=language, detail_level=detail_level
                ):
                    if '__stream_complete__' in result:
                        continue

                    idx = result.get('page_index', -1)
                    if idx < 0 or idx >= len(pages):
                        continue

                    page = pages[idx]
                    desc_content = {
                        'text': result.get('description_text', ''),
                        'generated_at': datetime.utcnow().isoformat(),
                    }
                    if result.get('extra_fields'):
                        desc_content['extra_fields'] = result['extra_fields']

                    page.set_description_content(desc_content)
                    page.status = 'DESCRIPTION_GENERATED'
                    page.updated_at = datetime.utcnow()
                    db.session.commit()

                    yield _sse_event('description', {
                        'page_index': idx,
                        'page_id': page.id,
                        'text': desc_content['text'],
                        'extra_fields': result.get('extra_fields'),
                    })

                # 检查是否所有页面都已生成描述
                missing = [p for p in pages if p.status == 'GENERATING_DESCRIPTION']
                if missing:
                    for p in missing:
                        # 有旧描述的保留，无描述的恢复 DRAFT
                        p.status = 'DESCRIPTION_GENERATED' if p.description_content else 'DRAFT'
                        p.updated_at = datetime.utcnow()
                    logger.warning(f"流式描述生成不完整: {len(missing)}/{len(pages)} 页未生成")

                proj.status = 'DESCRIPTIONS_GENERATED'
                proj.updated_at = datetime.utcnow()
                db.session.commit()

                # Re-fetch pages for final response
                pages = Page.query.filter_by(project_id=project_id).order_by(Page.order_index).all()
                yield _sse_event('done', {
                    'total': len(pages),
                    'pages': [p.to_dict() for p in pages],
                    **(({'warning': f'{len(missing)} 页描述未生成，请重试'}) if missing else {}),
                })

            except Exception as e:
                try:
                    db.session.rollback()
                except Exception as rollback_exc:
                    logger.warning(f"Session rollback failed: {rollback_exc}", exc_info=True)
                logger.error(f"generate_descriptions_stream failed: {str(e)}", exc_info=True)

                # 恢复未完成页面的状态：已生成描述的保留，未生成的恢复为 DRAFT
                try:
                    pages = Page.query.filter_by(project_id=project_id).order_by(Page.order_index).all()
                    proj = db.session.get(Project, project_id)
                    has_any_desc = False
                    for page in pages:
                        if page.status == 'GENERATING_DESCRIPTION':
                            # 如果之前就有描述内容，恢复为 DESCRIPTION_GENERATED
                            if page.description_content:
                                page.status = 'DESCRIPTION_GENERATED'
                                has_any_desc = True
                            else:
                                page.status = 'DRAFT'
                        elif page.status == 'DESCRIPTION_GENERATED':
                            has_any_desc = True
                    if proj:
                        proj.status = 'DESCRIPTIONS_GENERATED' if has_any_desc else 'OUTLINE_GENERATED'
                        proj.updated_at = datetime.utcnow()
                    db.session.commit()
                except Exception as recover_exc:
                    logger.warning(f"Failed to recover page statuses: {recover_exc}", exc_info=True)

                yield _sse_event('error', {'message': '生成过程中发生内部错误'})

    return Response(
        stream_with_context(sse_generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache, no-transform',
            'X-Accel-Buffering': 'no',
            'Connection': 'keep-alive',
        },
    )


@project_bp.route('/<project_id>/generate/images', methods=['POST'])
def generate_images(project_id):
    """
    POST /api/projects/{project_id}/generate/images - Generate images

    Request body:
    {
        "max_workers": 8,
        "use_template": true,
        "language": "zh",  # output language: zh, en, ja, auto
        "page_ids": ["id1", "id2"]  # optional: specific page IDs to generate (if not provided, generates all)
    }
    """
    try:
        project = Project.query.get(project_id)
        
        if not project:
            return not_found('Project')
        
        # if project.status not in ['DESCRIPTIONS_GENERATED', 'OUTLINE_GENERATED']:
        #     return bad_request("Project must have descriptions generated first")
        
        # IMPORTANT: Expire cached objects to ensure fresh data
        db.session.expire_all()
        
        data = request.get_json() or {}
        
        # Get page_ids from request body and fetch filtered pages.
        selected_page_ids = parse_page_ids_from_body(data)
        requested_pages = get_filtered_pages(project_id, selected_page_ids if selected_page_ids else None)
        
        if not requested_pages:
            return bad_request("No pages found for project")

        # The first renovation image is the PDF source, not a generated result.
        file_service = FileService(current_app.config['UPLOAD_FOLDER'])
        is_renovation = project.creation_type in {'renovation', 'ppt_renovation'}
        pages = (
            [page for page in requested_pages if page.image_versions.count() <= 1]
            if is_renovation
            else [page for page in requested_pages if prepare_page_for_image_generation(page, file_service)]
        )
        skipped_existing = len(requested_pages) - len(pages)

        active_image_tasks = Task.query.filter(
            Task.project_id == project_id,
            Task.task_type == 'GENERATE_IMAGES',
            Task.status.in_({'PENDING', 'PROCESSING', 'RUNNING', 'PAUSED'}),
        ).order_by(Task.created_at.desc()).all()
        claimed_page_ids = set()
        task_by_page_id = {}
        for active_task in active_image_tasks:
            progress = active_task.get_progress()
            active_page_ids = progress.get('page_ids')
            if not isinstance(active_page_ids, list):
                active_page_ids = [
                    item.get('page_id')
                    for item in progress.get('pages', [])
                    if isinstance(item, dict) and item.get('page_id')
                ]
            for active_page_id in active_page_ids:
                claimed_page_ids.add(active_page_id)
                task_by_page_id.setdefault(active_page_id, active_task)

        unclaimed_pages = [page for page in pages if page.id not in claimed_page_ids]
        claimed_requested_pages = [page for page in pages if page.id in claimed_page_ids]
        if not unclaimed_pages and claimed_requested_pages:
            active_task = task_by_page_id[claimed_requested_pages[0].id]
            return success_response({
                'task_id': active_task.id,
                'status': 'GENERATING_IMAGES',
                'total_pages': 0,
                'skipped_existing': skipped_existing,
                'skipped_active': len(claimed_requested_pages),
            }, status_code=202)
        pages = unclaimed_pages
        if not pages:
            return success_response({
                'task_id': None,
                'status': 'NO_PENDING_IMAGES',
                'total_pages': 0,
                'skipped_existing': skipped_existing,
                'skipped_active': 0,
            })
        
        # Create task
        task = Task(
            project_id=project_id,
            task_type='GENERATE_IMAGES',
            status='PENDING'
        )
        db.session.add(task)
        db.session.commit()
        _submit_image_generation_task(task, project, pages, data)
        
        return success_response({
            'task_id': task.id,
            'status': 'GENERATING_IMAGES',
            'total_pages': len(pages),
            'skipped_existing': skipped_existing,
            'skipped_active': len(claimed_requested_pages),
        }, status_code=202)
    
    except Exception as e:
        db.session.rollback()
        logger.error(f"generate_images failed: {str(e)}", exc_info=True)
        return error_response('SERVER_ERROR', str(e), 500)


@project_bp.route('/<project_id>/recover-image-scenes', methods=['POST'])
def recover_project_image_scenes(project_id):
    if not db.session.get(Project, project_id):
        return not_found('Project')
    data = request.get_json(silent=True) or {}
    page_ids = data.get('page_ids')
    if page_ids is not None and (
        not isinstance(page_ids, list)
        or any(not isinstance(page_id, str) for page_id in page_ids)
    ):
        return bad_request('page_ids must be a list of page IDs')
    pages = Page.query.filter_by(project_id=project_id).order_by(Page.order_index).all()
    if page_ids is not None:
        selected = set(page_ids)
        pages = [page for page in pages if page.id in selected]
    versions = PageImageVersion.query.filter(
        PageImageVersion.page_id.in_([page.id for page in pages]),
        PageImageVersion.is_current.is_(True),
    ).all() if pages else []
    versions_by_page = {version.page_id: version for version in versions}
    version_ids = [
        versions_by_page[page.id].id
        for page in pages
        if page.id in versions_by_page
    ]
    if not version_ids:
        return bad_request('No current image versions are available for recovery')

    force = bool(data.get('force'))
    resume_kwargs = {
        'project_id': project_id,
        'version_ids': version_ids,
        'force': force,
    }
    task = Task(project_id=project_id, task_type='RECOVER_IMAGE_SCENES', status='PENDING')
    db.session.add(task)
    db.session.flush()
    task.set_progress({
        'total': len(version_ids),
        'completed': 0,
        'failed': 0,
        'pages': [],
        '_resume': {'kind': 'historical-image-scenes', 'kwargs': resume_kwargs},
    })
    db.session.commit()
    task_manager.submit_task(
        task.id,
        recover_historical_image_scenes_task,
        file_service=FileService(current_app.config['UPLOAD_FOLDER']),
        app=current_app._get_current_object(),
        **resume_kwargs,
    )
    return success_response({
        'task_id': task.id,
        'status': 'PENDING',
        'total_pages': len(version_ids),
    }, status_code=202)


@server_task_bp.route('/tasks', methods=['GET'])
def list_server_tasks():
    """GET /api/tasks - server-side task list (single source of truth, plan §5.3).

    Filters: project_id / workspace_kind / status / limit / cursor(offset).
    Never depends on browser-local storage; the task center and the project
    task panel share this endpoint.
    """
    try:
        project_id = request.args.get('project_id', type=str) or None
        workspace_kind = request.args.get('workspace_kind', type=str) or None
        status = request.args.get('status', type=str) or None
        limit = min(max(1, request.args.get('limit', 50, type=int)), 100)
        cursor = max(0, request.args.get('cursor', 0, type=int))

        query = Task.query
        if project_id:
            query = query.filter(Task.project_id == project_id)
        if status:
            query = query.filter(Task.status == status)
        total = query.count()
        tasks = (
            query
            .order_by(Task.created_at.desc(), Task.id.desc())
            .offset(cursor)
            .limit(limit)
            .all()
        )
        project_titles = {
            project.id: project.project_title or '未命名项目'
            for project in Project.query.filter(
                Project.id.in_({task.project_id for task in tasks}),
            ).all()
        } if tasks else {}
        items = []
        for task in tasks:
            item = task_projection(task)
            item['project_title'] = project_titles.get(task.project_id, '')
            items.append(item)
        return success_response({
            'tasks': items,
            'total': total,
            'limit': limit,
            'cursor': cursor + len(items),
        })
    except Exception as e:
        logger.error(f"list_server_tasks failed: {str(e)}", exc_info=True)
        return error_response('SERVER_ERROR', str(e), 500)


@project_bp.route('/<project_id>/tasks/<task_id>', methods=['GET'])
def get_task_status(project_id, task_id):
    """
    GET /api/projects/{project_id}/tasks/{task_id} - Get task status
    """
    try:
        task = Task.query.get(task_id)

        if not task or task.project_id != project_id:
            return not_found('Task')

        item = task_projection(task)
        item['project_title'] = task.project.project_title or '未命名项目' if task.project else ''
        return success_response(item)

    except Exception as e:
        logger.error(f"get_task_status failed: {str(e)}", exc_info=True)
        return error_response('SERVER_ERROR', str(e), 500)


@project_bp.route('/<project_id>/tasks/<task_id>/pause', methods=['POST'])
def pause_export_task(project_id, task_id):
    task = Task.query.get(task_id)
    if not task or task.project_id != project_id:
        return not_found('Task')
    if task.task_type not in PAUSABLE_TASK_TYPES:
        return bad_request('This asynchronous task cannot be paused')
    pause_task(task)
    db.session.commit()
    return success_response(task_projection(task))


@project_bp.route('/<project_id>/tasks/<task_id>/cancel', methods=['POST'])
def cancel_server_task(project_id, task_id):
    task = Task.query.get(task_id)
    if not task or task.project_id != project_id:
        return not_found('Task')
    cancel_task(task)
    db.session.commit()
    return success_response(task_projection(task))


@project_bp.route('/<project_id>/tasks/<task_id>/retry', methods=['POST'])
def retry_server_task(project_id, task_id):
    task = Task.query.get(task_id)
    if not task or task.project_id != project_id:
        return not_found('Task')
    retry_task(task)
    db.session.commit()
    return success_response(task_projection(task))


@project_bp.route('/<project_id>/tasks/<task_id>/resume', methods=['POST'])
def resume_export_task(project_id, task_id):
    task = Task.query.get(task_id)
    if not task or task.project_id != project_id:
        return not_found('Task')
    if task.task_type not in PAUSABLE_TASK_TYPES:
        return bad_request('This asynchronous task cannot be resumed')
    if task.task_type == 'INITIALIZE_CONTENT_WORKSPACE':
        if task.status not in {'PAUSED', 'FAILED'}:
            return success_response(task.to_dict())
        if task_manager.is_task_active(task.id):
            task.status = 'PROCESSING'
            task.error_message = None
            db.session.commit()
            return success_response(task.to_dict())
        resume = task.get_progress().get('_resume')
        if not isinstance(resume, dict) or resume.get('kind') != 'content-workspace':
            return bad_request('This content workspace task cannot be resumed')
        task.status = 'PENDING'
        task.error_message = None
        task.completed_at = None
        db.session.commit()
        try:
            from controllers.content_workspace_controller import submit_workspace_task

            submit_workspace_task(task, current_app._get_current_object())
        except Exception as exc:
            task.status = 'PAUSED'
            task.error_message = str(exc)
            db.session.commit()
            return error_response('SERVER_ERROR', str(exc), 500)
        return success_response(task.to_dict())
    if task.task_type == 'GENERATE_WORKSPACE_CANDIDATE':
        # 重启/中断后恢复：任务只携带 run_id，从运行记录重读冻结快照（阶段2）
        if task.status not in {'PAUSED', 'FAILED'}:
            return success_response(task.to_dict())
        if task_manager.is_task_active(task.id):
            task.status = 'PROCESSING'
            task.error_message = None
            db.session.commit()
            return success_response(task.to_dict())
        resume = task.get_progress().get('_resume')
        if not isinstance(resume, dict) or resume.get('kind') != 'workspace-candidate':
            return bad_request('This workspace candidate task cannot be resumed')
        run_id = resume.get('kwargs', {}).get('run_id')
        if not run_id:
            return bad_request('This workspace candidate task cannot be resumed')
        task.status = 'PENDING'
        task.error_message = None
        task.completed_at = None
        db.session.commit()
        try:
            from services.task_manager import generate_workspace_candidate_task

            task_manager.submit_task(
                task.id,
                generate_workspace_candidate_task,
                run_id=run_id,
                app=current_app._get_current_object(),
            )
        except Exception as exc:
            task.status = 'PAUSED'
            task.error_message = str(exc)
            db.session.commit()
            return error_response('SERVER_ERROR', str(exc), 500)
        # 同步关联 Run 到 RUNNING（Task/Run 原子控制契约）
        from models import WorkspaceGenerationRun

        run = WorkspaceGenerationRun.query.filter_by(task_id=task.id).first()
        if run and run.status in {'PAUSED', 'FAILED', 'PENDING'}:
            run.status = 'RUNNING'
            db.session.commit()
        return success_response(task_projection(task))
    if task.status != 'PAUSED':
        return success_response(task.to_dict())

    if task.task_type in {'EXPORT_NATIVE_PPTX', 'EXPORT_NATIVE_PDF', 'EXPORT_NATIVE_HTML'}:
        progress = task.get_progress()
        task.set_progress({
            'total': progress.get('total', 0),
            'completed': 0,
            'failed': 0,
            'percent': 0,
            'current_step': '等待重新开始导出',
            '_resume': progress.get('_resume', {'kind': 'native-pptx', 'kwargs': {}}),
        })
        task.status = 'PENDING'
        task.error_message = None
        task.completed_at = None
        db.session.commit()
        return success_response(task.to_dict())

    if task_manager.is_task_active(task.id):
        task.status = 'PROCESSING'
        db.session.commit()
        return success_response(task.to_dict())

    if task.task_type == 'GENERATE_IMAGES':
        project = Project.query.get(project_id)
        if not project:
            return not_found('Project')
        progress = task.get_progress()
        saved_page_ids = progress.get('page_ids') if isinstance(progress.get('page_ids'), list) else None
        pages = get_filtered_pages(project_id, saved_page_ids)
        file_service = FileService(current_app.config['UPLOAD_FOLDER'])
        pages = [
            page for page in pages
            if prepare_page_for_image_generation(page, file_service)
        ]
        if not pages:
            task.status = 'COMPLETED'
            task.completed_at = datetime.utcnow()
            db.session.commit()
            return success_response(task.to_dict())
        try:
            _submit_image_generation_task(task, project, pages, progress.get('image_options'))
        except Exception as exc:
            task.status = 'PAUSED'
            task.error_message = str(exc)
            db.session.commit()
            return error_response('SERVER_ERROR', str(exc), 500)
        return success_response(task.to_dict())

    resume = task.get_progress().get('_resume')
    if not isinstance(resume, dict) or not isinstance(resume.get('kwargs'), dict):
        return bad_request('This export task cannot be resumed')

    from services.task_manager import (
        export_editable_pptx_with_recursive_analysis_task,
        export_podcast_workspace_task,
        export_video_task,
        export_video_workspace_task,
        recover_historical_image_scenes_task,
    )

    task_func = {
        'editable-pptx': export_editable_pptx_with_recursive_analysis_task,
        'podcast_workspace': export_podcast_workspace_task,
        'video': export_video_task,
        'video_workspace': export_video_workspace_task,
        'historical-image-scenes': recover_historical_image_scenes_task,
    }.get(resume.get('kind'))
    if task_func is None:
        return bad_request('Unknown export task type')

    task.status = 'PENDING'
    task.error_message = None
    task.completed_at = None
    db.session.commit()
    try:
        submit_kwargs = {
            'app': current_app._get_current_object(),
            **resume['kwargs'],
        }
        if resume.get('kind') not in {'podcast_workspace', 'video_workspace'}:
            submit_kwargs['file_service'] = FileService(current_app.config['UPLOAD_FOLDER'])
        task_manager.submit_task(
            task.id,
            task_func,
            **submit_kwargs,
        )
    except Exception as exc:
        task.status = 'PAUSED'
        task.error_message = str(exc)
        db.session.commit()
        return error_response('SERVER_ERROR', str(exc), 500)
    return success_response(task.to_dict())


@project_bp.route('/tasks/pause-active-exports', methods=['POST'])
def pause_active_export_tasks():
    tasks = Task.query.filter(
        Task.task_type.in_(PAUSABLE_TASK_TYPES),
        Task.status.in_(['PENDING', 'PROCESSING', 'RUNNING']),
    ).all()
    for task in tasks:
        task.status = 'PAUSED'
    if tasks:
        db.session.commit()
    return success_response({'paused_count': len(tasks)})


@project_bp.route('/<project_id>/refine/outline', methods=['POST'])
def refine_outline(project_id):
    """
    POST /api/projects/{project_id}/refine/outline - Refine outline based on user requirements
    
    Request body:
    {
        "user_requirement": "用户要求，例如：增加一页关于XXX的内容",
        "language": "zh"  # output language: zh, en, ja, auto
    }
    """
    try:
        project = Project.query.get(project_id)
        
        if not project:
            return not_found('Project')
        
        data = request.get_json()
        
        if not data or not data.get('user_requirement'):
            return bad_request("user_requirement is required")
        
        user_requirement = data['user_requirement']
        
        # IMPORTANT: Expire all cached objects to ensure we get fresh data from database
        # This prevents issues when multiple refine operations are called in sequence
        db.session.expire_all()
        
        # Get current outline from pages
        pages = Page.query.filter_by(project_id=project_id).order_by(Page.order_index).all()
        
        # Reconstruct current outline from pages (如果没有页面，使用空列表)
        if not pages:
            logger.info(f"项目 {project_id} 当前没有页面，将从空开始生成")
            current_outline = []  # 空大纲
        else:
            current_outline = _reconstruct_outline_from_pages(pages)
        
        # Get singleton AI service instance
        ai_service = get_ai_service()
        
        # Get reference files content and create project context
        reference_files_content = _get_project_reference_files_content(project_id)
        if reference_files_content:
            logger.info(f"Found {len(reference_files_content)} reference files for refine_outline")
            for rf in reference_files_content:
                logger.info(f"  - {rf['filename']}: {len(rf['content'])} characters")
        else:
            logger.info(f"No reference files found for project {project_id}")
        
        project_context = ProjectContext(project.to_dict(), reference_files_content)
        
        # Get previous requirements and language from request
        previous_requirements = data.get('previous_requirements', [])
        language = data.get('language', current_app.config.get('OUTPUT_LANGUAGE', 'zh'))
        
        # Refine outline
        logger.info(f"开始修改大纲: 项目 {project_id}, 用户要求: {user_requirement}, 历史要求数: {len(previous_requirements)}")
        refined_outline = ai_service.refine_outline(
            current_outline=current_outline,
            user_requirement=user_requirement,
            project_context=project_context,
            previous_requirements=previous_requirements,
            language=language
        )
        
        # Flatten outline to pages and smart merge with existing
        pages_data = ai_service.flatten_outline(refined_outline)
        pages_list = _smart_merge_pages(project_id, pages_data)

        preserved_count = sum(1 for p in pages_list if p.description_content)
        new_count = len(pages_list) - preserved_count
        logger.info(f"描述匹配完成: 保留了 {preserved_count} 个页面的描述, {new_count} 个页面需要重新生成描述")

        # Update project status
        if preserved_count and all(p.description_content for p in pages_list):
            set_ppt_status(project, 'DESCRIPTIONS_GENERATED')
        else:
            set_ppt_status(project, 'OUTLINE_GENERATED')
        project.updated_at = datetime.utcnow()
        record_ppt_revision(
            project,
            'outline.refine',
            changed_page_ids=[page.id for page in pages_list],
            source_type='ai',
        )
        
        db.session.commit()
        
        logger.info(f"大纲修改完成: 项目 {project_id}, 创建了 {len(pages_list)} 个页面")
        
        # Return pages
        return success_response({
            'pages': [page.to_dict() for page in pages_list],
            'message': '大纲修改成功'
        })
    
    except Exception as e:
        db.session.rollback()
        logger.error(f"refine_outline failed: {str(e)}", exc_info=True)
        return error_response('AI_SERVICE_ERROR', str(e), 503)


@project_bp.route('/<project_id>/refine/descriptions', methods=['POST'])
def refine_descriptions(project_id):
    """
    POST /api/projects/{project_id}/refine/descriptions - Refine page descriptions based on user requirements
    
    Request body:
    {
        "user_requirement": "用户要求，例如：让描述更详细一些",
        "language": "zh"  # output language: zh, en, ja, auto
    }
    """
    try:
        project = Project.query.get(project_id)
        
        if not project:
            return not_found('Project')
        
        data = request.get_json()
        
        if not data or not data.get('user_requirement'):
            return bad_request("user_requirement is required")
        
        user_requirement = data['user_requirement']
        
        db.session.expire_all()
        
        # Get current pages
        pages = Page.query.filter_by(project_id=project_id).order_by(Page.order_index).all()
        
        if not pages:
            logger.info(f"项目 {project_id} 当前没有页面，无法修改描述")
            return bad_request("No pages found for project. Please generate outline first.")
        
        # Check if pages have descriptions (允许没有描述，从空开始)
        has_descriptions = any(page.description_content for page in pages)
        if not has_descriptions:
            logger.info(f"项目 {project_id} 当前没有描述，将基于大纲生成新描述")
        
        # Reconstruct outline from pages
        outline = _reconstruct_outline_from_pages(pages)
        
        # Prepare current descriptions
        current_descriptions = []
        for i, page in enumerate(pages):
            outline_content = page.get_outline_content()
            desc_content = page.get_description_content()
            
            current_descriptions.append({
                'index': i,
                'title': outline_content.get('title', '未命名') if outline_content else '未命名',
                'description_content': desc_content if desc_content else ''
            })
        
        # Get singleton AI service instance
        ai_service = get_ai_service()
        
        # Get reference files content and create project context
        reference_files_content = _get_project_reference_files_content(project_id)
        if reference_files_content:
            logger.info(f"Found {len(reference_files_content)} reference files for refine_descriptions")
            for rf in reference_files_content:
                logger.info(f"  - {rf['filename']}: {len(rf['content'])} characters")
        else:
            logger.info(f"No reference files found for project {project_id}")
        
        project_context = ProjectContext(project.to_dict(), reference_files_content)
        
        # Get previous requirements and language from request
        previous_requirements = data.get('previous_requirements', [])
        language = data.get('language', current_app.config.get('OUTPUT_LANGUAGE', 'zh'))
        
        # Refine descriptions
        logger.info(f"开始修改页面描述: 项目 {project_id}, 用户要求: {user_requirement}, 历史要求数: {len(previous_requirements)}")
        refined_descriptions = ai_service.refine_descriptions(
            current_descriptions=current_descriptions,
            user_requirement=user_requirement,
            project_context=project_context,
            outline=outline,
            previous_requirements=previous_requirements,
            language=language
        )
        
        # 验证返回的描述数量
        if len(refined_descriptions) != len(pages):
            error_msg = ""
            logger.error(f"AI 返回的描述数量不匹配: 期望 {len(pages)} 个页面，实际返回 {len(refined_descriptions)} 个描述。")
            
            # 如果 AI 试图增删页面，给出明确提示
            if len(refined_descriptions) > len(pages):
                error_msg += " 提示：如需增加页面，请在大纲页面进行操作。"
            elif len(refined_descriptions) < len(pages):
                error_msg += " 提示：如需删除页面，请在大纲页面进行操作。"
            
            return bad_request(error_msg)
        
        # Update pages with refined descriptions
        for page, refined_desc in zip(pages, refined_descriptions):
            desc_content = {
                "text": refined_desc,
                "generated_at": datetime.utcnow().isoformat()
            }
            page.set_description_content(desc_content)
            page.status = 'DESCRIPTION_GENERATED'
        
        # Update project status
        set_ppt_status(project, 'DESCRIPTIONS_GENERATED')
        project.updated_at = datetime.utcnow()
        
        db.session.commit()
        
        logger.info(f"页面描述修改完成: 项目 {project_id}, 更新了 {len(pages)} 个页面")
        
        # Return pages
        return success_response({
            'pages': [page.to_dict() for page in pages],
            'message': '页面描述修改成功'
        })
    
    except Exception as e:
        db.session.rollback()
        logger.error(f"refine_descriptions failed: {str(e)}", exc_info=True)
        return error_response('AI_SERVICE_ERROR', str(e), 503)


@project_bp.route('/renovation', methods=['POST'])
def create_ppt_renovation_project():
    """
    POST /api/projects/renovation - Create a PPT renovation project

    Accepts a PDF/PPTX file upload, creates project with pages from PDF images,
    then submits an async task to parse content and fill outline + descriptions.

    Content-Type: multipart/form-data
    Form:
        file: PDF or PPTX file (required)
        keep_layout: "true"/"false" - whether to preserve layout via caption model (optional, default false)
        template_style: style description text (optional)

    Returns:
        {project_id, task_id, page_count}
    """
    try:
        # Validate file
        if 'file' not in request.files:
            return bad_request("No file uploaded")

        file = request.files['file']
        if file.filename == '':
            return bad_request("No file selected")

        # Check file extension
        filename = file.filename.lower()
        if not (filename.endswith('.pdf') or filename.endswith('.pptx') or filename.endswith('.ppt')):
            return bad_request("Only PDF and PPTX files are supported")

        keep_layout = request.form.get('keep_layout', 'false').lower() == 'true'
        template_style = request.form.get('template_style', '').strip() or None
        language = request.form.get('language', current_app.config.get('OUTPUT_LANGUAGE', 'zh'))

        # Create project
        project = Project(
            creation_type='ppt_renovation',
            template_style=template_style,
            status='active',
            last_workspace='ppt',
        )
        db.session.add(project)
        db.session.flush()
        from services.content_spine_service import create_spine
        from services.project_workspace_service import (
            create_workspace_set,
            initialize_workspace_from_snapshot,
        )

        project.content_spine = create_spine(project.id, {
            'project_title': Path(file.filename).stem,
        })
        project.workspaces.extend(create_workspace_set(project.id))
        db.session.flush()
        spine = project.content_spine
        initialize_workspace_from_snapshot(
            project.id,
            'ppt',
            spine.revision,
            spine.content_hash,
            json.loads(spine.document_json),
            {'render_mode': 'image', 'image_aspect_ratio': '16:9'},
        )
        db.session.commit()

        project_id = project.id

        # Save uploaded file
        file_service = FileService(current_app.config['UPLOAD_FOLDER'])
        project_dir = Path(current_app.config['UPLOAD_FOLDER']) / project_id
        template_dir = project_dir / "template"
        template_dir.mkdir(parents=True, exist_ok=True)

        # Save original file with a standardized name to avoid encoding issues
        # (secure_filename strips non-ASCII chars, causing Chinese filenames like
        # '演示文稿.pdf' to become 'pdf' with no extension, breaking PDF discovery)
        original_ext = file.filename.rsplit('.', 1)[-1].lower()
        safe_name = f'original.{original_ext}'
        original_path = template_dir / safe_name
        file.save(str(original_path))

        # Convert PPTX to PDF if needed
        pdf_path = str(original_path)
        if safe_name.lower().endswith(('.pptx', '.ppt')):
            try:
                subprocess.run(
                    ['libreoffice', '--headless', '--convert-to', 'pdf', '--outdir', str(template_dir), str(original_path)],
                    check=True, timeout=120, capture_output=True
                )
                pdf_name = safe_name.rsplit('.', 1)[0] + '.pdf'
                pdf_path = str(template_dir / pdf_name)
                if not os.path.exists(pdf_path):
                    raise ValueError("PDF conversion failed - output file not found")
                logger.info(f"Converted PPTX to PDF: {pdf_path}")
            except subprocess.TimeoutExpired:
                raise ValueError(
                    "PPTX 转 PDF 超时，请稍后重试或手动转为 PDF 后上传。"
                    if language == 'zh' else
                    "PPTX to PDF conversion timed out. Please retry or convert to PDF manually before uploading."
                )
            except FileNotFoundError:
                raise ValueError(
                    "PPTX 转换需要安装 LibreOffice，但当前环境未检测到。请在本地将 PPTX 转为 PDF 后再上传。"
                    if language == 'zh' else
                    "PPTX conversion requires LibreOffice, which is not installed. Please convert your PPTX to PDF locally before uploading."
                )

        # Convert PDF to page images using PyMuPDF or pdf2image
        pages_dir = project_dir / "pages"
        pages_dir.mkdir(parents=True, exist_ok=True)

        page_image_paths = []
        pdf_page_width = None
        pdf_page_height = None
        try:
            import fitz  # PyMuPDF
            doc = fitz.open(pdf_path)
            # Extract page dimensions from the first page before rendering
            if len(doc) > 0:
                rect = doc[0].rect
                pdf_page_width = rect.width
                pdf_page_height = rect.height
            for i, fitz_page in enumerate(doc):
                try:
                    mat = fitz.Matrix(2, 2)
                    pix = fitz_page.get_pixmap(matrix=mat)
                    img_path = str(pages_dir / f"page_{i + 1}_original.png")
                    pix.save(img_path)
                    page_image_paths.append(img_path)
                except Exception as e:
                    logger.error(f"Failed to render page {i + 1} with PyMuPDF: {e}")
                    page_image_paths.append(None)
            doc.close()
        except ImportError:
            # Fallback: use pdf2image
            try:
                from pdf2image import convert_from_path
                images = convert_from_path(pdf_path, dpi=200)
                for i, img in enumerate(images):
                    try:
                        # Extract page dimensions from the first image
                        if pdf_page_width is None:
                            pdf_page_width = img.width
                            pdf_page_height = img.height
                        img_path = str(pages_dir / f"page_{i + 1}_original.png")
                        img.save(img_path, 'PNG')
                        page_image_paths.append(img_path)
                    except Exception as e:
                        logger.error(f"Failed to render page {i + 1} with pdf2image: {e}")
                        page_image_paths.append(None)
            except ImportError:
                raise ValueError("Neither PyMuPDF nor pdf2image is available for PDF rendering")

        # Fail-fast if no pages rendered at all
        valid_pages = [p for p in page_image_paths if p is not None]
        if not valid_pages:
            raise ValueError("All pages failed to render from PDF")

        logger.info(f"Rendered {len(valid_pages)}/{len(page_image_paths)} page images from PDF")

        # Set project aspect ratio from PDF page dimensions
        if pdf_page_width and pdf_page_height and pdf_page_width > 0 and pdf_page_height > 0:
            try:
                raw_ratio = f"{int(round(pdf_page_width))}:{int(round(pdf_page_height))}"
                image_aspect_ratio = normalize_aspect_ratio(raw_ratio)
                update_ppt_settings(
                    project,
                    {'image_aspect_ratio': image_aspect_ratio},
                    record_revision=False,
                )
                logger.info(f"Set project aspect ratio from PDF: {pdf_page_width}x{pdf_page_height} -> {image_aspect_ratio}")
            except (ValueError, OverflowError) as e:
                logger.warning(f"Could not normalize PDF aspect ratio ({pdf_page_width}x{pdf_page_height}): {e}, keeping default 16:9")

        # Create Page records with initial images
        from services.task_manager import save_image_with_version
        from PIL import Image as PILImage

        pages_list = []
        for i, img_path in enumerate(page_image_paths):
            if img_path is None:
                logger.warning(f"Skipping page {i + 1}: render failed")
                continue

            page = Page(
                project_id=project_id,
                order_index=len(pages_list),
                status='DRAFT'
            )
            page.set_outline_content({
                'title': f'Page {i + 1}',
                'points': []
            })
            db.session.add(page)
            db.session.flush()  # Get page.id

            # Save the PDF page image as initial version
            img = PILImage.open(img_path)
            image_path, _version = save_image_with_version(
                img, project_id, page.id, file_service, page_obj=page
            )
            img.close()

            pages_list.append(page)

        db.session.commit()

        # Create async task
        task = Task(
            project_id=project_id,
            task_type='PPT_RENOVATION',
            status='PENDING'
        )
        task.set_progress({
            'total': len(pages_list),
            'completed': 0,
            'failed': 0,
            'current_step': 'queued'
        })
        db.session.add(task)
        db.session.commit()

        # Get services
        ai_service = get_ai_service()
        from services.file_parser_service import FileParserService
        file_parser_service = FileParserService(
            mineru_token=current_app.config['MINERU_TOKEN'],
            mineru_api_base=current_app.config['MINERU_API_BASE'],
            google_api_key=current_app.config.get('GOOGLE_API_KEY', ''),
            google_api_base=current_app.config.get('GOOGLE_API_BASE', ''),
            openai_api_key=current_app.config.get('OPENAI_API_KEY', ''),
            openai_api_base=current_app.config.get('OPENAI_API_BASE', ''),
            image_caption_model=current_app.config['IMAGE_CAPTION_MODEL'],
            provider_format=current_app.config.get('AI_PROVIDER_FORMAT', 'gemini'),
            lazyllm_image_caption_source=current_app.config.get('IMAGE_CAPTION_MODEL_SOURCE', 'doubao'),
        )

        app = current_app._get_current_object()

        # Submit async task
        task_manager.submit_task(
            task.id,
            process_ppt_renovation_task,
            project_id,
            ai_service,
            file_service,
            file_parser_service,
            keep_layout,
            5,  # max_workers
            app,
            language
        )

        set_ppt_status(project, 'PROCESSING')
        db.session.commit()

        return success_response({
            'project_id': project_id,
            'task_id': task.id,
            'page_count': len(pages_list)
        }, status_code=202)

    except Exception as e:
        db.session.rollback()
        logger.error(f"create_ppt_renovation_project failed: {str(e)}", exc_info=True)
        return error_response('SERVER_ERROR', str(e), 500)


# Style extraction blueprint (not bound to any project)
style_bp = Blueprint('style', __name__, url_prefix='/api')


@style_bp.route('/extract-style', methods=['POST'])
def extract_style():
    """
    POST /api/extract-style - Extract style description from an image

    Content-Type: multipart/form-data
    Form:
        image: Image file (required)

    Returns:
        {style_description: "..."}
    """
    try:
        if 'image' not in request.files:
            return bad_request("No image file uploaded")

        file = request.files['image']
        if file.filename == '':
            return bad_request("No file selected")

        # Save to temp location
        import tempfile

        ext = secure_filename(file.filename).rsplit('.', 1)[-1].lower() if '.' in file.filename else 'png'
        with tempfile.NamedTemporaryFile(suffix=f'.{ext}', delete=False) as tmp:
            file.save(tmp.name)
            tmp_path = tmp.name

        try:
            ai_service = get_ai_service()
            style_description = ai_service.extract_style_description(tmp_path)

            return success_response({
                'style_description': style_description
            })
        finally:
            os.unlink(tmp_path)

    except Exception as e:
        logger.error(f"extract_style failed: {str(e)}", exc_info=True)
        return error_response('AI_SERVICE_ERROR', str(e), 503)
