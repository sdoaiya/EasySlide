"""Small REST client for Fish Audio TTS and private voice models."""

from __future__ import annotations

import os
import time
import mimetypes
from typing import Iterable

import msgpack
import requests


DEFAULT_API_BASE = "https://api.fish.audio"
DEFAULT_MODEL = "s2.1-pro-free"
_RETRY_DELAYS = (1.0, 2.0)


class FishAudioAPIError(RuntimeError):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


def _error_message(response, api_key: str) -> str:
    try:
        payload = response.json()
        message = payload.get("message") if isinstance(payload, dict) else None
    except (TypeError, ValueError):
        message = None
    message = str(message or getattr(response, "text", "") or "Fish Audio request failed").strip()
    return message[:400].replace(api_key, "[redacted]")


def _request(method: str, path: str, api_key: str, api_base: str = DEFAULT_API_BASE, **kwargs):
    if not api_key:
        raise FishAudioAPIError("Fish Audio API Key 未配置", 401)
    headers = {
        "Authorization": f"Bearer {api_key}",
        **kwargs.pop("headers", {}),
    }
    url = f"{api_base.rstrip('/')}/{path.lstrip('/')}"
    timeout = kwargs.pop("timeout", (15, 300))
    for attempt in range(len(_RETRY_DELAYS) + 1):
        try:
            response = requests.request(
                method,
                url,
                headers=headers,
                timeout=timeout,
                **kwargs,
            )
        except requests.RequestException as exc:
            if attempt < len(_RETRY_DELAYS):
                time.sleep(_RETRY_DELAYS[attempt])
                continue
            raise FishAudioAPIError(f"无法连接 Fish Audio: {exc}") from exc

        if response.ok:
            return response
        if (response.status_code == 429 or response.status_code >= 500) and attempt < len(_RETRY_DELAYS):
            response.close()
            time.sleep(_RETRY_DELAYS[attempt])
            continue
        message = _error_message(response, api_key)
        response.close()
        raise FishAudioAPIError(message, response.status_code)
    raise FishAudioAPIError("Fish Audio request failed")


def synthesize(
    *,
    api_key: str,
    text: str,
    output_path: str,
    reference_id: str | list[str] | None = None,
    speed: float = 1.0,
    model: str = DEFAULT_MODEL,
    api_base: str = DEFAULT_API_BASE,
    timeout: tuple[float, float] = (15, 300),
    total_timeout: float | None = None,
) -> None:
    payload = {
        "text": text,
        "format": "mp3",
        "latency": "normal",
        "normalize": True,
        "temperature": 0.7,
        "top_p": 0.7,
        "prosody": {
            "speed": max(0.5, min(float(speed), 2.0)),
            "volume": 0,
            "normalize_loudness": True,
        },
    }
    if reference_id:
        payload["reference_id"] = reference_id
    response = _request(
        "POST",
        "/v1/tts",
        api_key,
        api_base,
        headers={"Content-Type": "application/msgpack", "model": model},
        data=msgpack.packb(payload, use_bin_type=True),
        stream=True,
        timeout=timeout,
    )
    content_type = str(response.headers.get("Content-Type") or "").lower()
    if "json" in content_type or content_type.startswith("text/"):
        message = _error_message(response, api_key)
        response.close()
        raise FishAudioAPIError(message)
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    partial_path = f"{output_path}.part"
    deadline = time.monotonic() + float(total_timeout) if total_timeout else None
    try:
        with open(partial_path, "wb") as handle:
            for chunk in response.iter_content(chunk_size=64 * 1024):
                if deadline and time.monotonic() > deadline:
                    raise TimeoutError(f"Fish Audio TTS 超过 {float(total_timeout):g} 秒未完成")
                if chunk:
                    handle.write(chunk)
        if not os.path.isfile(partial_path) or os.path.getsize(partial_path) <= 0:
            raise FishAudioAPIError("Fish Audio 返回了空音频")
        os.replace(partial_path, output_path)
    except Exception:
        if os.path.exists(partial_path):
            os.remove(partial_path)
        raise
    finally:
        response.close()


def list_voices(
    api_key: str,
    *,
    api_base: str = DEFAULT_API_BASE,
    page_size: int = 100,
    fetch_all: bool = True,
    scope: str = "private",
    sort_by: str = "created_at",
) -> list[dict]:
    scope = (scope or "private").lower()
    if scope == "all":
        merged = []
        seen = set()
        for item in list_voices(api_key, api_base=api_base, page_size=page_size, fetch_all=fetch_all, scope="public", sort_by=sort_by) + list_voices(api_key, api_base=api_base, page_size=page_size, fetch_all=fetch_all, scope="private", sort_by=sort_by):
            if item["id"] not in seen:
                merged.append(item)
                seen.add(item["id"])
        return merged
    if scope not in {"private", "public"}:
        scope = "private"
    if sort_by not in {"created_at", "task_count"}:
        sort_by = "created_at"
    page_size = max(1, min(page_size, 100))
    items = []
    page_number = 1
    while True:
        response = _request(
            "GET",
            "/model",
            api_key,
            api_base,
            params={
                "self": "true" if scope == "private" else "false",
                "page_size": page_size,
                "page_number": page_number,
                "sort_by": sort_by,
            },
            timeout=(15, 60),
        )
        try:
            payload = response.json()
        finally:
            response.close()
        page_items = payload.get("items", []) if isinstance(payload, dict) else []
        items.extend(page_items)
        total = int(payload.get("total") or len(items)) if isinstance(payload, dict) else len(items)
        if not fetch_all or len(items) >= total or len(page_items) < page_size:
            break
        page_number += 1
    available_states = {"created", "trained", "ready", "succeeded", "success"}
    return [
        {
            "id": str(item.get("_id") or ""),
            "title": str(item.get("title") or "未命名声音"),
            "state": str(item.get("state") or "created"),
            "languages": item.get("languages") if isinstance(item.get("languages"), list) else [],
            "visibility": str(item.get("visibility") or scope),
            "author": (item.get("author") or {}).get("nickname") if isinstance(item.get("author"), dict) else None,
            "like_count": int(item.get("like_count") or 0),
            "task_count": int(item.get("task_count") or 0),
        }
        for item in items
        if (
            isinstance(item, dict)
            and item.get("_id")
            and str(item.get("visibility") or scope).lower() == scope
            and str(item.get("type") or "tts").lower() == "tts"
            and str(item.get("state") or "created").lower() in available_states
        )
    ]


def transcribe(
    *,
    api_key: str,
    audio_path: str,
    language: str | None = None,
    include_timestamps: bool = True,
    api_base: str = DEFAULT_API_BASE,
) -> dict:
    """Transcribe a local audio file through Fish Audio ASR."""
    if not os.path.isfile(audio_path):
        raise FishAudioAPIError('待转写音频不存在')
    filename = os.path.basename(audio_path)
    content_type = mimetypes.guess_type(filename)[0] or 'application/octet-stream'
    data = {'ignore_timestamps': 'false' if include_timestamps else 'true'}
    if language:
        data['language'] = str(language).strip()
    with open(audio_path, 'rb') as handle:
        response = _request(
            'POST',
            '/v1/asr',
            api_key,
            api_base,
            files={'audio': (filename, handle, content_type)},
            data=data,
            timeout=(15, 300),
        )
        try:
            payload = response.json()
        except (TypeError, ValueError) as exc:
            raise FishAudioAPIError('Fish Audio ASR 返回了无效响应') from exc
        finally:
            response.close()

    if not isinstance(payload, dict):
        raise FishAudioAPIError('Fish Audio ASR 返回了无效响应')
    raw_segments = payload.get('segments') if isinstance(payload.get('segments'), list) else []
    segments = []
    for item in raw_segments:
        if not isinstance(item, dict):
            continue
        try:
            start = max(0.0, float(item.get('start') or 0))
            end = max(start, float(item.get('end') or start))
        except (TypeError, ValueError):
            continue
        segments.append({
            'text': str(item.get('text') or '').strip(),
            'start': start,
            'end': end,
        })
    try:
        duration = max(0.0, float(payload.get('duration') or 0))
    except (TypeError, ValueError):
        duration = segments[-1]['end'] if segments else 0.0
    return {
        'text': str(payload.get('text') or '').strip(),
        'duration': duration,
        'segments': segments,
    }


def create_private_voice(
    api_key: str,
    *,
    title: str,
    samples: Iterable[dict],
    api_base: str = DEFAULT_API_BASE,
) -> dict:
    files = []
    sample_items = list(samples)
    data: list[tuple[str, str]] = [
        ("type", "tts"),
        ("title", title),
        ("visibility", "private"),
        ("train_mode", "fast"),
        ("enhance_audio_quality", "true"),
    ]
    for sample in sample_items:
        files.append((
            "voices",
            (sample["filename"], sample["content"], sample.get("content_type") or "application/octet-stream"),
        ))
    if any(sample.get("text") for sample in sample_items):
        data.extend(("texts", str(sample.get("text") or "")) for sample in sample_items)
    response = _request(
        "POST",
        "/model",
        api_key,
        api_base,
        files=files,
        data=data,
        timeout=(15, 300),
    )
    try:
        item = response.json()
    finally:
        response.close()
    return {
        "id": str(item.get("_id") or ""),
        "title": str(item.get("title") or title),
        "state": str(item.get("state") or "created"),
        "languages": item.get("languages") if isinstance(item.get("languages"), list) else [],
        "visibility": str(item.get("visibility") or "private"),
    }


def delete_voice(api_key: str, voice_id: str, *, api_base: str = DEFAULT_API_BASE) -> None:
    response = _request("DELETE", f"/model/{voice_id}", api_key, api_base, timeout=(15, 60))
    response.close()
