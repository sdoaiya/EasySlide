"""Versioned narration APIs. Existing page narration endpoints stay compatible."""

import json
import io
import tempfile
from pathlib import Path

from datetime import datetime

from flask import Blueprint, current_app, request, send_file

from models import NarrationVersion, Page, Project, Settings, Task, db
from services.ai_service_manager import get_ai_service
from services.narration_service import (
    NarrationLocked,
    NarrationRevisionConflict,
    apply_narration_version,
    create_ai_narration_candidate,
    ensure_legacy_narration_version,
    narration_diff,
    save_manual_narration_version,
    save_narration_draft,
    set_narration_lock,
)
from services.prompts import get_narration_candidate_prompt
from services.task_manager import generate_narration_candidates_task, task_manager
from utils import error_response, not_found, success_response


narration_bp = Blueprint('narrations', __name__, url_prefix='/api/projects')
_AI_OPERATIONS = {'generate', 'polish', 'shorten', 'expand', 'convert_single', 'convert_dialogue'}
_AI_JOB_TASK_TYPE = 'GENERATE_NARRATION_CANDIDATES'


def _page_or_404(project_id, page_id):
    page = Page.query.get(page_id)
    if not page or page.project_id != project_id:
        return None
    return page


def _version_payload(version):
    if not version:
        return None
    data = version.to_dict()
    return {'id': data['version_id'], **data}


def _details(page):
    current = ensure_legacy_narration_version(page)
    versions = (
        NarrationVersion.query.filter_by(page_id=page.id)
        .order_by(NarrationVersion.version_number.desc())
        .all()
    )
    return {
        'page_id': page.id,
        'current_version_id': current.id if current else page.current_narration_version_id,
        'revision': int(page.narration_revision or 0),
        'locked': bool(page.narration_locked),
        'versions': [_version_payload(version) for version in versions],
    }


def _commit_or_error(action):
    try:
        result = action()
        db.session.commit()
        return result
    except NarrationRevisionConflict as exc:
        db.session.rollback()
        return error_response('NARRATION_REVISION_CONFLICT', str(exc), 409)
    except NarrationLocked as exc:
        db.session.rollback()
        return error_response('NARRATION_LOCKED', str(exc), 409)
    except ValueError as exc:
        db.session.rollback()
        return error_response('INVALID_NARRATION', str(exc), 400)
    except Exception as exc:
        db.session.rollback()
        return error_response('SERVER_ERROR', str(exc), 500)


@narration_bp.route('/<project_id>/narrations', methods=['GET'])
def list_project_narrations(project_id):
    project = Project.query.get(project_id)
    if not project:
        return not_found('Project')

    def action():
        pages = Page.query.filter_by(project_id=project_id).order_by(Page.order_index).all()
        summaries = []
        for page in pages:
            current = ensure_legacy_narration_version(page)
            text = page.get_narration_text() or ''
            summaries.append({
                'page_id': page.id,
                'order_index': page.order_index,
                'current_version_id': current.id if current else page.current_narration_version_id,
                'revision': int(page.narration_revision or 0),
                'locked': bool(page.narration_locked),
                'candidate_count': NarrationVersion.query.filter_by(page_id=page.id, status='candidate').count(),
                'word_count': len(text),
                'estimated_seconds': round(len(text) / 4.0, 1) if text else 0.0,
                'narration_status': page.narration_status or ('READY' if text else 'EMPTY'),
            })
        return {
            'pages': summaries,
            'total_pages': len(summaries),
            'confirmed_pages': sum(1 for item in summaries if item['current_version_id']),
            'missing_pages': sum(1 for item in summaries if not item['current_version_id']),
            'candidate_pages': sum(1 for item in summaries if item['candidate_count'] > 0),
        }

    result = _commit_or_error(action)
    return result if isinstance(result, tuple) else success_response(result)


@narration_bp.route('/<project_id>/pages/<page_id>/narration/versions', methods=['GET'])
def list_narration_versions(project_id, page_id):
    page = _page_or_404(project_id, page_id)
    if not page:
        return not_found('Page')
    result = _commit_or_error(lambda: _details(page))
    return result if isinstance(result, tuple) else success_response(result)


@narration_bp.route('/<project_id>/pages/<page_id>/narration/draft', methods=['PUT'])
def save_draft(project_id, page_id):
    page = _page_or_404(project_id, page_id)
    if not page:
        return not_found('Page')
    payload = request.get_json() or {}
    result = _commit_or_error(lambda: save_narration_draft(page, payload))
    if isinstance(result, tuple):
        return result
    return success_response({
        'page_id': page.id,
        'revision': page.narration_revision,
        'narration_text': page.narration_text,
        'narration_segments': page.get_narration_segments(),
    })


@narration_bp.route('/<project_id>/pages/<page_id>/narration/versions', methods=['POST'])
def create_manual_version(project_id, page_id):
    page = _page_or_404(project_id, page_id)
    if not page:
        return not_found('Page')
    payload = request.get_json() or {}
    result = _commit_or_error(lambda: save_manual_narration_version(page, payload))
    if isinstance(result, tuple):
        return result
    return success_response({'version': _version_payload(result), 'revision': page.narration_revision}, status_code=201)


@narration_bp.route('/<project_id>/pages/<page_id>/narration/versions/<version_id>/apply', methods=['POST'])
def apply_version(project_id, page_id, version_id):
    page = _page_or_404(project_id, page_id)
    if not page:
        return not_found('Page')
    payload = request.get_json() or {}
    source = NarrationVersion.query.filter_by(id=version_id, page_id=page.id).first()
    if not source:
        return not_found('Narration version')
    result = _commit_or_error(lambda: apply_narration_version(page, source, payload.get('base_revision')))
    if isinstance(result, tuple):
        return result
    return success_response({'version': _version_payload(result), 'revision': page.narration_revision})


@narration_bp.route('/<project_id>/pages/<page_id>/narration/candidates/<version_id>', methods=['DELETE'])
def discard_candidate(project_id, page_id, version_id):
    page = _page_or_404(project_id, page_id)
    if not page:
        return not_found('Page')
    version = NarrationVersion.query.filter_by(id=version_id, page_id=page.id, status='candidate').first()
    if not version:
        return not_found('Narration candidate')
    db.session.delete(version)
    db.session.commit()
    return success_response({'id': version_id})


@narration_bp.route('/<project_id>/pages/<page_id>/narration/lock', methods=['PUT'])
def update_narration_lock(project_id, page_id):
    page = _page_or_404(project_id, page_id)
    if not page:
        return not_found('Page')
    payload = request.get_json() or {}
    result = _commit_or_error(lambda: set_narration_lock(page, payload.get('locked'), payload.get('base_revision')))
    if isinstance(result, tuple):
        return result
    return success_response({'page_id': page.id, 'locked': bool(page.narration_locked), 'revision': page.narration_revision})


def _parse_ai_result(raw):
    value = str(raw or '').strip()
    if value.startswith('```'):
        value = value.split('\n', 1)[-1].rsplit('```', 1)[0].strip()
    parsed = json.loads(value)
    if not isinstance(parsed, dict):
        raise ValueError('AI 返回格式无效')
    return parsed


@narration_bp.route('/<project_id>/pages/<page_id>/narration/ai-candidates', methods=['POST'])
def create_ai_candidate(project_id, page_id):
    page = _page_or_404(project_id, page_id)
    if not page:
        return not_found('Page')
    payload = request.get_json() or {}
    operation = str(payload.get('operation') or 'polish')
    if operation not in _AI_OPERATIONS:
        return error_response('INVALID_NARRATION', '不支持的 AI 文案操作', 400)
    if page.narration_locked:
        return error_response('NARRATION_LOCKED', '当前页面旁白已锁定', 409)
    try:
        base_revision = int(payload.get('base_revision'))
    except (TypeError, ValueError):
        return error_response('NARRATION_REVISION_CONFLICT', 'base_revision is required', 409)
    if base_revision != int(page.narration_revision or 0):
        return error_response(
            'NARRATION_REVISION_CONFLICT',
            f'旁白已被更新，当前 revision 为 {page.narration_revision or 0}',
            409,
        )

    had_current = bool(page.current_narration_version_id)
    current = ensure_legacy_narration_version(page)
    if current and not had_current:
        db.session.commit()
    base_id = payload.get('base_version_id') or (current.id if current else None)
    base = NarrationVersion.query.filter_by(id=base_id, page_id=page.id).first() if base_id else None
    if not base and operation != 'generate':
        return error_response('INVALID_NARRATION', '请先保存一份人工稿作为 AI 编辑基础', 400)
    payload['base_version_id'] = base_id
    source = {
        'outline': page.get_outline_content() or {},
        'description': page.get_description_content() or {},
        'page_order': page.order_index + 1,
    }
    prompt = get_narration_candidate_prompt(
        operation=operation,
        base_text=base.text if base else '',
        source=source,
        instruction=str(payload.get('instruction') or ''),
        selection=payload.get('selection'),
        generation_config=payload.get('generation_config'),
    )
    try:
        parsed = _parse_ai_result(get_ai_service().text_provider.generate_text(prompt))
    except (ValueError, json.JSONDecodeError) as exc:
        return error_response('AI_SERVICE_ERROR', f'AI 文案格式无效：{exc}', 503)
    except Exception as exc:
        return error_response('AI_SERVICE_ERROR', str(exc), 503)

    source_type = 'ai_generated' if operation == 'generate' else ('converted' if operation.startswith('convert_') else 'ai_polished')
    result = _commit_or_error(lambda: create_ai_narration_candidate(
        page,
        payload=payload,
        result=parsed,
        source_type=source_type,
    ))
    if isinstance(result, tuple):
        return result
    return success_response({
        'candidate': _version_payload(result),
        'diff': narration_diff(base.text if base else '', result.text),
        'quality': {'word_count': len(result.text), 'warnings': []},
        'estimated_seconds': round(len(result.text) / 4.0, 1),
    }, status_code=201)


def _ai_job_or_404(project_id, task_id):
    return Task.query.filter_by(
        id=task_id,
        project_id=project_id,
        task_type=_AI_JOB_TASK_TYPE,
    ).first()


@narration_bp.route('/<project_id>/narrations/ai-jobs', methods=['POST'])
def create_ai_candidate_job(project_id):
    if not Project.query.get(project_id):
        return not_found('Project')
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return error_response('INVALID_NARRATION', '请求体必须是 JSON 对象', 400)

    operation = str(payload.get('operation') or 'polish')
    if operation not in _AI_OPERATIONS:
        return error_response('INVALID_NARRATION', '不支持的 AI 文案操作', 400)
    scope = str(payload.get('scope') or ('selected' if payload.get('page_ids') is not None else 'all_unlocked'))
    if scope == 'all':
        scope = 'all_unlocked'
    if scope not in {'selected', 'missing', 'all_unlocked'}:
        return error_response('INVALID_NARRATION', 'scope 仅支持 selected、missing、all_unlocked', 400)

    pages = Page.query.filter_by(project_id=project_id).order_by(Page.order_index).all()
    if scope == 'selected':
        requested = payload.get('page_ids')
        if not isinstance(requested, list) or not requested or len(requested) > 200:
            return error_response('INVALID_NARRATION', 'page_ids 必须是 1-200 个页面 ID', 400)
        requested_ids = [str(value) for value in requested]
        by_id = {page.id: page for page in pages}
        if any(page_id not in by_id for page_id in requested_ids):
            return error_response('INVALID_NARRATION', 'page_ids 包含不属于当前项目的页面', 400)
        pages = [by_id[page_id] for page_id in dict.fromkeys(requested_ids)]
    elif scope == 'missing':
        pages = [
            page for page in pages
            if not page.current_narration_version_id
            and not (page.get_narration_text() or '').strip()
            and not page.get_narration_segments()
        ]
    else:
        pages = [page for page in pages if not page.narration_locked]

    if not pages:
        return error_response('INVALID_NARRATION', '没有符合条件的页面', 400)

    task = Task(project_id=project_id, task_type=_AI_JOB_TASK_TYPE, status='PENDING')
    task.set_progress({
        'total': len(pages),
        'completed': 0,
        'failed': 0,
        'skipped': 0,
        'operation': operation,
        'scope': scope,
        'page_ids': [page.id for page in pages],
        'pages': [],
    })
    db.session.add(task)
    db.session.commit()
    try:
        task_manager.submit_task(
            task.id,
            generate_narration_candidates_task,
            project_id,
            [page.id for page in pages],
            operation,
            instruction=str(payload.get('instruction') or ''),
            selection=payload.get('selection'),
            generation_config=payload.get('generation_config'),
            app=current_app._get_current_object(),
        )
    except Exception:
        task.status = 'FAILED'
        task.error_message = '无法提交 AI 文案任务'
        task.completed_at = datetime.utcnow()
        db.session.commit()
        return error_response('TASK_SUBMIT_FAILED', task.error_message, 503)
    return success_response({'task_id': task.id, 'status': task.status, 'total': len(pages)}, status_code=202)


@narration_bp.route('/<project_id>/narrations/ai-jobs/<task_id>/result', methods=['GET'])
def get_ai_candidate_job_result(project_id, task_id):
    task = _ai_job_or_404(project_id, task_id)
    if not task:
        return not_found('Task')
    progress = task.get_progress()
    return success_response({
        'task_id': task.id,
        'status': task.status,
        'total': progress.get('total', 0),
        'completed': progress.get('completed', 0),
        'failed': progress.get('failed', 0),
        'skipped': progress.get('skipped', 0),
        'pages': progress.get('pages', []),
    })


@narration_bp.route('/<project_id>/narrations/ai-jobs/<task_id>/<action>', methods=['POST'])
def control_ai_candidate_job(project_id, task_id, action):
    task = _ai_job_or_404(project_id, task_id)
    if not task:
        return not_found('Task')
    if action == 'pause' and task.status in {'PENDING', 'PROCESSING', 'RUNNING'}:
        task.status = 'PAUSED'
    elif action == 'resume' and task.status == 'PAUSED':
        if not task_manager.is_task_active(task.id):
            return error_response('TASK_NOT_ACTIVE', '任务进程已结束，请重新提交失败页面', 409)
        task.status = 'PROCESSING'
    elif action == 'cancel' and task.status not in {'COMPLETED', 'FAILED', 'CANCELLED'}:
        task.status = 'CANCELLED'
        task.completed_at = datetime.utcnow()
    elif action not in {'pause', 'resume', 'cancel'}:
        return not_found('Action')
    db.session.commit()
    return success_response(task.to_dict())


def _preview_source(page, payload):
    version_id = str(payload.get('version_id') or '').strip()
    has_draft = 'draft' in payload
    if bool(version_id) == has_draft:
        raise ValueError('version_id 与 draft 必须且只能提供一个')

    if version_id:
        version = NarrationVersion.query.filter_by(id=version_id, page_id=page.id).first()
        if not version:
            raise LookupError('Narration version')
        source = {
            'mode': version.mode,
            'language': version.language,
            'text': version.text,
            'segments': version.get_segments(),
        }
    else:
        source = payload.get('draft')
        if not isinstance(source, dict):
            raise ValueError('draft 必须是对象')

    mode = str(source.get('mode') or 'single').strip().lower()
    if mode not in {'single', 'dialogue'}:
        raise ValueError('mode 仅支持 single 或 dialogue')
    language = str(source.get('language') or 'auto').strip() or 'auto'
    raw_segments = source.get('segments') if isinstance(source.get('segments'), list) else []
    segment_id = str(payload.get('segment_id') or '').strip()
    if segment_id:
        raw_segments = [
            segment for segment in raw_segments
            if isinstance(segment, dict) and str(segment.get('segment_id') or '') == segment_id
        ]
        if not raw_segments:
            raise ValueError('未找到指定的旁白片段')
        mode = 'single'

    from services.narration_service import normalize_narration_segments

    segments = normalize_narration_segments(
        raw_segments,
        fallback_text=None if segment_id else source.get('text'),
    )
    if not segments:
        raise ValueError('试听文案不能为空')
    if sum(len(segment['text']) for segment in segments) > 20000:
        raise ValueError('试听文案不能超过 20000 个字符')
    return mode, language, segments, bool(segment_id)


@narration_bp.route('/<project_id>/pages/<page_id>/narration/preview', methods=['POST'])
def preview_narration(project_id, page_id):
    page = _page_or_404(project_id, page_id)
    if not page:
        return not_found('Page')
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return error_response('INVALID_NARRATION', '请求体必须是 JSON 对象', 400)

    provider = str(payload.get('tts_provider') or 'edge').strip().lower()
    if provider not in {'edge', 'fish_audio'}:
        return error_response('INVALID_NARRATION', 'tts_provider 仅支持 edge 或 fish_audio', 400)
    try:
        speed = max(0.5, min(float(payload.get('speed', 1.0)), 2.0))
        mode, language, segments, segment_only = _preview_source(page, payload)
    except LookupError as exc:
        return not_found(str(exc))
    except (TypeError, ValueError) as exc:
        return error_response('INVALID_NARRATION', str(exc), 400)

    from services.narration_service import (
        apply_pronunciation_lexicon,
        normalize_speakers,
    )
    from services.tts_video_service import (
        generate_fish_narration_audio_sync,
        generate_narration_segments_audio_sync,
        get_default_voice,
    )
    from services.fish_audio_service import FishAudioAPIError

    voice = str(payload.get('voice') or '').strip()
    speakers = normalize_speakers(payload.get('speakers'), voice)
    speaker_voices = {speaker['id']: speaker['voice'] for speaker in speakers}
    default_voice = voice or get_default_voice(language.split('-', 1)[0] if language != 'auto' else 'zh')
    lexicon = page.project.get_pronunciation_lexicon()
    for segment in segments:
        segment['voice'] = speaker_voices.get(segment['speaker_id']) or default_voice
        segment['_tts_text'] = apply_pronunciation_lexicon(segment['text'], lexicon)

    upload_root = Path(current_app.config['UPLOAD_FOLDER'])
    cache_dir = upload_root / project_id / 'exports' / 'narration_preview_cache' / provider
    cache_dir.mkdir(parents=True, exist_ok=True)
    fish_api_key = ''
    try:
        with tempfile.TemporaryDirectory(prefix='narration_preview_', dir=upload_root) as working_dir:
            if provider == 'edge':
                audio_path, _duration, _segment_durations, cache_hit = generate_narration_segments_audio_sync(
                    segments=segments,
                    cache_dir=str(cache_dir),
                    working_dir=working_dir,
                    default_voice=default_voice,
                    rate=str(payload.get('rate') or '+0%'),
                    speed=speed,
                    ffmpeg_path=current_app.config.get('FFMPEG_PATH', 'ffmpeg'),
                    return_cache_hit=True,
                )
                timing_quality = 'segment_exact'
            else:
                fish_api_key = str(
                    Settings.get_settings().fish_audio_api_key
                    or current_app.config.get('FISH_AUDIO_API_KEY')
                    or ''
                ).strip()
                if not fish_api_key:
                    raise ValueError('Fish Audio API Key 未配置')
                if segment_only:
                    speaker_id = segments[0]['speaker_id']
                    selected_voice = speaker_voices.get(speaker_id) or voice
                    if not selected_voice:
                        raise ValueError('Fish Audio 单段试听必须配置对应角色声音')
                    fish_speakers = [{'id': speaker_id, 'name': speaker_id, 'voice': selected_voice}]
                elif mode == 'dialogue':
                    fish_speakers = speakers
                else:
                    selected_voice = voice or (speakers[0]['voice'] if speakers else '')
                    if not selected_voice:
                        raise ValueError('Fish Audio 试听必须选择声音')
                    fish_speakers = [{'id': segments[0]['speaker_id'], 'name': '旁白', 'voice': selected_voice}]
                preferences = page.project.get_narration_preferences()
                audio_path, _duration, _segment_durations, cache_hit = generate_fish_narration_audio_sync(
                    segments=segments,
                    speakers=fish_speakers,
                    narration_mode='single' if segment_only else mode,
                    cache_dir=str(cache_dir),
                    working_dir=working_dir,
                    api_key=fish_api_key,
                    speed=speed,
                    model=current_app.config.get('FISH_AUDIO_MODEL', 's2.1-pro-free'),
                    auto_emotion=bool(payload.get('auto_emotion', True)),
                    emotion_director=preferences.get('emotion_director'),
                    ffmpeg_path=current_app.config.get('FFMPEG_PATH', 'ffmpeg'),
                    return_cache_hit=True,
                )
                timing_quality = 'segment_exact' if segment_only or len(segments) == 1 else 'estimated'

            with open(audio_path, 'rb') as handle:
                audio = io.BytesIO(handle.read())
        audio.seek(0)
        response = send_file(audio, mimetype='audio/mpeg', download_name=f'{provider}-narration-preview.mp3')
        response.headers['X-TTS-Provider'] = provider
        response.headers['X-Timing-Quality'] = timing_quality
        response.headers['X-Cache-Hit'] = str(bool(cache_hit)).lower()
        return response
    except ValueError as exc:
        return error_response('INVALID_NARRATION', str(exc).replace(fish_api_key, '[redacted]') if fish_api_key else str(exc), 400)
    except FishAudioAPIError as exc:
        message = str(exc).replace(fish_api_key, '[redacted]') if fish_api_key else str(exc)
        if message == 'Reference not found':
            message = 'Fish Audio 声线不存在或不可用，请在设置里同步/创建私有声线后再试听'
        status = 400 if exc.status_code and exc.status_code < 500 else 502
        return error_response('TTS_PREVIEW_ERROR', message, status)
    except Exception as exc:
        message = str(exc).replace(fish_api_key, '[redacted]') if fish_api_key else str(exc)
        return error_response('TTS_PREVIEW_ERROR', message, 502)
