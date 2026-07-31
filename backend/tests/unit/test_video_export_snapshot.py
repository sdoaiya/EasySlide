import hashlib
import json
from pathlib import Path

import pytest

from models import Page, Project, db
from services.narration_service import save_manual_narration_version
from services.video_export_snapshot import (
    create_video_render_snapshot,
    create_video_export_snapshot,
    load_video_render_snapshot,
    load_video_export_snapshot,
)


def _confirmed_page(text='确认稿'):
    project = Project(id='snapshot-project', creation_type='idea', render_mode='image')
    page = Page(id='snapshot-page', project_id=project.id, order_index=0)
    db.session.add_all([project, page])
    db.session.flush()
    version = save_manual_narration_version(page, {
        'base_revision': 0,
        'text': text,
        'mode': 'single',
        'language': 'zh-CN',
    })
    db.session.commit()
    return project, page, version


def test_snapshot_freezes_confirmed_narration_and_verifies_hash(client, tmp_path):
    project, page, version = _confirmed_page()

    created = create_video_export_snapshot(
        project=project,
        pages=[page],
        upload_root=str(tmp_path),
        narration_policy='confirmed_only',
        narration_version_map={page.id: version.id},
        export_config={
            'tts_provider': 'fish_audio',
            'speakers': [{'id': 'host', 'voice': 'voice-1'}],
            'fish_api_key': 'must-not-be-persisted',
        },
    )

    page.narration_text = '任务提交后修改的稿子'
    db.session.commit()
    snapshot = load_video_export_snapshot(created['path'], created['sha256'])

    assert snapshot['pages'][0]['text'] == '确认稿'
    assert snapshot['pages'][0]['narration_version_id'] == version.id
    assert snapshot['export_config']['tts_provider'] == 'fish_audio'
    assert 'fish_api_key' not in json.dumps(snapshot, ensure_ascii=False)


def test_confirmed_only_rejects_missing_page_without_writing_file(client, tmp_path):
    project = Project(id='snapshot-missing', creation_type='idea', render_mode='image')
    page = Page(id='snapshot-missing-page', project_id=project.id, order_index=0)
    db.session.add_all([project, page])
    db.session.commit()

    with pytest.raises(ValueError, match='缺少已确认旁白'):
        create_video_export_snapshot(
            project=project,
            pages=[page],
            upload_root=str(tmp_path),
            narration_policy='confirmed_only',
            narration_version_map={},
            export_config={},
        )

    assert not list(Path(tmp_path).rglob('*.json'))


def test_review_missing_requires_workbench_confirmation(client, tmp_path):
    project = Project(id='snapshot-review', creation_type='idea', render_mode='image')
    page = Page(id='snapshot-review-page', project_id=project.id, order_index=0)
    db.session.add_all([project, page])
    db.session.commit()

    with pytest.raises(ValueError, match='请先在视频文案工作台确认'):
        create_video_export_snapshot(
            project=project,
            pages=[page],
            upload_root=str(tmp_path),
            narration_policy='review_missing',
            narration_version_map={},
            export_config={},
        )

    assert not list(Path(tmp_path).rglob('*.json'))


def test_allow_silent_pages_records_explicit_silent_entry(client, tmp_path):
    project = Project(id='snapshot-silent', creation_type='idea', render_mode='image')
    page = Page(id='snapshot-silent-page', project_id=project.id, order_index=0)
    db.session.add_all([project, page])
    db.session.commit()

    created = create_video_export_snapshot(
        project=project,
        pages=[page],
        upload_root=str(tmp_path),
        narration_policy='allow_silent_pages',
        narration_version_map={},
        export_config={},
    )
    snapshot = load_video_export_snapshot(created['path'], created['sha256'])

    assert snapshot['pages'][0]['silent'] is True
    assert snapshot['pages'][0]['text'] == ''


def test_snapshot_loader_rejects_tampering(client, tmp_path):
    project, page, _version = _confirmed_page()
    created = create_video_export_snapshot(
        project=project,
        pages=[page],
        upload_root=str(tmp_path),
        narration_policy='confirmed_only',
        narration_version_map={},
        export_config={},
    )
    Path(created['path']).write_text('{}', encoding='utf-8')

    with pytest.raises(ValueError, match='校验失败'):
        load_video_export_snapshot(created['path'], created['sha256'])


def test_snapshot_freezes_sanitized_scene_manifest_references(client, tmp_path):
    project, page, _version = _confirmed_page()
    digest = 'a' * 64

    created = create_video_export_snapshot(
        project=project,
        pages=[page],
        upload_root=str(tmp_path),
        narration_policy='confirmed_only',
        narration_version_map={},
        export_config={},
        scene_manifest_refs=[{
            'page_id': page.id,
            'path': str(tmp_path / 'scene.json'),
            'sha256': digest.upper(),
            'inline_manifest': {'must': 'not be persisted'},
        }],
    )

    snapshot = load_video_export_snapshot(created['path'], created['sha256'])
    assert snapshot['scene_manifests'] == [{
        'page_id': page.id,
        'path': str(tmp_path / 'scene.json'),
        'sha256': digest,
    }]


def test_snapshot_rejects_scene_manifest_page_mismatch(client, tmp_path):
    project, page, _version = _confirmed_page()

    with pytest.raises(ValueError, match='与导出页面不匹配'):
        create_video_export_snapshot(
            project=project,
            pages=[page],
            upload_root=str(tmp_path),
            narration_policy='confirmed_only',
            narration_version_map={},
            export_config={},
            scene_manifest_refs=[{
                'page_id': 'another-page',
                'path': str(tmp_path / 'scene.json'),
                'sha256': '0' * 64,
            }],
        )


def test_snapshot_allows_legacy_export_without_scene_manifests(client, tmp_path):
    project, page, _version = _confirmed_page()

    created = create_video_export_snapshot(
        project=project,
        pages=[page],
        upload_root=str(tmp_path),
        narration_policy='confirmed_only',
        narration_version_map={},
        export_config={},
        scene_manifest_refs=[],
    )

    snapshot = load_video_export_snapshot(created['path'], created['sha256'])
    assert snapshot['scene_manifests'] == []
    assert snapshot['native_scene_bundles'] == []


def test_snapshot_freezes_per_page_scene_levels(client, tmp_path):
    project, page, _version = _confirmed_page()

    created = create_video_export_snapshot(
        project=project,
        pages=[page],
        upload_root=str(tmp_path),
        scene_levels=[{
            'page_id': page.id,
            'level': 'L3',
            'reason': '背景修复质量不足',
        }],
    )

    snapshot = load_video_export_snapshot(created['path'], created['sha256'])
    assert snapshot['scene_levels'] == [{
        'page_id': page.id,
        'level': 'L3',
        'reason': '背景修复质量不足',
    }]


def test_snapshot_preserves_per_page_scene_fallback_slots(client, tmp_path):
    project, page, _version = _confirmed_page()
    second = Page(id='snapshot-page-legacy', project_id=project.id, order_index=1)
    db.session.add(second)
    db.session.commit()
    save_manual_narration_version(second, {
        'base_revision': 0,
        'text': '旧图片页',
        'mode': 'single',
        'language': 'zh-CN',
    })
    db.session.commit()
    scene_ref = {
        'page_id': page.id,
        'path': str(tmp_path / 'scene.json'),
        'sha256': 'a' * 64,
    }
    bundle_ref = {
        'page_id': page.id,
        'path': str(tmp_path / 'bundle.json'),
        'sha256': 'b' * 64,
    }

    created = create_video_export_snapshot(
        project=project,
        pages=[page, second],
        upload_root=str(tmp_path),
        narration_policy='confirmed_only',
        export_config={},
        scene_manifest_refs=[scene_ref, None],
        native_scene_bundle_refs=[bundle_ref, None],
    )

    snapshot = load_video_export_snapshot(created['path'], created['sha256'])
    assert snapshot['scene_manifests'] == [scene_ref, None]
    assert snapshot['native_scene_bundles'] == [bundle_ref, None]


def test_snapshot_freezes_native_scene_bundle_references(client, tmp_path):
    project, page, _version = _confirmed_page()
    digest = 'b' * 64

    created = create_video_export_snapshot(
        project=project,
        pages=[page],
        upload_root=str(tmp_path),
        narration_policy='confirmed_only',
        narration_version_map={},
        export_config={},
        native_scene_bundle_refs=[{
            'page_id': page.id,
            'path': str(tmp_path / 'bundle.json'),
            'sha256': digest.upper(),
            'html': 'must-not-be-persisted-inline',
        }],
    )

    snapshot = load_video_export_snapshot(created['path'], created['sha256'])
    assert snapshot['native_scene_bundles'] == [{
        'page_id': page.id,
        'path': str(tmp_path / 'bundle.json'),
        'sha256': digest,
    }]


def test_snapshot_rejects_native_scene_bundle_page_mismatch(client, tmp_path):
    project, page, _version = _confirmed_page()

    with pytest.raises(ValueError, match='原生场景包引用与导出页面不匹配'):
        create_video_export_snapshot(
            project=project,
            pages=[page],
            upload_root=str(tmp_path),
            narration_policy='confirmed_only',
            narration_version_map={},
            export_config={},
            native_scene_bundle_refs=[{
                'page_id': 'another-page',
                'path': str(tmp_path / 'bundle.json'),
                'sha256': '0' * 64,
            }],
        )


def test_render_snapshot_binds_narration_and_page_artifacts(client, tmp_path):
    project, page, _version = _confirmed_page()
    narration = create_video_export_snapshot(
        project=project,
        pages=[page],
        upload_root=str(tmp_path),
        narration_policy='confirmed_only',
        export_config={},
    )
    def artifact_ref(name, content):
        path = tmp_path / name
        path.write_bytes(content)
        return {
            'page_id': page.id,
            'path': str(path),
            'sha256': hashlib.sha256(content).hexdigest(),
        }

    artifact = artifact_ref('audio.json', b'audio-timeline')
    audio_track = artifact_ref('audio.mp3', b'audio-track')
    motion_base = artifact_ref('motion.json', b'motion')
    motion = {
        **motion_base,
        'scene_manifest_sha256': 'c' * 64,
    }

    created = create_video_render_snapshot(
        directory=tmp_path / 'artifacts',
        project_id=project.id,
        narration_snapshot_path=narration['path'],
        narration_snapshot_hash=narration['sha256'],
        pages=[{
            'page_id': page.id,
            'audio_track': audio_track,
            'audio_timeline': artifact,
            'motion_manifest': motion,
            'scene_manifest': None,
            'native_scene_bundle': None,
            'visual_renderer': 'browser_frames',
            'fallback_from': 'hyperframes',
            'fallback_reason': 'injected failure',
        }],
        renderer_config={
            'width': 1920,
            'height': 1080,
            'fps': 25,
            'hyperframes_enabled': True,
        },
    )

    loaded = load_video_render_snapshot(created['path'], created['sha256'])
    assert loaded['narration_snapshot']['sha256'] == narration['sha256']
    assert loaded['pages'][0]['audio_timeline'] == artifact
    assert loaded['pages'][0]['audio_track'] == audio_track
    assert loaded['pages'][0]['motion_manifest'] == motion
    assert loaded['pages'][0]['fallback_from'] == 'hyperframes'
    assert loaded['renderer'] == {
        'width': 1920,
        'height': 1080,
        'fps': 25,
        'hyperframes_enabled': True,
    }


def test_render_snapshot_rejects_tampering(client, tmp_path):
    project, page, _version = _confirmed_page()
    narration = create_video_export_snapshot(
        project=project,
        pages=[page],
        upload_root=str(tmp_path),
        narration_policy='confirmed_only',
        export_config={},
    )
    audio_timeline = tmp_path / 'audio.json'
    audio_timeline.write_bytes(b'audio-timeline')
    created = create_video_render_snapshot(
        directory=tmp_path / 'artifacts',
        project_id=project.id,
        narration_snapshot_path=narration['path'],
        narration_snapshot_hash=narration['sha256'],
        pages=[{
            'page_id': page.id,
            'audio_track': None,
            'audio_timeline': {
                'page_id': page.id,
                'path': str(audio_timeline),
                'sha256': hashlib.sha256(audio_timeline.read_bytes()).hexdigest(),
            },
            'motion_manifest': None,
            'scene_manifest': None,
            'native_scene_bundle': None,
            'visual_renderer': 'static_frame',
            'fallback_from': None,
            'fallback_reason': None,
        }],
        renderer_config={'width': 1920, 'height': 1080, 'fps': 25},
    )
    Path(created['path']).write_text('{}', encoding='utf-8')

    with pytest.raises(ValueError, match='校验失败'):
        load_video_render_snapshot(created['path'], created['sha256'])
