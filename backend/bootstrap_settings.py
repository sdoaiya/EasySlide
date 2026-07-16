"""Import an optional desktop credential bundle without exposing plaintext."""

import json
import logging
from pathlib import Path

from models import Settings, db
from secret_storage import (
    decrypt_portable_secret,
    decrypt_secret,
    is_encrypted,
    is_portable_encrypted,
)


logger = logging.getLogger(__name__)
PACKAGE_CREDENTIAL_FIELDS = (
    "mineru_token",
    "baidu_api_key",
    "elevenlabs_api_key",
)


def import_packaged_credentials(bundle_path: str | None) -> bool:
    """Import valid current-user encrypted values only into empty settings fields."""
    if not bundle_path:
        return False

    try:
        payload = json.loads(Path(bundle_path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False

    if payload.get("version") != 1 or not isinstance(payload.get("credentials"), dict):
        return False

    settings = Settings.get_settings()
    changed = False
    for field in PACKAGE_CREDENTIAL_FIELDS:
        value = payload["credentials"].get(field)
        if getattr(settings, field):
            continue
        try:
            if is_portable_encrypted(value):
                plaintext = decrypt_portable_secret(value)
            elif is_encrypted(value):
                plaintext = decrypt_secret(value)
            else:
                continue
        except Exception:
            logger.warning("Skipped packaged credential that cannot be decrypted")
            continue
        # The model type immediately re-encrypts this for the target computer.
        setattr(settings, field, plaintext)
        changed = True

    if changed:
        db.session.commit()
    return changed
