"""Unified voice catalog and canonical ID resolution (plan §7.4/阶段0).

阶段 0 冻结契约：
- GET /api/voices 提供 Edge+Fish 统一只读目录（搜索/筛选/试听/表现力联动）。
- canonical ID 解析：edge:<ShortName> / fish:<reference_id>；default/空/裸 ID 拒绝。
- 历史 default/空值兼容读取并标记「历史默认值待确认」。
当前没有目录服务与解析层，本套测试必须失败。
"""

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
