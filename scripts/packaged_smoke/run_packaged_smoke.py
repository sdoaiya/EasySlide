import argparse
import json
import subprocess
import sys
from pathlib import Path


SMOKES = [
    ("workspace_sync", "workspace_sync.py"),
    ("ppt_pdf_export", "ppt_pdf_export.py"),
    ("pause_resume_export", "pause_resume_export.py"),
    ("podcast_timeout", "podcast_timeout.py"),
]
OPTIONAL_SMOKES = [
    ("podcast_fish_success", "podcast_fish_success.py"),
]


def main() -> int:
    parser = argparse.ArgumentParser(description="Run packaged EasySlide release smokes.")
    parser.add_argument("backend", type=Path, help="Path to packaged easyslide-backend executable")
    parser.add_argument("work_root", type=Path, help="Directory for disposable smoke workspaces")
    parser.add_argument("--port-start", type=int, default=55310)
    all_smokes = SMOKES + OPTIONAL_SMOKES
    parser.add_argument("--only", choices=[name for name, _ in all_smokes], action="append")
    args = parser.parse_args()

    backend = args.backend.resolve()
    work_root = args.work_root.resolve()
    selected = {name for name in args.only} if args.only else {name for name, _ in SMOKES}
    script_dir = Path(__file__).resolve().parent
    results = []

    for offset, (name, filename) in enumerate(all_smokes):
        if name not in selected:
            continue
        command = [
            sys.executable,
            str(script_dir / filename),
            str(backend),
            str(work_root / name),
            str(args.port_start + offset),
        ]
        completed = subprocess.run(command, text=True, capture_output=True, check=False)
        payload = completed.stdout.strip().splitlines()[-1] if completed.stdout.strip() else ""
        if name in {item[0] for item in OPTIONAL_SMOKES} and completed.returncode == 2:
            result = json.loads(payload)
            if result.get("status") == "skipped":
                results.append({"name": name, "result": result})
                print(f"{name}: skipped")
                continue
        if completed.returncode != 0:
            sys.stdout.write(completed.stdout)
            sys.stderr.write(completed.stderr)
            return completed.returncode
        results.append({"name": name, "result": json.loads(payload)})
        print(f"{name}: ok")

    print(json.dumps({"smokes": results}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
