import hashlib
import json
import subprocess
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

from services.audio_mix_service import (
    audio_mix_manifest_hash,
    build_audio_mix_manifest,
    check_audio_peak,
    mix_audio_cues,
    mix_audio_manifest,
    resolve_audio_assets,
    validate_audio_mix_manifest,
)


ROOT = Path(__file__).parents[3]


def _schema():
    path = ROOT / "shared" / "video" / "audio-mix-manifest.schema.json"
    return Draft202012Validator(json.loads(path.read_text(encoding="utf-8")))


def _manifest():
    return build_audio_mix_manifest(
        music={
            "asset_id": "music.1",
            "enabled": True,
            "loop": True,
            "fade_in_ms": 50,
            "fade_out_ms": 80,
            "duck_under_narration": True,
            "gain_db": -24,
        },
        sfx=[{
            "cue_id": "cue.1",
            "asset_id": "sfx.1",
            "page_id": "page.1",
            "motion_event_id": "title.enter_end",
            "offset_ms": 250,
            "gain_db": -8,
        }],
    )


def _tone(path, frequency, duration):
    subprocess.run([
        "ffmpeg", "-y", "-f", "lavfi", "-i",
        f"sine=frequency={frequency}:duration={duration}", str(path),
    ], check=True, capture_output=True)


def test_manifest_matches_shared_schema_and_hash_is_stable():
    manifest = _manifest()
    _schema().validate(manifest)
    assert validate_audio_mix_manifest(manifest) == manifest
    assert audio_mix_manifest_hash(manifest) == audio_mix_manifest_hash(json.loads(json.dumps(manifest)))


def test_manifest_requires_binding_and_rejects_paths():
    with pytest.raises(ValueError, match="bind"):
        validate_audio_mix_manifest({
            "schema_version": 1,
            "narration": {"source": "tts-manifest", "normalize": True},
            "music": {"asset_id": None, "enabled": False, "loop": True, "fade_in_ms": 0, "fade_out_ms": 0, "duck_under_narration": True, "gain_db": -24},
            "sfx": [{"cue_id": "cue.1", "asset_id": "C:\\\\music.mp3", "offset_ms": 0, "gain_db": 0}],
        })


def test_resolve_audio_assets_verifies_snapshot_hash(tmp_path):
    asset = tmp_path / "sfx.mp3"
    asset.write_bytes(b"asset")
    manifest = build_audio_mix_manifest(sfx=[{"cue_id": "cue.1", "asset_id": "sfx.1", "page_id": "page.1", "offset_ms": 0, "gain_db": 0}])
    digest = hashlib.sha256(asset.read_bytes()).hexdigest()
    resolved = resolve_audio_assets(manifest, {"sfx.1": {"path": str(asset), "sha256": digest}})
    assert resolved["asset_hashes"] == {"sfx.1": digest}
    with pytest.raises(ValueError, match="changed"):
        resolve_audio_assets(manifest, {"sfx.1": {"path": str(asset), "sha256": "0" * 64}})


def test_mix_manifest_rejects_cue_after_target_duration(tmp_path):
    narration = tmp_path / "narration.mp3"
    narration.write_bytes(b"not-used")
    manifest = build_audio_mix_manifest(sfx=[{
        "cue_id": "cue.1",
        "asset_id": "sfx.1",
        "page_id": "page.1",
        "offset_ms": 601,
        "gain_db": 0,
    }])
    with pytest.raises(ValueError, match="outside target duration"):
        mix_audio_manifest(str(narration), str(tmp_path / "out.mp3"), manifest, {}, duration=0.6)


def test_mix_manifest_loops_bgm_ducks_voice_and_offsets_sfx(tmp_path):
    pytest.importorskip("shutil").which("ffmpeg") or pytest.skip("ffmpeg not available")
    narration = tmp_path / "narration.mp3"
    music = tmp_path / "music.mp3"
    sfx = tmp_path / "sfx.mp3"
    output = tmp_path / "mixed.mp3"
    _tone(narration, 440, 1.2)
    _tone(music, 220, 0.25)
    _tone(sfx, 880, 0.15)
    manifest = _manifest()
    duration = mix_audio_manifest(
        str(narration), str(output), manifest,
        {
            "music.1": {"path": str(music), "sha256": hashlib.sha256(music.read_bytes()).hexdigest()},
            "sfx.1": {"path": str(sfx), "sha256": hashlib.sha256(sfx.read_bytes()).hexdigest()},
        },
        duration=1.2,
    )
    assert output.stat().st_size > 0
    assert 1.0 <= duration <= 1.4
    assert check_audio_peak(str(output)) <= 0


def test_mix_manifest_supports_music_without_narration(tmp_path):
    pytest.importorskip("shutil").which("ffmpeg") or pytest.skip("ffmpeg not available")
    music = tmp_path / "music.mp3"
    output = tmp_path / "mixed.mp3"
    _tone(music, 220, 0.2)
    manifest = build_audio_mix_manifest(music={"asset_id": "music.1", "enabled": True, "gain_db": -18})
    duration = mix_audio_manifest(
        None, str(output), manifest,
        {"music.1": str(music)}, duration=0.6,
    )
    assert output.stat().st_size > 0
    assert 0.4 <= duration <= 0.8


def test_legacy_mix_adapter_accepts_path_shaped_asset_refs(tmp_path):
    pytest.importorskip("shutil").which("ffmpeg") or pytest.skip("ffmpeg not available")
    narration = tmp_path / "narration.mp3"
    sfx = tmp_path / "sfx.mp3"
    output = tmp_path / "legacy.mp3"
    _tone(narration, 440, 0.6)
    _tone(sfx, 880, 0.1)
    duration = mix_audio_cues(
        str(narration),
        str(output),
        [{
            "cue": {
                "cue_id": "cue.1",
                "kind": "sfx",
                "asset_ref": "/files/materials/sfx.mp3",
                "offset_ms": 100,
                "gain_db": -8,
            },
            "path": str(sfx),
            "sha256": hashlib.sha256(sfx.read_bytes()).hexdigest(),
        }],
        duration=0.6,
    )
    assert output.stat().st_size > 0
    assert 0.4 <= duration <= 0.8
