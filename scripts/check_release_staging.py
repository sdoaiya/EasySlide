import argparse
import subprocess
import sys


BLOCKED_PREFIXES = (
    ".codex-tmp/",
    ".codex/",
    ".playwright-cli/",
    ".pytest_cache/",
    ".venv/",
    "backend/.codex-tmp/",
    "backend/build/",
    "backend/dist/",
    "backend/graphify-out/",
    "desktop/resources/",
    "frontend/.codex-tmp/",
    "frontend/dist/",
    "frontend/node_modules/",
    "graphify-out/",
    "node_modules/",
    "output/playwright/",
    "pytest-of-",
    "release/",
    "test-results/",
    "tmp",
    "ui-demo/",
    "experiments/",
)
BLOCKED_NAMES = {"debug.log"}


def staged_paths():
    completed = subprocess.run(
        ["git", "diff", "--cached", "--name-only", "-z"],
        capture_output=True,
        check=True,
    )
    return [path.decode("utf-8", "replace") for path in completed.stdout.split(b"\0") if path]


def blocked(paths):
    bad = []
    for raw in paths:
        path = raw.replace("\\", "/")
        if path.startswith("./"):
            path = path[2:]
        lowered = path.lower()
        if (
            lowered in BLOCKED_NAMES
            or lowered.endswith(".log")
            or "__pycache__/" in lowered
            or "/node_modules/" in lowered
            or "/.pytest_cache/" in lowered
            or any(lowered.startswith(prefix) for prefix in BLOCKED_PREFIXES)
        ):
            bad.append(path)
    return bad


def main():
    parser = argparse.ArgumentParser(description="Fail if generated or scratch paths are staged.")
    parser.add_argument("--paths", nargs="*", help="Optional paths to check instead of the Git index.")
    args = parser.parse_args()

    bad = blocked(args.paths if args.paths is not None else staged_paths())
    if bad:
        print("Blocked generated/scratch paths:")
        print("\n".join(f"- {path}" for path in bad))
        return 1
    print("release staging check: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
