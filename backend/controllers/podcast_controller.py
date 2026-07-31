"""Podcast workspace preview and candidate endpoints."""

import io
import json
import tempfile
from pathlib import Path

from flask import Blueprint, current_app, request, send_file

from models import Project, ProjectWorkspace, Settings, db
from services.content_sync_service import proposal_to_dict
from services.podcast_service import (
    normalize_podcast_preview_segments,
    podcast_preview_cache_key,
    propose_podcast_to_spine,
)
from utils import bad_request, error_response, not_found, success_response


podcast_bp = Blueprint('podcasts', __name__, url_prefix='/api/content-projects')


def _workspace_or_404(project_id):
    project = db.session.get(Project, project_id)
    workspace = ProjectWorkspace.query.filter_by(project_id=project_id, kind='podcast').one_or_none()
    if not project or not workspace or not workspace.current_version:
        return None, None
    return project, workspace


@podcast_bp.route('/<project_id>/workspaces/podcast/preview', methods=['POST'])
def preview_podcast_workspace(project_id):
    project, workspace = _workspace_or_404(project_id)
    if not project:
        return not_found('Podcast workspace')
    payload = request.get_json(silent=True) or {}
    provider = str(payload.get('provider') or 'edge').strip().lower()
    if provider not in {'edge', 'fish_audio'}:
        return bad_request('provider must be edge or fish_audio')
    segment_id = str(payload.get('segment_id') or '').strip() or None
    try:
        speed = max(0.5, min(float(payload.get('speed', 1.0)), 2.0))
        document = json.loads(workspace.current_version.document_json)
        segments = normalize_podcast_preview_segments(document, segment_id)
    except LookupError as exc:
        return not_found(str(exc))
    except (TypeError, ValueError, json.JSONDecodeError) as exc:
        return bad_request(str(exc))

    from services.tts_video_service import (
        generate_fish_narration_audio_sync,
        generate_narration_segments_audio_sync,
        get_default_voice,
    )

    language = str(document.get('language') or 'zh-CN')
    speakers = document.get('speakers') or []
    speaker_map = {str(item.get('speaker_id')): item for item in speakers if isinstance(item, dict)}
    default_voice = get_default_voice(language, dict(current_app.config))
    selected_voice = str(payload.get('voice') or '').strip()
    for item in segments:
        speaker = speaker_map.get(item['speaker_id']) or {}
        item['voice'] = str(speaker.get('voice_ref') or selected_voice or default_voice)
        item['rate'] = str(payload.get('rate') or '+0%')
        item['_tts_text'] = item['text']

    upload_root = Path(current_app.config['UPLOAD_FOLDER'])
    cache_dir = upload_root / project_id / 'exports' / 'podcast_preview_cache' / provider
    cache_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='podcast_preview_', dir=upload_root) as working_dir:
        try:
            if provider == 'edge':
                audio_path, _duration, _durations, cache_hit = generate_narration_segments_audio_sync(
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
                api_key = str(
                    Settings.get_settings().fish_audio_api_key
                    or current_app.config.get('FISH_AUDIO_API_KEY')
                    or ''
                ).strip()
                if not api_key:
                    return bad_request('Fish Audio API Key 未配置，请先在设置中保存并验证')
                fish_speakers = [
                    {'id': item['speaker_id'], 'name': item.get('name') or item['speaker_id'], 'voice': item.get('voice_ref') or selected_voice}
                    for item in speakers if isinstance(item, dict)
                ]
                if segment_id:
                    fish_speakers = [item for item in fish_speakers if item['id'] == segments[0]['speaker_id']]
                if any(not item['voice'] for item in fish_speakers):
                    return bad_request('Fish Audio 试听必须为每位角色配置声音')
                audio_path, _duration, _durations, cache_hit = generate_fish_narration_audio_sync(
                    segments=segments,
                    speakers=fish_speakers,
                    narration_mode='single' if segment_id else document.get('format', 'single'),
                    cache_dir=str(cache_dir),
                    working_dir=working_dir,
                    api_key=api_key,
                    speed=speed,
                    model=current_app.config.get('FISH_AUDIO_MODEL', 's2.1-pro-free'),
                    api_base=current_app.config.get('FISH_AUDIO_API_BASE', 'https://api.fish.audio'),
                    ffmpeg_path=current_app.config.get('FFMPEG_PATH', 'ffmpeg'),
                    return_cache_hit=True,
                )
                timing_quality = 'segment_exact' if segment_id or len(segments) == 1 else 'estimated'
        except Exception as exc:
            return error_response('PODCAST_PREVIEW_FAILED', str(exc), 503)
        audio = io.BytesIO(Path(audio_path).read_bytes())
    audio.seek(0)
    response = send_file(audio, mimetype='audio/mpeg', download_name=f'{provider}-podcast-preview.mp3')
    response.headers['X-TTS-Provider'] = provider
    response.headers['X-Timing-Quality'] = timing_quality
    response.headers['X-Cache-Hit'] = str(bool(cache_hit)).lower()
    response.headers['X-Workspace-Revision'] = str(workspace.revision)
    response.headers['X-Preview-Cache-Key'] = podcast_preview_cache_key(
        document={**document, 'revision': workspace.revision},
        provider=provider,
        segment_id=segment_id,
        voice=selected_voice,
        speed=speed,
    )
    return response


@podcast_bp.route('/<project_id>/workspaces/podcast/candidates', methods=['POST'])
def create_podcast_workspace_candidate(project_id):
    project, _workspace = _workspace_or_404(project_id)
    if not project:
        return not_found('Podcast workspace')
    payload = request.get_json(silent=True) or {}
    if not isinstance(payload.get('target_base_revision'), int):
        return bad_request('target_base_revision is required')
    try:
        proposal = propose_podcast_to_spine(project, payload['target_base_revision'])
        db.session.commit()
        return success_response(proposal_to_dict(proposal), status_code=201)
    except ValueError as exc:
        db.session.rollback()
        return bad_request(str(exc))

