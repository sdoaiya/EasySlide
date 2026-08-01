"""Shared helpers for single-speaker and multi-speaker narration."""

import hashlib
import json
import re
import unicodedata
import uuid
from datetime import datetime
from difflib import SequenceMatcher
from typing import Any, Dict, Iterable, List, Optional

from sqlalchemy import func


NARRATION_SCRIPT_SCHEMA_VERSION = 2
MAX_PRONUNCIATION_ENTRIES = 100
MAX_VOICE_ASSETS = 100
MAX_FISH_TTS_CHARACTERS_PER_PAGE = 20000
FISH_CONTROL_TOKEN_RE = re.compile(
    r'<\|\s*speaker\s*:|\[[a-z][a-z _-]{1,30}\]',
    flags=re.IGNORECASE,
)
DEFAULT_NARRATION_PREFERENCES = {
    'quality_check': False,
    'strict_quality_check': False,
    'subtitle_timing': 'estimated',
    'emotion_director': {
        'intensity': 'standard',
        'pace': 'normal',
        'pause': 'normal',
        'relationship': 'neutral',
    },
    'page_overrides': {},
}
_DIRECTOR_VALUES = {
    'intensity': {'gentle', 'standard', 'strong'},
    'pace': {'slow', 'normal', 'fast'},
    'pause': {'short', 'normal', 'long'},
    'relationship': {'neutral', 'host_guest', 'mentor', 'debate'},
}
_FISH_EMOTIONS = {'curious', 'emphasis', 'confident', 'calm', 'warm', 'excited'}


def _json_value(value: Any, fallback: Any) -> Any:
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (TypeError, json.JSONDecodeError):
            return fallback
    return value


def normalize_pronunciation_entries(value: Any) -> List[dict]:
    """Validate the project lexicon used to prepare TTS-only text."""
    value = _json_value(value, [])
    if value in (None, ''):
        return []
    if not isinstance(value, list):
        raise ValueError('pronunciation_lexicon must be an array')
    if len(value) > MAX_PRONUNCIATION_ENTRIES:
        raise ValueError(f'发音词典最多支持 {MAX_PRONUNCIATION_ENTRIES} 条')

    entries: List[dict] = []
    seen = set()
    for item in value:
        if not isinstance(item, dict):
            continue
        term = str(item.get('term') or item.get('source') or '').strip()
        pronunciation = str(item.get('pronunciation') or item.get('replacement') or '').strip()
        if not term or not pronunciation:
            continue
        if len(term) > 80 or len(pronunciation) > 160:
            raise ValueError('发音词典词条过长')
        if FISH_CONTROL_TOKEN_RE.search(term) or FISH_CONTROL_TOKEN_RE.search(pronunciation):
            raise ValueError('发音词典不能包含 Fish Audio 控制标记')
        key = term.casefold()
        if key in seen:
            continue
        seen.add(key)
        entries.append({'term': term, 'pronunciation': pronunciation})
    return entries


def apply_pronunciation_lexicon(text: Any, entries: Any) -> str:
    """Apply longest terms first without mutating the stored/subtitle source text."""
    result = str(text or '')
    normalized = normalize_pronunciation_entries(entries)
    for item in sorted(normalized, key=lambda entry: len(entry['term']), reverse=True):
        result = re.sub(
            re.escape(item['term']),
            lambda _match, replacement=item['pronunciation']: replacement,
            result,
            flags=re.IGNORECASE,
        )
    return result


def _normalize_director(value: Any, *, partial: bool = False) -> dict:
    value = value if isinstance(value, dict) else {}
    result = {} if partial else dict(DEFAULT_NARRATION_PREFERENCES['emotion_director'])
    for field, allowed in _DIRECTOR_VALUES.items():
        if field not in value:
            continue
        candidate = str(value.get(field) or '').strip().lower()
        if candidate not in allowed:
            raise ValueError(f'Invalid emotion_director.{field}')
        result[field] = candidate
    if 'emotion' in value:
        emotion = str(value.get('emotion') or '').strip().lower()
        if emotion and emotion not in _FISH_EMOTIONS:
            raise ValueError('Invalid emotion_director.emotion')
        if emotion:
            result['emotion'] = emotion
    return result


def normalize_narration_preferences(value: Any) -> dict:
    value = _json_value(value, {})
    if value in (None, ''):
        value = {}
    if not isinstance(value, dict):
        raise ValueError('narration_preferences must be an object')

    subtitle_timing = str(value.get('subtitle_timing') or 'estimated').strip().lower()
    if subtitle_timing not in {'estimated', 'asr'}:
        raise ValueError('subtitle_timing must be estimated or asr')
    raw_overrides = value.get('page_overrides') or {}
    if not isinstance(raw_overrides, dict) or len(raw_overrides) > 200:
        raise ValueError('page_overrides must be an object with at most 200 pages')
    page_overrides = {}
    for page_id, override in raw_overrides.items():
        page_key = str(page_id).strip()
        if not page_key or len(page_key) > 100 or not isinstance(override, dict):
            continue
        page_overrides[page_key] = _normalize_director(override, partial=True)

    quality_check = bool(value.get('quality_check', False))
    return {
        'quality_check': quality_check,
        'strict_quality_check': quality_check and bool(value.get('strict_quality_check', False)),
        'subtitle_timing': subtitle_timing,
        'emotion_director': _normalize_director(value.get('emotion_director')),
        'page_overrides': page_overrides,
    }


def normalize_voice_assets(value: Any) -> List[dict]:
    value = _json_value(value, [])
    if value in (None, ''):
        return []
    if not isinstance(value, list):
        raise ValueError('fish_audio_voice_assets must be an array')
    if len(value) > MAX_VOICE_ASSETS:
        raise ValueError(f'人物声线资产最多支持 {MAX_VOICE_ASSETS} 条')
    assets = []
    seen = set()
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            continue
        voice = str(item.get('voice') or '').strip()
        name = str(item.get('name') or '').strip()
        asset_id = str(item.get('id') or f'voice_asset_{index + 1}').strip()
        if not voice or not name or not asset_id or asset_id in seen:
            continue
        if any(len(part) > 160 for part in (voice, name, asset_id)):
            raise ValueError('人物声线资产字段过长')
        avatar = str(item.get('avatar') or '').strip()
        if len(avatar) > 500:
            raise ValueError('人物声线资产头像字段过长')
        emotion = str(item.get('default_emotion') or 'warm').strip().lower()
        if emotion not in _FISH_EMOTIONS:
            emotion = 'warm'
        seen.add(asset_id)
        assets.append({
            'id': asset_id,
            'name': name,
            'voice': voice,
            'avatar': avatar,
            'rate': str(item.get('rate') or '+0%'),
            'language': str(item.get('language') or 'zh')[:10],
            'default_emotion': emotion,
            'use_case': str(item.get('use_case') or '')[:160],
            'synthetic': bool(item.get('synthetic', False)),
        })
    return assets


def estimate_narration_usage(pages: Any, *, speed: float = 1.0) -> dict:
    """Estimate Fish calls and duration from the same page-level request model as export."""
    page_items = pages if isinstance(pages, list) else []
    characters = 0
    requests = 0
    role_ids = set()
    for page in page_items:
        if not isinstance(page, dict):
            continue
        segments = normalize_narration_segments(
            page.get('narration_segments'),
            fallback_text=page.get('narration_text'),
        )
        page_has_text = False
        for segment in segments:
            text = re.sub(r'\s+', '', str(segment.get('text') or ''))
            if not text:
                continue
            page_has_text = True
            characters += len(text)
            role_ids.add(str(segment.get('speaker_id') or 'host'))
        if page_has_text:
            requests += 1
    try:
        normalized_speed = max(0.5, min(float(speed), 2.0))
    except (TypeError, ValueError):
        normalized_speed = 1.0
    estimated_seconds = round(characters / (4.0 * normalized_speed), 1) if characters else 0.0
    return {
        'characters': characters,
        'estimated_seconds': estimated_seconds,
        'requests': requests,
        'roles': len(role_ids),
        'free_model_notice': 's2.1-pro-free 为免费模型，实际额度与并发限制以 Fish Audio 账户为准。',
    }


def _comparison_text(value: Any) -> str:
    return ''.join(
        char.casefold()
        for char in unicodedata.normalize('NFKC', str(value or ''))
        if not char.isspace() and not unicodedata.category(char).startswith(('P', 'S'))
    )


def compare_asr_transcript(expected: Any, actual: Any, *, threshold: float = 0.9) -> dict:
    expected_text = _comparison_text(expected)
    actual_text = _comparison_text(actual)
    similarity = (
        SequenceMatcher(None, expected_text, actual_text).ratio()
        if expected_text or actual_text
        else 1.0
    )
    similarity = round(similarity, 4)
    return {
        'similarity': similarity,
        'matched': similarity >= threshold,
        'expected_characters': len(expected_text),
        'transcribed_characters': len(actual_text),
    }


def _stable_hash(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(payload.encode('utf-8')).hexdigest()


def normalize_speakers(value: Any, default_voice: Optional[str] = None) -> List[dict]:
    if not isinstance(value, list):
        value = []
    speakers = []
    for index, item in enumerate(value[:4]):
        if not isinstance(item, dict):
            continue
        speaker_id = str(item.get('id') or item.get('speaker_id') or f'speaker_{index + 1}').strip()
        voice = str(item.get('voice') or default_voice or '').strip()
        if speaker_id:
            speakers.append({
                'id': speaker_id,
                'name': str(item.get('name') or speaker_id).strip(),
                'voice': voice,
                'rate': str(item.get('rate') or '+0%'),
            })
    return speakers


def normalize_narration_segments(
    value: Any,
    fallback_text: Optional[str] = None,
    default_voice: Optional[str] = None,
    default_rate: str = '+0%',
) -> List[dict]:
    """Normalize stored or AI-generated segments while preserving legacy text."""
    raw_segments = value
    if isinstance(value, str):
        try:
            raw_segments = json.loads(value)
        except (TypeError, json.JSONDecodeError):
            raw_segments = []
    segments = []
    if isinstance(raw_segments, list):
        for index, item in enumerate(raw_segments):
            if not isinstance(item, dict):
                continue
            text = str(item.get('text') or item.get('narration_text') or '').strip()
            if not text:
                continue
            segments.append({
                'speaker_id': str(item.get('speaker_id') or item.get('speaker') or item.get('role') or 'host').strip() or 'host',
                'text': text,
                'voice': str(item.get('voice') or default_voice or '').strip(),
                'rate': str(item.get('rate') or default_rate),
                'segment_index': index,
            })
            prosody_fields = ('delivery', 'pause_after_ms', 'rate_delta', 'pitch_delta', 'volume')
            for field in prosody_fields:
                if field in item and item.get(field) not in (None, ''):
                    segments[-1][field] = item[field]
    if not segments and fallback_text and str(fallback_text).strip():
        segments = [{
            'speaker_id': 'host',
            'text': str(fallback_text).strip(),
            'voice': default_voice or '',
            'rate': default_rate,
            'segment_index': 0,
        }]
    return segments


def has_dialogue_speakers(segments: Any) -> bool:
    """Return whether segments contain at least two distinct speaker IDs."""
    normalized = normalize_narration_segments(segments)
    return len({item['speaker_id'] for item in normalized}) >= 2


def segments_to_text(segments: Iterable[dict]) -> str:
    return '\n'.join(str(item.get('text') or '').strip() for item in segments if str(item.get('text') or '').strip())


def page_narration_source(page) -> dict:
    outline = page.get_outline_content() or {}
    description = page.get_description_content() or {}
    return {
        'order_index': page.order_index,
        'outline': outline,
        'description': description,
    }


def _script_speakers(value: Any) -> List[dict]:
    return [
        {'id': speaker['id'], 'name': speaker['name']}
        for speaker in normalize_speakers(value)
    ]


def _script_config(config: Optional[dict]) -> dict:
    return {
        key: value
        for key, value in (config or {}).items()
        if key != 'speakers'
    }


def narration_source_hash(page, config: Optional[dict], mode: str = 'single', speakers: Any = None) -> str:
    return _stable_hash({
        'schema_version': NARRATION_SCRIPT_SCHEMA_VERSION,
        'source': page_narration_source(page),
        'config': _script_config(config),
        'mode': mode or 'single',
        'speakers': _script_speakers(speakers),
    })


def narration_config_hash(config: Optional[dict], mode: str = 'single', speakers: Any = None) -> str:
    return _stable_hash({
        'schema_version': NARRATION_SCRIPT_SCHEMA_VERSION,
        'config': _script_config(config),
        'mode': mode or 'single',
        'speakers': _script_speakers(speakers),
    })


def page_narration_is_current(page, source_hash: str, config_hash: str) -> bool:
    return bool(
        ((page.get_narration_text() or '').strip() or page.get_narration_segments())
        and page.narration_source_hash == source_hash
        and page.narration_config_hash == config_hash
    )


def set_page_narration(page, text: Optional[str] = None, segments: Any = None, source_hash: Optional[str] = None, config_hash: Optional[str] = None) -> None:
    normalized = normalize_narration_segments(segments, fallback_text=text)
    page.set_narration_text(segments_to_text(normalized) or text)
    page.set_narration_segments(normalized)
    page.narration_source_hash = source_hash
    page.narration_config_hash = config_hash
    page.narration_status = 'READY' if normalized else 'EMPTY'
    page.narration_audio_manifest = None
    page.narration_error = None


class NarrationRevisionConflict(ValueError):
    pass


class NarrationLocked(ValueError):
    pass


def _check_revision(page, base_revision: Any) -> None:
    try:
        expected = int(base_revision)
    except (TypeError, ValueError):
        raise NarrationRevisionConflict('base_revision is required')
    if expected != int(page.narration_revision or 0):
        raise NarrationRevisionConflict(
            f'旁白已被更新，当前 revision 为 {page.narration_revision or 0}'
        )


def _claim_revision(page, base_revision: Any, *, increment: bool, require_unlocked: bool = False) -> None:
    """Atomically guard writes so two requests cannot both pass a Python-only check."""
    from models import Page, db

    try:
        expected = int(base_revision)
    except (TypeError, ValueError):
        raise NarrationRevisionConflict('base_revision is required')
    query = Page.query.filter_by(id=page.id, narration_revision=expected)
    if require_unlocked:
        query = query.filter(Page.narration_locked.is_(False))
    value = Page.narration_revision + 1 if increment else Page.narration_revision
    if query.update({Page.narration_revision: value}, synchronize_session=False) != 1:
        db.session.expire(page)
        current_revision = Page.query.with_entities(Page.narration_revision).filter_by(id=page.id).scalar()
        if require_unlocked and Page.query.with_entities(Page.narration_locked).filter_by(id=page.id).scalar():
            raise NarrationLocked('当前页面旁白已锁定')
        raise NarrationRevisionConflict(f'旁白已被更新，当前 revision 为 {current_revision or 0}')
    db.session.flush()
    db.session.refresh(page)


def _next_version_number(page_id: str) -> int:
    from models import NarrationVersion

    current = (
        NarrationVersion.query.with_entities(func.max(NarrationVersion.version_number))
        .filter_by(page_id=page_id)
        .scalar()
    )
    return int(current or 0) + 1


def _canonical_narration(text: Any = None, segments: Any = None) -> tuple[str, List[dict]]:
    raw_items = _json_value(segments, [])
    normalized = normalize_narration_segments(segments, fallback_text=text)
    for index, item in enumerate(normalized):
        raw = raw_items[index] if isinstance(raw_items, list) and index < len(raw_items) and isinstance(raw_items[index], dict) else {}
        item['segment_id'] = str(raw.get('segment_id') or uuid.uuid4())
        item['order'] = int(raw.get('order') or index + 1)
        if isinstance(raw.get('focus_element_ids'), list):
            item['focus_element_ids'] = [str(value) for value in raw['focus_element_ids'] if str(value).strip()]
        item['source'] = str(raw.get('source') or 'manual')
    canonical_text = segments_to_text(normalized)
    if not canonical_text:
        raise ValueError('旁白文案不能为空')
    if FISH_CONTROL_TOKEN_RE.search(canonical_text):
        raise ValueError('旁白正文不能包含 Fish Audio 控制标记')
    return canonical_text, normalized


def _version_content_hash(mode: str, language: str, text: str, segments: List[dict]) -> str:
    return _stable_hash({
        'mode': mode,
        'language': language,
        'text': text,
        'segments': segments,
    })


def _new_version(
    page,
    *,
    text: Any = None,
    segments: Any = None,
    mode: str = 'single',
    language: str = 'auto',
    source_type: str = 'manual',
    status: str = 'candidate',
    parent_version_id: Optional[str] = None,
    ai_operation: Optional[str] = None,
    ai_config: Optional[dict] = None,
    created_by: str = 'user',
):
    from models import NarrationVersion

    mode = mode if mode in {'single', 'dialogue'} else 'single'
    language = str(language or 'auto')[:20]
    canonical_text, normalized = _canonical_narration(text, segments)
    version = NarrationVersion(
        id=str(uuid.uuid4()),
        page_id=page.id,
        version_number=_next_version_number(page.id),
        mode=mode,
        language=language,
        text=canonical_text,
        segments_json=json.dumps(normalized, ensure_ascii=False),
        source_type=source_type,
        status=status,
        parent_version_id=parent_version_id,
        ai_operation=ai_operation,
        ai_config_json=json.dumps(ai_config, ensure_ascii=False) if ai_config else None,
        content_hash=_version_content_hash(mode, language, canonical_text, normalized),
        created_by=created_by,
        created_at=datetime.utcnow(),
    )
    return version


def _archive_current_version(page) -> None:
    from models import NarrationVersion

    if not page.current_narration_version_id:
        return
    current = NarrationVersion.query.get(page.current_narration_version_id)
    if current and current.status == 'applied':
        current.status = 'archived'


def _project_version(page, version) -> None:
    segments = version.get_segments()
    set_page_narration(page, text=version.text, segments=segments)
    page.current_narration_version_id = version.id
    page.narration_source_hash = None
    page.narration_config_hash = None
    page.updated_at = datetime.utcnow()


def ensure_legacy_narration_version(page):
    """Lazily materialize legacy Page fields without rewriting the whole database."""
    from models import NarrationVersion, db

    if page.current_narration_version_id:
        return NarrationVersion.query.get(page.current_narration_version_id)
    if not ((page.get_narration_text() or '').strip() or page.get_narration_segments()):
        return None
    version = _new_version(
        page,
        text=page.get_narration_text(),
        segments=page.get_narration_segments(),
        mode='dialogue' if has_dialogue_speakers(page.get_narration_segments()) else 'single',
        source_type='legacy',
        status='applied',
        created_by='migration',
    )
    db.session.add(version)
    db.session.flush()
    page.current_narration_version_id = version.id
    page.narration_revision = int(page.narration_revision or 0) + 1
    return version


def save_narration_draft(page, payload: dict):
    """Update the compatibility projection only; confirmed version remains unchanged."""
    _claim_revision(page, payload.get('base_revision'), increment=True)
    text, segments = _canonical_narration(payload.get('text'), payload.get('segments'))
    set_page_narration(page, text=text, segments=segments)
    page.narration_status = 'DRAFT'
    page.updated_at = datetime.utcnow()
    return page


def save_manual_narration_version(page, payload: dict):
    from models import db

    _claim_revision(page, payload.get('base_revision'), increment=True)
    _archive_current_version(page)
    version = _new_version(
        page,
        text=payload.get('text', payload.get('narration_text')),
        segments=payload.get('segments', payload.get('narration_segments')),
        mode=payload.get('mode', 'single'),
        language=payload.get('language', 'auto'),
        source_type='manual',
        status='applied',
        parent_version_id=page.current_narration_version_id,
        created_by='user',
    )
    db.session.add(version)
    db.session.flush()
    _project_version(page, version)
    return version


def create_ai_narration_candidate(
    page,
    *,
    payload: dict,
    result: dict,
    source_type: str,
    provider_meta: Optional[dict] = None,
):
    from models import NarrationVersion, db

    _claim_revision(page, payload.get('base_revision'), increment=False, require_unlocked=True)
    base_version_id = payload.get('base_version_id')
    if base_version_id:
        base = NarrationVersion.query.filter_by(id=base_version_id, page_id=page.id).first()
        if not base:
            raise ValueError('基础旁白版本不存在')
    version = _new_version(
        page,
        text=result.get('text'),
        segments=result.get('segments'),
        mode=result.get('mode') or payload.get('mode') or 'single',
        language=result.get('language') or payload.get('language') or 'auto',
        source_type=source_type,
        status='candidate',
        parent_version_id=base_version_id or page.current_narration_version_id,
        ai_operation=payload.get('operation'),
        ai_config=_candidate_config_base(page, payload, provider_meta),
        created_by='ai',
    )
    db.session.add(version)
    db.session.flush()
    return version


def apply_narration_version(page, source_version, base_revision: Any):
    from models import db

    _claim_revision(page, base_revision, increment=True)
    _archive_current_version(page)
    applied = _new_version(
        page,
        text=source_version.text,
        segments=source_version.get_segments(),
        mode=source_version.mode,
        language=source_version.language,
        source_type=source_version.source_type,
        status='applied',
        parent_version_id=source_version.id,
        ai_operation=source_version.ai_operation,
        created_by='user',
    )
    db.session.add(applied)
    db.session.flush()
    if source_version.status == 'candidate':
        source_version.status = 'archived'
    _project_version(page, applied)
    return applied


def set_narration_lock(page, locked: Any, base_revision: Any) -> None:
    _claim_revision(page, base_revision, increment=True)
    page.narration_locked = bool(locked)
    page.updated_at = datetime.utcnow()


def narration_diff(before: Any, after: Any) -> dict:
    before_text = str(before or '')
    after_text = str(after or '')
    return {
        'changed': before_text != after_text,
        'similarity': round(SequenceMatcher(None, before_text, after_text).ratio(), 4),
        'before_characters': len(before_text),
        'after_characters': len(after_text),
    }


# --- 阶段3：候选稳定契约（重构计划 §7.4） ---

_PROVIDER_MODULE_NAMES = ('openai', 'genai', 'codex', 'anthropic', 'lazyllm', 'edge')
_PROMPT_VERSION = 'narration-candidate-v2'
UNKNOWN_ID = 'legacy.unknown'


def provider_metadata(provider) -> dict:
    """Capture the real upstream provider/model identity without guessing."""
    module = type(provider).__module__.lower()
    provider_name = next(
        (name for name in _PROVIDER_MODULE_NAMES if name in module),
        'unknown',
    )
    model = getattr(provider, 'model', None)
    return {
        'provider': provider_name,
        'model_id': str(model) if model else UNKNOWN_ID,
        'prompt_version': _PROMPT_VERSION,
    }


def _candidate_config_base(page, payload: dict, provider_meta: Optional[dict]) -> dict:
    config = {
        'instruction': payload.get('instruction'),
        'selection': payload.get('selection'),
        'generation_config': payload.get('generation_config'),
        'source_page_revision': int(getattr(page, 'narration_revision', 0) or 0),
        'source_content_hash': getattr(page, 'narration_source_hash', None),
        'prompt_version': _PROMPT_VERSION,
    }
    if provider_meta:
        config.update(provider_meta)
    return config


def candidate_contract(version) -> dict:
    """Stable candidate contract; ``NarrationVersion.id`` is the candidate id.

    Missing legacy fields serialize as ``legacy.unknown`` — never guessed
    provider/model/style IDs. Falls back to the page's live revision/hash
    only when the legacy candidate predates the normalized ai_config.
    """
    config = version.get_ai_config() or {}
    generation_config = config.get('generation_config') or {}
    page = version.page
    page_revision = int(
        config.get('source_page_revision')
        or getattr(page, 'narration_revision', 0)
        or 0
    )
    source_hash = config.get('source_content_hash') or getattr(
        page, 'narration_source_hash', None,
    )
    return {
        'candidate_id': version.id,
        'page_id': version.page_id,
        'source_page_revision': page_revision,
        'base_version_id': version.parent_version_id,
        'source_content_hash': source_hash or UNKNOWN_ID,
        'status': version.status,
        'operation': version.ai_operation or UNKNOWN_ID,
        'style_profile_id': str(generation_config.get('style_profile_id') or UNKNOWN_ID),
        'expressiveness_id': str(generation_config.get('expressiveness_id') or UNKNOWN_ID),
        'voice_profile_id': str(generation_config.get('voice_profile_id') or UNKNOWN_ID),
        'text': version.text,
        'segments': version.get_segments(),
        'provider': str(config.get('provider') or UNKNOWN_ID),
        'model_id': str(config.get('model_id') or UNKNOWN_ID),
        'prompt_version': str(config.get('prompt_version') or UNKNOWN_ID),
        'created_at': version.created_at.isoformat() if version.created_at else None,
    }
