import json
from pathlib import Path

from jsonschema import Draft202012Validator


def _validator():
    path = Path(__file__).parents[3] / 'shared' / 'content' / 'podcast-workspace.schema.json'
    return Draft202012Validator(json.loads(path.read_text(encoding='utf-8')))


def test_podcast_adapter_supports_single_and_rotating_dialogue_speakers():
    from services.podcast_service import build_podcast_document_from_spine

    spine = {
        'topic': {'value': '统一内容'},
        'sections': [
            {'section_id': 'section.1', 'title': '开场', 'summary': '欢迎收听。'},
            {'section_id': 'section.2', 'title': '结论', 'summary': '核心结论。'},
        ],
    }
    single = build_podcast_document_from_spine(spine)
    dialogue = build_podcast_document_from_spine(spine, {
        'format': 'dialogue',
        'speakers': [
            {'speaker_id': 'host', 'name': '主持人', 'voice_ref': 'voice.host'},
            {'speaker_id': 'guest', 'name': '嘉宾', 'voice_ref': 'voice.guest'},
        ],
    })

    _validator().validate(single)
    _validator().validate(dialogue)
    assert [item['speaker_id'] for item in dialogue['segments']] == ['host', 'guest']


def test_podcast_proposal_excludes_voice_and_mixing_fields():
    from types import SimpleNamespace
    from services.podcast_service import (
        build_podcast_document_from_spine,
        propose_podcast_to_spine,
    )

    workspace = SimpleNamespace(
        kind='podcast', current_version_id='version-1', revision=2,
        document_json=json.dumps(build_podcast_document_from_spine({
            'topic': {'value': '统一内容'},
            'sections': [{'section_id': 'section.1', 'title': '结论', 'summary': '播客结论'}],
        })),
    )
    project = SimpleNamespace(
        workspaces=[workspace],
        content_spine=SimpleNamespace(document_json=json.dumps({'sections': []})),
    )
    captured = {}
    import services.content_sync_service as sync
    original = sync.create_sync_proposal
    sync.create_sync_proposal = lambda *_args, **kwargs: captured.update(kwargs) or kwargs
    try:
        proposal = propose_podcast_to_spine(project, 1)
    finally:
        sync.create_sync_proposal = original

    assert proposal['source_kind'] == 'podcast'
    assert 'voice_ref' not in str(captured['diff'])
    assert 'mixing' not in str(captured['diff'])


def test_podcast_export_snapshot_freezes_workspace_version():
    from types import SimpleNamespace
    from services.podcast_service import build_podcast_document_from_spine
    from services.podcast_export_service import build_podcast_export_snapshot
    document = build_podcast_document_from_spine({'topic': {'value': '节目'}, 'sections': []})
    version = SimpleNamespace(id='version-1', revision=2, content_hash='a' * 64, document_json=json.dumps(document))
    result = build_podcast_export_snapshot(version)
    assert result['snapshot']['workspace_version']['id'] == 'version-1'
    assert result['snapshot']['segments'] == []
    assert len(result['sha256']) == 64


def test_podcast_export_snapshot_is_persisted_and_tamper_checked(tmp_path):
    from types import SimpleNamespace
    from services.podcast_service import build_podcast_document_from_spine
    from services.podcast_export_service import (
        create_podcast_export_snapshot,
        load_podcast_export_snapshot,
    )
    version = SimpleNamespace(
        id='version-1', revision=2, content_hash='a' * 64,
        document_json=json.dumps(build_podcast_document_from_spine({'topic': {'value': '节目'}, 'sections': []})),
    )
    created = create_podcast_export_snapshot(
        project_id='project-1', workspace_version=version, upload_root=tmp_path,
        export_config={'format': 'mp3'},
    )
    loaded = load_podcast_export_snapshot(created['path'], created['sha256'])
    assert loaded['workspace_version']['revision'] == 2
    assert loaded['export_config'] == {'format': 'mp3'}
    Path(created['path']).write_text('{}', encoding='utf-8')
    try:
        load_podcast_export_snapshot(created['path'], created['sha256'])
    except ValueError as exc:
        assert '快照校验失败' in str(exc)
    else:
        raise AssertionError('tampered snapshot must be rejected')


def test_podcast_snapshot_freezes_shared_audio_mix_manifest_and_asset_hash(tmp_path):
    from types import SimpleNamespace
    from services.podcast_export_service import (
        create_podcast_export_snapshot,
        mix_podcast_audio,
    )
    document = {
        'schema_version': 1,
        'title': '带混音节目',
        'format': 'single',
        'language': 'zh-CN',
        'speakers': [{'speaker_id': 'host', 'name': '主持人', 'voice_ref': 'voice.host'}],
        'segments': [{
            'segment_id': 'segment.1', 'speaker_id': 'host', 'text': '正文',
            'locked': False,
            'audio_cues': [{
                'cue_id': 'cue.1', 'kind': 'sfx', 'asset_ref': 'sfx.1',
                'offset_ms': 100, 'gain_db': -8,
            }],
        }],
        'mixing': {'bgm_asset_ref': 'bgm.1', 'ducking': True, 'fade_in_ms': 50, 'fade_out_ms': 50},
        'cover': {'asset_ref': None, 'title': '带混音节目', 'subtitle': ''},
    }
    version = SimpleNamespace(
        id='version-mix', revision=3, content_hash='b' * 64,
        document_json=json.dumps(document),
    )
    (tmp_path / 'bgm.mp3').write_bytes(b'bgm')
    (tmp_path / 'sfx.mp3').write_bytes(b'sfx')
    assets = [
        {'asset_ref': 'bgm.1', 'relative_path': 'bgm.mp3', 'purpose': 'bgm'},
        {'asset_ref': 'sfx.1', 'relative_path': 'sfx.mp3', 'purpose': 'sfx'},
    ]
    created = create_podcast_export_snapshot(
        project_id='project-mix', workspace_version=version, upload_root=tmp_path,
        export_config={'format': 'mp3', 'audio_assets': assets},
    )
    mix = created['snapshot']['audio_mix']
    assert mix['manifest']['music']['asset_id'] == 'bgm.1'
    assert mix['manifest']['sfx'][0]['segment_id'] == 'segment.1'
    assert len(mix['manifest_hash']) == 64
    (tmp_path / 'sfx.mp3').write_bytes(b'changed')
    try:
        mix_podcast_audio(
            narration_path=str(tmp_path / 'missing-narration.mp3'),
            output_path=str(tmp_path / 'out.mp3'), document=document,
            audio_assets=assets, upload_root=tmp_path, audio_mix=mix,
        )
    except ValueError as exc:
        assert 'asset changed after snapshot' in str(exc)
    else:
        raise AssertionError('changed podcast audio asset must be rejected')


def test_podcast_audio_reference_preflight_rejects_missing_material(monkeypatch):
    from services.podcast_export_service import preflight_podcast_audio_materials
    from services.podcast_service import build_podcast_document_from_spine
    document = build_podcast_document_from_spine({'topic': {'value': '节目'}, 'sections': []})
    document['segments'] = [{'segment_id': 'segment.1', 'speaker_id': 'speaker.main', 'text': '内容', 'locked': False, 'audio_cues': []}]
    document['mixing']['bgm_asset_ref'] = 'missing-bgm'

    class Query:
        def filter(self, _value):
            return self
        def all(self):
            return []

    import services.podcast_export_service as export_service
    class IdColumn:
        def in_(self, _values):
            return True
    monkeypatch.setattr(export_service, 'Material', type('MaterialStub', (), {'id': IdColumn(), 'query': Query()}))
    try:
        preflight_podcast_audio_materials('project-1', document)
    except ValueError as exc:
        assert '音频素材不可用' in str(exc)
    else:
        raise AssertionError('missing referenced material must block export')


def test_podcast_export_preflight_rejects_empty_episode():
    from services.podcast_export_service import preflight_podcast_audio_materials
    try:
        preflight_podcast_audio_materials('project-1', {'segments': [], 'mixing': {}})
    except ValueError as exc:
        assert '至少需要一个' in str(exc)
    else:
        raise AssertionError('empty episode must block export')


def test_podcast_audio_mix_applies_bgm_and_sfx(tmp_path):
    import subprocess
    from PIL import Image
    from services.podcast_export_service import freeze_podcast_audio_mix, mix_podcast_audio
    narration = tmp_path / 'narration.mp3'
    bgm = tmp_path / 'bgm.mp3'
    sfx = tmp_path / 'sfx.mp3'
    output = tmp_path / 'mixed.mp3'
    for target, frequency, duration in ((narration, 440, 1.2), (bgm, 220, 1.2), (sfx, 880, 0.2)):
        subprocess.run(['ffmpeg', '-y', '-f', 'lavfi', '-i', f'sine=frequency={frequency}:duration={duration}', str(target)], check=True, capture_output=True)
    document = {'mixing': {'bgm_asset_ref': 'bgm', 'ducking': True, 'fade_in_ms': 50, 'fade_out_ms': 50}, 'segments': [{'audio_cues': [{'asset_ref': 'sfx', 'offset_ms': 100, 'gain_db': -8}]}]}
    assets = [{'asset_ref': 'bgm', 'relative_path': 'bgm.mp3', 'purpose': 'bgm'}, {'asset_ref': 'sfx', 'relative_path': 'sfx.mp3', 'purpose': 'sfx'}]
    audio_mix = freeze_podcast_audio_mix(document, assets, tmp_path)
    duration = mix_podcast_audio(narration_path=str(narration), output_path=str(output), document=document, audio_assets=assets, upload_root=tmp_path, audio_mix=audio_mix)
    assert output.stat().st_size > 0
    assert 1.0 <= duration <= 1.4
    from services.podcast_export_service import check_podcast_audio_peak
    assert check_podcast_audio_peak(str(output)) <= 0

    cover = tmp_path / 'cover.png'
    Image.new('RGB', (32, 32), 'white').save(cover)
    covered_output = tmp_path / 'mixed-cover.mp3'
    covered_duration = mix_podcast_audio(
        narration_path=str(narration), output_path=str(covered_output), document=document,
        audio_assets=assets, upload_root=tmp_path, audio_mix=audio_mix,
        metadata={'title': '测试节目'}, cover_path=cover,
    )
    assert covered_output.stat().st_size > 0
    assert 1.0 <= covered_duration <= 1.4


def test_podcast_audio_mix_transcodes_plain_narration_to_wav(tmp_path):
    import subprocess
    from services.podcast_export_service import mix_podcast_audio

    narration = tmp_path / 'narration.mp3'
    output = tmp_path / 'episode.wav'
    subprocess.run([
        'ffmpeg', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.5',
        str(narration),
    ], check=True, capture_output=True)

    duration = mix_podcast_audio(
        narration_path=str(narration),
        output_path=str(output),
        document={'mixing': {}, 'segments': []},
        audio_assets=[],
        upload_root=tmp_path,
    )

    assert output.read_bytes()[:4] == b'RIFF'
    assert 0.4 <= duration <= 0.7


def test_podcast_export_sidecars_follow_frozen_snapshot(tmp_path):
    from services.podcast_export_service import write_podcast_export_sidecars
    output = tmp_path / 'episode.wav'
    output.write_bytes(b'wav')
    result = write_podcast_export_sidecars(output_path=output, snapshot={'workspace_version': {'id': 'v1', 'revision': 2}, 'title': '节目', 'language': 'zh-CN', 'segments': [{'segment_id': 's1', 'speaker_id': 'host', 'text': '内容'}], 'cover': {'asset_ref': None, 'title': '节目', 'subtitle': ''}})
    assert json.loads(Path(result['transcript']).read_text(encoding='utf-8'))['segments'][0]['text'] == '内容'
    assert json.loads(Path(result['cover_manifest']).read_text(encoding='utf-8'))['cover']['title'] == '节目'


def test_podcast_preview_slice_and_cache_key_are_revision_stable():
    from services.podcast_service import (
        build_podcast_document_from_spine,
        normalize_podcast_preview_segments,
        podcast_preview_cache_key,
    )

    document = build_podcast_document_from_spine(
        {'topic': {'value': '节目'}, 'sections': [{'title': '第一段', 'summary': '正文'}]},
    )
    segment = normalize_podcast_preview_segments(document, 'segment.1')
    assert [item['segment_id'] for item in segment] == ['segment.1']
    assert podcast_preview_cache_key(
        document={**document, 'revision': 1}, provider='edge', segment_id='segment.1', speed=1,
    ) != podcast_preview_cache_key(
        document={**document, 'revision': 2}, provider='edge', segment_id='segment.1', speed=1,
    )


class TestAiPolishPodcastDocument:
    def _document(self):
        return {
            'schema_version': 1,
            'title': '测试播客',
            'format': 'single',
            'speakers': [{'speaker_id': 'speaker.main', 'name': '主持人', 'voice_ref': 'edge:zh-CN-XiaoxiaoNeural'}],
            'segments': [
                {'segment_id': 'segment.1', 'speaker_id': 'speaker.main', 'text': '原始第一段', 'locked': False, 'audio_cues': []},
                {'segment_id': 'segment.2', 'speaker_id': 'speaker.main', 'text': '原始第二段', 'locked': False, 'audio_cues': []},
            ],
        }

    def test_success_replaces_text_keeps_structure(self, monkeypatch):
        from services.podcast_service import ai_polish_podcast_document

        def fake_generate(prompt, thinking_budget=0):
            assert '口语化' in prompt and 'segments' in prompt
            return '{"segments": [{"text": "打磨后第一段"}, {"text": "打磨后第二段"}]}'

        ai_service = type('AI', (), {'text_provider': type('P', (), {'generate_text': staticmethod(fake_generate)})()})()
        monkeypatch.setattr('services.ai_service_manager.get_ai_service', lambda: ai_service)
        document = self._document()
        result = ai_polish_podcast_document(document, {'source_text': '来源材料内容'})
        assert result is not None
        assert [item['text'] for item in result['segments']] == ['打磨后第一段', '打磨后第二段']
        assert result['segments'][0]['segment_id'] == 'segment.1'
        assert result['segments'][0]['speaker_id'] == 'speaker.main'

    def test_markdown_fence_is_tolerated(self, monkeypatch):
        from services.podcast_service import ai_polish_podcast_document

        def fake_generate(prompt, thinking_budget=0):
            return '```json\n{"segments": [{"text": "甲"}, {"text": "乙"}]}\n```'

        ai_service = type('AI', (), {'text_provider': type('P', (), {'generate_text': staticmethod(fake_generate)})()})()
        monkeypatch.setattr('services.ai_service_manager.get_ai_service', lambda: ai_service)
        result = ai_polish_podcast_document(self._document(), {'source_text': '来源'})
        assert result is not None
        assert [item['text'] for item in result['segments']] == ['甲', '乙']

    def test_garbage_response_falls_back_to_none(self, monkeypatch):
        from services.podcast_service import ai_polish_podcast_document

        def fake_generate(prompt, thinking_budget=0):
            raise RuntimeError('AI unavailable')

        ai_service = type('AI', (), {'text_provider': type('P', (), {'generate_text': staticmethod(fake_generate)})()})()
        monkeypatch.setattr('services.ai_service_manager.get_ai_service', lambda: ai_service)
        assert ai_polish_podcast_document(self._document(), {'source_text': '来源'}) is None

    def test_segment_count_mismatch_falls_back(self, monkeypatch):
        from services.podcast_service import ai_polish_podcast_document

        def fake_generate(prompt, thinking_budget=0):
            return '{"segments": [{"text": "只有一段"}]}'

        ai_service = type('AI', (), {'text_provider': type('P', (), {'generate_text': staticmethod(fake_generate)})()})()
        monkeypatch.setattr('services.ai_service_manager.get_ai_service', lambda: ai_service)
        assert ai_polish_podcast_document(self._document(), {'source_text': '来源'}) is None

    def test_empty_source_falls_back_without_ai_call(self, monkeypatch):
        from services.podcast_service import ai_polish_podcast_document

        called = []

        def fake_generate(prompt, thinking_budget=0):
            called.append(True)
            return '{}'

        ai_service = type('AI', (), {'text_provider': type('P', (), {'generate_text': staticmethod(fake_generate)})()})()
        monkeypatch.setattr('services.ai_service_manager.get_ai_service', lambda: ai_service)
        assert ai_polish_podcast_document(self._document(), {'source_text': '   '}) is None
        assert called == []


class TestChunkPodcastSegments:
    def _segment(self, index, text, speaker='speaker.main'):
        return {'segment_id': f'segment.{index}', 'speaker_id': speaker, 'text': text, 'locked': False, 'audio_cues': []}

    def test_single_mode_splits_by_char_budget(self):
        from services.podcast_service import chunk_podcast_segments

        segments = [self._segment(i, '中' * 100) for i in range(1, 6)]
        chunks = chunk_podcast_segments(segments, speaker_ids=[], max_chars=250, mode='single')
        assert len(chunks) == 3  # 100*2=200 ≤250, +100=300 >250 → 2,2,1
        assert sum(len(chunk) for chunk in chunks) == 5

    def test_dialogue_waits_for_all_configured_speakers(self):
        from services.podcast_service import chunk_podcast_segments

        segments = [
            self._segment(1, '主' * 200, 'host'),
            self._segment(2, '客' * 200, 'guest'),
            self._segment(3, '主' * 200, 'host'),
            self._segment(4, '客' * 200, 'guest'),
        ]
        chunks = chunk_podcast_segments(
            segments, speaker_ids=['host', 'guest'], max_chars=250, mode='dialogue',
        )
        # 预算 250：第一块需要 host+guest 都出现才切 → 段1+2；同样段3+4
        assert len(chunks) == 2
        for chunk in chunks:
            speakers = {item['speaker_id'] for item in chunk}
            assert speakers == {'host', 'guest'}

    def test_single_huge_segment_becomes_its_own_chunk(self):
        from services.podcast_service import chunk_podcast_segments

        segments = [
            self._segment(1, '超' * 500),
            self._segment(2, '后' * 100),
        ]
        chunks = chunk_podcast_segments(segments, speaker_ids=[], max_chars=200, mode='single')
        assert len(chunks) == 2
        assert len(chunks[0]) == 1 and len(chunks[1]) == 1


class TestBuildPodcastFromPptSnapshot:
    def _snapshot(self):
        return {
            'project_title': '季度复盘播客',
            'pages': [
                {'page_id': 'page-1', 'order_index': 0, 'narration': '开场白内容', 'description': {'text': '描述一'}},
                {'page_id': 'page-2', 'order_index': 1, 'narration': '', 'description': {'text': '描述二'}},
                {'page_id': 'page-3', 'order_index': 2, 'narration': '收尾内容', 'description': {'text': '描述三'}},
            ],
        }

    def test_dialogue_default_builds_segments_with_rotating_roles(self):
        from services.podcast_service import build_podcast_document_from_ppt_snapshot

        document = build_podcast_document_from_ppt_snapshot(self._snapshot(), {})
        assert document['format'] == 'dialogue'
        assert [item['name'] for item in document['speakers']] == ['主持人', '嘉宾']
        assert [item['speaker_id'] for item in document['segments']] == ['speaker.1', 'speaker.2', 'speaker.1']
        assert document['segments'][0]['text'] == '开场白内容'
        # 无旁白页回退页面描述
        assert document['segments'][1]['text'] == '描述二'
        assert document['segments'][0]['source_ref'] == 'page-1'
        assert document['segments'][0]['source_kind'] == 'ppt_page'

    def test_single_format_uses_one_speaker(self):
        from services.podcast_service import build_podcast_document_from_ppt_snapshot

        document = build_podcast_document_from_ppt_snapshot(self._snapshot(), {'format': 'single'})
        assert document['format'] == 'single'
        assert len(document['speakers']) == 1
        assert all(item['speaker_id'] == 'speaker.main' for item in document['segments'])

    def test_page_order_is_stable(self):
        from services.podcast_service import build_podcast_document_from_ppt_snapshot

        snapshot = self._snapshot()
        snapshot['pages'].reverse()
        document = build_podcast_document_from_ppt_snapshot(snapshot, {})
        assert [item['source_ref'] for item in document['segments']] == ['page-1', 'page-2', 'page-3']
