import argparse
import json
import sys
from pathlib import Path


def require_object(value, label):
    if not isinstance(value, dict):
        raise AssertionError(f"{label} must be an object")
    return value


def require_path(value, label):
    path = Path(value)
    if not path.exists():
        raise AssertionError(f"{label} missing: {path}")


def validate_media(media, label):
    media = require_object(media, f"{label} media")
    if float(media.get("duration") or 0) <= 0:
        raise AssertionError(f"{label} has no readable duration")
    streams = media.get("streams", [])
    video = next((stream for stream in streams if stream.get("codec_type") == "video"), None)
    if not video:
        raise AssertionError(f"{label} has no video stream")
    if int(video.get("width") or 0) <= 0 or int(video.get("height") or 0) <= 0:
        raise AssertionError(f"{label} has no readable video dimensions")


def validate_export(payload, label):
    payload = require_object(payload, label)
    for key in ("output", "media"):
        if key not in payload:
            raise AssertionError(f"{label} missing {key}")
    require_path(payload["output"], f"{label} output")
    validate_media(payload["media"], label)


def validate_case(payload, label, *, require_trace=False):
    payload = require_object(payload, label)
    if not payload.get("project_id"):
        raise AssertionError(f"{label} missing project_id")
    for key in ("proof", "final"):
        if key not in payload:
            raise AssertionError(f"{label} missing {key}")
    validate_export(payload["proof"], f"{label} proof")
    validate_export(payload["final"], f"{label} final")
    if require_trace:
        if not payload.get("source_revision"):
            raise AssertionError(f"{label} missing source_revision")
        if not payload.get("page_ids"):
            raise AssertionError(f"{label} missing page_ids")


def validate_summary(path):
    if not path.exists():
        raise AssertionError(f"summary missing: {path}")
    payload = require_object(json.loads(path.read_text(encoding="utf-8-sig")), "summary")
    for key in ("independent_video", "ppt_video"):
        if key not in payload:
            raise AssertionError(f"summary missing {key}")
    validate_case(payload["independent_video"], "independent_video")
    validate_case(payload["ppt_video"], "ppt_video", require_trace=True)
    return payload


def main():
    parser = argparse.ArgumentParser(description="Validate video Proof/Final acceptance summary JSON.")
    parser.add_argument("summary", type=Path)
    args = parser.parse_args()
    try:
        payload = validate_summary(args.summary)
    except (AssertionError, KeyError, json.JSONDecodeError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    print(json.dumps({
        "status": "ok",
        "summary": str(args.summary),
        "independent_project_id": payload["independent_video"]["project_id"],
        "ppt_project_id": payload["ppt_video"]["project_id"],
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
