"""Unified voice catalog API (§7.4/阶段2).

``GET /api/voices`` returns the combined Edge + Fish read-only catalog with
provider / language / query filters. ``GET /api/voices/<voice_id>`` returns
one item (Edge voices resolve against the static catalog; Fish voices
against the live API when a key is configured).
"""

from flask import Blueprint, request

from utils import not_found, success_response
from services.voice_catalog_service import (
    get_voice_catalog,
    get_voice_detail,
    resolve_voice_id,
)

voice_catalog_bp = Blueprint('voice_catalog', __name__, url_prefix='/api')


@voice_catalog_bp.get('/voices')
def list_voice_catalog():
    provider = str(request.args.get('provider') or '').strip() or None
    language = str(request.args.get('language') or '').strip() or None
    query = str(request.args.get('query') or '').strip() or None
    voices = get_voice_catalog(provider=provider, language=language, query=query)
    return success_response({'voices': voices, 'total': len(voices)})


@voice_catalog_bp.get('/voices/<voice_id>')
def get_voice(voice_id: str):
    canonical = resolve_voice_id(voice_id)
    if not canonical:
        return not_found('Voice')
    item = get_voice_detail(canonical)
    if not item:
        return not_found('Voice')
    return success_response(item)


@voice_catalog_bp.get('/voices/<voice_id>/preview')
def preview_voice(voice_id: str):
    """合成一句试听音频：Edge 用本地 TTS，Fish 委托 Fish Audio API。

    可选 ``text`` 参数用于 A/B 对比等场景共用同一段试听文案；
    缺失时使用默认示例文案。
    """
    import os
    import tempfile

    from flask import current_app, send_file

    from services.voice_catalog_service import get_voice_detail

    canonical = resolve_voice_id(voice_id)
    if not canonical:
        return not_found('Voice')
    item = get_voice_detail(canonical)
    if not item:
        return not_found('Voice')
    text = str(request.args.get('text') or '').strip()[:200] or '你好，欢迎使用 EasySlide。这是声音试听示例。'
    if item['provider'] == 'edge':
        from services.tts_video_service import generate_tts_audio_sync
        output_path = os.path.join(
            tempfile.gettempdir(),
            f'easyslide-edge-preview-{os.urandom(8).hex()}.mp3',
        )
        try:
            generate_tts_audio_sync(text, output_path, voice=item['upstream_id'])
        except Exception:
            from utils import error_response
            return error_response('VOICE_PREVIEW_FAILED', '试听生成失败，请稍后重试', 502)
        from flask import after_this_request
        @after_this_request
        def _cleanup(response):
            try:
                os.remove(output_path)
            except OSError:
                pass
            return response
        return send_file(output_path, mimetype='audio/mpeg', as_attachment=False, download_name='edge-preview.mp3')
    # fish_audio
    from services.fish_audio_service import FishAudioAPIError, synthesize
    key = str(current_app.config.get('FISH_AUDIO_API_KEY') or '').strip()
    if not key:
        from utils import error_response
        return error_response('VOICE_PREVIEW_FAILED', '请先在设置中保存 Fish Audio API Key', 400)
    output_path = os.path.join(
        tempfile.gettempdir(),
        f'easyslide-fish-preview-{os.urandom(8).hex()}.mp3',
    )
    try:
        synthesize(
            api_key=key,
            text=text,
            output_path=output_path,
            reference_id=item['upstream_id'],
            model=current_app.config.get('FISH_AUDIO_MODEL', 's2.1-pro-free'),
        )
    except FishAudioAPIError as exc:
        from utils import error_response
        return error_response('VOICE_PREVIEW_FAILED', str(exc), getattr(exc, 'status_code', 502) or 502)
    except Exception:
        from utils import error_response
        return error_response('VOICE_PREVIEW_FAILED', '试听生成失败，请稍后重试', 502)
    from flask import after_this_request
    @after_this_request
    def _cleanup(response):
        try:
            os.remove(output_path)
        except OSError:
            pass
        return response
    return send_file(output_path, mimetype='audio/mpeg', as_attachment=False, download_name='fish-preview.mp3')
