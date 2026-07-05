"""Tests for EasySlide LazyLLM environment variable compatibility."""

import os

from services.ai_providers.lazyllm_env import ensure_lazyllm_namespace_key, get_lazyllm_api_key


def test_lazyllm_namespace_defaults_to_easyslide(monkeypatch):
    monkeypatch.setenv("QWEN_API_KEY", "qwen-direct-key")
    monkeypatch.delenv("EASYSLIDE_QWEN_API_KEY", raising=False)
    monkeypatch.delenv("BANANA_QWEN_API_KEY", raising=False)

    assert ensure_lazyllm_namespace_key("qwen") is True

    assert os.environ["EASYSLIDE_QWEN_API_KEY"] == "qwen-direct-key"
    assert "BANANA_QWEN_API_KEY" not in os.environ


def test_lazyllm_reads_legacy_banana_namespace_as_fallback(monkeypatch):
    monkeypatch.delenv("QWEN_API_KEY", raising=False)
    monkeypatch.delenv("EASYSLIDE_QWEN_API_KEY", raising=False)
    monkeypatch.setenv("BANANA_QWEN_API_KEY", "qwen-legacy-key")

    assert get_lazyllm_api_key("qwen") == "qwen-legacy-key"
