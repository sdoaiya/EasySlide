"""Local encrypted storage for settings credentials."""

import base64
import ctypes
import hashlib
import os
from ctypes import wintypes
from pathlib import Path

from sqlalchemy.types import Text, TypeDecorator


SECRET_PREFIX = "dpapi:v1:"
PORTABLE_SECRET_PREFIX = "bundle:v1:"
_PORTABLE_BUNDLE_MATERIAL = b"EasySlide internal deployment bundle v1"
SECRET_FIELD_NAMES = (
    "api_key",
    "mineru_token",
    "baidu_api_key",
    "elevenlabs_api_key",
    "lazyllm_api_keys",
    "text_api_key",
    "image_api_key",
    "image_caption_api_key",
    "openai_oauth_access_token",
    "openai_oauth_refresh_token",
)


class SecretStorageError(RuntimeError):
    pass


class _DataBlob(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_byte))]


def is_encrypted(value: str | None) -> bool:
    return isinstance(value, str) and value.startswith(SECRET_PREFIX)


def is_portable_encrypted(value: str | None) -> bool:
    return isinstance(value, str) and value.startswith(PORTABLE_SECRET_PREFIX)


def _blob_from_bytes(value: bytes) -> tuple[_DataBlob, ctypes.Array]:
    buffer = ctypes.create_string_buffer(value)
    return _DataBlob(len(value), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_byte))), buffer


def _dpapi_encrypt(value: bytes) -> bytes:
    crypt32 = ctypes.windll.crypt32
    kernel32 = ctypes.windll.kernel32
    source, source_buffer = _blob_from_bytes(value)
    encrypted = _DataBlob()
    if not crypt32.CryptProtectData(ctypes.byref(source), "EasySlide settings", None, None, None, 0x01, ctypes.byref(encrypted)):
        raise SecretStorageError(f"Windows credential encryption failed: {ctypes.get_last_error()}")
    try:
        return ctypes.string_at(encrypted.pbData, encrypted.cbData)
    finally:
        kernel32.LocalFree(encrypted.pbData)
        del source_buffer


def _dpapi_decrypt(value: bytes) -> bytes:
    crypt32 = ctypes.windll.crypt32
    kernel32 = ctypes.windll.kernel32
    source, source_buffer = _blob_from_bytes(value)
    decrypted = _DataBlob()
    if not crypt32.CryptUnprotectData(ctypes.byref(source), None, None, None, None, 0x01, ctypes.byref(decrypted)):
        raise SecretStorageError("Windows credential decryption failed for the current user")
    try:
        return ctypes.string_at(decrypted.pbData, decrypted.cbData)
    finally:
        kernel32.LocalFree(decrypted.pbData)
        del source_buffer


def _fallback_fernet():
    try:
        from cryptography.fernet import Fernet
    except ImportError as exc:  # pragma: no cover - desktop builds use DPAPI
        raise SecretStorageError("Credential encryption support is unavailable") from exc
    root = Path(os.getenv("XDG_CONFIG_HOME") or Path.home() / ".config") / "easyslide"
    root.mkdir(parents=True, exist_ok=True)
    key_path = root / "credentials.key"
    if key_path.exists():
        key = key_path.read_bytes()
    else:
        key = Fernet.generate_key()
        key_path.write_bytes(key)
        try:
            key_path.chmod(0o600)
        except OSError:
            pass
    return Fernet(key)


def _portable_fernet():
    from cryptography.fernet import Fernet
    key = base64.urlsafe_b64encode(hashlib.sha256(_PORTABLE_BUNDLE_MATERIAL).digest())
    return Fernet(key)


def encrypt_secret(value: str) -> str:
    raw = value.encode("utf-8")
    if os.name == "nt":
        encrypted = _dpapi_encrypt(raw)
    else:  # Keep development and server deployments encrypted as well.
        encrypted = _fallback_fernet().encrypt(raw)
    return SECRET_PREFIX + base64.urlsafe_b64encode(encrypted).decode("ascii")


def decrypt_secret(value: str) -> str:
    try:
        encrypted = base64.urlsafe_b64decode(value[len(SECRET_PREFIX):].encode("ascii"))
        if os.name == "nt":
            decrypted = _dpapi_decrypt(encrypted)
        else:  # Keep development and server deployments encrypted as well.
            decrypted = _fallback_fernet().decrypt(encrypted)
        return decrypted.decode("utf-8")
    except Exception as exc:
        if isinstance(exc, SecretStorageError):
            raise
        raise SecretStorageError("Stored credential cannot be decrypted") from exc


def encrypt_portable_secret(value: str) -> str:
    """Encrypt a distribution bundle value that can bootstrap another computer."""
    token = _portable_fernet().encrypt(value.encode("utf-8")).decode("ascii")
    return PORTABLE_SECRET_PREFIX + token


def decrypt_portable_secret(value: str) -> str:
    if not is_portable_encrypted(value):
        raise SecretStorageError("Invalid desktop credential bundle value")
    try:
        return _portable_fernet().decrypt(value[len(PORTABLE_SECRET_PREFIX):].encode("ascii")).decode("utf-8")
    except Exception as exc:
        raise SecretStorageError("Desktop credential bundle cannot be decrypted") from exc


class EncryptedText(TypeDecorator):
    """Stores a setting as encrypted text while exposing plaintext to callers."""

    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if is_encrypted(value):
            return value
        return encrypt_secret(str(value))

    def process_result_value(self, value, dialect):
        if value is None or not is_encrypted(value):
            return value
        return decrypt_secret(value)
