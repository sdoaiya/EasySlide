"""Content Spine and workspace APIs."""

import json
import os
import re

from flask import Blueprint, current_app, request
from werkzeug.utils import secure_filename

from models import ContentSyncProposal, Project, ProjectWorkspace, Task, db
from services.content_sync_service import (
    SyncProposalStateError,
    SyncRevisionConflict,
    apply_sync_proposal,
    create_sync_proposal,
    proposal_to_dict,
    reject_sync_proposal,
    restore_workspace,
)
from services.content_spine_service import (
    SpineRevisionConflict,
    confirm_spine,
    get_project_brief,
    optimize_positioning,
    resolve_initial_workspace,
    revise_spine,
    spine_to_dict,
)
from services.ai_service_manager import get_ai_service
from services.project_workspace_service import (
    SpineNotConfirmed,
    WorkspaceRevisionConflict,
    initialize_video_workspace_from_ppt,
    queue_workspace_initialization,
    save_workspace_revision,
    preflight_video_audio_materials,
    version_to_dict,
    workspace_to_dict,
)
from services.ppt_workspace_service import propose_ppt_to_spine
from services.task_manager import (
    export_podcast_workspace_task,
    export_video_workspace_task,
    initialize_content_workspace_task,
    task_manager,
)
from services.video_workspace_service import propose_video_to_spine
from services.podcast_service import propose_podcast_to_spine
from utils import bad_request, error_response, not_found, rate_limit_error, success_response


content_workspace_bp = Blueprint(
    'content_workspaces', __name__, url_prefix='/api/content-projects',
)


def _resolve_workspace_video_voice(body, voice_config):
    """解析视频工作区导出音色，返回 ``(voice, tts_provider)``。

    优先级：请求体 ``voice`` → 工作区设置 ``voice_config.voice``
    （编辑页面选择 / 转换向导固化）→ 全局默认。
    canonical ID 归一化与引擎推导复用 voice_catalog 的统一规则。
    """
    from services.voice_catalog_service import normalize_export_voice

    raw = str(body.get('voice') or '').strip()
    if not raw:
        raw = str((voice_config or {}).get('voice') or '').strip()
    voice, provider = normalize_export_voice(raw)
    if voice:
        return voice, provider or 'edge'
    from services.tts_video_service import get_default_voice
    language = str((voice_config or {}).get('language') or body.get('language') or 'zh')
    return get_default_voice(language, dict(current_app.config)), 'edge'


def submit_workspace_task(task: Task, app) -> None:
    resume = task.get_progress()['_resume']
    task_manager.submit_task(
        task.id,
        initialize_content_workspace_task,
        app=app,
        **resume['kwargs'],
    )


def workspace_initialization_task_summary(task: Task, workspace_kind: str) -> dict:
    """Return the public creation/initialization task contract without frozen inputs."""
    progress = task.get_progress()
    return {
        'task_id': task.id,
        'task_type': task.task_type,
        'workspace_kind': workspace_kind,
        'status': task.status,
        'progress': {
            'total': progress.get('total', 1),
            'completed': progress.get('completed', 0),
            'failed': progress.get('failed', 0),
            'stage': progress.get('stage'),
        },
        'error_message': task.error_message,
        'created_at': task.created_at.isoformat() if task.created_at else None,
        'completed_at': task.completed_at.isoformat() if task.completed_at else None,
    }


@content_workspace_bp.route('/<project_id>', methods=['GET'])
def get_content_project(project_id):
    project = db.session.get(Project, project_id)
    if not project or not project.content_spine:
        return not_found('Content project')
    return success_response({
        'project_id': project.id,
        'project_title': project.project_title,
        'lifecycle_state': project.status,
        'last_workspace': resolve_initial_workspace(project, project.last_workspace),
        'brief': get_project_brief(project),
        'project_settings': {
            'pronunciation_lexicon': project.get_pronunciation_lexicon(),
            'narration_preferences': project.get_narration_preferences(),
        },
        'spine': spine_to_dict(project.content_spine),
        'workspaces': [workspace_to_dict(item) for item in project.workspaces],
        'pending_sync_count': sum(
            item.status in {'pending', 'partially_applied'}
            for item in project.sync_proposals
        ),
        'created_at': project.created_at.isoformat() if project.created_at else None,
        'updated_at': project.updated_at.isoformat() if project.updated_at else None,
    })


@content_workspace_bp.route('/<project_id>/last-workspace', methods=['PUT'])
def set_last_workspace(project_id):
    project = db.session.get(Project, project_id)
    if not project or not project.content_spine:
        return not_found('Content project')
    data = request.get_json() or {}
    entry = data.get('entry')
    # Legacy 'spine' values are accepted for old clients but normalized to a
    # real target workspace so navigation never depends on the retired page.
    if entry not in {'spine', 'ppt', 'video', 'podcast'}:
        return bad_request('entry must be spine, ppt, video, or podcast')
    resolved = resolve_initial_workspace(project, entry)
    project.last_workspace = resolved
    db.session.commit()
    return success_response({'project_id': project.id, 'last_workspace': resolved})


@content_workspace_bp.route('/<project_id>/spine', methods=['PUT'])
def update_content_spine(project_id):
    project = db.session.get(Project, project_id)
    if not project or not project.content_spine:
        return not_found('Content project')
    data = request.get_json() or {}
    if not isinstance(data.get('document'), dict) or not isinstance(data.get('expected_revision'), int):
        return bad_request('document and expected_revision are required')
    try:
        revise_spine(
            project.content_spine,
            data['document'],
            data['expected_revision'],
        )
        db.session.commit()
        return success_response(spine_to_dict(project.content_spine))
    except SpineRevisionConflict as exc:
        db.session.rollback()
        return error_response('SPINE_REVISION_CONFLICT', str(exc), 409)
    except ValueError as exc:
        db.session.rollback()
        return bad_request(str(exc))


@content_workspace_bp.route('/<project_id>/spine/optimize', methods=['POST'])
def optimize_content_spine(project_id):
    """Generate editable positioning suggestions without persisting them."""
    project = db.session.get(Project, project_id)
    if not project or not project.content_spine:
        return not_found('Content project')
    data = request.get_json() or {}
    if not isinstance(data, dict):
        return bad_request('request body must be an object')

    document = json.loads(project.content_spine.document_json)
    values = {}
    for field in ('topic', 'audience', 'goal'):
        value = data.get(field)
        if value is None:
            value = (document.get(field) or {}).get('value', '')
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
        current_app.logger.exception('Content Spine optimization failed')
        return error_response('AI_SERVICE_ERROR', str(exc), 503)


@content_workspace_bp.route('/<project_id>/spine/confirm', methods=['POST'])
def confirm_content_spine(project_id):
    project = db.session.get(Project, project_id)
    if not project or not project.content_spine:
        return not_found('Content project')
    data = request.get_json() or {}
    if not isinstance(data.get('expected_revision'), int):
        return bad_request('expected_revision is required')
    try:
        confirm_spine(project.content_spine, data['expected_revision'])
        db.session.commit()
        return success_response(spine_to_dict(project.content_spine))
    except SpineRevisionConflict as exc:
        db.session.rollback()
        return error_response('SPINE_REVISION_CONFLICT', str(exc), 409)
    except ValueError as exc:
        db.session.rollback()
        return bad_request(str(exc))


@content_workspace_bp.route(
    '/<project_id>/workspaces/<workspace_kind>/initialize', methods=['POST'],
)
def initialize_content_workspace(project_id, workspace_kind):
    project = db.session.get(Project, project_id)
    if not project or not project.content_spine:
        return not_found('Content project')
    data = request.get_json() or {}
    settings = data.get('settings') or {}
    if not isinstance(settings, dict):
        return bad_request('settings must be an object')
    try:
        task = queue_workspace_initialization(
            project,
            workspace_kind,
            settings=settings,
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
            'workspace_kind': workspace_kind,
            'task_id': task.id,
            'status': task.status,
            'initialization_task': workspace_initialization_task_summary(task, workspace_kind),
        }, status_code=202)
    except SpineNotConfirmed as exc:
        db.session.rollback()
        return error_response('SPINE_CONFIRMATION_REQUIRED', str(exc), 409)
    except ValueError as exc:
        db.session.rollback()
        return bad_request(str(exc))
    except Exception as exc:
        db.session.rollback()
        return error_response('SERVER_ERROR', str(exc), 500)


@content_workspace_bp.route(
    '/<project_id>/workspaces/<workspace_kind>', methods=['PUT'],
)
def update_content_workspace(project_id, workspace_kind):
    if workspace_kind not in {'video', 'podcast'}:
        return bad_request('Only video and podcast documents use this endpoint')
    workspace = ProjectWorkspace.query.filter_by(
        project_id=project_id,
        kind=workspace_kind,
    ).one_or_none()
    if not workspace or not workspace.current_version_id:
        return not_found('Workspace')
    data = request.get_json() or {}
    if not isinstance(data.get('base_revision'), int):
        return bad_request('base_revision is required')
    if not isinstance(data.get('document'), dict):
        return bad_request('document must be an object')
    settings = data.get('settings', workspace_to_dict(workspace)['settings'])
    if not isinstance(settings, dict):
        return bad_request('settings must be an object')
    source_type = data.get('source_type', 'manual')
    if source_type not in {'manual', 'ai'}:
        return bad_request('source_type must be manual or ai')
    try:
        version = save_workspace_revision(
            workspace,
            data['document'],
            settings,
            expected_revision=data['base_revision'],
            source_type=source_type,
        )
        db.session.commit()
        return success_response({
            'workspace': workspace_to_dict(workspace),
            'version': version_to_dict(version),
        })
    except WorkspaceRevisionConflict as exc:
        db.session.rollback()
        return error_response('WORKSPACE_REVISION_CONFLICT', str(exc), 409)
    except ValueError as exc:
        db.session.rollback()
        return bad_request(str(exc))


@content_workspace_bp.route(
    '/<project_id>/workspaces/video/initialize-from-ppt', methods=['POST'],
)
def initialize_video_from_ppt(project_id):
    """Deprecated PPT → video shortcut (reconstruction plan §11.5).

    The reconstruction flow replaces this synchronous write with a
    workspace generation run (candidate → review → publish). New UI must
    not call this endpoint. During the compatibility period it stays
    available behind LEGACY_WORKSPACE_INITIALIZATION_ENABLED.
    """
    if str(os.getenv('LEGACY_WORKSPACE_INITIALIZATION_ENABLED', 'true')).lower() not in {'1', 'true', 'yes'}:
        return error_response(
            'DEPRECATED_WORKSPACE_INITIALIZATION',
            'PPT 转视频已迁移到生成运行流程，请从 PPT 编辑器的项目操作中发起。',
            410,
        )
    project = db.session.get(Project, project_id)
    if not project or not project.content_spine:
        return not_found('Content project')
    data = request.get_json() or {}
    settings = data.get('settings') or {}
    if not isinstance(settings, dict):
        return bad_request('settings must be an object')
    try:
        workspace = initialize_video_workspace_from_ppt(project, settings)
        db.session.commit()
        return success_response(workspace_to_dict(workspace), status_code=201)
    except SpineNotConfirmed as exc:
        db.session.rollback()
        return error_response('SPINE_CONFIRMATION_REQUIRED', str(exc), 409)
    except ValueError as exc:
        db.session.rollback()
        return bad_request(str(exc))


@content_workspace_bp.route('/<project_id>/workspaces/video/export', methods=['POST'])
def export_video_workspace(project_id):
    project = db.session.get(Project, project_id)
    workspace = ProjectWorkspace.query.filter_by(project_id=project_id, kind='video').one_or_none()
    if not project or not workspace or not workspace.current_version:
        return not_found('Video workspace')
    data = request.get_json() or {}
    render_profile = str(data.get('render_profile') or 'final').strip().lower()
    if render_profile not in {'proof', 'final'}:
        return bad_request('render_profile must be proof or final')
    source_proof_task_id = str(data.get('source_proof_task_id') or '').strip() or None
    if source_proof_task_id and render_profile != 'final':
        return bad_request('source_proof_task_id is only valid for final export')
    default_filename = (
        f'video_workspace_{project_id}.proof.mp4'
        if render_profile == 'proof'
        else f'video_workspace_{project_id}.mp4'
    )
    filename = secure_filename(str(data.get('filename') or '')) or default_filename
    if not filename.lower().endswith('.mp4'):
        filename += '.mp4'
    try:
        from services.file_service import FileService
        from services.video_workspace_export_snapshot import (
            create_video_workspace_export_snapshot,
            load_video_workspace_export_snapshot,
        )

        file_service = FileService(current_app.config['UPLOAD_FOLDER'])
        def resolve_upload_path(path):
            if not path:
                return None
            normalized = str(path).replace('\\', '/').lstrip('/')
            if normalized.startswith('files/'):
                normalized = normalized[6:]
            candidate = file_service.get_absolute_path(normalized)
            return candidate if os.path.isfile(candidate) else None

        document = json.loads(workspace.current_version.document_json)
        preflight_video_audio_materials(
            project_id,
            document,
        )
        workspace_settings = json.loads(workspace.current_version.settings_json or '{}')
        voice_config = workspace_settings.get('voice_config') or {}
        voice, tts_provider = _resolve_workspace_video_voice(data, voice_config)
        if tts_provider == 'fish_audio' and not voice:
            raise ValueError('Fish Audio 导出需要选择克隆声音。')
        try:
            speed = float(data.get('speed', voice_config.get('speed', 1.0)))
        except (TypeError, ValueError):
            speed = 1.0
        speed = max(0.7, min(speed, 1.2))
        rate = str(data.get('rate') or '+0%')

        if source_proof_task_id:
            proof_task = db.session.get(Task, source_proof_task_id)
            if (
                not proof_task
                or proof_task.project_id != project_id
                or proof_task.task_type != 'EXPORT_VIDEO_WORKSPACE'
                or proof_task.status != 'COMPLETED'
            ):
                raise ValueError('source_proof_task_id must reference a completed proof export')
            proof_kwargs = proof_task.get_progress().get('_resume', {}).get('kwargs', {})
            if proof_kwargs.get('render_profile') != 'proof':
                raise ValueError('source_proof_task_id must reference a proof export')
            proof_snapshot_path = proof_kwargs.get('snapshot_path')
            proof_snapshot_hash = proof_kwargs.get('snapshot_hash')
            if not isinstance(proof_snapshot_path, str) or not isinstance(proof_snapshot_hash, str):
                raise ValueError('proof export is missing a valid snapshot reference')
            if proof_kwargs.get('workspace_version_id') != workspace.current_version.id:
                raise ValueError('proof export does not match the current workspace version')
            frozen = load_video_workspace_export_snapshot(
                proof_snapshot_path, proof_snapshot_hash,
            )
            if frozen.get('workspace_version', {}).get('id') != workspace.current_version.id:
                raise ValueError('proof snapshot does not match the current workspace version')
            snapshot = {
                'path': proof_snapshot_path,
                'sha256': proof_snapshot_hash,
                'snapshot': frozen,
            }
        else:
            snapshot = create_video_workspace_export_snapshot(
                project_id=project_id,
                workspace_version=workspace.current_version,
                upload_root=current_app.config['UPLOAD_FOLDER'],
                page_lookup=lambda page_id: next(
                    (page for page in project.pages if page.id == page_id), None,
                ),
                path_resolver=resolve_upload_path,
                export_config={
                    'voice': voice,
                    'rate': rate,
                    'speed': speed,
                    'tts_provider': tts_provider,
                    'enable_ken_burns': bool(data.get('enable_ken_burns', False)),
                },
            )
        task = Task(project_id=project_id, task_type='EXPORT_VIDEO_WORKSPACE', status='PENDING')
        task.set_progress({'_resume': {'kind': 'video_workspace', 'kwargs': {
            'project_id': project_id, 'filename': filename,
            'snapshot_path': snapshot['path'], 'snapshot_hash': snapshot['sha256'],
            'workspace_version_id': workspace.current_version.id,
            'render_profile': render_profile,
            'source_proof_task_id': source_proof_task_id,
            **snapshot['snapshot']['export_config'],
        }}})
        db.session.add(task)
        db.session.commit()
        task_manager.submit_task(
            task.id, export_video_workspace_task,
            app=current_app._get_current_object(),
            **task.get_progress()['_resume']['kwargs'],
        )
        return success_response({
            'task_id': task.id,
            'workspace_version': snapshot['snapshot']['workspace_version'],
            'render_profile': render_profile,
            'source_proof_task_id': source_proof_task_id,
        }, status_code=202)
    except ValueError as exc:
        db.session.rollback()
        return bad_request(str(exc))


@content_workspace_bp.route('/<project_id>/workspaces/video/browser-frames', methods=['POST'])
def handoff_video_workspace_browser_frames(project_id):
    project = db.session.get(Project, project_id)
    if not project:
        return not_found('Project')
    workspace = ProjectWorkspace.query.filter_by(project_id=project_id, kind='video').one_or_none()
    if not workspace or not workspace.current_version:
        return success_response({'attached': False})
    if workspace.source_kind != 'ppt':
        return success_response({'attached': False})
    try:
        page_ids = json.loads(request.form.get('page_ids', '[]'))
        frame_counts = json.loads(request.form.get('frame_counts', '[]'))
    except json.JSONDecodeError:
        return bad_request('page_ids 和 frame_counts 必须是有效 JSON')
    frames = request.files.getlist('frames')
    if (
        not isinstance(page_ids, list) or not page_ids
        or any(not isinstance(page_id, str) for page_id in page_ids)
        or not isinstance(frame_counts, list) or len(frame_counts) != len(page_ids)
        or any(not isinstance(count, int) or count < 1 or count > 4 for count in frame_counts)
        or sum(frame_counts) != len(frames)
    ):
        return bad_request('每页必须交接 1-4 张连续阶段帧')
    document = json.loads(workspace.current_version.document_json)
    expected_page_ids = [
        scene.get('visual', {}).get('source_ref')
        for scene in document.get('scenes', [])
        if scene.get('visual', {}).get('kind') in {'page', 'native_scene'}
    ]
    if page_ids != expected_page_ids:
        return bad_request('Browser Frames 页面顺序与视频工作区场景不一致')
    try:
        from PIL import Image
        from services.video_workspace_export_snapshot import save_browser_frame_handoff

        for frame in frames:
            Image.open(frame.stream).verify()
            frame.stream.seek(0)
        settings = json.loads(workspace.current_version.settings_json or '{}')
        settings['browser_frame_handoff'] = save_browser_frame_handoff(
            project_id=project_id,
            page_ids=page_ids,
            frame_counts=frame_counts,
            frames=frames,
            upload_root=current_app.config['UPLOAD_FOLDER'],
        )
        version = save_workspace_revision(
            workspace,
            document,
            settings,
            expected_revision=workspace.revision,
            source_type='sync',
        )
        db.session.commit()
        return success_response({
            'attached': True,
            'workspace': workspace_to_dict(workspace),
            'version': version_to_dict(version),
        })
    except WorkspaceRevisionConflict as exc:
        db.session.rollback()
        return error_response('WORKSPACE_REVISION_CONFLICT', str(exc), 409)
    except Exception as exc:
        db.session.rollback()
        return bad_request(str(exc))


@content_workspace_bp.route('/<project_id>/workspaces/podcast/export', methods=['POST'])
def export_podcast_workspace(project_id):
    project = db.session.get(Project, project_id)
    workspace = ProjectWorkspace.query.filter_by(project_id=project_id, kind='podcast').one_or_none()
    if not project or not workspace or not workspace.current_version:
        return not_found('Podcast workspace')
    data = request.get_json() or {}
    export_format = str(data.get('format') or 'mp3').lower()
    if export_format not in {'mp3', 'wav'}:
        return bad_request('format must be mp3 or wav')
    filename = secure_filename(str(data.get('filename') or '')) or f'podcast_workspace_{project_id}.{export_format}'
    if not filename.lower().endswith(f'.{export_format}'):
        filename += f'.{export_format}'
    try:
        from services.podcast_export_service import (
            create_podcast_export_snapshot,
            preflight_podcast_materials,
        )

        import json
        document = json.loads(workspace.current_version.document_json)
        materials = preflight_podcast_materials(project_id, document)
        audio_assets = [item for item in materials if item['purpose'] in {'bgm', 'sfx'}]
        cover_asset = next((item for item in materials if item['purpose'] == 'cover'), None)
        snapshot = create_podcast_export_snapshot(
            project_id=project_id, workspace_version=workspace.current_version,
            upload_root=current_app.config['UPLOAD_FOLDER'],
            export_config={
                'format': export_format,
                'tts_provider': data.get('tts_provider') or 'fish_audio',
                'audio_assets': audio_assets,
                'cover_asset': cover_asset,
            },
        )
        task = Task(project_id=project_id, task_type='EXPORT_PODCAST_WORKSPACE', status='PENDING')
        task.set_progress({'_resume': {'kind': 'podcast_workspace', 'kwargs': {
            'project_id': project_id, 'filename': filename,
            'snapshot_path': snapshot['path'], 'snapshot_hash': snapshot['sha256'],
        }}})
        db.session.add(task)
        db.session.commit()
        task_manager.submit_task(
            task.id, export_podcast_workspace_task,
            app=current_app._get_current_object(), **task.get_progress()['_resume']['kwargs'],
        )
        return success_response({'task_id': task.id, 'workspace_version': snapshot['snapshot']['workspace_version']}, status_code=202)
    except ValueError as exc:
        db.session.rollback()
        return bad_request(str(exc))


@content_workspace_bp.route('/<project_id>/sync-proposals', methods=['GET', 'POST'])
def content_sync_proposals(project_id):
    project = db.session.get(Project, project_id)
    if not project or not project.content_spine:
        return not_found('Content project')
    if request.method == 'GET':
        proposals = ContentSyncProposal.query.filter_by(project_id=project_id).order_by(
            ContentSyncProposal.created_at.desc()
        ).all()
        return success_response({'proposals': [proposal_to_dict(item) for item in proposals]})

    data = request.get_json() or {}
    required = ('source_kind', 'target_kind', 'source_revision', 'target_base_revision', 'diff')
    if any(field not in data for field in required):
        return bad_request(f'{", ".join(required)} are required')
    if not isinstance(data['source_revision'], int) or not isinstance(data['target_base_revision'], int):
        return bad_request('source_revision and target_base_revision must be integers')
    if not isinstance(data['diff'], dict):
        return bad_request('diff must be an object')
    try:
        proposal = create_sync_proposal(
            project,
            source_kind=data['source_kind'],
            target_kind=data['target_kind'],
            source_revision=data['source_revision'],
            target_base_revision=data['target_base_revision'],
            diff=data['diff'],
            reason=data.get('reason'),
        )
        db.session.commit()
        return success_response(proposal_to_dict(proposal), status_code=201)
    except SyncRevisionConflict as exc:
        db.session.rollback()
        return error_response('SYNC_REVISION_CONFLICT', str(exc), 409)
    except ValueError as exc:
        db.session.rollback()
        return bad_request(str(exc))


@content_workspace_bp.route(
    '/<project_id>/sync-proposals/<proposal_id>/apply', methods=['POST'],
)
def apply_content_sync_proposal(project_id, proposal_id):
    proposal = db.session.get(ContentSyncProposal, proposal_id)
    if not proposal or proposal.project_id != project_id:
        return not_found('Sync proposal')
    data = request.get_json() or {}
    if not isinstance(data.get('base_revision'), int):
        return bad_request('base_revision is required')
    selected = data.get('selected_item_ids')
    if not isinstance(selected, list) or not all(isinstance(item, str) for item in selected):
        return bad_request('selected_item_ids must be a list of strings')
    try:
        result = apply_sync_proposal(
            proposal,
            selected_item_ids=selected,
            base_revision=data['base_revision'],
        )
        db.session.commit()
        return success_response(result)
    except SyncRevisionConflict as exc:
        db.session.commit()
        return error_response('SYNC_PROPOSAL_STALE', str(exc), 409)
    except SyncProposalStateError as exc:
        db.session.rollback()
        return error_response('SYNC_PROPOSAL_RESOLVED', str(exc), 409)
    except ValueError as exc:
        db.session.rollback()
        return bad_request(str(exc))


@content_workspace_bp.route(
    '/<project_id>/sync-proposals/<proposal_id>/reject', methods=['POST'],
)
def reject_content_sync_proposal(project_id, proposal_id):
    proposal = db.session.get(ContentSyncProposal, proposal_id)
    if not proposal or proposal.project_id != project_id:
        return not_found('Sync proposal')
    data = request.get_json() or {}
    selected = data.get('selected_item_ids')
    if selected is not None and (
        not isinstance(selected, list) or not all(isinstance(item, str) for item in selected)
    ):
        return bad_request('selected_item_ids must be a list of strings')
    try:
        reject_sync_proposal(proposal, selected_item_ids=selected)
        db.session.commit()
        return success_response(proposal_to_dict(proposal))
    except SyncProposalStateError as exc:
        db.session.rollback()
        return error_response('SYNC_PROPOSAL_RESOLVED', str(exc), 409)
    except ValueError as exc:
        db.session.rollback()
        return bad_request(str(exc))


@content_workspace_bp.route(
    '/<project_id>/workspaces/<workspace_kind>/versions', methods=['GET'],
)
def list_workspace_versions(project_id, workspace_kind):
    workspace = ProjectWorkspace.query.filter_by(
        project_id=project_id,
        kind=workspace_kind,
    ).one_or_none()
    if not workspace:
        return not_found('Workspace')
    return success_response({
        'workspace': workspace_to_dict(workspace),
        'versions': [version_to_dict(item) for item in reversed(workspace.versions)],
    })


@content_workspace_bp.route(
    '/<project_id>/workspaces/<workspace_kind>/versions/<version_id>/restore',
    methods=['POST'],
)
def restore_content_workspace_version(project_id, workspace_kind, version_id):
    project = db.session.get(Project, project_id)
    if not project or not project.content_spine:
        return not_found('Content project')
    data = request.get_json() or {}
    if not isinstance(data.get('base_revision'), int):
        return bad_request('base_revision is required')
    try:
        result = restore_workspace(
            project,
            workspace_kind,
            version_id,
            data['base_revision'],
        )
        db.session.commit()
        return success_response(result)
    except WorkspaceRevisionConflict as exc:
        db.session.rollback()
        return error_response('WORKSPACE_REVISION_CONFLICT', str(exc), 409)
    except ValueError as exc:
        db.session.rollback()
        return bad_request(str(exc))


@content_workspace_bp.route(
    '/<project_id>/workspaces/ppt/propose-to-spine', methods=['POST'],
)
def propose_ppt_content_to_spine(project_id):
    project = db.session.get(Project, project_id)
    if not project or not project.content_spine:
        return not_found('Content project')
    data = request.get_json() or {}
    if not isinstance(data.get('target_base_revision'), int):
        return bad_request('target_base_revision is required')
    try:
        proposal = propose_ppt_to_spine(project, data['target_base_revision'])
        db.session.commit()
        return success_response(proposal_to_dict(proposal), status_code=201)
    except SyncRevisionConflict as exc:
        db.session.rollback()
        return error_response('SYNC_REVISION_CONFLICT', str(exc), 409)
    except ValueError as exc:
        db.session.rollback()
        return bad_request(str(exc))


@content_workspace_bp.route(
    '/<project_id>/workspaces/video/propose-to-spine', methods=['POST'],
)
def propose_video_content_to_spine(project_id):
    project = db.session.get(Project, project_id)
    if not project or not project.content_spine:
        return not_found('Content project')
    data = request.get_json() or {}
    if not isinstance(data.get('target_base_revision'), int):
        return bad_request('target_base_revision is required')
    try:
        proposal = propose_video_to_spine(project, data['target_base_revision'])
        db.session.commit()
        return success_response(proposal_to_dict(proposal), status_code=201)
    except SyncRevisionConflict as exc:
        db.session.rollback()
        return error_response('SYNC_REVISION_CONFLICT', str(exc), 409)
    except ValueError as exc:
        db.session.rollback()
        return bad_request(str(exc))


@content_workspace_bp.route(
    '/<project_id>/workspaces/podcast/propose-to-spine', methods=['POST'],
)
def propose_podcast_content_to_spine(project_id):
    project = db.session.get(Project, project_id)
    if not project or not project.content_spine:
        return not_found('Content project')
    data = request.get_json() or {}
    if not isinstance(data.get('target_base_revision'), int):
        return bad_request('target_base_revision is required')
    try:
        proposal = propose_podcast_to_spine(project, data['target_base_revision'])
        db.session.commit()
        return success_response(proposal_to_dict(proposal), status_code=201)
    except SyncRevisionConflict as exc:
        db.session.rollback()
        return error_response('SYNC_REVISION_CONFLICT', str(exc), 409)
    except ValueError as exc:
        db.session.rollback()
        return bad_request(str(exc))
