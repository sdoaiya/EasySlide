import argparse
import json
import subprocess
import sys
from pathlib import Path

from validate_media_artifacts import validate


def export(path):
    resolved = path.resolve()
    return {
        "output": str(resolved),
        "media": validate(resolved),
    }


def main():
    parser = argparse.ArgumentParser(description="Build a video Proof/Final acceptance summary JSON.")
    parser.add_argument("--independent-project-id")
    parser.add_argument("--independent-proof", type=Path)
    parser.add_argument("--independent-final", type=Path)
    parser.add_argument("--ppt-project-id")
    parser.add_argument("--ppt-proof", type=Path)
    parser.add_argument("--ppt-final", type=Path)
    parser.add_argument("--ppt-source-revision")
    parser.add_argument("--ppt-page-ids", help="Comma-separated page ids.")
    parser.add_argument("--output", type=Path)
    parser.add_argument("values", nargs="*")
    args = parser.parse_args()

    if args.values and not args.independent_project_id:
        if len(args.values) < 9:
            raise SystemExit("expected positional args: independent_project_id independent_proof independent_final ppt_project_id ppt_proof ppt_final ppt_source_revision ppt_page_ids output")
        args.independent_project_id = args.values[0]
        args.independent_proof = Path(args.values[1])
        args.independent_final = Path(args.values[2])
        args.ppt_project_id = args.values[3]
        args.ppt_proof = Path(args.values[4])
        args.ppt_final = Path(args.values[5])
        args.ppt_source_revision = args.values[6]
        args.ppt_page_ids = ",".join(args.values[7:-1])
        args.output = Path(args.values[-1])

    required = (
        args.independent_project_id, args.independent_proof, args.independent_final,
        args.ppt_project_id, args.ppt_proof, args.ppt_final, args.ppt_source_revision,
        args.ppt_page_ids, args.output,
    )
    if not all(required):
        raise SystemExit("missing required video acceptance summary arguments")

    page_ids = [item.strip() for item in args.ppt_page_ids.split(",") if item.strip()]
    if not page_ids:
        raise SystemExit("--ppt-page-ids must contain at least one page id")

    payload = {
        "independent_video": {
            "project_id": args.independent_project_id,
            "proof": export(args.independent_proof),
            "final": export(args.independent_final),
        },
        "ppt_video": {
            "project_id": args.ppt_project_id,
            "source_revision": args.ppt_source_revision,
            "page_ids": page_ids,
            "proof": export(args.ppt_proof),
            "final": export(args.ppt_final),
        },
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"status": "ok", "output": str(args.output)}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except (AssertionError, FileNotFoundError, json.JSONDecodeError, subprocess.CalledProcessError) as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
