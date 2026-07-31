import json
from hashlib import sha256
from pathlib import Path
from types import SimpleNamespace

from jsonschema import Draft202012Validator


def _validator():
    path = Path(__file__).parents[3] / 'shared' / 'content' / 'video-workspace.schema.json'
    return Draft202012Validator(json.loads(path.read_text(encoding='utf-8')))


def test_spine_and_ppt_sources_build_the_same_video_schema():
    from services.video_workspace_service import (
        build_video_document_from_ppt,
        build_video_document_from_spine,
    )

    spine_document = {
        'topic': {'value': '统一主题'},
        'sections': [{
            'section_id': 'section.1',
            'title': '增长结论',
            'summary': '收入同比增长。',
        }],
    }
    page = SimpleNamespace(
        id='page-1',
        order_index=0,
        part=None,
        native_layout='core01_title',
        get_outline_content=lambda: {'title': '增长结论'},
        get_description_content=lambda: {'text': '收入同比增长。'},
        get_narration_text=lambda: None,
        get_narration_segments=lambda: [
            {'speaker_id': 'host', 'text': '先看收入。'},
            {'speaker_id': 'expert', 'text': '同比增长。'},
        ],
        narration_revision=3,
        image_versions=[SimpleNamespace(version_number=4, is_current=True)],
    )
    project = SimpleNamespace(
        pages=[page],
        project_title='统一主题',
        idea_prompt=None,
        image_aspect_ratio='16:9',
    )

    spine_video = build_video_document_from_spine(spine_document)
    ppt_video = build_video_document_from_ppt(project)

    _validator().validate(spine_video)
    _validator().validate(ppt_video)
    assert set(spine_video) == set(ppt_video)
    assert ppt_video['scenes'][0]['visual'] == {
        'kind': 'native_scene',
        'source_ref': 'page-1',
        'source_revision': 4,
    }
    assert ppt_video['scenes'][0]['narration']['mode'] == 'dialogue'


def test_video_render_plan_keeps_scene_identity_and_reports_visual_fallback():
    from services.video_workspace_render_plan import build_video_workspace_render_items

    page = SimpleNamespace(generated_image_path='project/pages/one.png')
    document = {
        'scenes': [
            {
                'scene_id': 'scene.page.1', 'title': '有图页面',
                'visual': {'kind': 'page', 'source_ref': 'page-1'},
                'narration': {'mode': 'single', 'text': '正文', 'segments': []},
            },
            {
                'scene_id': 'scene.blank.2', 'title': '空白场景',
                'visual': {'kind': 'blank', 'source_ref': None},
                'narration': {'mode': 'single', 'text': '', 'segments': []},
            },
        ],
    }

    items = build_video_workspace_render_items(
        document,
        page_lookup=lambda ref: page if ref == 'page-1' else None,
        path_resolver=lambda path: f'/uploads/{path}',
    )

    assert items[0]['page_id'] == 'scene.page.1'
    assert items[0]['image_path'] == '/uploads/project/pages/one.png'
    assert items[1]['image_path'] is None
    assert items[1]['fallback_reason'] == 'scene_has_no_renderable_page_source'
    assert items[1]['allow_silent'] is True


def test_video_render_plan_preserves_workspace_motion_transition_and_audio_cues():
    from services.video_workspace_render_plan import build_video_workspace_render_items

    document = {
        'scenes': [{
            'scene_id': 'scene.motion.1', 'title': '动效场景',
            'visual': {'kind': 'blank', 'source_ref': None},
            'narration': {'mode': 'single', 'text': '正文', 'segments': []},
            'transition': 'fade',
            'animation': {'intensity': 'balanced', 'cues': [{'element_id': 'title', 'enter': 'fade'}]},
            'audio_cues': [{'cue_id': 'cue.1', 'kind': 'sfx', 'asset_ref': '/files/materials/fx.mp3', 'offset_ms': 120, 'gain_db': -6}],
        }],
    }
    item = build_video_workspace_render_items(
        document, page_lookup=lambda _ref: None,
        path_resolver=lambda path: f'/uploads/{path}',
    )[0]

    assert item['transition'] == 'fade'
    assert item['animation']['intensity'] == 'balanced'
    assert item['audio_cues'][0]['offset_ms'] == 120
    assert item['audio_cue_assets'][0]['path'] == '/uploads//files/materials/fx.mp3'
    assert item['native_animation']['elements']['title']['enter'] == 'fade'


def test_video_workspace_export_snapshot_is_immutable(tmp_path):
    from services.video_workspace_export_snapshot import (
        create_video_workspace_export_snapshot,
        load_video_workspace_export_snapshot,
    )

    image = tmp_path / 'page.png'
    image.write_bytes(b'png')
    version = SimpleNamespace(
        id='version-1', revision=2, content_hash='a' * 64,
        document_json=json.dumps({'scenes': [{
            'scene_id': 'scene.1', 'title': '第一幕',
            'visual': {'kind': 'page', 'source_ref': 'page-1'},
            'narration': {'mode': 'single', 'text': '旁白', 'segments': []},
        }]}),
    )
    page = SimpleNamespace(generated_image_path='page.png')

    snapshot = create_video_workspace_export_snapshot(
        project_id='project-1', workspace_version=version, upload_root=tmp_path,
        page_lookup=lambda ref: page if ref == 'page-1' else None,
        path_resolver=lambda path: str(image), export_config={'voice': 'zh-CN-XiaoxiaoNeural'},
    )
    loaded = load_video_workspace_export_snapshot(snapshot['path'], snapshot['sha256'])

    assert loaded['workspace_version']['revision'] == 2
    assert loaded['render_items'][0]['page_id'] == 'scene.1'
    assert sha256(Path(snapshot['path']).read_bytes()).hexdigest() == snapshot['sha256']


def test_video_render_plan_freezes_current_scene_manifest_and_bundle(tmp_path):
    from PIL import Image
    from services.video_workspace_render_plan import build_video_workspace_render_items
    from services.image_scene_service import build_image_scene_manifest, materialize_image_scene_bundle
    from services.scene_manifest import save_scene_manifests

    image = tmp_path / 'page.png'
    Image.new('RGB', (8, 8), 'white').save(image)
    scene = build_image_scene_manifest(page_id='page-1', background_asset_path=str(image), title='标题')
    scene_ref = save_scene_manifests([scene], tmp_path / 'manifests', ['page-1'])[0]
    materialize_image_scene_bundle(scene_ref, tmp_path / 'direct-bundles')
    version = SimpleNamespace(is_current=True, scene_manifest_path=scene_ref['path'], scene_manifest_sha256=scene_ref['sha256'])
    page = SimpleNamespace(id='page-1', generated_image_path='page.png', image_versions=[version])
    items = build_video_workspace_render_items({'scenes': [{'scene_id': 'scene.1', 'title': '原生场景', 'visual': {'kind': 'native_scene', 'source_ref': 'page-1'}, 'narration': {'text': '', 'segments': []}}]}, page_lookup=lambda _ref: page, path_resolver=lambda _path: str(image), native_bundle_directory=tmp_path / 'bundles')
    assert items[0]['scene_manifest_ref'] == scene_ref
    assert items[0]['native_scene_bundle_ref']['page_id'] == 'page-1'


def test_video_workspace_snapshot_materializes_browser_frame_handoff(tmp_path):
    from services.video_workspace_export_snapshot import (
        create_video_workspace_export_snapshot,
        load_video_workspace_export_snapshot,
    )

    source_dir = tmp_path / 'project-1' / 'workspace-assets' / 'browser-frames'
    source_dir.mkdir(parents=True)
    source_frames = []
    hashes = []
    for index, content in enumerate((b'frame-one', b'frame-two')):
        path = source_dir / f'{index}.png'
        path.write_bytes(content)
        source_frames.append(path.relative_to(tmp_path).as_posix())
        hashes.append(sha256(content).hexdigest())
    settings = {
        'browser_frame_handoff': {
            'schema_version': 1,
            'frames': [{
                'page_id': 'page-1',
                'paths': source_frames,
                'sha256': hashes,
            }],
        },
    }
    version = SimpleNamespace(
        id='version-2',
        revision=2,
        content_hash='b' * 64,
        document_json=json.dumps({
            'scenes': [{
                'scene_id': 'scene.1',
                'title': '原生阶段动画',
                'visual': {'kind': 'native_scene', 'source_ref': 'page-1'},
                'narration': {'mode': 'single', 'text': '', 'segments': []},
            }],
        }),
        settings_json=json.dumps(settings),
    )
    page = SimpleNamespace(generated_image_path=None, image_versions=[])

    snapshot = create_video_workspace_export_snapshot(
        project_id='project-1',
        workspace_version=version,
        upload_root=tmp_path,
        page_lookup=lambda _ref: page,
        path_resolver=lambda _path: None,
    )
    loaded = load_video_workspace_export_snapshot(snapshot['path'], snapshot['sha256'])
    item = loaded['render_items'][0]

    assert item['stage_image_sha256'] == hashes
    assert [Path(path).read_bytes() for path in item['stage_image_paths']] == [
        b'frame-one',
        b'frame-two',
    ]
    assert item['image_path'] == item['stage_image_paths'][-1]


def test_video_workspace_snapshot_freezes_audio_mix_manifest_and_rejects_tampering(tmp_path):
    from services.video_workspace_export_snapshot import (
        create_video_workspace_export_snapshot,
        load_video_workspace_export_snapshot,
    )

    image = tmp_path / 'page.png'
    image.write_bytes(b'png')
    bgm = tmp_path / 'bgm.mp3'
    sfx = tmp_path / 'sfx.mp3'
    bgm.write_bytes(b'bgm')
    sfx.write_bytes(b'sfx')
    version = SimpleNamespace(
        id='version-audio', revision=3, content_hash='c' * 64,
        document_json=json.dumps({'scenes': [{
            'scene_id': 'scene.1', 'title': '带音频场景',
            'visual': {'kind': 'page', 'source_ref': 'page-1'},
            'narration': {'mode': 'single', 'text': '旁白', 'segments': []},
            'audio_cues': [
                {'cue_id': 'cue.bgm', 'kind': 'bgm', 'asset_ref': '/files/materials/bgm.mp3', 'offset_ms': 0, 'gain_db': -20},
                {'cue_id': 'cue.sfx', 'kind': 'sfx', 'asset_ref': '/files/materials/sfx.mp3', 'offset_ms': 120, 'gain_db': -8},
            ],
        }]}),
    )

    snapshot = create_video_workspace_export_snapshot(
        project_id='project-audio', workspace_version=version, upload_root=tmp_path,
        page_lookup=lambda ref: SimpleNamespace(generated_image_path='page.png') if ref == 'page-1' else None,
        path_resolver=lambda ref: str({'page.png': image, '/files/materials/bgm.mp3': bgm, '/files/materials/sfx.mp3': sfx}.get(ref)),
    )
    loaded = load_video_workspace_export_snapshot(snapshot['path'], snapshot['sha256'])
    mix = loaded['audio_mix']
    assert mix['manifest']['music']['enabled'] is True
    assert mix['manifest']['sfx'][0]['page_id'] == 'scene.1'
    assert set(mix['asset_hashes']) == {
        'asset.' + sha256(b'/files/materials/bgm.mp3').hexdigest()[:24],
        'asset.' + sha256(b'/files/materials/sfx.mp3').hexdigest()[:24],
    }

    sfx.write_bytes(b'tampered')
    try:
        load_video_workspace_export_snapshot(snapshot['path'], snapshot['sha256'])
    except ValueError as exc:
        assert 'changed after snapshot' in str(exc)
    else:
        raise AssertionError('tampered audio must be rejected')
