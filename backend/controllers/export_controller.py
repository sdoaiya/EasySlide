"""
Export Controller - handles file export endpoints
"""
import logging
import os
import io
import json
import re
import shutil
import tempfile
import time
import zipfile
from datetime import datetime
from pathlib import Path

from flask import Blueprint, request, current_app, send_file
from werkzeug.utils import secure_filename
from PIL import Image
from models import db, Project, Page, PageImageVersion, Task
from utils import (
    error_response, not_found, bad_request, success_response,
    parse_page_ids_from_query, parse_page_ids_from_body, get_filtered_pages
)
from services import ExportService, FileService
from services.ai_service_manager import get_ai_service
from services.content_spine_service import get_spine_source_fields
from services.prompts import normalize_narration_generation_config
from services.ppt_workspace_service import get_ppt_settings, record_ppt_revision
from services.video_director import build_video_director_plan, normalize_video_director_config

logger = logging.getLogger(__name__)

export_bp = Blueprint('export', __name__, url_prefix='/api/projects')


def _normalize_tts_provider(value) -> str | None:
    provider = str(value or 'edge').strip().lower()
    return provider if provider in {'edge', 'fish_audio'} else None


def _form_bool(value, default: bool = False) -> bool:
    if value is None:
        return default
    return str(value).strip().lower() in {'1', 'true', 'yes', 'on'}


def _fish_audio_key_configured() -> bool:
    from models import Settings

    settings = Settings.get_settings()
    return bool(settings.fish_audio_api_key or current_app.config.get('FISH_AUDIO_API_KEY'))


def _fish_audio_key() -> str:
    from models import Settings

    settings = Settings.get_settings()
    return str(settings.fish_audio_api_key or current_app.config.get('FISH_AUDIO_API_KEY') or '').strip()


def _fish_video_option_error(
    provider: str,
    *,
    voice: str,
    narration_mode: str,
    speakers: list,
    validate_voices: bool = False,
) -> str | None:
    if provider != 'fish_audio':
        return None
    if not _fish_audio_key_configured():
        return 'Fish Audio API Key 未配置，请先在设置中保存并验证。'
    if narration_mode == 'dialogue':
        if not 2 <= len(speakers) <= 4:
            return 'Fish Audio 多人旁白需要配置 2-4 位角色。'
        if any(not str(item.get('voice') or '').strip() for item in speakers):
            return 'Fish Audio 多人旁白的每位角色都必须选择克隆声音。'
    elif not str(voice or '').strip():
        return 'Fish Audio 单人旁白必须选择一个声音。'
    if validate_voices:
        from services.fish_audio_service import FishAudioAPIError, list_voices

        try:
            available = {item['id'] for item in list_voices(_fish_audio_key())}
        except FishAudioAPIError as exc:
            return f'Fish Audio 声线校验失败: {exc}'
        selected = {
            str(item.get('voice') or '').strip()
            for item in speakers
        } if narration_mode == 'dialogue' else {str(voice or '').strip()}
        if selected - available:
            return '所选 Fish Audio 私有声线已不可用，请刷新声线列表后重试。'
    return None


def _video_director_page_inputs(pages, render_mode='image'):
    inputs = []
    for page in pages:
        outline = page.get_outline_content() or {}
        description = page.get_description_content() or {}
        native_props = page.get_native_props() if render_mode == 'native' else {}
        animation = native_props.get('__animation') if isinstance(native_props, dict) else None
        element_animations = []
        if isinstance(animation, dict) and animation.get('elementEnter') not in (None, 'none'):
            element_animations.append({
                'element_id': 'content-group',
                'enter': animation.get('elementEnter'),
                'order': 1,
                'emphasis': animation.get('emphasis'),
            })
        inputs.append({
            'page_index': page.order_index,
            'title': outline.get('title', ''),
            'description_text': description.get('text', ''),
            'layout_id': page.native_layout or '',
            'render_mode': render_mode,
            'element_animations': element_animations,
        })
    return inputs


def _snapshot_current_image_scenes(project, pages, upload_root, config):
    if not config.get('IMAGE_SCENE_ENABLED', False) or not config.get('HYPERFRAMES_ENABLED', False):
        return [], [], []
    if get_ppt_settings(project)['render_mode'] == 'native':
        return [], [], []
    versions = PageImageVersion.query.filter(
        PageImageVersion.page_id.in_([page.id for page in pages]),
        PageImageVersion.is_current.is_(True),
    ).all()
    versions_by_page = {version.page_id: version for version in versions}
    scene_levels = [
        {
            'page_id': page.id,
            'level': _scene_level(
                versions_by_page.get(page.id).scene_error if versions_by_page.get(page.id) else None,
                'L0' if versions_by_page.get(page.id) and versions_by_page[page.id].scene_status == 'ready' else 'L3',
            ),
            'reason': (
                versions_by_page[page.id].scene_error.split(':', 1)[-1].strip()
                if versions_by_page.get(page.id) and versions_by_page[page.id].scene_error
                else ''
            ),
        }
        for page in pages
    ]
    if not any(
        version.scene_status == 'ready'
        and version.scene_manifest_path
        and version.scene_manifest_sha256
        for version in versions
    ):
        return [], [], scene_levels

    root = Path(upload_root) / project.id / 'exports' / 'snapshot-scenes'
    root.mkdir(parents=True, exist_ok=True)
    snapshot_dir = Path(tempfile.mkdtemp(prefix='image-scenes-', dir=root))
    scene_refs = []
    bundle_refs = []
    try:
        from services.image_scene_service import materialize_image_scene_bundle
        from services.scene_manifest import load_scene_manifest

        for index, page in enumerate(pages):
            version = versions_by_page.get(page.id)
            if (
                not version
                or version.scene_status != 'ready'
                or not version.scene_manifest_path
                or not version.scene_manifest_sha256
            ):
                scene_refs.append(None)
                bundle_refs.append(None)
                continue
            scene_ref = {
                'page_id': page.id,
                'path': version.scene_manifest_path,
                'sha256': version.scene_manifest_sha256,
            }
            load_scene_manifest(scene_ref, page.id)
            bundle_ref = materialize_image_scene_bundle(
                scene_ref,
                snapshot_dir / f'page-{index:04d}',
            )
            scene_refs.append(scene_ref)
            bundle_refs.append(bundle_ref)
        return scene_refs, bundle_refs, scene_levels
    except Exception:
        shutil.rmtree(snapshot_dir, ignore_errors=True)
        raise


def _image_scene_preflight(project, pages, config):
    result = {
        'enabled': False,
        'animated_pages': [],
        'fallback_pages': [],
        'page_levels': [],
        'errors': [],
    }
    if (
        get_ppt_settings(project)['render_mode'] == 'native'
        or not config.get('IMAGE_SCENE_ENABLED', False)
        or not config.get('HYPERFRAMES_ENABLED', False)
    ):
        return result
    result['enabled'] = True
    versions = PageImageVersion.query.filter(
        PageImageVersion.page_id.in_([page.id for page in pages]),
        PageImageVersion.is_current.is_(True),
    ).all()
    versions_by_page = {version.page_id: version for version in versions}
    from services.scene_manifest import load_scene_manifest

    for page in pages:
        version = versions_by_page.get(page.id)
        level = _scene_level(
            version.scene_error if version else None,
            'L0' if version and version.scene_status == 'ready' else 'L3',
        )
        if (
            not version
            or version.scene_status != 'ready'
            or not version.scene_manifest_path
            or not version.scene_manifest_sha256
        ):
            result['fallback_pages'].append({
                'page': page.order_index + 1,
                'level': level,
                'reason': (
                    version.scene_error.split(':', 1)[-1].strip()
                    if version and version.scene_error
                    else '当前图片版本没有可用的分层场景'
                ),
                'strategy': 'ken_burns_or_static',
            })
            result['page_levels'].append({
                'page': page.order_index + 1,
                'level': level,
                'reason': result['fallback_pages'][-1]['reason'],
            })
            continue
        reference = {
            'page_id': page.id,
            'path': version.scene_manifest_path,
            'sha256': version.scene_manifest_sha256,
        }
        try:
            load_scene_manifest(reference, page.id)
            result['animated_pages'].append(page.order_index + 1)
            result['page_levels'].append({
                'page': page.order_index + 1,
                'level': level,
                'reason': version.scene_error.split(':', 1)[-1].strip() if version.scene_error else '',
            })
        except Exception as exc:
            result['errors'].append({
                'page': page.order_index + 1,
                'reason': str(exc),
            })
    return result


def _scene_level(value, fallback):
    text = str(value or '')
    return text.split(':', 1)[0] if text.startswith(('L0:', 'L1:', 'L2:', 'L3:', 'L4:')) else fallback


def _parse_pptx_transition_effects():
    enabled = request.args.get('transition_enabled', '').lower() in {'1', 'true', 'yes', 'on'}
    if not enabled:
        return [], None

    effects = list(dict.fromkeys(
        effect.strip()
        for effect in request.args.get('transition_effects', '').split(',')
        if effect.strip()
    ))
    valid_effects = [effect for effect in effects if effect in ExportService.PPTX_TRANSITION_EFFECTS]
    if not valid_effects:
        return [], "At least one valid transition effect is required"
    return valid_effects, None


def _resolve_exports_root(project_id):
    upload_folder = Path(current_app.config['UPLOAD_FOLDER']).resolve()
    exports_root = (upload_folder / project_id / 'exports').resolve()
    try:
        exports_root.relative_to(upload_folder)
    except ValueError:
        return None
    return exports_root


def _resolve_export_file(exports_root, filename):
    name = str(filename or '').strip()
    if (
        not name
        or name.startswith(('.', '_'))
        or '/' in name
        or '\\' in name
        or ':' in name
        or '\x00' in name
        or Path(name).name != name
    ):
        return None

    file_path = (exports_root / name).resolve()
    try:
        file_path.relative_to(exports_root)
    except ValueError:
        return None
    return file_path


def _get_native_export_task(project_id, task_id):
    return Task.query.filter(
        Task.id == task_id,
        Task.project_id == project_id,
        Task.task_type.in_(['EXPORT_NATIVE_PPTX', 'EXPORT_NATIVE_PDF', 'EXPORT_NATIVE_HTML']),
    ).first()


def _native_export_format(task):
    return {
        'EXPORT_NATIVE_PPTX': 'pptx',
        'EXPORT_NATIVE_PDF': 'pdf',
        'EXPORT_NATIVE_HTML': 'html',
    }.get(task.task_type)


def _safe_export_filename(raw_filename, fallback_filename, extension):
    ext = f'.{extension.lstrip(".").lower()}'
    source = raw_filename or fallback_filename
    stem = Path(str(source)).stem.strip()
    if not stem:
        stem = Path(str(fallback_filename)).stem.strip() or 'export'
    chars = []
    for char in stem:
        if char.isalnum() or char in '-_.()（）[]【】':
            chars.append(char)
        elif char.isspace():
            chars.append('_')
        else:
            chars.append('_')
    safe_stem = re.sub(r'_+', '_', ''.join(chars)).strip('._- ')[:80] or 'export'
    return f'{safe_stem}{ext}'


def _first_page_title(project):
    pages = getattr(project, 'pages', None)
    if not pages:
        return ''
    try:
        ordered_pages = sorted(list(pages), key=lambda page: getattr(page, 'order_index', 0) or 0)
    except TypeError:
        ordered_pages = list(pages)
    for page in ordered_pages:
        outline = page.get_outline_content() if hasattr(page, 'get_outline_content') else None
        if isinstance(outline, dict):
            title = str(outline.get('title') or '').strip()
            if title:
                return title
    return ''


def _export_title_from_text(source):
    value = (source or '').strip()
    if not value:
        return ''
    title = next((line.strip() for line in value.splitlines() if line.strip()), '')
    if not title:
        return ''

    title = re.split(r'[，,。；;：:]', title, maxsplit=1)[0].strip()
    title = re.sub(
        r'^(?:请|帮我|帮忙|麻烦)?(?:生成|创建|制作|做|设计|输出|写)(?:一份|一个|一套|份|个|套)?',
        '',
        title,
    ).strip()
    title = re.sub(r'^(?:关于|有关|围绕)', '', title).strip()
    title = re.sub(
        r'(?:的(?:简短|完整|详细|中文|英文|商务|演讲|汇报|路演|展示|介绍|分析|主题|项目|方案)?)?\s*(?:PPT|ppt|演示文稿|幻灯片)$',
        '',
        title,
    ).strip()
    return title


def _project_title_filename(project, extension, fallback_filename):
    title = (project.project_title or '').strip()
    if not title:
        for source in (
            getattr(project, 'idea_prompt', None),
            getattr(project, 'outline_text', None),
            getattr(project, 'description_text', None),
        ):
            title = _export_title_from_text(source)
            if title:
                break
    if not title:
        title = _first_page_title(project)
    if title:
        return _safe_export_filename(None, f'{title}.{extension}', extension)
    return _safe_export_filename(fallback_filename, fallback_filename, extension)


@export_bp.post('/<project_id>/export/native-pptx')
def create_native_pptx_export(project_id):
    project = db.session.get(Project, project_id)
    if not project:
        return not_found('Project')
    if get_ppt_settings(project)['render_mode'] != 'native':
        return bad_request('只有原生可编辑项目可以使用原生导出')
    if not Page.query.filter_by(project_id=project_id).count():
        return bad_request('项目没有可导出的页面')

    data = request.get_json(silent=True) or {}
    export_format = data.get('format', 'pptx')
    if export_format not in {'pptx', 'pdf', 'html'}:
        return bad_request('format must be pptx, pdf, or html')
    task = Task(project_id=project_id, task_type=f'EXPORT_NATIVE_{export_format.upper()}', status='PENDING')
    task.set_progress({
        'total': Page.query.filter_by(project_id=project_id).count(),
        'completed': 0,
        'percent': 0,
        '_resume': {
            'kind': 'native-pptx' if export_format == 'pptx' else 'native-export',
            'format': export_format,
            'kwargs': {},
        },
    })
    db.session.add(task)
    record_ppt_revision(project, f'export.native_{export_format}')
    db.session.commit()
    return success_response(task.to_dict(), status_code=202)


@export_bp.put('/<project_id>/export/native-pptx/<task_id>/progress')
def update_native_pptx_progress(project_id, task_id):
    task = _get_native_export_task(project_id, task_id)
    if not task:
        return not_found('Task')
    if task.status in {'COMPLETED', 'FAILED', 'PAUSED'}:
        return bad_request('当前任务状态不能更新进度')

    data = request.get_json(silent=True)
    allowed = {'total', 'completed', 'percent', 'current_step', 'messages', 'warnings'}
    if not isinstance(data, dict) or set(data) - allowed:
        return bad_request('进度数据包含无效字段')
    for key in ('total', 'completed', 'percent'):
        if key in data and (not isinstance(data[key], int) or data[key] < 0):
            return bad_request(f'{key} 必须是非负整数')
    for key in ('messages', 'warnings'):
        if key in data and (not isinstance(data[key], list) or any(not isinstance(item, str) for item in data[key])):
            return bad_request(f'{key} 必须是文本数组')

    resume = task.get_progress().get('_resume')
    progress = {**task.get_progress(), **data}
    if resume:
        progress['_resume'] = resume
    task.status = 'PROCESSING'
    task.set_progress(progress)
    db.session.commit()
    return success_response(task.to_dict())


@export_bp.post('/<project_id>/export/native-pptx/<task_id>/complete')
def complete_native_pptx_export(project_id, task_id):
    task = _get_native_export_task(project_id, task_id)
    if not task:
        return not_found('Task')
    if task.status == 'PAUSED':
        return bad_request('任务已暂停')

    upload = request.files.get('file')
    if not upload or not upload.filename:
        return bad_request('缺少导出文件')
    export_format = _native_export_format(task)
    project = task.project
    filename = _safe_export_filename(
        request.form.get('filename'),
        _project_title_filename(project, export_format, upload.filename),
        export_format,
    )
    if not filename or Path(filename).suffix.lower() != f'.{export_format}':
        return bad_request(f'文件必须是 {export_format.upper()}')

    try:
        report = json.loads(request.form.get('report', ''))
    except json.JSONDecodeError:
        return bad_request('质量报告不是有效 JSON')
    if not isinstance(report, dict):
        return bad_request('质量报告必须是对象')

    max_bytes = int(current_app.config.get('MAX_NATIVE_EXPORT_UPLOAD_BYTES', 100 * 1024 * 1024))
    payload = upload.read(max_bytes + 1)
    if not payload or len(payload) > max_bytes:
        return bad_request('导出文件为空或超过大小限制')
    if export_format == 'pptx':
        try:
            with zipfile.ZipFile(io.BytesIO(payload)) as package:
                names = set(package.namelist())
        except (zipfile.BadZipFile, OSError):
            return bad_request('PPTX 文件不是有效 ZIP 包')
        if not {'[Content_Types].xml', 'ppt/presentation.xml'}.issubset(names):
            return bad_request('PPTX 文件缺少必要结构')
    elif export_format == 'pdf':
        if not payload.startswith(b'%PDF-'):
            return bad_request('PDF 文件签名无效')
    else:
        try:
            html = payload.decode('utf-8')
        except UnicodeDecodeError:
            return bad_request('HTML 文件必须使用 UTF-8')
        lowered = html.lower()
        if '<html' not in lowered or 'class="slide' not in lowered:
            return bad_request('HTML 文件缺少页面结构')
        if any(value in lowered for value in ('/files/', 'http://', 'https://', 'file://')):
            return bad_request('HTML 文件包含外部资源，不能离线使用')

    exports_root = _resolve_exports_root(project_id)
    if exports_root is None:
        return bad_request('Invalid project ID')
    exports_root.mkdir(parents=True, exist_ok=True)
    output_path = exports_root / filename
    temp_path = exports_root / f'.{task.id}.tmp'
    try:
        temp_path.write_bytes(payload)
        temp_path.replace(output_path)
    finally:
        temp_path.unlink(missing_ok=True)

    progress = task.get_progress()
    progress.update({
        'completed': progress.get('total', report.get('slideCount', 0)),
        'percent': 100,
        'current_step': '导出完成',
        'filename': filename,
        'download_url': f'/files/{project_id}/exports/{filename}',
        'quality_report': report,
    })
    task.status = 'COMPLETED'
    task.completed_at = datetime.utcnow()
    task.set_progress(progress)
    db.session.commit()
    return success_response(task.to_dict())


@export_bp.delete('/export-cache')
def clear_export_cache():
    """Delete generated project exports without touching downloaded files."""
    active_statuses = {'PENDING', 'PROCESSING', 'RUNNING', 'PAUSED'}
    active_project_ids = {
        project_id
        for project_id, in db.session.query(Task.project_id).filter(
            Task.task_type.like('EXPORT_%'),
            Task.status.in_(active_statuses),
        ).distinct().all()
    }

    deleted_files = 0
    freed_bytes = 0
    cleared_projects = 0
    skipped_active_projects = 0

    for project_id, in db.session.query(Project.id).all():
        if project_id in active_project_ids:
            skipped_active_projects += 1
            continue

        exports_root = _resolve_exports_root(project_id)
        if exports_root is None or not exports_root.is_dir():
            continue

        cached_files = [path for path in exports_root.rglob('*') if path.is_file()]
        if not any(exports_root.iterdir()):
            continue

        deleted_files += len(cached_files)
        freed_bytes += sum(path.stat().st_size for path in cached_files)
        shutil.rmtree(exports_root)
        cleared_projects += 1

    return success_response(data={
        'deleted_files': deleted_files,
        'freed_bytes': freed_bytes,
        'cleared_projects': cleared_projects,
        'skipped_active_projects': skipped_active_projects,
    }, message='Export cache cleared')


@export_bp.route('/<project_id>/exports', methods=['GET'])
def list_exports(project_id):
    """
    GET /api/projects/{project_id}/exports - 列出项目已导出的文件

    返回 exports 目录下的文件列表（名称、大小、修改时间、下载链接）。
    """
    try:
        project = db.session.get(Project, project_id)
        if not project:
            return not_found('Project')

        exports_root = _resolve_exports_root(project_id)
        if exports_root is None:
            return bad_request('Invalid project ID')

        if not exports_root.is_dir():
            return success_response(data={"files": []})

        files = []
        for filepath in sorted(exports_root.iterdir(), key=lambda path: path.name):
            name = filepath.name
            if not filepath.is_file():
                continue
            # 跳过临时目录和隐藏文件
            if name.startswith('.') or name.startswith('_'):
                continue

            stat = filepath.stat()
            ext = os.path.splitext(name)[1].lower()
            file_type = {
                '.mp4': 'video', '.pptx': 'pptx', '.pdf': 'pdf',
                '.zip': 'images', '.png': 'image', '.jpg': 'image',
            }.get(ext, 'other')

            files.append({
                "filename": name,
                "type": file_type,
                "size": stat.st_size,
                "modified_at": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(stat.st_mtime)),
                "download_url": f"/files/{project_id}/exports/{name}",
            })

        # 按修改时间倒序
        files.sort(key=lambda f: f['modified_at'], reverse=True)

        return success_response(data={"files": files})

    except Exception as e:
        return error_response('SERVER_ERROR', str(e), 500)


@export_bp.route('/<project_id>/exports/<filename>', methods=['DELETE'])
def delete_export(project_id, filename):
    """
    DELETE /api/projects/{project_id}/exports/{filename} - 删除项目已导出的文件
    """
    try:
        project = db.session.get(Project, project_id)
        if not project:
            return not_found('Project')

        exports_root = _resolve_exports_root(project_id)
        if exports_root is None:
            return bad_request('Invalid project ID')
        file_path = _resolve_export_file(exports_root, filename)
        if file_path is None:
            return bad_request('Invalid export filename')

        if not file_path.is_file():
            return not_found('File')

        file_path.unlink()
        return success_response(data={"filename": file_path.name}, message="Export file deleted")

    except Exception as e:
        return error_response('SERVER_ERROR', str(e), 500)


@export_bp.route('/<project_id>/export/pptx', methods=['GET'])
def export_pptx(project_id):
    """
    GET /api/projects/{project_id}/export/pptx?filename=...&page_ids=id1,id2,id3 - Export PPTX
    
    Query params:
        - filename: optional custom filename
        - page_ids: optional comma-separated page IDs to export (if not provided, exports all pages)
    
    Returns:
        JSON with download URL, e.g.
        {
            "success": true,
            "data": {
                "download_url": "/files/{project_id}/exports/xxx.pptx",
                "download_url_absolute": "http://host:port/files/{project_id}/exports/xxx.pptx"
            }
        }
    """
    try:
        project = Project.query.get(project_id)
        
        if not project:
            return not_found('Project')
        
        # Get page_ids from query params and fetch filtered pages
        selected_page_ids = parse_page_ids_from_query(request)
        logger.debug(f"[export_pptx] selected_page_ids: {selected_page_ids}")
        
        pages = get_filtered_pages(project_id, selected_page_ids if selected_page_ids else None)
        logger.debug(f"[export_pptx] Exporting {len(pages)} pages")
        
        if not pages:
            return bad_request("No pages found for project")
        
        # Get image paths
        file_service = FileService(current_app.config['UPLOAD_FOLDER'])
        
        image_paths = []
        for page in pages:
            if page.generated_image_path:
                abs_path = file_service.get_absolute_path(page.generated_image_path)
                image_paths.append(abs_path)
        
        if not image_paths:
            return bad_request("No generated images found for project")
        
        # Determine export directory and filename
        exports_dir = file_service._get_exports_dir(project_id)

        # Get filename from query params or use default
        filename = _safe_export_filename(
            request.args.get('filename'),
            _project_title_filename(project, 'pptx', f'presentation_{project_id}.pptx'),
            'pptx',
        )

        output_path = os.path.join(exports_dir, filename)

        transition_effects, transition_error = _parse_pptx_transition_effects()
        if transition_error:
            return bad_request(transition_error)

        # Generate PPTX file on disk
        ExportService.create_pptx_from_images(
            image_paths,
            output_file=output_path,
            aspect_ratio=get_ppt_settings(project)['image_aspect_ratio'],
            transition_effects=transition_effects,
        )

        # Build download URLs
        download_path = f"/files/{project_id}/exports/{filename}"
        base_url = request.url_root.rstrip("/")
        download_url_absolute = f"{base_url}{download_path}"
        record_ppt_revision(
            project,
            'export.pptx',
            changed_page_ids=[page.id for page in pages],
        )
        db.session.commit()

        return success_response(
            data={
                "download_url": download_path,
                "download_url_absolute": download_url_absolute,
                "filename": filename,
            },
            message="Export PPTX task created"
        )
    
    except Exception as e:
        return error_response('SERVER_ERROR', str(e), 500)


@export_bp.route('/<project_id>/export/pdf', methods=['GET'])
def export_pdf(project_id):
    """
    GET /api/projects/{project_id}/export/pdf?filename=...&page_ids=id1,id2,id3 - Export PDF
    
    Query params:
        - filename: optional custom filename
        - page_ids: optional comma-separated page IDs to export (if not provided, exports all pages)
    
    Returns:
        JSON with download URL, e.g.
        {
            "success": true,
            "data": {
                "download_url": "/files/{project_id}/exports/xxx.pdf",
                "download_url_absolute": "http://host:port/files/{project_id}/exports/xxx.pdf"
            }
        }
    """
    try:
        project = Project.query.get(project_id)
        
        if not project:
            return not_found('Project')
        
        # Get page_ids from query params and fetch filtered pages
        selected_page_ids = parse_page_ids_from_query(request)
        pages = get_filtered_pages(project_id, selected_page_ids if selected_page_ids else None)
        
        if not pages:
            return bad_request("No pages found for project")
        
        # Get image paths
        file_service = FileService(current_app.config['UPLOAD_FOLDER'])
        
        image_paths = []
        for page in pages:
            if page.generated_image_path:
                abs_path = file_service.get_absolute_path(page.generated_image_path)
                image_paths.append(abs_path)
        
        if not image_paths:
            return bad_request("No generated images found for project")
        
        # Determine export directory and filename
        exports_dir = file_service._get_exports_dir(project_id)

        # Get filename from query params or use default
        filename = _safe_export_filename(
            request.args.get('filename'),
            _project_title_filename(project, 'pdf', f'presentation_{project_id}.pdf'),
            'pdf',
        )

        output_path = os.path.join(exports_dir, filename)

        # Generate PDF file on disk
        ExportService.create_pdf_from_images(
            image_paths,
            output_file=output_path,
            aspect_ratio=get_ppt_settings(project)['image_aspect_ratio'],
        )

        # Build download URLs
        download_path = f"/files/{project_id}/exports/{filename}"
        base_url = request.url_root.rstrip("/")
        download_url_absolute = f"{base_url}{download_path}"
        record_ppt_revision(
            project,
            'export.pdf',
            changed_page_ids=[page.id for page in pages],
        )
        db.session.commit()

        return success_response(
            data={
                "download_url": download_path,
                "download_url_absolute": download_url_absolute,
                "filename": filename,
            },
            message="Export PDF task created"
        )
    
    except Exception as e:
        return error_response('SERVER_ERROR', str(e), 500)


@export_bp.route('/<project_id>/export/images', methods=['GET'])
def export_images(project_id):
    """
    GET /api/projects/{project_id}/export/images?page_ids=id1,id2,id3 - Export images

    Single image: copies to exports dir and returns download URL.
    Multiple images: creates a ZIP archive and returns download URL.
    """
    try:
        if '..' in project_id or '/' in project_id or '\\' in project_id:
            return bad_request('Invalid project ID')
        s_project_id = secure_filename(project_id)
        if s_project_id != project_id:
            return bad_request('Invalid project ID')

        project = Project.query.get(s_project_id)
        if not project:
            return not_found('Project')

        selected_page_ids = parse_page_ids_from_query(request)
        pages = get_filtered_pages(s_project_id, selected_page_ids if selected_page_ids else None)
        if not pages:
            return bad_request("No pages found for project")

        file_service = FileService(current_app.config['UPLOAD_FOLDER'])

        image_items = []
        for page in pages:
            if page.generated_image_path:
                abs_path = file_service.get_absolute_path(page.generated_image_path)
                if os.path.exists(abs_path):
                    image_items.append((page, abs_path))

        if not image_items:
            return bad_request("No generated images found for project")

        exports_dir = file_service._get_exports_dir(s_project_id)
        timestamp = int(time.time())

        if len(image_items) == 1:
            page, path = image_items[0]
            ext = os.path.splitext(path)[1] or '.png'
            filename = _project_title_filename(project, ext.lstrip('.'), f'slide_{page.id}_{timestamp}{ext}')
            output_path = os.path.join(exports_dir, filename)
            shutil.copy2(path, output_path)
        else:
            filename = _project_title_filename(project, 'zip', f'slides_{s_project_id}_{timestamp}.zip')
            output_path = os.path.join(exports_dir, filename)
            with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                for page, path in image_items:
                    ext = os.path.splitext(path)[1] or '.png'
                    zf.write(path, f'slide_{page.order_index + 1:03d}{ext}')

        download_path = f"/files/{s_project_id}/exports/{filename}"
        base_url = request.url_root.rstrip("/")
        record_ppt_revision(
            project,
            'export.images',
            changed_page_ids=[page.id for page, _path in image_items],
        )
        db.session.commit()

        return success_response(
            data={
                "download_url": download_path,
                "download_url_absolute": f"{base_url}{download_path}",
                "filename": filename,
            },
            message="Export images completed"
        )

    except Exception as e:
        return error_response('SERVER_ERROR', str(e), 500)


@export_bp.route('/<project_id>/export/editable-pptx', methods=['POST'])
def export_editable_pptx(project_id):
    """
    POST /api/projects/{project_id}/export/editable-pptx - 导出可编辑PPTX（异步）
    
    使用递归分析方法（支持任意尺寸、递归子图分析）
    
    这个端点创建一个异步任务来执行以下操作：
    1. 递归分析图片（支持任意尺寸和分辨率）
    2. 转换为PDF并上传MinerU识别
    3. 提取元素bbox和生成clean background（inpainting）
    4. 递归处理图片/图表中的子元素
    5. 创建可编辑PPTX
    
    Request body (JSON):
        {
            "filename": "optional_custom_name.pptx",
            "page_ids": ["id1", "id2"],  // 可选，要导出的页面ID列表（不提供则导出所有）
            "max_depth": 1,      // 可选，递归深度（默认1=不递归，2=递归一层）
            "max_workers": 4     // 可选，并发数（默认4）
        }
    
    Returns:
        JSON with task_id, e.g.
        {
            "success": true,
            "data": {
                "task_id": "uuid-here",
                "method": "recursive_analysis",
                "max_depth": 2,
                "max_workers": 4
            },
            "message": "Export task created"
        }
    
    轮询 /api/projects/{project_id}/tasks/{task_id} 获取进度和下载链接
    """
    try:
        project = Project.query.get(project_id)
        
        if not project:
            return not_found('Project')
        
        # Get parameters from request body
        data = request.get_json() or {}
        
        # Get page_ids from request body and fetch filtered pages
        selected_page_ids = parse_page_ids_from_body(data)
        pages = get_filtered_pages(project_id, selected_page_ids if selected_page_ids else None)
        
        if not pages:
            return bad_request("No pages found for project")
        
        # Check if pages have generated images
        has_images = any(page.generated_image_path for page in pages)
        if not has_images:
            return bad_request("No generated images found for project")
        
        # Get parameters from request body
        data = request.get_json() or {}
        filename = _safe_export_filename(
            data.get('filename'),
            _project_title_filename(project, 'pptx', f'presentation_editable_{project_id}.pptx'),
            'pptx',
        )
        
        # 递归分析参数
        # max_depth 语义：1=只处理表层不递归，2=递归一层（处理图片/图表中的子元素）
        max_depth = data.get('max_depth', 1)  # 默认不递归，与测试脚本一致
        max_workers = data.get('max_workers', 4)
        
        # Validate parameters
        # max_depth >= 1: 至少处理表层元素
        if not isinstance(max_depth, int) or max_depth < 1 or max_depth > 5:
            return bad_request("max_depth must be an integer between 1 and 5")
        
        if not isinstance(max_workers, int) or max_workers < 1 or max_workers > 16:
            return bad_request("max_workers must be an integer between 1 and 16")

        export_extractor_method = project.export_extractor_method or 'hybrid'
        export_inpaint_method = project.export_inpaint_method or 'hybrid'
        export_high_fidelity_editable = bool(
            data.get('export_high_fidelity_editable', project.export_high_fidelity_editable or False)
        )
        resume_kwargs = {
            "project_id": project_id,
            "filename": filename,
            "page_ids": selected_page_ids if selected_page_ids else None,
            "max_depth": max_depth,
            "max_workers": max_workers,
            "export_extractor_method": export_extractor_method,
            "export_inpaint_method": export_inpaint_method,
            "export_high_fidelity_editable": export_high_fidelity_editable,
            "enable_icon_subject_extraction": False,
        }
        
        # Create task record
        task = Task(
            project_id=project_id,
            task_type='EXPORT_EDITABLE_PPTX',
            status='PENDING'
        )
        task.set_progress({"_resume": {"kind": "editable-pptx", "kwargs": resume_kwargs}})
        db.session.add(task)
        record_ppt_revision(
            project,
            'export.editable_pptx',
            changed_page_ids=[page.id for page in pages],
        )
        db.session.commit()
        
        logger.info(f"Created export task {task.id} for project {project_id} (recursive analysis: depth={max_depth}, workers={max_workers})")
        
        # Get services
        from services.file_service import FileService
        from services.task_manager import task_manager, export_editable_pptx_with_recursive_analysis_task
        
        file_service = FileService(current_app.config['UPLOAD_FOLDER'])
        
        # Get Flask app instance for background task
        app = current_app._get_current_object()
        
        # 读取项目的导出设置
        logger.info(
            f"Export settings: extractor={export_extractor_method}, "
            f"inpaint={export_inpaint_method}, high_fidelity={export_high_fidelity_editable}"
        )

        # 使用递归分析任务（不需要 ai_service，使用 ImageEditabilityService）
        task_manager.submit_task(
            task.id,
            export_editable_pptx_with_recursive_analysis_task,
            project_id=project_id,
            filename=filename,
            file_service=file_service,
            page_ids=selected_page_ids if selected_page_ids else None,
            max_depth=max_depth,
            max_workers=max_workers,
            export_extractor_method=export_extractor_method,
            export_inpaint_method=export_inpaint_method,
            export_high_fidelity_editable=export_high_fidelity_editable,
            enable_icon_subject_extraction=False,
            app=app
        )
        
        logger.info(f"Submitted recursive export task {task.id} to task manager")
        
        return success_response(
            data={
                "task_id": task.id,
                "method": "recursive_analysis",
                "max_depth": max_depth,
                "max_workers": max_workers
            },
            message="Export task created (using recursive analysis)"
        )
    
    except Exception as e:
        logger.exception("Error creating export task")
        return error_response('SERVER_ERROR', str(e), 500)


@export_bp.post('/<project_id>/export/native-video')
def export_native_video(project_id):
    """Create a narration-video task from browser-rendered native slide frames."""
    project = db.session.get(Project, project_id)
    if not project:
        return not_found('Project')
    if get_ppt_settings(project)['render_mode'] != 'native':
        return bad_request('只有原生可编辑项目可以使用原生视频导出')

    try:
        page_ids = json.loads(request.form.get('page_ids', '[]'))
        scene_manifests = json.loads(request.form.get('scene_manifests', '[]'))
        native_scene_bundles = json.loads(request.form.get('native_scene_bundles', '[]'))
    except json.JSONDecodeError:
        return bad_request('page_ids、scene_manifests 和 native_scene_bundles 必须是有效 JSON')
    if not isinstance(page_ids, list) or not page_ids or any(not isinstance(item, str) for item in page_ids):
        return bad_request('page_ids 必须是非空文本数组')

    pages = get_filtered_pages(project_id, page_ids)
    if [page.id for page in pages] != page_ids:
        return bad_request('页面顺序与项目不一致，请刷新后重试')
    if not isinstance(scene_manifests, list):
        return bad_request('scene_manifests 必须是 JSON 数组')
    if scene_manifests and len(scene_manifests) != len(pages):
        return bad_request('场景清单数量与导出页面不一致')
    if not isinstance(native_scene_bundles, list):
        return bad_request('native_scene_bundles 必须是 JSON 数组')
    if native_scene_bundles and len(native_scene_bundles) != len(pages):
        return bad_request('原生场景包数量与导出页面不一致')
    if native_scene_bundles and not scene_manifests:
        return bad_request('原生场景包必须与场景清单一起上传')
    frames = request.files.getlist('frames')
    try:
        frame_counts = json.loads(request.form.get('frame_counts', '[]'))
    except json.JSONDecodeError:
        return bad_request('frame_counts 必须是 JSON 数组')
    if not frame_counts:
        frame_counts = [1] * len(pages)
    if (
        not isinstance(frame_counts, list)
        or len(frame_counts) != len(pages)
        or any(not isinstance(count, int) or count < 1 or count > 4 for count in frame_counts)
        or sum(frame_counts) != len(frames)
    ):
        return bad_request('每页必须上传 1-4 张连续阶段帧')
    try:
        for frame in frames:
            Image.open(frame.stream).verify()
            frame.stream.seek(0)
    except Exception:
        return bad_request('视频帧必须是有效图片')

    filename = _safe_export_filename(
        request.form.get('filename'),
        _project_title_filename(project, 'mp4', f'native_{project_id}.mp4'),
        'mp4',
    )
    try:
        raw_director_config = json.loads(request.form.get('director_config', '{}'))
    except json.JSONDecodeError:
        return bad_request('director_config 必须是 JSON 对象')
    director_config = normalize_video_director_config(raw_director_config)
    director_plan = build_video_director_plan(
        _video_director_page_inputs(pages, 'native'),
        director_config,
    )

    tts_provider = _normalize_tts_provider(request.form.get('tts_provider'))
    if not tts_provider:
        return bad_request('tts_provider 仅支持 edge 或 fish_audio')
    language = request.form.get('language') or current_app.config.get('OUTPUT_LANGUAGE', 'zh')
    from services.tts_video_service import get_default_voice
    voice = str(request.form.get('voice') or '').strip()
    if tts_provider == 'edge' and not voice:
        voice = get_default_voice(language, dict(current_app.config))
    rate = str(request.form.get('rate') or current_app.config.get('TTS_DEFAULT_RATE', '+0%'))
    try:
        speed = max(0.7, min(float(request.form.get('speed', 1.0)), 1.2))
    except (TypeError, ValueError):
        speed = 1.0
    try:
        raw_narration_config = json.loads(request.form.get('narration_config', '{}'))
        raw_speakers = json.loads(request.form.get('speakers', '[]'))
        raw_pronunciation_lexicon = json.loads(request.form.get('pronunciation_lexicon', 'null'))
        raw_narration_preferences = json.loads(request.form.get('narration_preferences', 'null'))
        narration_version_map = json.loads(request.form.get('narration_version_map', '{}'))
    except json.JSONDecodeError:
        return bad_request('旁白配置必须是有效 JSON')
    narration_config = normalize_narration_generation_config(
        raw_narration_config,
        fallback_topic=get_spine_source_fields(project)['idea_prompt'],
    )
    from services.narration_service import (
        normalize_narration_preferences,
        normalize_pronunciation_entries,
        normalize_speakers,
    )
    narration_mode = request.form.get('narration_mode') or narration_config.get('narration_mode') or 'single'
    if narration_mode not in {'single', 'dialogue'}:
        narration_mode = 'single'
    speakers = normalize_speakers(
        raw_speakers or narration_config.get('speakers'),
        default_voice=voice,
    )
    fish_error = _fish_video_option_error(
        tts_provider,
        voice=voice,
        narration_mode=narration_mode,
        speakers=speakers,
    )
    if fish_error:
        return bad_request(fish_error)
    narration_config['narration_mode'] = narration_mode
    narration_config['speakers'] = speakers
    auto_emotion = _form_bool(request.form.get('auto_emotion'), True)
    try:
        pronunciation_lexicon = normalize_pronunciation_entries(
            project.get_pronunciation_lexicon() if raw_pronunciation_lexicon is None else raw_pronunciation_lexicon
        )
        narration_preferences = normalize_narration_preferences(
            project.get_narration_preferences() if raw_narration_preferences is None else raw_narration_preferences
        )
    except ValueError as exc:
        return bad_request(str(exc))

    generate_narration = _form_bool(request.form.get('generate_narration'), True)
    narration_policy = request.form.get('narration_policy') or 'export_only_auto_fill'

    task = Task(project_id=project_id, task_type='EXPORT_VIDEO', status='PENDING')
    db.session.add(task)
    db.session.flush()
    frames_dir = Path(current_app.config['UPLOAD_FOLDER']) / project_id / 'exports' / f'_native_video_{task.id}'
    try:
        frames_dir.mkdir(parents=True, exist_ok=True)
        frame_sequences = []
        cursor = 0
        for page_index, count in enumerate(frame_counts):
            page_frames = []
            for stage_index in range(count):
                frame_path = frames_dir / f'frame_{page_index:04d}_{stage_index:02d}.png'
                frames[cursor].save(frame_path)
                cursor += 1
                page_frames.append(str(frame_path.resolve()))
            frame_sequences.append(page_frames)

        scene_manifest_refs = []
        if scene_manifests:
            from services.scene_manifest import save_scene_manifests

            scene_manifest_refs = save_scene_manifests(scene_manifests, frames_dir, page_ids)

        native_scene_bundle_refs = []
        if native_scene_bundles:
            from services.native_scene_bundle import save_native_scene_bundles

            native_scene_bundle_refs = save_native_scene_bundles(
                native_scene_bundles,
                frames_dir,
                scene_manifest_refs,
                page_ids,
            )

        from services.video_export_snapshot import create_video_export_snapshot

        snapshot = create_video_export_snapshot(
            project=project,
            pages=pages,
            upload_root=current_app.config['UPLOAD_FOLDER'],
            narration_policy=narration_policy,
            narration_version_map=narration_version_map,
            export_config={
                'tts_provider': tts_provider,
                'voice': voice,
                'rate': rate,
                'speed': speed,
                'language': language,
                'narration_mode': narration_mode,
                'speakers': speakers,
                'auto_emotion': auto_emotion,
                'pronunciation_lexicon': pronunciation_lexicon,
                'narration_preferences': narration_preferences,
            },
            scene_manifest_refs=scene_manifest_refs,
            native_scene_bundle_refs=native_scene_bundle_refs,
        )

        from services.task_manager import export_video_task, task_manager

        kwargs = {
            'project_id': project_id,
            'filename': filename,
            'voice': voice,
            'rate': rate,
            'speed': speed,
            'generate_narration': generate_narration,
            'enable_ken_burns': False,
            'include_no_image_pages': False,
            'page_ids': page_ids,
            'language': language,
            'narration_config': narration_config,
            'narration_mode': narration_mode,
            'speakers': speakers,
            'tts_provider': tts_provider,
            'auto_emotion': auto_emotion,
            'director_plan': director_plan,
            'pronunciation_lexicon': pronunciation_lexicon,
            'narration_preferences': narration_preferences,
            'narration_snapshot_path': snapshot['path'],
            'narration_snapshot_hash': snapshot['sha256'],
            'frame_sequences': frame_sequences,
        }
        task.set_progress({
            'total': 100,
            'completed': 0,
            'failed': 0,
            '_resume': {'kind': 'video', 'kwargs': kwargs},
        })
        record_ppt_revision(
            project,
            'export.native_video',
            changed_page_ids=page_ids,
        )
        db.session.commit()

        task_manager.submit_task(
            task.id,
            export_video_task,
            file_service=FileService(current_app.config['UPLOAD_FOLDER']),
            app=current_app._get_current_object(),
            **kwargs,
        )
        return success_response({'task_id': task.id})
    except ValueError as exc:
        db.session.rollback()
        shutil.rmtree(frames_dir, ignore_errors=True)
        return bad_request(str(exc))
    except Exception as exc:
        db.session.rollback()
        persisted_task = db.session.get(Task, task.id)
        if persisted_task:
            persisted_task.status = 'FAILED'
            persisted_task.error_message = str(exc)
            persisted_task.completed_at = datetime.utcnow()
            db.session.commit()
        shutil.rmtree(frames_dir, ignore_errors=True)
        logger.exception('Error creating native video export task')
        return error_response('SERVER_ERROR', str(exc), 500)


@export_bp.route('/<project_id>/narration/preview', methods=['POST'])
def preview_narration(project_id):
    """Generate a short Fish Audio sample for voice and delivery A/B checks."""
    project = Project.query.get(project_id)
    if not project:
        return not_found('Project')
    data = request.get_json() or {}
    text = str(data.get('text') or '').strip()
    if not 5 <= len(text) <= 200:
        return bad_request('试听文本长度需为 5-200 个字符')
    voice = str(data.get('voice') or '').strip()
    fish_error = _fish_video_option_error(
        'fish_audio',
        voice=voice,
        narration_mode='single',
        speakers=[],
    )
    if fish_error:
        return bad_request(fish_error)
    try:
        speed = max(0.5, min(float(data.get('speed', 1.0)), 2.0))
    except (TypeError, ValueError):
        return bad_request('speed 必须是 0.5-2.0 之间的数字')

    from services.fish_audio_service import FishAudioAPIError, synthesize
    from services.narration_service import apply_pronunciation_lexicon
    from services.tts_video_service import build_fish_narration_request

    try:
        lexicon = (
            data.get('pronunciation_lexicon')
            if 'pronunciation_lexicon' in data
            else project.get_pronunciation_lexicon()
        )
        tts_text = apply_pronunciation_lexicon(text, lexicon)
        request_data = build_fish_narration_request(
            [{'speaker_id': 'host', 'text': tts_text}],
            speakers=[{'id': 'host', 'name': '旁白', 'voice': voice}],
            narration_mode='single',
            auto_emotion=bool(data.get('auto_emotion', True)),
        )
        with tempfile.TemporaryDirectory(prefix='fish_preview_') as temp_dir:
            output_path = os.path.join(temp_dir, 'preview.mp3')
            synthesize(
                api_key=_fish_audio_key(),
                text=request_data['text'],
                output_path=output_path,
                reference_id=voice,
                speed=speed,
                model=current_app.config.get('FISH_AUDIO_MODEL', 's2.1-pro-free'),
            )
            with open(output_path, 'rb') as handle:
                audio = io.BytesIO(handle.read())
        audio.seek(0)
        return send_file(audio, mimetype='audio/mpeg', download_name='fish-preview.mp3')
    except ValueError as exc:
        return bad_request(str(exc))
    except FishAudioAPIError as exc:
        status = 400 if exc.status_code and exc.status_code < 500 else 502
        return error_response('FISH_AUDIO_ERROR', str(exc), status)


@export_bp.route('/<project_id>/export/video/preflight', methods=['POST'])
def export_video_preflight(project_id):
    """Return actionable checks before starting an asynchronous video export."""
    project = Project.query.get(project_id)
    if not project:
        return not_found('Project')

    data = request.get_json() or {}
    page_ids = parse_page_ids_from_body(data)
    pages = get_filtered_pages(project_id, page_ids if page_ids else None)
    if not pages:
        return success_response({
            'can_export': False,
            'errors': ['没有找到可导出的页面'],
            'warnings': [],
        })

    errors = []
    warnings = []
    tts_provider = _normalize_tts_provider(data.get('tts_provider'))
    if not tts_provider:
        errors.append('tts_provider 仅支持 edge 或 fish_audio')
    speakers = []
    narration_mode = data.get('narration_mode') if data.get('narration_mode') in {'single', 'dialogue'} else 'single'
    if tts_provider == 'fish_audio':
        from services.narration_service import (
            MAX_FISH_TTS_CHARACTERS_PER_PAGE,
            apply_pronunciation_lexicon,
            normalize_narration_preferences,
            normalize_pronunciation_entries,
            normalize_narration_segments,
            normalize_speakers,
        )
        speakers = normalize_speakers(data.get('speakers'), default_voice=str(data.get('voice') or ''))
        fish_error = _fish_video_option_error(
            tts_provider,
            voice=str(data.get('voice') or ''),
            narration_mode=narration_mode,
            speakers=speakers,
            validate_voices=True,
        )
        if fish_error:
            errors.append(fish_error)
        lexicon = project.get_pronunciation_lexicon()
        oversized_pages = []
        for page in pages:
            segments = normalize_narration_segments(
                page.get_narration_segments(),
                fallback_text=page.narration_text,
            )
            character_count = sum(
                len(re.sub(r'\s+', '', apply_pronunciation_lexicon(segment.get('text'), lexicon)))
                for segment in segments
            )
            if character_count > MAX_FISH_TTS_CHARACTERS_PER_PAGE:
                oversized_pages.append(page.order_index + 1)
        if oversized_pages:
            errors.append(
                f"以下页面旁白超过单页 {MAX_FISH_TTS_CHARACTERS_PER_PAGE} 字限制："
                f"第 {'、'.join(map(str, oversized_pages))} 页"
            )
    missing_images = [page.order_index + 1 for page in pages if not page.generated_image_path]
    if missing_images and not data.get('include_no_image_pages', False):
        errors.append(f"以下页面缺少图片：第 {'、'.join(map(str, missing_images))} 页")

    scene_animation = _image_scene_preflight(project, pages, current_app.config)
    if scene_animation['fallback_pages']:
        fallback_numbers = '、'.join(
            str(item['page']) for item in scene_animation['fallback_pages']
        )
        warnings.append(
            f'第 {fallback_numbers} 页没有可用分层场景，将使用 Ken Burns 或静态画面'
        )
    if scene_animation['errors']:
        for item in scene_animation['errors']:
            errors.append(f"第 {item['page']} 页分层场景损坏：{item['reason']}")

    missing_narration = [
        page.order_index + 1
        for page in pages
        if not (page.narration_text or '').strip() and not page.get_narration_segments()
    ]
    if missing_narration:
        if data.get('generate_narration', True):
            warnings.append(f"将自动生成 {len(missing_narration)} 页旁白")
        else:
            errors.append(f"以下页面缺少旁白：第 {'、'.join(map(str, missing_narration))} 页")

    from services.tts_video_service import check_ffmpeg_available, check_ffmpeg_ass_filter_available
    ffmpeg_path = current_app.config.get('FFMPEG_PATH', 'ffmpeg')
    if not check_ffmpeg_available(ffmpeg_path):
        errors.append('FFmpeg 未安装或不在 PATH 中')
    elif any((page.narration_text or '').strip() or page.get_narration_segments() for page in pages) and not check_ffmpeg_ass_filter_available(ffmpeg_path):
        errors.append('当前 FFmpeg 不支持 ASS 字幕，无法导出讲解视频')

    from services.narration_service import estimate_narration_usage
    estimate = estimate_narration_usage([
        {
            'narration_text': page.narration_text,
            'narration_segments': page.get_narration_segments(),
        }
        for page in pages
    ], speed=data.get('speed', 1.0))
    if narration_mode == 'dialogue' and speakers:
        estimate['roles'] = len(speakers)

    return success_response({
        'can_export': not errors,
        'errors': errors,
        'warnings': warnings,
        'total_pages': len(pages),
        'pages_with_narration': len(pages) - len(missing_narration),
        'missing_images': missing_images,
        'missing_narration': missing_narration,
        'scene_animation': scene_animation,
        'estimate': estimate,
    })


@export_bp.route('/<project_id>/export/video', methods=['POST'])
def export_video(project_id):
    """
    POST /api/projects/{project_id}/export/video - 导出讲解视频（异步）

    将幻灯片图片 + TTS 旁白合成为 MP4 视频，含 Ken Burns 动效。

    Request body (JSON):
        {
            "filename": "optional_custom_name.mp4",
            "page_ids": ["id1", "id2"],          // 可选
            "voice": "zh-CN-XiaoxiaoNeural",     // 可选 TTS 语音
            "rate": "+0%",                        // 可选语速
            "generate_narration": true,            // 是否自动生成缺失旁白（默认 true）
            "language": "zh"                       // 可选输出语言
        }

    Returns:
        JSON with task_id for polling via /api/projects/{project_id}/tasks/{task_id}
    """
    try:
        project = Project.query.get(project_id)

        if not project:
            return not_found('Project')

        data = request.get_json() or {}

        tts_provider = _normalize_tts_provider(data.get('tts_provider'))
        if not tts_provider:
            return bad_request('tts_provider 仅支持 edge 或 fish_audio')
        auto_emotion = bool(data.get('auto_emotion', True))

        filename = _safe_export_filename(
            data.get('filename'),
            _project_title_filename(project, 'mp4', f'narration_{project_id}.mp4'),
            'mp4',
        )

        voice = str(data.get('voice') or '').strip()
        rate = data.get('rate', current_app.config.get('TTS_DEFAULT_RATE', '+0%'))
        try:
            speed = float(data.get('speed', 1.0))
        except (TypeError, ValueError):
            speed = 1.0
        speed = max(0.7, min(speed, 1.2))
        generate_narration = data.get('generate_narration', True)
        enable_ken_burns = data.get('enable_ken_burns', False)
        ken_burns_style = data.get('ken_burns_style', 'auto')
        if ken_burns_style not in {'auto', 'zoom', 'pan'}:
            ken_burns_style = 'auto'
        include_no_image_pages = data.get('include_no_image_pages', False)
        language = data.get('language', current_app.config.get('OUTPUT_LANGUAGE', 'zh'))
        if tts_provider == 'edge' and not voice:
            from services.tts_video_service import get_default_voice
            voice = get_default_voice(language, dict(current_app.config))
        presentation_topic = (
            data.get('presentation_topic')
            or get_spine_source_fields(project)['idea_prompt']
        )
        narration_config = normalize_narration_generation_config(
            data.get('narration_config'),
            fallback_topic=presentation_topic,
        )
        from services.narration_service import (
            normalize_narration_preferences,
            normalize_pronunciation_entries,
            normalize_speakers,
        )
        narration_mode = data.get('narration_mode') or narration_config.get('narration_mode') or 'single'
        if narration_mode not in {'single', 'dialogue'}:
            narration_mode = 'single'
        speakers = normalize_speakers(
            data.get('speakers') or narration_config.get('speakers'),
            default_voice=voice,
        )
        if narration_mode == 'dialogue' and not speakers:
            speakers = [
                {'id': 'host', 'name': '主持人', 'voice': voice, 'rate': rate},
                {'id': 'expert', 'name': '专家', 'voice': voice, 'rate': rate},
            ]
        fish_error = _fish_video_option_error(
            tts_provider,
            voice=voice,
            narration_mode=narration_mode,
            speakers=speakers,
        )
        if fish_error:
            return bad_request(fish_error)
        narration_config['narration_mode'] = narration_mode
        narration_config['speakers'] = speakers
        pronunciation_lexicon = normalize_pronunciation_entries(
            data.get('pronunciation_lexicon', project.get_pronunciation_lexicon())
        )
        narration_preferences = normalize_narration_preferences(
            data.get('narration_preferences', project.get_narration_preferences())
        )
        narration_version_map = data.get('narration_version_map') or {}
        if not isinstance(narration_version_map, dict):
            return bad_request('narration_version_map 必须是对象')
        narration_policy = data.get('narration_policy') or 'export_only_auto_fill'
        director_config = normalize_video_director_config(data.get('director_config'))

        # 获取页面
        selected_page_ids = parse_page_ids_from_body(data)

        pages = get_filtered_pages(project_id, selected_page_ids if selected_page_ids else None)

        if not pages:
            return bad_request("No pages found for project")

        director_plan = build_video_director_plan(
            _video_director_page_inputs(
                pages,
                'native' if get_ppt_settings(project)['render_mode'] == 'native' else 'image',
            ),
            director_config,
        )

        has_images = any(page.generated_image_path for page in pages)
        if not has_images and not include_no_image_pages:
            return bad_request("No generated images found for project. Enable 'include pages without images' to export all pages.")

        try:
            scene_manifest_refs, native_scene_bundle_refs, scene_levels = _snapshot_current_image_scenes(
                project,
                pages,
                current_app.config['UPLOAD_FOLDER'],
                current_app.config,
            )
            from services.video_export_snapshot import create_video_export_snapshot
            snapshot = create_video_export_snapshot(
                project=project,
                pages=pages,
                upload_root=current_app.config['UPLOAD_FOLDER'],
                narration_policy=narration_policy,
                narration_version_map=narration_version_map,
                export_config={
                    'tts_provider': tts_provider,
                    'voice': voice,
                    'rate': rate,
                    'speed': speed,
                    'language': language,
                    'narration_mode': narration_mode,
                    'speakers': speakers,
                    'auto_emotion': auto_emotion,
                    'pronunciation_lexicon': pronunciation_lexicon,
                    'narration_preferences': narration_preferences,
                },
                scene_manifest_refs=scene_manifest_refs,
                native_scene_bundle_refs=native_scene_bundle_refs,
                scene_levels=scene_levels,
            )
        except ValueError as exc:
            db.session.rollback()
            return bad_request(str(exc))

        # 创建任务
        task = Task(
            project_id=project_id,
            task_type='EXPORT_VIDEO',
            status='PENDING',
        )
        task.set_progress({
            "_resume": {
                "kind": "video",
                "kwargs": {
                    "project_id": project_id,
                    "filename": filename,
                    "voice": voice,
                    "rate": rate,
                    "speed": speed,
                    "generate_narration": generate_narration,
                    "enable_ken_burns": enable_ken_burns,
                    "ken_burns_style": ken_burns_style,
                    "include_no_image_pages": include_no_image_pages,
                    "page_ids": selected_page_ids if selected_page_ids else None,
                    "language": language,
                    "narration_config": narration_config,
                    "narration_mode": narration_mode,
                    "speakers": speakers,
                    "tts_provider": tts_provider,
                    "auto_emotion": auto_emotion,
                    "director_plan": director_plan,
                    "pronunciation_lexicon": pronunciation_lexicon,
                    "narration_preferences": narration_preferences,
                    "narration_snapshot_path": snapshot['path'],
                    "narration_snapshot_hash": snapshot['sha256'],
                },
            },
        })
        db.session.add(task)
        record_ppt_revision(
            project,
            'export.video',
            changed_page_ids=[page.id for page in pages],
        )
        db.session.commit()

        logger.info(f"Created video export task {task.id} for project {project_id}")

        # 提交后台任务
        from services.file_service import FileService
        from services.task_manager import task_manager, export_video_task

        file_service = FileService(current_app.config['UPLOAD_FOLDER'])
        app = current_app._get_current_object()

        task_manager.submit_task(
            task.id,
            export_video_task,
            project_id=project_id,
            filename=filename,
            file_service=file_service,
            voice=voice,
            rate=rate,
            speed=speed,
            generate_narration=generate_narration,
            enable_ken_burns=enable_ken_burns,
            ken_burns_style=ken_burns_style,
            include_no_image_pages=include_no_image_pages,
            page_ids=selected_page_ids if selected_page_ids else None,
            language=language,
            narration_config=narration_config,
            narration_mode=narration_mode,
            speakers=speakers,
            tts_provider=tts_provider,
            auto_emotion=auto_emotion,
            director_plan=director_plan,
            pronunciation_lexicon=pronunciation_lexicon,
            narration_preferences=narration_preferences,
            narration_snapshot_path=snapshot['path'],
            narration_snapshot_hash=snapshot['sha256'],
            app=app,
        )

        return success_response(
            data={
                "task_id": task.id,
                "voice": voice,
                "generate_narration": generate_narration,
                "enable_ken_burns": enable_ken_burns,
                "ken_burns_style": ken_burns_style,
                "include_no_image_pages": include_no_image_pages,
                "narration_config": narration_config,
                "narration_mode": narration_mode,
                "speakers": speakers,
                "tts_provider": tts_provider,
                "auto_emotion": auto_emotion,
                "director_config": director_config,
                "director_plan": director_plan,
            },
            message="Video export task created"
        )

    except Exception as e:
        logger.exception("Error creating video export task")
        return error_response('SERVER_ERROR', str(e), 500)
