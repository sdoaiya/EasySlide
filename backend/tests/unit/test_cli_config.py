"""Tests for banana-cli config resolution."""

from __future__ import annotations

from pathlib import Path

from cli.banana_cli.config import default_config_path, resolve_config


def test_resolve_config_defaults_to_new_backend_port(tmp_path: Path, monkeypatch):
    monkeypatch.delenv("BANANA_CLI_BASE_URL", raising=False)
    monkeypatch.delenv("EASYSLIDE_CLI_BASE_URL", raising=False)

    cfg = resolve_config(config_path=str(tmp_path / "missing.toml"))

    assert cfg.base_url == "http://localhost:5011"


def test_default_config_path_uses_easyslide_directory(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("APPDATA", str(tmp_path))
    monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)

    assert default_config_path() == tmp_path / "easyslide" / "cli.toml"


def test_default_config_path_keeps_existing_legacy_config(tmp_path: Path, monkeypatch):
    legacy_path = tmp_path / "banana-slides" / "cli.toml"
    legacy_path.parent.mkdir()
    legacy_path.write_text('base_url = "http://legacy:5011"\n', encoding="utf-8")
    monkeypatch.setenv("APPDATA", str(tmp_path))
    monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)

    assert default_config_path() == legacy_path

    cfg = resolve_config()

    assert cfg.base_url == "http://legacy:5011"


def test_resolve_config_precedence(tmp_path: Path, monkeypatch):
    cfg_file = tmp_path / "cli.toml"
    cfg_file.write_text(
        (
            'base_url = "http://file:5011"\n'
            'access_code = "from-file"\n'
            "poll_interval = 7\n"
            "request_timeout = 33\n"
            "continue_on_error = false\n"
        ),
        encoding="utf-8",
    )

    monkeypatch.setenv("BANANA_CLI_BASE_URL", "http://env:5011")
    monkeypatch.setenv("BANANA_CLI_ACCESS_CODE", "from-env")
    monkeypatch.setenv("BANANA_CLI_POLL_INTERVAL", "9")
    monkeypatch.setenv("BANANA_CLI_REQUEST_TIMEOUT", "66")
    monkeypatch.setenv("BANANA_CLI_CONTINUE_ON_ERROR", "true")

    cfg = resolve_config(
        base_url="http://arg:5011",
        access_code="from-arg",
        poll_interval=11,
        request_timeout=77,
        continue_on_error=False,
        config_path=str(cfg_file),
        json_output=False,
        verbose=False,
    )

    assert cfg.base_url == "http://arg:5011"
    assert cfg.access_code == "from-arg"
    assert cfg.poll_interval == 11
    assert cfg.request_timeout == 77
    assert cfg.continue_on_error is False


def test_resolve_config_prefers_easyslide_env_vars(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("BANANA_CLI_BASE_URL", "http://legacy-env:5011")
    monkeypatch.setenv("EASYSLIDE_CLI_BASE_URL", "http://easyslide-env:5011")

    cfg = resolve_config(config_path=str(tmp_path / "missing.toml"))

    assert cfg.base_url == "http://easyslide-env:5011"


def test_resolve_config_keeps_legacy_banana_env_fallback(tmp_path: Path, monkeypatch):
    monkeypatch.delenv("EASYSLIDE_CLI_BASE_URL", raising=False)
    monkeypatch.setenv("BANANA_CLI_BASE_URL", "http://legacy-env:5011")

    cfg = resolve_config(config_path=str(tmp_path / "missing.toml"))

    assert cfg.base_url == "http://legacy-env:5011"
