from models import Page, PageImageVersion, Project, db
from controllers import export_controller


def test_snapshot_current_image_scenes_keeps_legacy_page_as_fallback_slot(
    client,
    tmp_path,
    monkeypatch,
):
    project = Project(id='image-scene-export', creation_type='idea', render_mode='image')
    scene_page = Page(id='scene-page', project_id=project.id, order_index=0)
    legacy_page = Page(id='legacy-page', project_id=project.id, order_index=1)
    version = PageImageVersion(
        page_id=scene_page.id,
        image_path='scene-page.png',
        version_number=1,
        is_current=True,
        scene_manifest_path=str(tmp_path / 'scene.json'),
        scene_manifest_sha256='a' * 64,
        scene_status='ready',
        scene_quality_score=1.0,
        scene_schema_version=1,
    )
    db.session.add_all([project, scene_page, legacy_page, version])
    db.session.commit()

    monkeypatch.setattr(
        'services.scene_manifest.load_scene_manifest',
        lambda reference, page_id: {'page_id': page_id, 'reference': reference},
    )

    def fake_bundle(reference, output_directory):
        return {
            'page_id': reference['page_id'],
            'path': str(output_directory / 'bundle.json'),
            'sha256': 'b' * 64,
        }

    monkeypatch.setattr(
        'services.image_scene_service.materialize_image_scene_bundle',
        fake_bundle,
    )

    scene_refs, bundle_refs, scene_levels = export_controller._snapshot_current_image_scenes(
        project,
        [scene_page, legacy_page],
        tmp_path,
        {'IMAGE_SCENE_ENABLED': True, 'HYPERFRAMES_ENABLED': True},
    )

    assert scene_refs == [{
        'page_id': scene_page.id,
        'path': str(tmp_path / 'scene.json'),
        'sha256': 'a' * 64,
    }, None]
    assert bundle_refs[0]['page_id'] == scene_page.id
    assert bundle_refs[1] is None
    assert scene_levels == [
        {'page_id': scene_page.id, 'level': 'L0', 'reason': ''},
        {
            'page_id': legacy_page.id,
            'level': 'L3',
            'reason': '',
        },
    ]


def test_snapshot_current_image_scenes_stays_off_without_both_flags(client, tmp_path):
    project = Project(id='image-scene-disabled', creation_type='idea', render_mode='image')

    assert export_controller._snapshot_current_image_scenes(
        project,
        [],
        tmp_path,
        {'IMAGE_SCENE_ENABLED': True, 'HYPERFRAMES_ENABLED': False},
    ) == ([], [], [])


def test_image_scene_preflight_explains_animation_and_page_fallback(
    client,
    tmp_path,
    monkeypatch,
):
    project = Project(id='image-scene-preflight', creation_type='idea', render_mode='image')
    scene_page = Page(id='preflight-scene', project_id=project.id, order_index=0)
    legacy_page = Page(id='preflight-legacy', project_id=project.id, order_index=1)
    version = PageImageVersion(
        page_id=scene_page.id,
        image_path='scene-page.png',
        version_number=1,
        is_current=True,
        scene_manifest_path=str(tmp_path / 'scene.json'),
        scene_manifest_sha256='a' * 64,
        scene_status='ready',
    )
    db.session.add_all([project, scene_page, legacy_page, version])
    db.session.commit()
    monkeypatch.setattr(
        'services.scene_manifest.load_scene_manifest',
        lambda *_args, **_kwargs: {'render_mode': 'image'},
    )

    result = export_controller._image_scene_preflight(
        project,
        [scene_page, legacy_page],
        {'IMAGE_SCENE_ENABLED': True, 'HYPERFRAMES_ENABLED': True},
    )

    assert result['animated_pages'] == [1]
    assert result['fallback_pages'] == [{
        'page': 2,
        'level': 'L3',
        'reason': '当前图片版本没有可用的分层场景',
        'strategy': 'ken_burns_or_static',
    }]
    assert result['errors'] == []
