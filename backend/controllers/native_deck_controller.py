"""Native deck layout, save, and generation endpoints."""

from flask import Blueprint, current_app, request

from models import Page, Project, Task, db
from services.ai_service_manager import get_ai_service
from services.native_deck_service import NativeDeckService
from services.task_manager import generate_native_deck_task, task_manager
from utils import bad_request, not_found, success_response


native_deck_bp = Blueprint('native_deck', __name__, url_prefix='/api')


@native_deck_bp.get('/native-deck/layouts')
def list_native_layouts():
    role = request.args.get('role')
    theme = request.args.get('theme')
    raw_media = request.args.get('needs_media')
    needs_media = None
    if raw_media is not None:
        if raw_media.lower() not in {'true', 'false'}:
            return bad_request('needs_media must be true or false')
        needs_media = raw_media.lower() == 'true'
    layouts = NativeDeckService().list_layouts(role=role, needs_media=needs_media, theme=theme)
    return success_response({'layouts': layouts})


@native_deck_bp.put('/projects/<project_id>/pages/<page_id>/native')
def save_native_page(project_id, page_id):
    project = db.session.get(Project, project_id)
    if not project:
        return not_found('Project')
    if project.render_mode != 'native':
        return bad_request('只有原生可编辑项目可以保存原生页面')

    page = Page.query.filter_by(id=page_id, project_id=project_id).first()
    if not page:
        return not_found('Page')
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or set(data) != {'layout', 'props'}:
        return bad_request('请求只允许 layout 和 props')

    try:
        slide = NativeDeckService().normalize_slide(data['layout'], data['props'])
    except (KeyError, ValueError) as exc:
        return bad_request(str(exc))

    page.native_layout = slide['layout']
    page.set_native_props(slide['props'])
    page.status = 'NATIVE_GENERATED'
    db.session.commit()
    return success_response(page.to_dict())


@native_deck_bp.get('/projects/<project_id>/pages/<page_id>/native/versions')
def list_native_page_versions(project_id, page_id):
    project = db.session.get(Project, project_id)
    if not project:
        return not_found('Project')
    page = Page.query.filter_by(id=page_id, project_id=project_id).first()
    if not page:
        return not_found('Page')
    return success_response({'versions': page.native_version_list()})


@native_deck_bp.put('/projects/<project_id>/pages/<page_id>/native/versions/<version_id>')
def restore_native_page_version(project_id, page_id, version_id):
    project = db.session.get(Project, project_id)
    if not project:
        return not_found('Project')
    if project.render_mode != 'native':
        return bad_request('只有原生可编辑项目可以切换页面版本')
    page = Page.query.filter_by(id=page_id, project_id=project_id).first()
    if not page:
        return not_found('Page')
    if not page.restore_native_version(version_id):
        return not_found('Native page version')
    db.session.commit()
    return success_response(page.to_dict())


@native_deck_bp.post('/projects/<project_id>/generate/native-deck')
def generate_native_deck(project_id):
    project = db.session.get(Project, project_id)
    if not project:
        return not_found('Project')
    if project.render_mode != 'native':
        return bad_request('只有原生可编辑项目可以生成原生页面')

    data = request.get_json(silent=True) or {}
    requested_page_ids = data.get('page_ids')
    if requested_page_ids is not None and (not isinstance(requested_page_ids, list) or not requested_page_ids or any(not isinstance(item, str) for item in requested_page_ids)):
        return bad_request('page_ids 必须是非空文本数组')
    pages_query = Page.query.filter_by(project_id=project_id)
    if requested_page_ids:
        pages_query = pages_query.filter(Page.id.in_(requested_page_ids))
    page_count = pages_query.count()
    if not page_count:
        return bad_request('请先生成大纲页面')

    task = Task(project_id=project_id, task_type='GENERATE_NATIVE_DECK', status='PENDING')
    task.set_progress({'total': page_count, 'completed': 0, 'failed': 0, 'page_ids': requested_page_ids})
    db.session.add(task)
    db.session.commit()
    task_manager.submit_task(
        task.id,
        generate_native_deck_task,
        project_id,
        get_ai_service(),
        page_ids=requested_page_ids,
        app=current_app._get_current_object(),
    )
    return success_response(task.to_dict(), status_code=202)
