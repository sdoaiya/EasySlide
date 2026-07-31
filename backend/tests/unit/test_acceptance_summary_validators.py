import importlib.util
import json
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[3]


def load_script(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


video_validator = load_script("validate_video_acceptance_summary")
fish_validator = load_script("validate_fish_acceptance_summary")


def write_video_summary(tmp_path, *, page_ids=("page-1",)):
    tmp_path.mkdir(parents=True, exist_ok=True)
    for name in ["independent-proof.mp4", "independent-final.mp4", "ppt-proof.mp4", "ppt-final.mp4"]:
        (tmp_path / name).write_bytes(b"fixture")
    media = {"duration": 1, "streams": [{"codec_type": "video", "width": 1920, "height": 1080}]}
    payload = {
        "independent_video": {"project_id": "video-independent", "proof": {"output": str(tmp_path / "independent-proof.mp4"), "media": media}, "final": {"output": str(tmp_path / "independent-final.mp4"), "media": media}},
        "ppt_video": {"project_id": "video-ppt", "source_revision": 1, "page_ids": list(page_ids), "proof": {"output": str(tmp_path / "ppt-proof.mp4"), "media": media}, "final": {"output": str(tmp_path / "ppt-final.mp4"), "media": media}},
    }
    path = tmp_path / "video-summary.json"
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def write_fish_summary(tmp_path, *, peak=-1, transcript="{}"):
    tmp_path.mkdir(parents=True, exist_ok=True)
    for name in ["single.mp3", "single.wav", "dialogue.mp3", "dialogue.wav"]:
        (tmp_path / name).write_bytes(b"fixture")
    for name in ["single-cover.json", "dialogue-transcript.json", "dialogue-cover.json"]:
        (tmp_path / name).write_text("{}", encoding="utf-8")
    (tmp_path / "single-transcript.json").write_text(transcript, encoding="utf-8")
    media = {"duration": 1, "max_volume_db": peak, "streams": [{"codec_type": "audio"}]}

    def export(stem, ext):
        return {
            "task_id": f"{stem}-{ext}",
            "output": str(tmp_path / f"{stem}.{ext}"),
            "transcript": str(tmp_path / f"{stem}-transcript.json"),
            "cover": str(tmp_path / f"{stem}-cover.json"),
            "media": media,
        }

    payload = {
        "single": {"project_id": "podcast-single", "mp3": export("single", "mp3"), "wav": export("single", "wav")},
        "dialogue": {"project_id": "podcast-dialogue", "mp3": export("dialogue", "mp3"), "wav": export("dialogue", "wav")},
    }
    path = tmp_path / "fish-summary.json"
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def test_video_acceptance_summary_requires_ppt_trace(tmp_path):
    video_validator.validate_summary(write_video_summary(tmp_path))
    with pytest.raises(AssertionError, match="missing page_ids"):
        video_validator.validate_summary(write_video_summary(tmp_path, page_ids=()))


def test_fish_acceptance_summary_requires_safe_audio_and_json_sidecars(tmp_path):
    fish_validator.validate_summary(write_fish_summary(tmp_path))
    with pytest.raises(AssertionError, match="peak is invalid"):
        fish_validator.validate_summary(write_fish_summary(tmp_path / "hot", peak=1))
    with pytest.raises(AssertionError, match="not readable JSON"):
        fish_validator.validate_summary(write_fish_summary(tmp_path / "bad-json", transcript="{"))
