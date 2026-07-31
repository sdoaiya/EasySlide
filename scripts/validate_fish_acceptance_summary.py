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
    return path


def require_json_path(value, label):
    path = require_path(value, label)
    try:
        json.loads(path.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError as exc:
        raise AssertionError(f"{label} is not readable JSON: {path}") from exc


def validate_media(media, label):
    media = require_object(media, f"{label} media")
    if float(media.get("duration") or 0) <= 0:
        raise AssertionError(f"{label} has no readable duration")
    if not any(stream.get("codec_type") == "audio" for stream in media.get("streams", [])):
        raise AssertionError(f"{label} has no audio stream")
    peak = media.get("max_volume_db")
    if peak is None or float(peak) > 0:
        raise AssertionError(f"{label} peak is invalid: {peak}")


def validate_export(payload, label):
    payload = require_object(payload, label)
    for key in ("task_id", "output", "transcript", "cover", "media"):
        if key not in payload:
            raise AssertionError(f"{label} missing {key}")
    require_path(payload["output"], f"{label} output")
    require_json_path(payload["transcript"], f"{label} transcript")
    require_json_path(payload["cover"], f"{label} cover")
    validate_media(payload["media"], label)


def validate_case(payload, label):
    payload = require_object(payload, label)
    if not payload.get("project_id"):
        raise AssertionError(f"{label} missing project_id")
    for key in ("mp3", "wav"):
        if key not in payload:
            raise AssertionError(f"{label} missing {key}")
    validate_export(payload["mp3"], f"{label} mp3")
    validate_export(payload["wav"], f"{label} wav")


def validate_summary(path):
    if not path.exists():
        raise AssertionError(f"summary missing: {path}")
    payload = require_object(json.loads(path.read_text(encoding="utf-8-sig")), "summary")
    for key in ("single", "dialogue"):
        if key not in payload:
            raise AssertionError(f"summary missing {key}")
    validate_case(payload["single"], "single")
    validate_case(payload["dialogue"], "dialogue")
    return payload


def main():
    parser = argparse.ArgumentParser(description="Validate Fish Audio success acceptance summary JSON.")
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
        "single_project_id": payload["single"]["project_id"],
        "dialogue_project_id": payload["dialogue"]["project_id"],
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
