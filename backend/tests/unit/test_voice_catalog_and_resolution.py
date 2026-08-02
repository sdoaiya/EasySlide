"""Unified voice catalog and canonical ID resolution (plan §7.4/阶段0).

阶段 0 冻结契约：
- GET /api/voices 提供 Edge+Fish 统一只读目录（搜索/筛选/试听/表现力联动）。
- canonical ID 解析：edge:<ShortName> / fish:<reference_id>；default/空/裸 ID 拒绝。
- 历史 default/空值兼容读取并标记「历史默认值待确认」。
当前没有目录服务与解析层，本套测试必须失败。
"""

from pathlib import Path
from unittest.mock import patch

import pytest


class TestVoiceCatalogApi:
    def test_voice_catalog_lists_edge_and_fish_with_filters(self, client):
        response = client.get('/api/voices')
        assert response.status_code == 200
        data = response.get_json()['data']
        assert data['total'] > 0
        providers = {item['provider'] for item in data['voices']}
        assert 'edge' in providers
        for item in data['voices']:
            assert item['voice_id'].startswith(('edge:', 'fish:'))
            assert item['upstream_id']
            assert isinstance(item['languages'], list)
            assert isinstance(item['supported_expressiveness_ids'], list)

    def test_voice_catalog_supports_provider_and_language_filter(self, client):
        response = client.get('/api/voices?provider=fish_audio&language=zh')
        assert response.status_code == 200
        items = response.get_json()['data']['voices']
        if items:
            assert all(item['provider'] == 'fish_audio' for item in items)

    def test_voice_preview_endpoint(self, client):
        response = client.get('/api/voices/edge:zh-CN-XiaoxiaoNeural')
        assert response.status_code == 200
        item = response.get_json()['data']
        assert item['voice_id'] == 'edge:zh-CN-XiaoxiaoNeural'

    def test_voice_preview_uses_custom_text(self, client, tmp_path):
        """A/B 对比弹窗的共用文案通过 text 参数透传到试听合成。"""
        def _fake_synthesize(text, output_path, **kwargs):
            Path(output_path).write_bytes(b'ID3-edge-preview')
            return output_path

        with patch(
            'services.tts_video_service.generate_tts_audio_sync',
            side_effect=_fake_synthesize,
        ) as synthesize:
            response = client.get(
                '/api/voices/edge:zh-CN-XiaoxiaoNeural/preview',
                query_string={'text': '这是 A/B 对比的共用试听文案。'},
            )
        assert response.status_code == 200
        assert response.data == b'ID3-edge-preview'
        assert '这是 A/B 对比的共用试听文案。' in synthesize.call_args[0][0]


class TestVoiceResolution:
    def test_canonical_voice_id_contract(self):
        """default/空/裸 ID 必须被判定为未配置。"""
        from services.voice_catalog_service import resolve_voice_id

        assert resolve_voice_id('edge:zh-CN-XiaoxiaoNeural') == 'edge:zh-CN-XiaoxiaoNeural'
        assert resolve_voice_id('fish:voice-dd43b30d04d9446a94ebe41f301229b5').startswith('fish:')
        # 契约：以下均不是已配置声音（当前无解析层，导入即失败）
        assert resolve_voice_id('default') is None
        assert resolve_voice_id('') is None
        assert resolve_voice_id(None) is None
        assert resolve_voice_id('zh-CN-XiaoxiaoNeural') is None  # 裸 ID 无法判定 provider

    def test_historical_default_compat_read(self):
        """历史 default/空值按当前语言解析预览，并标记待确认。"""
        from services.voice_catalog_service import resolve_historical_voice

        resolved, needs_confirmation = resolve_historical_voice('default', language='zh')
        assert resolved.startswith(('edge:', 'fish:'))
        assert needs_confirmation is True

        resolved, needs_confirmation = resolve_historical_voice(None, language='en')
        assert resolved.startswith(('edge:', 'fish:'))
        assert needs_confirmation is True


class TestNormalizeExportVoice:
    """导出音色归一化：canonical 剥前缀；非法前缀值拒绝而非透传。"""

    def test_canonical_edge_strips_prefix(self):
        from services.voice_catalog_service import normalize_export_voice

        assert normalize_export_voice('edge:zh-CN-XiaoxiaoNeural') == (
            'zh-CN-XiaoxiaoNeural', 'edge',
        )

    def test_canonical_fish_strips_prefix(self):
        from services.voice_catalog_service import normalize_export_voice

        assert normalize_export_voice('fish:clone-reference-123') == (
            'clone-reference-123', 'fish_audio',
        )

    def test_bare_voice_passes_through_with_unknown_provider(self):
        from services.voice_catalog_service import normalize_export_voice

        assert normalize_export_voice('zh-CN-YunxiNeural') == ('zh-CN-YunxiNeural', None)

    def test_empty_and_default_return_none(self):
        from services.voice_catalog_service import normalize_export_voice

        assert normalize_export_voice('') == (None, None)
        assert normalize_export_voice(None) == (None, None)
        assert normalize_export_voice('default') == (None, None)

    def test_unresolvable_prefixed_value_is_rejected_not_passed_through(self):
        """修复：带前缀但无法解析的值不得以裸音色名透传给 TTS。"""
        from services.voice_catalog_service import normalize_export_voice

        assert normalize_export_voice('fish:') == (None, None)
        assert normalize_export_voice('edge:badvoice') == (None, None)
        assert normalize_export_voice('fish:short') == (None, None)  # 不足 8 字符
