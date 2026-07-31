from pathlib import Path

from PIL import Image

from services import task_manager


class _App:
    config = {
        'IMAGE_SCENE_ENABLED': True,
        'HYPERFRAMES_ENABLED': True,
        'FFMPEG_PATH': 'ffmpeg-test',
    }


class _Files:
    def __init__(self, root):
        self.upload_folder = root


def test_image_scene_requires_both_production_flags():
    app = _App()

    assert task_manager._image_scene_enabled(app) is True
    app.config['HYPERFRAMES_ENABLED'] = False
    assert task_manager._image_scene_enabled(app) is False


def test_prepare_image_scene_version_uses_hero_and_stable_page_copy(
    tmp_path,
    monkeypatch,
):
    captured = {}
    hero_path = tmp_path / 'hero.png'
    Image.new('RGB', (1920, 1080), '#f7f5ef').save(hero_path)

    monkeypatch.setattr(
        'services.hyperframes_renderer.HyperframesRuntime.for_development',
        lambda *_args, **_kwargs: object(),
    )

    def fake_create(**kwargs):
        captured.update(kwargs)
        return {
            'hero_path': str(hero_path),
            'scene_manifest_ref': {
                'page_id': 'page-1',
                'path': str(tmp_path / 'scene.json'),
                'sha256': 'a' * 64,
            },
            'quality': {'status': 'passed', 'issues': []},
        }

    monkeypatch.setattr(
        'services.image_scene_service.create_image_scene_artifacts',
        fake_create,
    )
    source = Image.new('RGB', (1200, 1200), '#17324d')

    version_image, artifacts = task_manager._prepare_image_scene_version(
        source,
        project_id='project-1',
        page_id='page-1',
        page_data={
            'title': '年度增长引擎',
            'key_points': ['产品进入规模化阶段', '收入同比增长 68%'],
        },
        description='fallback',
        page_index=2,
        file_service=_Files(tmp_path),
        app=_App(),
    )

    assert version_image.size == (1920, 1080)
    assert captured['background_image'].size == (1920, 1080)
    assert captured['title'] == '年度增长引擎'
    assert captured['body_lines'] == ['产品进入规模化阶段', '收入同比增长 68%']
    assert captured['ffmpeg_path'] == 'ffmpeg-test'
    assert captured['output_directory'] == Path(
        tmp_path / 'project-1' / 'image-scenes' / 'page-1'
    )
    assert artifacts['scene_manifest_ref']['page_id'] == 'page-1'
    version_image.close()
