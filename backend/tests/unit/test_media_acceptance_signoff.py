import importlib.util
import json
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[3]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))
SPEC = importlib.util.spec_from_file_location("check_media_acceptance_signoff", SCRIPTS / "check_media_acceptance_signoff.py")
signoff = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(signoff)


def write_fixture(tmp_path, *, video_signer="QA", video_date="2026-07-29", video_ids="video-independent, video-ppt", single="podcast-single", dialogue="podcast-dialogue"):
    for name in ["independent-proof.mp4", "independent-final.mp4", "ppt-proof.mp4", "ppt-final.mp4", "single.mp3", "single.wav", "dialogue.mp3", "dialogue.wav"]:
        (tmp_path / name).write_bytes(b"fixture")
    for name in ["single-transcript.json", "single-cover.json", "dialogue-transcript.json", "dialogue-cover.json"]:
        (tmp_path / name).write_text("{}", encoding="utf-8")

    video_media = {"duration": 1, "streams": [{"codec_type": "video", "width": 1920, "height": 1080}]}
    video = {
        "independent_video": {"project_id": "video-independent", "proof": {"output": str(tmp_path / "independent-proof.mp4"), "media": video_media}, "final": {"output": str(tmp_path / "independent-final.mp4"), "media": video_media}},
        "ppt_video": {"project_id": "video-ppt", "source_revision": 1, "page_ids": ["page-1"], "proof": {"output": str(tmp_path / "ppt-proof.mp4"), "media": video_media}, "final": {"output": str(tmp_path / "ppt-final.mp4"), "media": video_media}},
    }
    audio_media = {"duration": 1, "max_volume_db": -1, "streams": [{"codec_type": "audio"}]}
    podcast_export = lambda stem, ext: {"task_id": f"{stem}-{ext}", "output": str(tmp_path / f"{stem}.{ext}"), "transcript": str(tmp_path / f"{stem}-transcript.json"), "cover": str(tmp_path / f"{stem}-cover.json"), "media": audio_media}
    fish = {
        "single": {"project_id": "podcast-single", "mp3": podcast_export("single", "mp3"), "wav": podcast_export("single", "wav")},
        "dialogue": {"project_id": "podcast-dialogue", "mp3": podcast_export("dialogue", "mp3"), "wav": podcast_export("dialogue", "wav")},
    }
    video_path = tmp_path / "video-summary.json"
    fish_path = tmp_path / "fish-summary.json"
    video_path.write_text(json.dumps(video), encoding="utf-8")
    fish_path.write_text(json.dumps(fish), encoding="utf-8")
    rows = "\n".join(f"| {index} | ok | 通过 |" for index in range(1, 16))
    checklist = tmp_path / "checklist.md"
    checklist.write_text(f"""# fixture

## 2. 视频 Proof / Final 人工验收

| 项 | 通过标准 | 结果 |
|---|---|---|
{rows}

- 验收人：{video_signer}
- 日期（YYYY-MM-DD）：{video_date}
- 样本项目 ID：{video_ids}
- 输出文件路径：{video_path}

## 3. 播客 Fish 成功样本验收

| 项 | 通过标准 | 结果 |
|---|---|---|
{rows}

- 验收人：QA
- 日期（YYYY-MM-DD）：2026-07-29
- 单人项目 ID：{single}
- 多人项目 ID：{dialogue}
- 输出文件路径：{fish_path}
""", encoding="utf-8")
    return checklist


def test_media_acceptance_signoff_accepts_matching_summary(tmp_path):
    signoff.check(write_fixture(tmp_path))


@pytest.mark.parametrize(
    ("kwargs", "message"),
    [
        ({"video_signer": "<验收人>"}, "placeholder"),
        ({"video_date": "2026/07/29"}, "YYYY-MM-DD"),
        ({"video_ids": "video-independent, wrong-video"}, "video project IDs"),
        ({"single": "wrong-single"}, "single podcast project ID"),
        ({"dialogue": "wrong-dialogue"}, "dialogue podcast project ID"),
    ],
)
def test_media_acceptance_signoff_rejects_invalid_signoff(tmp_path, kwargs, message):
    with pytest.raises(AssertionError, match=message):
        signoff.check(write_fixture(tmp_path, **kwargs))
