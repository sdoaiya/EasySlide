"""Workspace generation run APIs (reconstruction plan §11.1/§11.2).

Stage 1 shells: create/query/control/publish with the feature switch
``WORKSPACE_GENERATION_RUNS_ENABLED`` (default off). Generation execution
tasks are wired in a later stage; the state machine and publish
transaction already run in the service layer.
"""

import json
import os

from flask import Blueprint, current_app, request

from models import Project, WorkspaceGenerationRun, db
from services.workspace_generation_service import (
    FeatureDisabled,
    GenerationAlreadyActive,
    GenerationRunError,
    GenerationRunStateError,
    create_generation_run,
    mark_stale_if_source_changed,
    publish_run,
    transition_run,
)
from utils import bad_request, error_response, not_found, success_response

workspace_generation_bp = Blueprint(
    'workspace_generation', __name__, url_prefix='/api/projects',
)

VALID_TARGET_KINDS = {'video', 'podcast'}
VALID_SOURCE_KINDS = {'brief', 'ppt'}


def _feature_enabled() -> bool:
    return str(os.getenv('WORKSPACE_GENERATION_RUNS_ENABLED', 'false')).lower() in {
        '1', 'true', 'yes',
    }


def _require_feature() -> None:
    if not _feature_enabled():
        raise FeatureDisabled('工作区生成运行功能尚未启用')


def _get_project(project_id) -> Project:
    project = db.session.get(Project, project_id)
    if not project:
        raise GenerationRunError('项目不存在')
    return project


def _run_or_404(run_id: str) -> WorkspaceGenerationRun:
    run = db.session.get(WorkspaceGenerationRun, run_id)
    if not run:
        raise GenerationRunError('生成运行不存在')
    return run


@workspace_generation_bp.route('/<project_id>/workspace-generation-runs', methods=['POST'])
def create_run(project_id):
    try:
        _require_feature()
        project = _get_project(project_id)
        data = request.get_json() or {}
        if not isinstance(data, dict):
            return bad_request('request body must be an object')
        target = data.get('target_workspace_kind')
        source_kind = data.get('source_kind')
        if target not in VALID_TARGET_KINDS:
            return bad_request('target_workspace_kind must be video or podcast')
        if source_kind not in VALID_SOURCE_KINDS:
            return bad_request('source_kind must be brief or ppt')
        options = data.get('options') or {}
        if not isinstance(options, dict):
            return bad_request('options must be an object')
        page_ids = data.get('options', {}).get('page_ids')
        if page_ids is not None and not isinstance(page_ids, list):
            return bad_request('page_ids must be an array')
        run = create_generation_run(
            project,
            target_workspace_kind=target,
            source_kind=source_kind,
            mode=data.get('mode', 'direct' if source_kind == 'brief' else 'ai_adapt'),
            operation=data.get('operation', 'generate'),
            options=options,
            page_ids=page_ids,
            parent_run_id=data.get('parent_run_id'),
        )
        db.session.commit()
        return success_response({
            **run.to_dict(),
            'result_route': f'/project/{project.id}/{target}/review/{run.id}',
        }, status_code=202)
    except FeatureDisabled as exc:
        db.session.rollback()
        return error_response('FEATURE_DISABLED', str(exc), 403)
    except GenerationAlreadyActive as exc:
        db.session.rollback()
        return error_response('GENERATION_ALREADY_ACTIVE', str(exc), 409)
    except GenerationRunError as exc:
        db.session.rollback()
        return error_response('INVALID_GENERATION_RUN', str(exc), 400)


@workspace_generation_bp.route('/<project_id>/workspace-generation-runs', methods=['GET'])
def list_runs(project_id):
    try:
        _get_project(project_id)
        query = WorkspaceGenerationRun.query.filter_by(project_id=project_id)
        target_kind = request.args.get('target_kind')
        status = request.args.get('status')
        source_kind = request.args.get('source_kind')
        if target_kind:
            if target_kind not in VALID_TARGET_KINDS:
                return bad_request('invalid target_kind')
            query = query.filter_by(target_workspace_kind=target_kind)
        if status:
            query = query.filter_by(status=status)
        if source_kind:
            if source_kind not in VALID_SOURCE_KINDS:
                return bad_request('invalid source_kind')
            query = query.filter_by(source_kind=source_kind)
        runs = query.order_by(WorkspaceGenerationRun.created_at.desc()).all()
        return success_response({
            'runs': [run.to_dict() for run in runs],
            'total': len(runs),
        })
    except GenerationRunError as exc:
        return error_response('GENERATION_RUN_NOT_FOUND', str(exc), 404)


@workspace_generation_bp.route(
    '/<project_id>/workspace-generation-runs/<run_id>', methods=['GET'],
)
def get_run(project_id, run_id):
    try:
        run = _run_or_404(run_id)
        if run.project_id != project_id:
            return not_found('Generation run')
        project = _get_project(project_id)
        stale = mark_stale_if_source_changed(run, project)
        if stale:
            db.session.commit()
        payload = run.to_dict()
        payload['stale'] = stale
        return success_response(payload)
    except GenerationRunError as exc:
        return error_response('GENERATION_RUN_NOT_FOUND', str(exc), 404)


def _control_run(project_id, run_id, next_status: str, error_code: str):
    try:
        run = _run_or_404(run_id)
        if run.project_id != project_id:
            return not_found('Generation run')
        transition_run(run, next_status)
        db.session.commit()
        return success_response(run.to_dict())
    except GenerationRunStateError as exc:
        db.session.rollback()
        return error_response(error_code, str(exc), 409)
    except GenerationRunError as exc:
        return error_response('GENERATION_RUN_NOT_FOUND', str(exc), 404)


@workspace_generation_bp.route(
    '/<project_id>/workspace-generation-runs/<run_id>/pause', methods=['POST'],
)
def pause_run(project_id, run_id):
    return _control_run(project_id, run_id, 'PAUSED', 'GENERATION_STATE_CONFLICT')


@workspace_generation_bp.route(
    '/<project_id>/workspace-generation-runs/<run_id>/resume', methods=['POST'],
)
def resume_run(project_id, run_id):
    return _control_run(project_id, run_id, 'RUNNING', 'GENERATION_STATE_CONFLICT')


@workspace_generation_bp.route(
    '/<project_id>/workspace-generation-runs/<run_id>/cancel', methods=['POST'],
)
def cancel_run(project_id, run_id):
    return _control_run(project_id, run_id, 'CANCELLED', 'GENERATION_STATE_CONFLICT')


@workspace_generation_bp.route(
    '/<project_id>/workspace-generation-runs/<run_id>/retry', methods=['POST'],
)
def retry_run(project_id, run_id):
    return _control_run(project_id, run_id, 'PENDING', 'GENERATION_STATE_CONFLICT')


@workspace_generation_bp.route(
    '/<project_id>/workspace-generation-runs/<run_id>/publish', methods=['POST'],
)
def publish(project_id, run_id):
    try:
        run = _run_or_404(run_id)
        if run.project_id != project_id:
            return not_found('Generation run')
        project = _get_project(project_id)
        published = publish_run(run, project)
        return success_response(published.to_dict(), status_code=200)
    except GenerationRunStateError as exc:
        db.session.rollback()
        return error_response('GENERATION_NOT_REVIEWABLE', str(exc), 409)
    except GenerationRunError as exc:
        db.session.rollback()
        return error_response('INVALID_GENERATION_RUN', str(exc), 400)
