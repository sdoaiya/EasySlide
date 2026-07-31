"""Deterministic audio mix manifests and the small FFmpeg execution layer."""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import sys
import subprocess
from array import array
from pathlib import Path
from typing import Mapping


AUDIO_MIX_MANIFEST_SCHEMA_VERSION = 1
_ASSET_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
_TOP_LEVEL_FIELDS = {"schema_version", "narration", "music", "sfx"}
_MUSIC_FIELDS = {
    "asset_id", "enabled", "loop", "fade_in_ms", "fade_out_ms",
    "duck_under_narration", "gain_db",
}
_NARRATION_FIELDS = {"source", "normalize"}
_SFX_FIELDS = {
    "cue_id", "asset_id", "page_id", "segment_id", "motion_event_id",
    "offset_ms", "gain_db",
}


def _canonical_bytes(payload: object) -> bytes:
    return json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def _asset_id(value: object, label: str, *, allow_none: bool = False) -> str | None:
    if value is None and allow_none:
        return None
    if not isinstance(value, str) or not _ASSET_ID_RE.fullmatch(value):
        raise ValueError(f"{label} must be a stable asset reference")
    return value


def _integer(value: object, label: str, *, maximum: int | None = None) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"{label} must be a non-negative integer")
    if maximum is not None and value > maximum:
        raise ValueError(f"{label} is outside the supported range")
    return value


def _gain(value: object, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{label} must be a finite number")
    result = float(value)
    if result < -60 or result > 12:
        raise ValueError(f"{label} is outside the supported range")
    return result


def _strict_fields(
    value: object,
    fields: set[str],
    label: str,
    *,
    required: set[str] | None = None,
) -> dict:
    required = fields if required is None else required
    if (
        not isinstance(value, dict)
        or not required.issubset(value)
        or not set(value).issubset(fields)
    ):
        raise ValueError(f"{label} fields are invalid")
    return value


def validate_audio_mix_manifest(manifest: object) -> dict:
    """Validate and return a detached canonical manifest.

    Paths are intentionally absent from this protocol. They are injected only
    by ``resolve_audio_assets`` from an export snapshot's asset table.
    """
    if not isinstance(manifest, dict) or set(manifest) != _TOP_LEVEL_FIELDS:
        raise ValueError("audio mix manifest fields are invalid")
    if manifest.get("schema_version") != AUDIO_MIX_MANIFEST_SCHEMA_VERSION:
        raise ValueError("unsupported audio mix manifest version")

    narration = _strict_fields(manifest["narration"], _NARRATION_FIELDS, "narration")
    if narration.get("source") != "tts-manifest" or not isinstance(narration.get("normalize"), bool):
        raise ValueError("narration source or normalize is invalid")

    music = _strict_fields(manifest["music"], _MUSIC_FIELDS, "music")
    asset_id = _asset_id(music.get("asset_id"), "music.asset_id", allow_none=True)
    if not isinstance(music.get("enabled"), bool) or not isinstance(music.get("loop"), bool):
        raise ValueError("music enabled or loop is invalid")
    if music["enabled"] and asset_id is None:
        raise ValueError("enabled music requires music.asset_id")
    if not isinstance(music.get("duck_under_narration"), bool):
        raise ValueError("music.duck_under_narration is invalid")
    fade_in = _integer(music.get("fade_in_ms"), "music.fade_in_ms", maximum=600000)
    fade_out = _integer(music.get("fade_out_ms"), "music.fade_out_ms", maximum=600000)
    gain_db = _gain(music.get("gain_db"), "music.gain_db")

    sfx = manifest["sfx"]
    if not isinstance(sfx, list):
        raise ValueError("sfx must be an array")
    normalized_sfx = []
    cue_ids = set()
    for index, cue in enumerate(sfx):
        value = _strict_fields(
            cue,
            _SFX_FIELDS,
            f"sfx[{index}]",
            required={"cue_id", "asset_id", "offset_ms", "gain_db"},
        )
        cue_id = _asset_id(value.get("cue_id"), f"sfx[{index}].cue_id")
        if cue_id in cue_ids:
            raise ValueError(f"duplicate SFX cue_id: {cue_id}")
        cue_ids.add(cue_id)
        reference_ids = [
            _asset_id(value.get(field), f"sfx[{index}].{field}")
            for field in ("page_id", "segment_id", "motion_event_id")
            if value.get(field) is not None
        ]
        if not reference_ids:
            raise ValueError(f"sfx[{index}] must bind a page, segment, or motion event")
        normalized_sfx.append({
            "cue_id": cue_id,
            "asset_id": _asset_id(value.get("asset_id"), f"sfx[{index}].asset_id"),
            **{
                field: _asset_id(value.get(field), f"sfx[{index}].{field}")
                for field in ("page_id", "segment_id", "motion_event_id")
                if value.get(field) is not None
            },
            "offset_ms": _integer(value.get("offset_ms"), f"sfx[{index}].offset_ms", maximum=86400000),
            "gain_db": _gain(value.get("gain_db"), f"sfx[{index}].gain_db"),
        })

    return {
        "schema_version": AUDIO_MIX_MANIFEST_SCHEMA_VERSION,
        "narration": {"source": "tts-manifest", "normalize": narration["normalize"]},
        "music": {
            "asset_id": asset_id,
            "enabled": music["enabled"],
            "loop": music["loop"],
            "fade_in_ms": fade_in,
            "fade_out_ms": fade_out,
            "duck_under_narration": music["duck_under_narration"],
            "gain_db": gain_db,
        },
        "sfx": normalized_sfx,
    }


def normalize_audio_mix_manifest(manifest: object) -> dict:
    """Alias used by callers that treat normalization as the public operation."""
    return validate_audio_mix_manifest(manifest)


def build_audio_mix_manifest(
    *,
    narration: Mapping[str, object] | None = None,
    music: Mapping[str, object] | None = None,
    sfx: list[Mapping[str, object]] | None = None,
) -> dict:
    """Build the explicit v1 shape, applying only documented defaults."""
    narration_value = {
        "source": "tts-manifest",
        "normalize": True,
        **(dict(narration) if narration is not None else {}),
    }
    music_value = {
        "asset_id": None,
        "enabled": False,
        "loop": True,
        "fade_in_ms": 600,
        "fade_out_ms": 900,
        "duck_under_narration": True,
        "gain_db": -24,
        **(dict(music) if music is not None else {}),
    }
    return validate_audio_mix_manifest({
        "schema_version": AUDIO_MIX_MANIFEST_SCHEMA_VERSION,
        "narration": narration_value,
        "music": music_value,
        "sfx": list(sfx or []),
    })


def audio_mix_manifest_hash(manifest: object, *, asset_hashes: Mapping[str, str] | None = None) -> str:
    """Return a stable hash suitable for Proof -> Final identity checks."""
    normalized = validate_audio_mix_manifest(manifest)
    safe_hashes = {}
    for asset_id, digest in (asset_hashes or {}).items():
        _asset_id(asset_id, "asset_hashes key")
        if not isinstance(digest, str) or not _SHA256_RE.fullmatch(digest.lower()):
            raise ValueError(f"asset_hashes[{asset_id}] must be a SHA-256 digest")
        safe_hashes[asset_id] = digest.lower()
    payload = {"manifest": normalized, "asset_hashes": safe_hashes}
    return hashlib.sha256(_canonical_bytes(payload)).hexdigest()


def hash_audio_mix_manifest(manifest: object, *, asset_hashes: Mapping[str, str] | None = None) -> str:
    return audio_mix_manifest_hash(manifest, asset_hashes=asset_hashes)


def _asset_mapping(assets: Mapping[str, object] | list[object]) -> Mapping[str, object]:
    if isinstance(assets, Mapping):
        return assets
    if not isinstance(assets, list):
        raise ValueError("audio assets must be a mapping or list")
    result = {}
    for entry in assets:
        if not isinstance(entry, Mapping):
            raise ValueError("audio asset entries must be objects")
        cue = entry.get("cue") if isinstance(entry.get("cue"), Mapping) else entry
        asset_id = cue.get("asset_id") or cue.get("asset_ref") or entry.get("asset_id") or entry.get("asset_ref")
        if not isinstance(asset_id, str) or not asset_id:
            raise ValueError("audio asset entry is missing asset_id")
        result[asset_id] = {
            "path": entry.get("path") or entry.get("relative_path"),
            **({"sha256": entry["sha256"]} if entry.get("sha256") else {}),
        }
    return result


def resolve_audio_assets(manifest: object, assets: Mapping[str, object] | list[object]) -> dict:
    """Resolve snapshot asset IDs to verified local files without mutating manifest."""
    normalized = validate_audio_mix_manifest(manifest)
    assets = _asset_mapping(assets)
    referenced = []
    if normalized["music"]["enabled"]:
        referenced.append(normalized["music"]["asset_id"])
    referenced.extend(cue["asset_id"] for cue in normalized["sfx"])
    resolved = {}
    hashes = {}
    for asset_id in referenced:
        if asset_id in resolved:
            continue
        entry = assets.get(asset_id)
        path = entry.get("path") if isinstance(entry, Mapping) else entry
        expected = entry.get("sha256") if isinstance(entry, Mapping) else None
        if isinstance(path, os.PathLike):
            path = os.fspath(path)
        if not isinstance(path, str) or not path or not os.path.isfile(path):
            raise FileNotFoundError(f"audio asset is unavailable: {asset_id}")
        digest = hashlib.sha256(Path(path).read_bytes()).hexdigest()
        if expected is not None:
            if not isinstance(expected, str) or not _SHA256_RE.fullmatch(expected.lower()):
                raise ValueError(f"audio asset hash is invalid: {asset_id}")
            if digest != expected.lower():
                raise ValueError(f"audio asset changed after snapshot: {asset_id}")
        resolved[asset_id] = {"path": str(Path(path).resolve()), "sha256": digest}
        hashes[asset_id] = digest
    return {"assets": resolved, "asset_hashes": hashes, "manifest_hash": audio_mix_manifest_hash(normalized, asset_hashes=hashes)}


def _audio_codec(output_path: str) -> list[str]:
    suffix = Path(output_path).suffix.lower()
    if suffix == ".wav":
        return ["-c:a", "pcm_s16le"]
    if suffix in {".m4a", ".mp4"}:
        return ["-c:a", "aac", "-b:a", "192k"]
    return ["-c:a", "libmp3lame", "-b:a", "128k"]


def _run_ffmpeg(command: list[str], ffmpeg_path: str) -> None:
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=180)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RuntimeError("FFmpeg audio mix could not run") from exc
    if result.returncode:
        detail = (result.stderr or result.stdout or "").strip()
        raise RuntimeError(f"FFmpeg audio mix failed: {detail[-600:]}")


def _duration_seconds(audio_path: str, ffmpeg_path: str) -> float:
    ffprobe_path = ffmpeg_path.replace("ffmpeg", "ffprobe")
    try:
        result = subprocess.run(
            [ffprobe_path, "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", audio_path],
            capture_output=True, text=True, timeout=30, check=True,
        )
        value = float((result.stdout or "").strip())
    except (OSError, ValueError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        raise RuntimeError("FFprobe could not read audio duration") from exc
    if not math.isfinite(value) or value < 0:
        raise RuntimeError("FFprobe returned an invalid audio duration")
    return value


def mix_audio_manifest(
    narration_path: str | None,
    output_path: str,
    manifest: object,
    assets: Mapping[str, object] | list[object],
    *,
    duration: float,
    ffmpeg_path: str = "ffmpeg",
    metadata: Mapping[str, object] | None = None,
    cover_path: str | os.PathLike[str] | None = None,
) -> float:
    """Mix a frozen manifest and return the actual output duration in seconds."""
    normalized = validate_audio_mix_manifest(manifest)
    if isinstance(duration, bool) or not isinstance(duration, (int, float)) or not math.isfinite(duration) or duration <= 0:
        raise ValueError("audio mix duration must be a positive finite number")
    duration = float(duration)
    for cue in normalized["sfx"]:
        if cue["offset_ms"] > round(duration * 1000):
            raise ValueError(f"SFX cue offset is outside target duration: {cue['cue_id']}")
    resolved = resolve_audio_assets(normalized, assets)["assets"]
    inputs = [ffmpeg_path, "-y"]
    if narration_path is None:
        inputs += ["-f", "lavfi", "-t", f"{duration:.3f}", "-i", "anullsrc=r=48000:cl=stereo"]
    else:
        if not isinstance(narration_path, str) or not os.path.isfile(narration_path):
            raise FileNotFoundError("narration audio is unavailable")
        inputs += ["-i", narration_path]

    narration_filter = (
        f"[0:a]aresample=async=1:first_pts=0,"
        f"apad=pad_dur={duration:.3f},atrim=duration={duration:.3f}"
    )
    if normalized["narration"]["normalize"]:
        narration_filter += ",loudnorm=I=-16:LRA=7:TP=-1.5"
    narration_filter += "[voice]"
    filters = [narration_filter]
    mix_labels = ["[voice]"]
    next_index = 1

    music = normalized["music"]
    if music["enabled"]:
        music_asset = resolved[music["asset_id"]]
        if music["loop"]:
            inputs += ["-stream_loop", "-1"]
        inputs += ["-i", music_asset["path"]]
        music_filter = f"[{next_index}:a]atrim=duration={duration:.3f},asetpts=PTS-STARTPTS"
        fade_in = min(music["fade_in_ms"] / 1000.0, duration)
        fade_out = min(music["fade_out_ms"] / 1000.0, duration)
        if fade_in > 0:
            music_filter += f",afade=t=in:st=0:d={fade_in:.3f}"
        if fade_out > 0:
            music_filter += f",afade=t=out:st={max(0.0, duration - fade_out):.3f}:d={fade_out:.3f}"
        music_filter += f",volume={music['gain_db']:.2f}dB[music]"
        filters.append(music_filter)
        if music["duck_under_narration"]:
            filters.append("[music][voice]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=200[bed]")
            mix_labels.append("[bed]")
        else:
            mix_labels.append("[music]")
        next_index += 1

    for index, cue in enumerate(normalized["sfx"], start=next_index):
        asset = resolved[cue["asset_id"]]
        inputs += ["-i", asset["path"]]
        delay = cue["offset_ms"]
        delay_filter = f"adelay={delay}|{delay}:all=1" if delay else "anull"
        label = f"[sfx{index}]"
        filters.append(
            f"[{index}:a]{delay_filter},atrim=duration={duration:.3f},"
            f"volume={cue['gain_db']:.2f}dB,asetpts=PTS-STARTPTS{label}"
        )
        mix_labels.append(label)
    next_index += len(normalized["sfx"])

    filters.append(
        f"{''.join(mix_labels)}amix=inputs={len(mix_labels)}:duration=first:"
        "dropout_transition=0:normalize=0,alimiter=limit=0.95[mixed]"
    )
    cover_index = None
    if cover_path is not None:
        cover_path = os.fspath(cover_path)
        if str(output_path).lower().endswith(".mp3") and os.path.isfile(cover_path):
            cover_index = next_index
            inputs += ["-i", cover_path]
    metadata_args = []
    for key, value in (metadata or {}).items():
        if value is not None and str(value).strip():
            metadata_args += ["-metadata", f"{key}={value}"]
    mapping = ["-map", "[mixed]"]
    video_args = ["-vn"]
    if cover_index is not None:
        mapping += ["-map", f"{cover_index}:v:0"]
        video_args = ["-c:v", "mjpeg", "-disposition:v:0", "attached_pic", "-id3v2_version", "3"]
    command = inputs + [
        "-filter_complex", ";".join(filters),
        *mapping, *video_args, "-t", f"{duration:.3f}",
        *metadata_args, *_audio_codec(output_path), output_path,
    ]
    _run_ffmpeg(command, ffmpeg_path)
    actual = _duration_seconds(output_path, ffmpeg_path)
    if abs(actual - duration) > 0.25:
        raise RuntimeError(f"mixed audio duration differs from target by more than 250ms: {actual:.3f}s")
    return actual


def mix_audio_cues(
    narration_path: str | None,
    output_path: str,
    cue_assets: list[Mapping[str, object]],
    *,
    duration: float,
    ffmpeg_path: str = "ffmpeg",
) -> float:
    """Compatibility adapter for the previous page-level cue asset shape."""
    music = None
    sfx = []
    assets = {}
    for index, entry in enumerate(cue_assets):
        cue = entry.get("cue") if isinstance(entry.get("cue"), Mapping) else entry
        kind = str(cue.get("kind") or "sfx")
        raw_asset_id = cue.get("asset_id") or cue.get("asset_ref")
        if not isinstance(raw_asset_id, str) or not raw_asset_id:
            raise ValueError(f"audio cue {index} is missing asset_ref")
        asset_id = raw_asset_id if _ASSET_ID_RE.fullmatch(raw_asset_id) else f"asset.{hashlib.sha256(raw_asset_id.encode('utf-8')).hexdigest()[:24]}"
        path = entry.get("path") if isinstance(entry, Mapping) else None
        if isinstance(path, os.PathLike):
            path = os.fspath(path)
        if not isinstance(path, str) or not path:
            raise FileNotFoundError(f"audio cue asset is unavailable: {asset_id}")
        assets[asset_id] = {
            "path": path,
            "sha256": entry.get("sha256") if isinstance(entry, Mapping) else None,
        }
        if kind == "bgm" and music is None:
            music = {
                "asset_id": asset_id,
                "enabled": True,
                "loop": True,
                "fade_in_ms": int(cue.get("fade_in_ms") or 0),
                "fade_out_ms": int(cue.get("fade_out_ms") or 0),
                "duck_under_narration": bool(cue.get("duck_under_narration", True)),
                "gain_db": float(cue.get("gain_db") or 0),
            }
            continue
        if kind not in {"bgm", "sfx"}:
            raise ValueError(f"Unsupported audio cue kind: {kind}")
        raw_cue_id = str(cue.get("cue_id") or f"legacy-cue-{index}")
        cue_id = raw_cue_id if _ASSET_ID_RE.fullmatch(raw_cue_id) else f"legacy-cue-{index}"
        raw_page_id = str(cue.get("page_id") or "legacy-page")
        page_id = raw_page_id if _ASSET_ID_RE.fullmatch(raw_page_id) else "legacy-page"
        sfx.append({
            "cue_id": cue_id,
            "asset_id": asset_id,
            "page_id": page_id,
            "offset_ms": int(cue.get("offset_ms") or 0),
            "gain_db": float(cue.get("gain_db") or 0),
        })
    manifest = build_audio_mix_manifest(
        narration={"normalize": False},
        music=music or {"enabled": False},
        sfx=sfx,
    )
    return mix_audio_manifest(
        narration_path,
        output_path,
        manifest,
        assets,
        duration=duration,
        ffmpeg_path=ffmpeg_path,
    )


def check_audio_peak(path: str, ffmpeg_path: str = "ffmpeg") -> float:
    """Return the measured peak in dBFS; positive values indicate clipping."""
    try:
        result = subprocess.run(
            [ffmpeg_path, "-hide_banner", "-loglevel", "info", "-i", path, "-af", "volumedetect", "-f", "null", "-"],
            capture_output=True,
            text=True,
            timeout=60,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RuntimeError("FFmpeg peak check could not run") from exc
    diagnostics = "\n".join(filter(None, (result.stderr or "", result.stdout or "")))
    if result.returncode:
        raise RuntimeError(f"FFmpeg peak check failed: {diagnostics[-400:]}")
    match = re.search(r"max_volume:\s*(-?[\d.]+) dB", diagnostics)
    if match:
        return float(match.group(1))
    pcm = subprocess.run(
        [ffmpeg_path, "-v", "error", "-i", path, "-f", "s16le", "-ac", "1", "-"],
        capture_output=True,
        timeout=60,
    )
    if pcm.returncode or not pcm.stdout:
        raise RuntimeError(f"FFmpeg peak check failed: {diagnostics[-400:]}")
    samples = array("h")
    samples.frombytes(pcm.stdout[: len(pcm.stdout) - (len(pcm.stdout) % 2)])
    if sys.byteorder != "little":
        samples.byteswap()
    peak = max((abs(value) for value in samples), default=0)
    return -float("inf") if peak == 0 else 20 * math.log10(peak / 32767.0)


__all__ = [
    "AUDIO_MIX_MANIFEST_SCHEMA_VERSION",
    "audio_mix_manifest_hash",
    "build_audio_mix_manifest",
    "check_audio_peak",
    "hash_audio_mix_manifest",
    "mix_audio_cues",
    "mix_audio_manifest",
    "normalize_audio_mix_manifest",
    "resolve_audio_assets",
    "validate_audio_mix_manifest",
]
