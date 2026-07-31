"""
Page Controller - handles page-related endpoints
"""
import logging
from flask import Blueprint, request, current_app
from models import db, Project, Page, PageImageVersion, Task
from utils import success_response, error_response, not_found, bad_request, allowed_file
from services import FileService, ProjectContext
from services.ai_service_manager import get_ai_service
from services.image_generation_manifest import (
    build_image_generation_manifest,
    persist_image_generation_manifest,
)
from services.image_template_profiles import (
    has_gorden_template_pack,
    infer_image_layout_family,
    infer_image_page_role,
    resolve_template_reference_path,
)
from services.image_generation_quality import normalize_quality_issues, build_quality_repair_requirements
from services.narration_service import (
    NarrationRevisionConflict,
    ensure_legacy_narration_version,
    has_dialogue_speakers,
    normalize_speakers,
    narration_config_hash,
    narration_source_hash,
    page_narration_is_current,
    save_manual_narration_version,
    set_page_narration,
)
from services.ppt_workspace_service import get_ppt_settings, record_ppt_revision
from services.content_spine_service import get_spine_source_fields
from services.task_manager import (
    task_manager,
    generate_single_page_image_task,
    edit_page_image_task,
    get_image_prompt_field_names,
    prepare_page_for_image_generation,
    recover_historical_image_scenes_task,
)
from controllers.project_controller import (
    _build_image_generation_settings_prompt,
    _build_template_visual_preferences_prompt,
    _resolve_image_generation_options,
)
from datetime import datetime
from pathlib import Path
from werkzeug.utils import secure_filename
import shutil
import tempfile
import json

logger = logging.getLogger(__name__)

page_bp = Blueprint('pages', __name__, url_prefix='/api/projects')


def _auto_match_page_template(page, project, total_pages):
    page_data = page.get_outline_content() or {}
    if page.part:
        page_data = {**page_data, 'part': page.part}

    role = infer_image_page_role(
        page.order_index + 1,
        total_pages,
        page_data,
        page.part,
    )
    layout = infer_image_layout_family(role, page.order_index + 1, page_data)
    if has_gorden_template_pack(project.template_pack_id):
        source = 'template_pack'
    elif project.template_image_path:
        source = 'project_template'
    else:
        source = 'style_only'
    reason = f'Auto matched page {page.order_index + 1} as {role}/{layout}.'
    return role, layout, source, reason


@page_bp.route('/<project_id>/pages', methods=['POST'])
def create_page(project_id):
    """
    POST /api/projects/{project_id}/pages - Add new page
    
    Request body:
    {
        "order_index": 2,
        "part": "optional",
        "outline_content": {"title": "...", "points": [...]}
    }
    """
    try:
        project = Project.query.get(project_id)
        
        if not project:
            return not_found('Project')
        
        data = request.get_json()
        
        if not data or 'order_index' not in data:
            return bad_request("order_index is required")
        
        # Create new page
        page = Page(
            project_id=project_id,
            order_index=data['order_index'],
            part=data.get('part'),
            status='DRAFT'
        )
        
        if 'outline_content' in data:
            page.set_outline_content(data['outline_content'])

        if 'description_content' in data:
            page.set_description_content(data['description_content'])
            page.status = 'DESCRIPTION_GENERATED'

        db.session.add(page)
        
        # Update other pages' order_index if necessary
        other_pages = Page.query.filter(
            Page.project_id == project_id,
            Page.order_index >= data['order_index']
        ).all()
        
        for p in other_pages:
            if p.id != page.id:
                p.order_index += 1
        
        project.updated_at = datetime.utcnow()
        record_ppt_revision(project, 'page.create', changed_page_ids=[page.id])
        db.session.commit()
        
        return success_response(page.to_dict(), status_code=201)
    
    except Exception as e:
        db.session.rollback()
        return error_response('SERVER_ERROR', str(e), 500)


@page_bp.route('/<project_id>/pages/batch', methods=['POST'])
def create_pages_batch(project_id):
    """Create imported pages in one transaction with stable contiguous ordering."""
    try:
        project = Project.query.get(project_id)
        if not project:
            return not_found('Project')
        data = request.get_json() or {}
        pages_data = data.get('pages')
        if not isinstance(pages_data, list) or not pages_data:
            return bad_request("pages must be a non-empty array")
        if len(pages_data) > 200:
            return bad_request("pages cannot contain more than 200 items")

        validated_pages = []
        for item in pages_data:
            if not isinstance(item, dict):
                return bad_request("Each page must be an object")
            outline_content = item.get('outline_content')
            if not isinstance(outline_content, dict):
                return bad_request("Each page requires outline_content")
            description_content = item.get('description_content')
            if description_content is not None and not isinstance(description_content, dict):
                return bad_request("description_content must be an object")
            validated_pages.append((item, outline_content, description_content))

        last_page = Page.query.filter_by(project_id=project_id).order_by(Page.order_index.desc()).first()
        start_index = (last_page.order_index + 1) if last_page else 0
        created = []
        for offset, (item, outline_content, description_content) in enumerate(validated_pages):
            page = Page(
                project_id=project_id,
                order_index=start_index + offset,
                part=item.get('part'),
                status='DRAFT',
            )
            page.set_outline_content(outline_content)
            if description_content is not None:
                page.set_description_content(description_content)
                page.status = 'DESCRIPTION_GENERATED'
            db.session.add(page)
            created.append(page)

        project.updated_at = datetime.utcnow()
        record_ppt_revision(
            project,
            'page.batch_create',
            changed_page_ids=[page.id for page in created],
        )
        db.session.commit()
        return success_response({'pages': [page.to_dict() for page in created]}, status_code=201)
    except Exception as e:
        db.session.rollback()
        return error_response('SERVER_ERROR', str(e), 500)


@page_bp.route('/<project_id>/pages/<page_id>', methods=['DELETE'])
def delete_page(project_id, page_id):
    """
    DELETE /api/projects/{project_id}/pages/{page_id} - Delete page
    """
    try:
        page = Page.query.get(page_id)

        if not page or page.project_id != project_id:
            return not_found('Page')

        # Delete page image if exists
        file_service = FileService(current_app.config['UPLOAD_FOLDER'])
        file_service.delete_page_image(project_id, page_id)

        # Delete page
        db.session.delete(page)

        # Update project
        project = Project.query.get(project_id)
        if project:
            project.updated_at = datetime.utcnow()
            record_ppt_revision(project, 'page.delete', changed_page_ids=[page_id])

        db.session.commit()

        return success_response(message="Page deleted successfully")

    except Exception as e:
        db.session.rollback()
        return error_response('SERVER_ERROR', str(e), 500)


@page_bp.route('/<project_id>/pages/<page_id>', methods=['PUT'])
def update_page(project_id, page_id):
    """
    PUT /api/projects/{project_id}/pages/{page_id} - Update page fields

    Request body:
    {
        "part": "章节名"
    }
    """
    try:
        page = Page.query.get(page_id)

        if not page or page.project_id != project_id:
            return not_found('Page')

        data = request.get_json()

        if not data:
            return bad_request("Request body is required")

        # Update part field if provided
        if 'part' in data:
            page.part = data['part']

        page.updated_at = datetime.utcnow()

        # Update project
        if page.project:
            page.project.updated_at = datetime.utcnow()
            record_ppt_revision(page.project, 'page.update', changed_page_ids=[page.id])

        db.session.commit()

        return success_response(page.to_dict())

    except Exception as e:
        db.session.rollback()
        logger.error(f"Failed to update page {page_id}: {e}")
        return error_response('SERVER_ERROR', 'An internal server error occurred', 500)


@page_bp.route('/<project_id>/pages/<page_id>/template', methods=['POST', 'PATCH', 'DELETE'])
def update_page_template(project_id, page_id):
    try:
        page = Page.query.get(page_id)
        if not page or page.project_id != project_id:
            return not_found('Page')

        file_service = FileService(current_app.config['UPLOAD_FOLDER'])
        if request.method == 'POST':
            file = request.files.get('template_image')
            if not file or not file.filename:
                return bad_request("template_image is required")
            if not allowed_file(file.filename, current_app.config['ALLOWED_EXTENSIONS']):
                return bad_request("Invalid file type. Allowed types: png, jpg, jpeg, gif, webp")
            if page.template_image_path:
                file_service.delete_page_image_version(page.template_image_path)
            page.template_image_path = file_service.save_page_template_image(file, project_id, page_id)
        elif request.method == 'PATCH':
            data = request.get_json() or {}
            page.template_style_text = (data.get('template_style_text') or '').strip() or None
        else:
            if page.template_image_path:
                file_service.delete_page_image_version(page.template_image_path)
            page.template_image_path = None
            page.template_style_text = None

        page.updated_at = datetime.utcnow()
        if page.project:
            page.project.updated_at = datetime.utcnow()
            record_ppt_revision(page.project, 'page.template', changed_page_ids=[page.id])
        db.session.commit()
        return success_response(page.to_dict())
    except ValueError as e:
        db.session.rollback()
        return bad_request(str(e))
    except Exception as e:
        db.session.rollback()
        logger.error(f"Failed to update page template {page_id}: {e}")
        return error_response('SERVER_ERROR', 'An internal server error occurred', 500)


@page_bp.route('/<project_id>/pages/templates/auto-match', methods=['POST'])
def auto_match_page_templates(project_id):
    try:
        project = Project.query.get(project_id)
        if not project:
            return not_found('Project')

        data = request.get_json(silent=True) or {}
        overwrite_existing = bool(data.get('overwrite_existing', True))
        pages = Page.query.filter_by(project_id=project_id).order_by(Page.order_index.asc()).all()
        total_pages = len(pages)
        if not pages:
            return bad_request('Project has no pages')

        matched = []
        skipped = 0
        for page in pages:
            if not overwrite_existing and page.template_selection_source:
                skipped += 1
                continue
            role, layout, source, reason = _auto_match_page_template(page, project, total_pages)
            page.template_selection_role = role
            page.template_selection_layout = layout
            page.template_selection_source = source
            page.template_match_reason = reason
            page.updated_at = datetime.utcnow()
            matched.append({
                'page_id': page.id,
                'role': role,
                'layout': layout,
                'source': source,
                'reason': reason,
            })

        project.updated_at = datetime.utcnow()
        record_ppt_revision(
            project,
            'page.template_auto_match',
            changed_page_ids=[item['page_id'] for item in matched],
        )
        db.session.commit()
        return success_response({
            'matched': len(matched),
            'skipped': skipped,
            'pages': matched,
        })
    except Exception as e:
        db.session.rollback()
        logger.error(f"Failed to auto-match page templates for project {project_id}: {e}")
        return error_response('SERVER_ERROR', 'An internal server error occurred', 500)


@page_bp.route('/<project_id>/pages/<page_id>/outline', methods=['PUT'])
def update_page_outline(project_id, page_id):
    """
    PUT /api/projects/{project_id}/pages/{page_id}/outline - Edit page outline
    
    Request body:
    {
        "outline_content": {"title": "...", "points": [...]}
    }
    """
    try:
        page = Page.query.get(page_id)
        
        if not page or page.project_id != project_id:
            return not_found('Page')
        
        data = request.get_json()
        
        if not data or 'outline_content' not in data:
            return bad_request("outline_content is required")
        
        page.set_outline_content(data['outline_content'])
        page.updated_at = datetime.utcnow()
        
        # Update project
        project = Project.query.get(project_id)
        if project:
            project.updated_at = datetime.utcnow()
            record_ppt_revision(project, 'page.outline', changed_page_ids=[page.id])
        
        db.session.commit()
        
        return success_response(page.to_dict())
    
    except Exception as e:
        db.session.rollback()
        return error_response('SERVER_ERROR', str(e), 500)


@page_bp.route('/<project_id>/pages/<page_id>/description', methods=['PUT'])
def update_page_description(project_id, page_id):
    """
    PUT /api/projects/{project_id}/pages/{page_id}/description - Edit description
    
    Request body:
    {
        "description_content": {
            "title": "...",
            "text_content": ["...", "..."],
            "extra_fields": {"排版布局": "..."}
        }
    }
    """
    try:
        page = Page.query.get(page_id)
        
        if not page or page.project_id != project_id:
            return not_found('Page')
        
        data = request.get_json()
        
        if not data or 'description_content' not in data:
            return bad_request("description_content is required")
        
        page.set_description_content(data['description_content'])
        page.updated_at = datetime.utcnow()
        
        # Update project
        project = Project.query.get(project_id)
        if project:
            project.updated_at = datetime.utcnow()
            record_ppt_revision(project, 'page.description', changed_page_ids=[page.id])
        
        db.session.commit()
        
        return success_response(page.to_dict())
    
    except Exception as e:
        db.session.rollback()
        return error_response('SERVER_ERROR', str(e), 500)


@page_bp.route('/<project_id>/pages/<page_id>/generate/description', methods=['POST'])
def generate_page_description(project_id, page_id):
    """
    POST /api/projects/{project_id}/pages/{page_id}/generate/description - Generate single page description
    
    Request body:
    {
        "force_regenerate": false
    }
    """
    try:
        page = Page.query.get(page_id)
        
        if not page or page.project_id != project_id:
            return not_found('Page')
        
        project = Project.query.get(project_id)
        if not project:
            return not_found('Project')
        
        data = request.get_json() or {}
        force_regenerate = data.get('force_regenerate', False)
        language = data.get('language', current_app.config.get('OUTPUT_LANGUAGE', 'zh'))
        detail_level = data.get('detail_level', 'default')

        # Check if already generated
        if page.get_description_content() and not force_regenerate:
            return bad_request("Description already exists. Set force_regenerate=true to regenerate")
        
        # Get outline content
        outline_content = page.get_outline_content()
        if not outline_content:
            return bad_request("Page must have outline content first")
        
        # Reconstruct full outline
        all_pages = Page.query.filter_by(project_id=project_id).order_by(Page.order_index).all()
        outline = []
        for p in all_pages:
            oc = p.get_outline_content()
            if oc:
                page_data = oc.copy()
                if p.part:
                    page_data['part'] = p.part
                outline.append(page_data)
        
        # Initialize AI service
        ai_service = get_ai_service()
        
        # Get reference files content and create project context
        from controllers.project_controller import _get_project_reference_files_content
        reference_files_content = _get_project_reference_files_content(project_id)
        project_context = ProjectContext(project, reference_files_content)
        
        # Generate description
        page_data = outline_content.copy()
        if page.part:
            page_data['part'] = page.part
        
        desc_result = ai_service.generate_page_description(
            project_context,
            outline,
            page_data,
            page.order_index + 1,
            language=language,
            detail_level=detail_level
        )

        # Save description (generate_page_description returns dict with text + optional extra_fields)
        desc_content = {
            "text": desc_result['text'],
            "generated_at": datetime.utcnow().isoformat()
        }
        if desc_result.get('extra_fields'):
            desc_content['extra_fields'] = desc_result['extra_fields']
        
        page.set_description_content(desc_content)
        page.status = 'DESCRIPTION_GENERATED'
        page.updated_at = datetime.utcnow()
        
        db.session.commit()
        
        return success_response(page.to_dict())
    
    except Exception as e:
        db.session.rollback()
        return error_response('AI_SERVICE_ERROR', str(e), 503)


@page_bp.route('/<project_id>/pages/<page_id>/generate/image', methods=['POST'])
def generate_page_image(project_id, page_id):
    """
    POST /api/projects/{project_id}/pages/{page_id}/generate/image - Generate single page image
    
    Request body:
    {
        "use_template": true,
        "force_regenerate": false
    }
    """
    try:
        page = Page.query.get(page_id)
        
        if not page or page.project_id != project_id:
            return not_found('Page')
        
        project = Project.query.get(project_id)
        if not project:
            return not_found('Project')
        
        data = request.get_json() or {}
        use_template = data.get('use_template', True)
        force_regenerate = data.get('force_regenerate', False)
        language = data.get('language', current_app.config.get('OUTPUT_LANGUAGE', 'zh'))
        image_density, image_style, image_composition, image_restraint, image_style_prompt = _resolve_image_generation_options(data)
        quality_issues = normalize_quality_issues(data.get('quality_issues'))
        file_service = FileService(current_app.config['UPLOAD_FOLDER'])
        
        # Check if already generated
        if not force_regenerate and not prepare_page_for_image_generation(page, file_service):
            return bad_request("Image already exists. Set force_regenerate=true to regenerate")
        
        # Get description content
        desc_content = page.get_description_content()
        if not desc_content:
            return bad_request("Page must have description content first")
        
        # Reconstruct full outline with part structure
        all_pages = Page.query.filter_by(project_id=project_id).order_by(Page.order_index).all()
        outline = []
        current_part = None
        current_part_pages = []
        
        for p in all_pages:
            oc = p.get_outline_content()
            if not oc:
                continue
                
            page_data = oc.copy()
            
            # 如果当前页面属于一个 part
            if p.part:
                # 如果这是新的 part，先保存之前的 part（如果有）
                if current_part and current_part != p.part:
                    outline.append({
                        "part": current_part,
                        "pages": current_part_pages
                    })
                    current_part_pages = []
                
                current_part = p.part
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
        
        # Initialize services
        ai_service = get_ai_service()
        
        # Get template path
        ref_image_path = None
        if use_template:
            ref_image_path = file_service.get_template_path(project_id)
        
        # 检查是否有模板图片或风格描述
        # 如果都没有，则返回错误
        is_renovation = project.creation_type in {'renovation', 'ppt_renovation'}
        has_generation_style = image_style != 'theme' or bool(image_style_prompt)
        has_page_template = bool(page.template_image_path or page.template_style_text)
        if not is_renovation and not ref_image_path and not project.template_style and not has_page_template and not has_gorden_template_pack(project.template_pack_id) and not has_generation_style:
            return bad_request("No template image or style description found for project")
        
        # Generate prompt
        page_data = page.get_outline_content() or {}
        if page.part:
            page_data['part'] = page.part
        
        # 获取描述文本（可能是 text 字段或 text_content 数组）
        desc_text = desc_content.get('text', '')
        if not desc_text and desc_content.get('text_content'):
            # 如果 text 字段不存在，尝试从 text_content 数组获取
            text_content = desc_content.get('text_content', [])
            if isinstance(text_content, list):
                desc_text = '\n'.join(text_content)
            else:
                desc_text = str(text_content)
        
        # 从当前页面的描述内容中提取图片 URL（在生成 prompt 之前提取，以便告知 AI）
        additional_ref_images = []
        has_material_images = False
        
        # 从描述文本中提取图片
        if desc_text:
            image_urls = ai_service.extract_image_urls_from_markdown(desc_text)
            if image_urls:
                logger.info(f"Found {len(image_urls)} image(s) in page {page_id} description")
                additional_ref_images = image_urls
                has_material_images = True
        
        # 合并额外要求和风格描述
        combined_requirements = project.extra_requirements or ""
        if project.template_style:
            style_requirement = f"\n\nppt页面风格描述：\n\n{project.template_style}"
            combined_requirements = combined_requirements + style_requirement
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
        combined_requirements += build_quality_repair_requirements(quality_issues)
        
        # Create async task for image generation
        task = Task(
            project_id=project_id,
            task_type='GENERATE_PAGE_IMAGE',
            status='PENDING'
        )
        db.session.add(task)
        db.session.flush()
        latest_version = page.image_versions.first()
        manifest = build_image_generation_manifest(
            task_id=task.id,
            project_id=project.id,
            pages=[{
                'page_id': page.id,
                'page_index': page.order_index + 1,
                'current_version': latest_version.version_number if latest_version else 0,
                'protected': bool(page.generated_image_path),
            }],
            image_options={
                'use_template': use_template,
                'language': language,
                'max_workers': 1,
                'image_density': image_density,
                'image_style': image_style,
                'image_composition': image_composition,
                'image_restraint': image_restraint,
                'image_style_prompt': image_style_prompt,
                'quality_issues': quality_issues,
            },
            style_snapshot={
                'template_pack_id': project.template_pack_id,
                'template_style': project.template_style or '',
                'extra_requirements': project.extra_requirements or '',
                'aspect_ratio': get_ppt_settings(project)['image_aspect_ratio'],
                'resolution': current_app.config['DEFAULT_RESOLUTION'],
            },
        )
        manifest.update({
            'total': 1,
            'completed': 0,
            'failed': 0,
        })
        persist_image_generation_manifest(current_app.config['UPLOAD_FOLDER'], manifest)
        task.set_progress(manifest)
        db.session.commit()
        
        # Get app instance for background task
        app = current_app._get_current_object()
        image_prompt_field_names = get_image_prompt_field_names()
        
        # Submit background task
        task_manager.submit_task(
            task.id,
            generate_single_page_image_task,
            project_id,
            page_id,
            ai_service,
            file_service,
            outline,
            use_template,
            get_ppt_settings(project)['image_aspect_ratio'],
            current_app.config['DEFAULT_RESOLUTION'],
            app,
            combined_requirements if combined_requirements.strip() else None,
            language,
            image_prompt_field_names
        )
        
        # Return task_id immediately
        return success_response({
            'task_id': task.id,
            'page_id': page_id,
            'status': 'PENDING'
        }, status_code=202)
    
    except Exception as e:
        db.session.rollback()
        return error_response('AI_SERVICE_ERROR', str(e), 503)


@page_bp.route('/<project_id>/pages/<page_id>/edit/image', methods=['POST'])
def edit_page_image(project_id, page_id):
    """
    POST /api/projects/{project_id}/pages/{page_id}/edit/image - Edit page image
    
    Request body (JSON or multipart/form-data):
    {
        "edit_instruction": "更改文本框样式为虚线",
        "context_images": {
            "use_template": true,  // 是否使用template图片
            "desc_image_urls": ["url1", "url2"],  // desc中的图片URL列表
            "uploaded_image_ids": ["file1", "file2"]  // 上传的图片文件ID列表（在multipart中）
        }
    }
    
    For multipart/form-data:
    - edit_instruction: text field
    - use_template: text field (true/false)
    - desc_image_urls: JSON array string
    - context_images: file uploads (multiple files with key "context_images")
    """
    try:
        page = Page.query.get(page_id)
        
        if not page or page.project_id != project_id:
            return not_found('Page')
        
        if not page.generated_image_path:
            return bad_request("Page must have generated image first")
        
        project = Project.query.get(project_id)
        if not project:
            return not_found('Project')
        
        # Initialize services
        ai_service = get_ai_service()
        
        file_service = FileService(current_app.config['UPLOAD_FOLDER'])
        
        # Parse request data (support both JSON and multipart/form-data)
        if request.is_json:
            data = request.get_json()
            uploaded_files = []
        else:
            # multipart/form-data
            data = request.form.to_dict()
            # Get uploaded files
            uploaded_files = request.files.getlist('context_images')
            # Parse JSON fields
            if 'desc_image_urls' in data and data['desc_image_urls']:
                try:
                    data['desc_image_urls'] = json.loads(data['desc_image_urls'])
                except Exception:
                    data['desc_image_urls'] = []
            else:
                data['desc_image_urls'] = []
        
        if not data or 'edit_instruction' not in data:
            return bad_request("edit_instruction is required")
        
        # Get current image path
        current_image_path = file_service.get_absolute_path(page.generated_image_path)
        
        # Get original description if available
        original_description = None
        desc_content = page.get_description_content()
        if desc_content:
            # Extract text from description_content
            original_description = desc_content.get('text') or ''
            # If text is not available, try to construct from text_content
            if not original_description and desc_content.get('text_content'):
                if isinstance(desc_content['text_content'], list):
                    original_description = '\n'.join(desc_content['text_content'])
                else:
                    original_description = str(desc_content['text_content'])
        
        # Collect additional reference images
        additional_ref_images = []
        
        # 1. Add template image if requested
        context_images = data.get('context_images', {})
        if isinstance(context_images, dict):
            use_template = context_images.get('use_template', False)
        else:
            use_template = data.get('use_template', 'false').lower() == 'true'
        
        if use_template:
            template_path = None
            if page.template_image_path:
                candidate = Path(file_service.upload_folder) / page.template_image_path.replace('\\', '/')
                if candidate.exists() and candidate.is_file():
                    template_path = str(candidate)
            template_path = template_path or file_service.get_template_path(project_id)
            if not page.template_image_path:
                total_pages = Page.query.filter_by(project_id=project_id).count()
                page_data = page.get_outline_content() or {}
                role = page.template_selection_role or infer_image_page_role(
                    page.order_index + 1,
                    total_pages,
                    page_data,
                    page.part,
                )
                template_path = resolve_template_reference_path(
                    project.template_pack_id,
                    role,
                    template_path,
                )
            if template_path:
                additional_ref_images.append(template_path)
        
        # 2. Add desc image URLs if provided
        if isinstance(context_images, dict):
            desc_image_urls = context_images.get('desc_image_urls', [])
        else:
            desc_image_urls = data.get('desc_image_urls', [])
        
        if desc_image_urls:
            if isinstance(desc_image_urls, str):
                try:
                    desc_image_urls = json.loads(desc_image_urls)
                except Exception:
                    desc_image_urls = []
            if isinstance(desc_image_urls, list):
                additional_ref_images.extend(desc_image_urls)
        
        # 3. Save and add uploaded files to a persistent location
        temp_dir = None
        if uploaded_files:
            # Create a temporary directory in the project's upload folder
            import tempfile
            import shutil
            from werkzeug.utils import secure_filename
            temp_dir = Path(tempfile.mkdtemp(dir=current_app.config['UPLOAD_FOLDER']))
            try:
                for uploaded_file in uploaded_files:
                    if uploaded_file.filename:
                        # Save to temp directory
                        temp_path = temp_dir / secure_filename(uploaded_file.filename)
                        uploaded_file.save(str(temp_path))
                        additional_ref_images.append(str(temp_path))
            except Exception as e:
                # Clean up temp directory on error
                if temp_dir and temp_dir.exists():
                    shutil.rmtree(temp_dir)
                raise e
        
        # Create async task for image editing
        task = Task(
            project_id=project_id,
            task_type='EDIT_PAGE_IMAGE',
            status='PENDING'
        )
        task.set_progress({
            'total': 1,
            'completed': 0,
            'failed': 0
        })
        db.session.add(task)
        db.session.commit()
        
        # Get app instance for background task
        app = current_app._get_current_object()
        
        # Submit background task
        task_manager.submit_task(
            task.id,
            edit_page_image_task,
            project_id,
            page_id,
            data['edit_instruction'],
            ai_service,
            file_service,
            get_ppt_settings(project)['image_aspect_ratio'],
            current_app.config['DEFAULT_RESOLUTION'],
            original_description,
            additional_ref_images if additional_ref_images else None,
            str(temp_dir) if temp_dir else None,
            app
        )
        
        # Return task_id immediately
        return success_response({
            'task_id': task.id,
            'page_id': page_id,
            'status': 'PENDING'
        }, status_code=202)
    
    except Exception as e:
        db.session.rollback()
        return error_response('AI_SERVICE_ERROR', str(e), 503)



@page_bp.route('/<project_id>/pages/<page_id>/image-versions', methods=['GET'])
def get_page_image_versions(project_id, page_id):
    """
    GET /api/projects/{project_id}/pages/{page_id}/image-versions - Get all image versions for a page
    """
    try:
        page = Page.query.get(page_id)
        
        if not page or page.project_id != project_id:
            return not_found('Page')
        
        versions = PageImageVersion.query.filter_by(page_id=page_id)\
            .order_by(PageImageVersion.version_number.desc()).all()
        
        return success_response({
            'versions': [v.to_dict() for v in versions]
        })
    
    except Exception as e:
        return error_response('SERVER_ERROR', str(e), 500)


@page_bp.route(
    '/<project_id>/pages/<page_id>/image-versions/<version_id>/recover-scene',
    methods=['POST'],
)
def recover_page_image_scene(project_id, page_id, version_id):
    version = PageImageVersion.query.filter_by(id=version_id, page_id=page_id).first()
    if not version or not version.page or version.page.project_id != project_id:
        return not_found('Image Version')
    data = request.get_json(silent=True) or {}
    task = Task(project_id=project_id, task_type='RECOVER_IMAGE_SCENES', status='PENDING')
    db.session.add(task)
    db.session.flush()
    task.set_progress({
        'total': 1,
        'completed': 0,
        'failed': 0,
        'pages': [],
        '_resume': {
            'kind': 'historical-image-scenes',
            'kwargs': {
                'project_id': project_id,
                'version_ids': [version_id],
                'force': bool(data.get('force')),
            },
        },
    })
    db.session.commit()
    task_manager.submit_task(
        task.id,
        recover_historical_image_scenes_task,
        project_id,
        [version_id],
        FileService(current_app.config['UPLOAD_FOLDER']),
        current_app._get_current_object(),
        bool(data.get('force')),
    )
    return success_response({'task_id': task.id, 'status': 'PENDING'}, status_code=202)


@page_bp.route('/<project_id>/pages/<page_id>/image-versions/<version_id>/set-current', methods=['POST'])
def set_current_image_version(project_id, page_id, version_id):
    """
    POST /api/projects/{project_id}/pages/{page_id}/image-versions/{version_id}/set-current
    Set a specific version as the current one
    """
    try:
        page = Page.query.get(page_id)
        
        if not page or page.project_id != project_id:
            return not_found('Page')
        
        version = PageImageVersion.query.get(version_id)
        
        if not version or version.page_id != page_id:
            return not_found('Image Version')
        
        # Mark all versions as not current
        PageImageVersion.query.filter_by(page_id=page_id).update({'is_current': False})

        # Set this version as current
        version.is_current = True
        page.generated_image_path = version.image_path

        # 更新 cached_image_path，指向该版本的缓存图（如果存在）
        file_service = FileService(current_app.config['UPLOAD_FOLDER'])
        cached_relative_path = file_service.get_cached_image_path(project_id, page_id, version.version_number)
        if file_service.file_exists(cached_relative_path):
            page.cached_image_path = cached_relative_path
        else:
            # 缓存文件不存在，设置为 None，to_dict() 会回退到原图
            page.cached_image_path = None

        page.updated_at = datetime.utcnow()
        
        db.session.commit()
        
        return success_response(page.to_dict(include_versions=True))

    except Exception as e:
        db.session.rollback()
        return error_response('SERVER_ERROR', str(e), 500)


@page_bp.route('/<project_id>/pages/<page_id>/regenerate-renovation', methods=['POST'])
def regenerate_renovation_page(project_id, page_id):
    """
    POST /api/projects/{project_id}/pages/{page_id}/regenerate-renovation

    Re-parse the original PDF page and regenerate outline + description for PPT renovation projects.
    This re-runs the renovation pipeline for a single page.
    """
    try:
        page = Page.query.get(page_id)

        if not page or page.project_id != project_id:
            return not_found('Page')

        project = Project.query.get(project_id)
        if not project:
            return not_found('Project')

        # Verify this is a renovation project
        if project.creation_type != 'ppt_renovation':
            return bad_request("This endpoint is only for PPT renovation projects")

        data = request.get_json() or {}
        language = data.get('language', current_app.config.get('OUTPUT_LANGUAGE', 'zh'))
        keep_layout = data.get('keep_layout', False)

        # Find the split PDF for this page
        project_dir = Path(current_app.config['UPLOAD_FOLDER']) / project_id
        split_dir = project_dir / "split_pages"
        page_pdf_path = split_dir / f"page_{page.order_index + 1}.pdf"

        if not page_pdf_path.exists():
            return bad_request(f"Split PDF not found for page {page.order_index + 1}")

        # Initialize services
        ai_service = get_ai_service()
        from services.file_parser_service import FileParserService
        file_parser_service = FileParserService(
            mineru_api_base=current_app.config.get('MINERU_API_BASE', ''),
            mineru_token=current_app.config.get('MINERU_TOKEN', ''),
            google_api_key=current_app.config.get('GOOGLE_API_KEY', ''),
            ai_provider_format=current_app.config.get('AI_PROVIDER_FORMAT', 'gemini'),
            openai_api_key=current_app.config.get('OPENAI_API_KEY', ''),
            openai_api_base=current_app.config.get('OPENAI_API_BASE', ''),
            image_caption_model=current_app.config.get('IMAGE_CAPTION_MODEL', 'gemini-3-flash-preview'),
            lazyllm_image_caption_source=current_app.config.get('IMAGE_CAPTION_MODEL_SOURCE', ''),
            upload_folder=current_app.config.get('UPLOAD_FOLDER', 'uploads')
        )
        file_service = FileService(current_app.config['UPLOAD_FOLDER'])

        # Step 1: Parse page PDF → markdown
        logger.info(f"Regenerating renovation page {page.order_index + 1}: parsing PDF...")
        filename = f"page_{page.order_index + 1}.pdf"
        _batch_id, md_text, extract_id, error_msg, _failed = file_parser_service.parse_file(
            str(page_pdf_path), filename
        )

        if error_msg:
            logger.warning(f"Page {page.order_index + 1} parse warning: {error_msg}")

        md_text = md_text or ''

        # Supplement with header/footer from layout.json
        if extract_id:
            hf_text = file_parser_service.extract_header_footer_from_layout(extract_id)
            if hf_text:
                md_text = hf_text + '\n\n' + md_text

        if not md_text.strip():
            return error_response('PARSE_ERROR', f"Failed to extract content from page {page.order_index + 1}", 400)

        from services.material_import_service import import_reference_markdown_images_to_materials
        import_reference_markdown_images_to_materials(
            project_id=project_id,
            markdown_content=md_text,
            upload_folder=current_app.config['UPLOAD_FOLDER'],
        )

        # Step 2: AI extract structured content
        logger.info(f"Regenerating renovation page {page.order_index + 1}: extracting content...")
        content = ai_service.extract_page_content(md_text, language=language)

        # Step 3: Optional layout caption
        if keep_layout:
            try:
                image_path = None
                if page.cached_image_path:
                    image_path = file_service.get_absolute_path(page.cached_image_path)
                elif page.generated_image_path:
                    image_path = file_service.get_absolute_path(page.generated_image_path)
                if image_path and Path(image_path).exists():
                    caption = ai_service.generate_layout_caption(image_path)
                    if caption:
                        content['description'] = content.get('description', '') + f"\n\n{caption}"
            except Exception as e:
                logger.error(f"Layout caption failed for page {page.order_index + 1}: {e}")

        # Step 4: Update page in database
        title = content.get('title', f'Page {page.order_index + 1}')
        points = content.get('points', [])
        description = content.get('description', '')

        page.set_outline_content({
            'title': title,
            'points': points
        })
        page.set_description_content({
            "text": description,
            "generated_at": datetime.utcnow().isoformat()
        })
        page.status = 'DESCRIPTION_GENERATED'
        page.updated_at = datetime.utcnow()

        db.session.commit()

        logger.info(f"Regenerated renovation page {page.order_index + 1} successfully")

        return success_response(page.to_dict())

    except Exception as e:
        db.session.rollback()
        logger.error(f"Failed to regenerate renovation page: {e}", exc_info=True)
        return error_response('SERVER_ERROR', str(e), 500)


# ═══════════════════════════════════════════════════════════════════════════════
# 旁白 (Narration) 相关接口 — TTS 播报视频
# ═══════════════════════════════════════════════════════════════════════════════


@page_bp.route('/<project_id>/pages/<page_id>/narration', methods=['PUT'])
def update_page_narration(project_id, page_id):
    """
    PUT /api/projects/{project_id}/pages/{page_id}/narration - Edit narration text

    Request body:
    {
        "narration_text": "这段内容介绍了……"
    }
    """
    try:
        page = Page.query.get(page_id)

        if not page or page.project_id != project_id:
            return not_found('Page')

        data = request.get_json()

        if not data or ('narration_text' not in data and 'narration_segments' not in data):
            return bad_request("narration_text or narration_segments is required")

        ensure_legacy_narration_version(page)
        save_manual_narration_version(page, {
            'base_revision': data.get('base_revision', page.narration_revision or 0),
            'text': data.get('narration_text'),
            'segments': data.get('narration_segments'),
            'mode': data.get('mode') or ('dialogue' if has_dialogue_speakers(data.get('narration_segments')) else 'single'),
            'language': data.get('language', 'auto'),
        })

        project = Project.query.get(project_id)
        if project:
            project.updated_at = datetime.utcnow()

        db.session.commit()

        return success_response(page.to_dict())

    except NarrationRevisionConflict as e:
        db.session.rollback()
        return error_response('NARRATION_REVISION_CONFLICT', str(e), 409)
    except Exception as e:
        db.session.rollback()
        return error_response('SERVER_ERROR', str(e), 500)


@page_bp.route('/<project_id>/pages/<page_id>/generate/narration', methods=['POST'])
def generate_page_narration(project_id, page_id):
    """
    POST /api/projects/{project_id}/pages/{page_id}/generate/narration
    Generate narration text from description using AI.

    Request body:
    {
        "language": "zh",            // optional
        "force_regenerate": false     // optional
    }
    """
    try:
        page = Page.query.get(page_id)

        if not page or page.project_id != project_id:
            return not_found('Page')

        project = Project.query.get(project_id)
        if not project:
            return not_found('Project')

        data = request.get_json() or {}
        force_regenerate = data.get('force_regenerate', False)
        language = data.get('language', current_app.config.get('OUTPUT_LANGUAGE', 'zh'))

        # Need description content to generate narration
        desc_content = page.get_description_content()
        desc_text = ''
        if desc_content:
            desc_text = desc_content.get('text', '')
            if not desc_text and desc_content.get('text_content'):
                text_content = desc_content.get('text_content', [])
                desc_text = '\n'.join(text_content) if isinstance(text_content, list) else str(text_content)

        outline_content = page.get_outline_content() or {}

        # Fallback: if no description, use outline
        if not desc_text:
            title = outline_content.get('title', '')
            points = outline_content.get('points', [])
            if title or points:
                desc_text = f"{title}\n" + '\n'.join(f'- {p}' for p in points)
            else:
                return bad_request("Page must have description or outline content to generate narration")

        # Get total page count for prompt context
        total_pages = Page.query.filter_by(project_id=project_id).count()

        # Generate narration using AI
        ai_service = get_ai_service()
        from services.prompts import (
            get_dialogue_narration_generation_prompt,
            get_narration_generation_prompt,
            normalize_narration_generation_config,
            parse_dialogue_narration_result,
            parse_narration_generation_result,
        )
        narration_config = normalize_narration_generation_config(
            data.get('narration_config'),
            fallback_topic=(
                get_spine_source_fields(project)['idea_prompt']
                or outline_content.get('title', '')
            ),
        )
        narration_mode = data.get('narration_mode') or narration_config.get('narration_mode') or 'single'
        narration_mode = narration_mode if narration_mode in {'single', 'dialogue'} else 'single'
        speakers = normalize_speakers(
            data.get('speakers') or narration_config.get('speakers'),
            default_voice=current_app.config.get('TTS_DEFAULT_VOICE_ZH', 'zh-CN-XiaoxiaoNeural'),
        )
        narration_config['narration_mode'] = narration_mode
        narration_config['speakers'] = speakers
        config_hash = narration_config_hash(narration_config, narration_mode, speakers)
        source_hash = narration_source_hash(page, narration_config, narration_mode, speakers)
        has_existing_narration = bool(
            (page.narration_text or '').strip() or page.get_narration_segments()
        )
        dialogue_ready = narration_mode != 'dialogue' or has_dialogue_speakers(page.get_narration_segments())
        if has_existing_narration and dialogue_ready and not force_regenerate and page_narration_is_current(page, source_hash, config_hash):
            return success_response(page.to_dict())
        prompt_builder = get_dialogue_narration_generation_prompt if narration_mode == 'dialogue' else get_narration_generation_prompt
        prompt = prompt_builder(
            pages=[{
                'page_index': page.order_index + 1,
                'title': outline_content.get('title', ''),
                'points': outline_content.get('points', []),
                'description_text': desc_text,
            }],
            language=language,
            config=narration_config,
        )

        narration = ai_service.text_provider.generate_text(prompt)
        parsed = parse_dialogue_narration_result(narration) if narration_mode == 'dialogue' else parse_narration_generation_result(narration)
        parsed_value = parsed.get(page.order_index + 1)
        if narration_mode == 'dialogue' and parsed_value is None and len(parsed) == 1:
            parsed_value = next(iter(parsed.values()))
        if narration_mode == 'single' and not parsed_value and narration and narration.strip():
            parsed_value = narration.strip()
        if not parsed_value:
            return error_response('AI_SERVICE_ERROR', 'AI returned empty narration', 503)

        set_page_narration(
            page,
            text=parsed_value if isinstance(parsed_value, str) else None,
            segments=parsed_value if isinstance(parsed_value, list) else None,
            source_hash=source_hash,
            config_hash=config_hash,
        )
        page.updated_at = datetime.utcnow()
        db.session.commit()

        return success_response(page.to_dict())

    except Exception as e:
        db.session.rollback()
        return error_response('AI_SERVICE_ERROR', str(e), 503)


@page_bp.route('/<project_id>/generate/narrations', methods=['POST'])
def generate_all_narrations(project_id):
    """
    POST /api/projects/{project_id}/generate/narrations
    Batch generate narration text for all pages that have descriptions.

    Request body:
    {
        "language": "zh",            // optional
        "force_regenerate": false     // optional
    }
    """
    try:
        project = Project.query.get(project_id)
        if not project:
            return not_found('Project')

        data = request.get_json() or {}
        force_regenerate = data.get('force_regenerate', False)
        language = data.get('language', current_app.config.get('OUTPUT_LANGUAGE', 'zh'))

        pages = Page.query.filter_by(project_id=project_id).order_by(Page.order_index).all()
        if not pages:
            return bad_request("No pages found for project")

        total_pages = len(pages)
        ai_service = get_ai_service()
        from services.prompts import (
            get_dialogue_narration_generation_prompt,
            get_narration_generation_prompt,
            normalize_narration_generation_config,
            parse_dialogue_narration_result,
            parse_narration_generation_result,
        )
        narration_config = normalize_narration_generation_config(
            data.get('narration_config'),
            fallback_topic=get_spine_source_fields(project)['idea_prompt'],
        )
        narration_mode = data.get('narration_mode') or narration_config.get('narration_mode') or 'single'
        narration_mode = narration_mode if narration_mode in {'single', 'dialogue'} else 'single'
        speakers = normalize_speakers(
            data.get('speakers') or narration_config.get('speakers'),
            default_voice=current_app.config.get('TTS_DEFAULT_VOICE_ZH', 'zh-CN-XiaoxiaoNeural'),
        )
        narration_config['narration_mode'] = narration_mode
        narration_config['speakers'] = speakers
        config_hash = narration_config_hash(narration_config, narration_mode, speakers)

        generated = 0
        skipped = 0
        failed = 0

        for page in pages:
            source_hash = narration_source_hash(page, narration_config, narration_mode, speakers)
            has_existing_narration = bool(
                (page.narration_text or '').strip() or page.get_narration_segments()
            )
            dialogue_ready = narration_mode != 'dialogue' or has_dialogue_speakers(page.get_narration_segments())
            if has_existing_narration and dialogue_ready and not force_regenerate and page_narration_is_current(page, source_hash, config_hash):
                skipped += 1
                continue

            # Get description text
            desc_content = page.get_description_content()
            desc_text = ''
            if desc_content:
                desc_text = desc_content.get('text', '')
                if not desc_text and desc_content.get('text_content'):
                    text_content = desc_content.get('text_content', [])
                    desc_text = '\n'.join(text_content) if isinstance(text_content, list) else str(text_content)

            outline_content = page.get_outline_content() or {}

            if not desc_text:
                title = outline_content.get('title', '')
                points = outline_content.get('points', [])
                if title or points:
                    desc_text = f"{title}\n" + '\n'.join(f'- {p}' for p in points)
                else:
                    skipped += 1
                    continue

            try:
                prompt_builder = get_dialogue_narration_generation_prompt if narration_mode == 'dialogue' else get_narration_generation_prompt
                prompt = prompt_builder(
                    pages=[{
                        'page_index': page.order_index + 1,
                        'title': outline_content.get('title', ''),
                        'points': outline_content.get('points', []),
                        'description_text': desc_text,
                    }],
                    language=language,
                    config=narration_config,
                )
                narration = ai_service.text_provider.generate_text(prompt)
                parsed = parse_dialogue_narration_result(narration) if narration_mode == 'dialogue' else parse_narration_generation_result(narration)
                parsed_value = parsed.get(page.order_index + 1)
                if narration_mode == 'dialogue' and parsed_value is None and len(parsed) == 1:
                    parsed_value = next(iter(parsed.values()))
                if narration_mode == 'single' and not parsed_value and narration and narration.strip():
                    parsed_value = narration.strip()

                if parsed_value:
                    set_page_narration(
                        page,
                        text=parsed_value if isinstance(parsed_value, str) else None,
                        segments=parsed_value if isinstance(parsed_value, list) else None,
                        source_hash=source_hash,
                        config_hash=config_hash,
                    )
                    page.updated_at = datetime.utcnow()
                    generated += 1
                else:
                    failed += 1
            except Exception as e:
                logger.error(f"Failed to generate narration for page {page.id}: {e}")
                failed += 1

        db.session.commit()

        return success_response(
            data={
                "total": total_pages,
                "generated": generated,
                "skipped": skipped,
                "failed": failed,
                "pages": [p.to_dict() for p in pages],
            },
            message=f"Generated narration for {generated}/{total_pages} pages"
        )

    except Exception as e:
        db.session.rollback()
        return error_response('SERVER_ERROR', str(e), 500)
