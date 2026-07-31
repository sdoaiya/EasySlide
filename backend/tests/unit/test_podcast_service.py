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
