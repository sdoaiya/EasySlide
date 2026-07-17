"""
Export Controller - handles file export endpoints
"""
import logging
import os
import io
import json
import re
import shutil
import time
import zipfile
from datetime import datetime
from pathlib import Path

from flask import Blueprint, request, current_app
from werkzeug.utils import secure_filename
from PIL import Image
from models import db, Project, Page, Task
from utils import (
    error_response, not_found, bad_request, success_response,
    parse_page_ids_from_query, parse_page_ids_from_body, get_filtered_pages
)
from services import ExportService, FileService
from services.ai_service_manager import get_ai_service
from services.prompts import normalize_narration_generation_config
from services.video_director import build_video_director_plan, normalize_video_director_config

logger = logging.getLogger(__name__)

export_bp = Blueprint('export', __name__, url_prefix='/api/projects')


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
    if project.render_mode != 'native':
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
            aspect_ratio=project.image_aspect_ratio,
            transition_effects=transition_effects,
        )

        # Build download URLs
        download_path = f"/files/{project_id}/exports/{filename}"
        base_url = request.url_root.rstrip("/")
        download_url_absolute = f"{base_url}{download_path}"

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
        ExportService.create_pdf_from_images(image_paths, output_file=output_path, aspect_ratio=project.image_aspect_ratio)

        # Build download URLs
        download_path = f"/files/{project_id}/exports/{filename}"
        base_url = request.url_root.rstrip("/")
        download_url_absolute = f"{base_url}{download_path}"

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
        export_high_fidelity_editable = project.export_high_fidelity_editable or False
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
    if project.render_mode != 'native':
        return bad_request('只有原生可编辑项目可以使用原生视频导出')

    try:
        page_ids = json.loads(request.form.get('page_ids', '[]'))
    except json.JSONDecodeError:
        return bad_request('page_ids 必须是 JSON 数组')
    if not isinstance(page_ids, list) or not page_ids or any(not isinstance(item, str) for item in page_ids):
        return bad_request('page_ids 必须是非空文本数组')

    pages = get_filtered_pages(project_id, page_ids)
    if [page.id for page in pages] != page_ids:
        return bad_request('页面顺序与项目不一致，请刷新后重试')
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

        from services.tts_video_service import get_default_voice
        from services.task_manager import export_video_task, task_manager

        language = current_app.config.get('OUTPUT_LANGUAGE', 'zh')
        kwargs = {
            'project_id': project_id,
            'filename': filename,
            'voice': get_default_voice(language, dict(current_app.config)),
            'rate': current_app.config.get('TTS_DEFAULT_RATE', '+0%'),
            'speed': 1.0,
            'generate_narration': True,
            'enable_ken_burns': False,
            'include_no_image_pages': False,
            'page_ids': page_ids,
            'language': language,
            'narration_config': normalize_narration_generation_config(
                None,
                fallback_topic=project.idea_prompt or '',
            ),
            'director_plan': director_plan,
            'frame_sequences': frame_sequences,
        }
        task.set_progress({
            'total': 100,
            'completed': 0,
            'failed': 0,
            '_resume': {'kind': 'video', 'kwargs': kwargs},
        })
        db.session.commit()

        task_manager.submit_task(
            task.id,
            export_video_task,
            file_service=FileService(current_app.config['UPLOAD_FOLDER']),
            app=current_app._get_current_object(),
            **kwargs,
        )
        return success_response({'task_id': task.id})
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

        filename = _safe_export_filename(
            data.get('filename'),
            _project_title_filename(project, 'mp4', f'narration_{project_id}.mp4'),
            'mp4',
        )

        voice = data.get('voice', current_app.config.get('TTS_DEFAULT_VOICE_ZH', 'zh-CN-XiaoxiaoNeural'))
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
        presentation_topic = data.get('presentation_topic') or project.idea_prompt or ''
        narration_config = normalize_narration_generation_config(
            data.get('narration_config'),
            fallback_topic=presentation_topic,
        )
        director_config = normalize_video_director_config(data.get('director_config'))

        # 获取页面
        selected_page_ids = parse_page_ids_from_body(data)

        pages = get_filtered_pages(project_id, selected_page_ids if selected_page_ids else None)

        if not pages:
            return bad_request("No pages found for project")

        director_plan = build_video_director_plan(
            _video_director_page_inputs(pages, 'native' if project.render_mode == 'native' else 'image'),
            director_config,
        )

        has_images = any(page.generated_image_path for page in pages)
        if not has_images and not include_no_image_pages:
            return bad_request("No generated images found for project. Enable 'include pages without images' to export all pages.")

        # 根据语言自动选择默认语音
        if 'voice' not in data:
            from services.tts_video_service import get_default_voice
            voice = get_default_voice(language, dict(current_app.config))

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
                    "director_plan": director_plan,
                },
            },
        })
        db.session.add(task)
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
            director_plan=director_plan,
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
                "director_config": director_config,
                "director_plan": director_plan,
            },
            message="Video export task created"
        )

    except Exception as e:
        logger.exception("Error creating video export task")
        return error_response('SERVER_ERROR', str(e), 500)
