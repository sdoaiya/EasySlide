"""Create a DPAPI-encrypted desktop credential bundle without printing any value."""

import argparse
import json
import os
import sqlite3
import sys
from pathlib import Path


FIELDS = ("mineru_token", "baidu_api_key", "elevenlabs_api_key")
PREFIX = "dpapi:v1:"
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from secret_storage import decrypt_secret, encrypt_portable_secret


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    credentials = {}
    source = Path(args.source)
    if source.exists():
        try:
            connection = sqlite3.connect(f"file:{source.as_posix()}?mode=ro", uri=True)
            row = connection.execute(
                f"SELECT {', '.join(FIELDS)} FROM settings ORDER BY id LIMIT 1"
            ).fetchone()
            connection.close()
            if row:
                for field, value in zip(FIELDS, row):
                    if not isinstance(value, str) or not value.startswith(PREFIX):
                        continue
                    try:
                        credentials[field] = encrypt_portable_secret(decrypt_secret(value))
                    except Exception:
                        continue
        except sqlite3.Error:
            credentials = {}

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({"version": 1, "credentials": credentials}), encoding="utf-8")
    print(f"Desktop credential bundle prepared ({len(credentials)} encrypted value(s)).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
