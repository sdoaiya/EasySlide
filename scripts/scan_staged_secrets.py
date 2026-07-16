#!/usr/bin/env python3
"""Reject likely real credentials from staged Git content."""

from __future__ import annotations

import re
import subprocess
import sys


SKIPPED_PATH_PREFIXES = ("backend/tests/", "frontend/src/tests/", "e2e/", "docs/")
PLACEHOLDER_MARKERS = ("your-", "example", "placeholder", "change-this", "test-")
ASSIGNMENT = re.compile(r"(?i)(?:api[_-]?key|token|secret|password|authorization)\s*[:=]\s*['\"]([A-Za-z0-9_./+=-]{16,})['\"]")
TOKEN_PATTERNS = (
    re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b"),
    re.compile(r"\bAIza[A-Za-z0-9_-]{30,}\b"),
    re.compile(r"\b(?:xox[baprs]-|gh[pous]_)[A-Za-z0-9_-]{20,}\b"),
    re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._-]{20,}\b"),
)


def _staged_lines() -> list[tuple[str, str]]:
    result = subprocess.run(
        ["git", "diff", "--cached", "--unified=0", "--no-ext-diff"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=True,
    )
    path = ""
    lines: list[tuple[str, str]] = []
    for line in result.stdout.splitlines():
        if line.startswith("+++ b/"):
            path = line[6:]
        elif line.startswith("+") and not line.startswith("+++") and path:
            lines.append((path, line[1:]))
    return lines


def _is_placeholder(value: str) -> bool:
    lowered = value.lower()
    return any(marker in lowered for marker in PLACEHOLDER_MARKERS)


def main() -> int:
    findings: list[str] = []
    for path, line in _staged_lines():
        if path.startswith(SKIPPED_PATH_PREFIXES) or path.endswith((".example", ".sample")):
            continue
        for match in ASSIGNMENT.finditer(line):
            if not _is_placeholder(match.group(1)):
                findings.append(path)
                break
        if any(pattern.search(line) for pattern in TOKEN_PATTERNS):
            findings.append(path)
    if findings:
        paths = ", ".join(sorted(set(findings)))
        print(f"Blocked commit: suspected plaintext credential in {paths}.", file=sys.stderr)
        print("Store credentials only through EasySlide settings; remove the staged secret before committing.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
