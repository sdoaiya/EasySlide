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


def test_prepare_image_scene_version_falls_back_to_composed_image_on_render_failure(
    tmp_path,
    monkeypatch,
):
    """Hyperframes 渲染失败（如打包运行时缺目录）必须降级为合成页面图，
    生图不能被附属的可编辑场景渲染拖垮，且不能出现「只有背景没有文字」。"""
    monkeypatch.setattr(
        'services.hyperframes_renderer.HyperframesRuntime.for_development',
        lambda *_args, **_kwargs: object(),
    )

    def failing_create(**kwargs):
        output_directory = kwargs['output_directory']
        (output_directory / 'image_scene_orphan').mkdir(parents=True, exist_ok=True)
        raise RuntimeError('Hyperframes 页面渲染失败，退出码 1: ENOENT mkdtemp')

    monkeypatch.setattr(
        'services.image_scene_service.create_image_scene_artifacts',
        failing_create,
    )
    source = Image.new('RGB', (1200, 1200), '#17324d')

    result = task_manager._prepare_image_scene_version(
        source,
        project_id='project-1',
        page_id='page-1',
        page_data={'title': '降级页', 'key_points': ['要点一', '要点二']},
        description='',
        page_index=1,
        file_service=_Files(tmp_path),
        app=_App(),
    )

    # 降级产物是合成图（背景+文字），不是纯背景原图
    assert result is not None
    composed, artifacts = result
    assert artifacts is None
    assert composed.size == (1920, 1080)
    # 标题文字区域出现亮色文字像素，证明文字已合成
    pixels = composed.crop((180, 140, 320, 260)).getcolors(maxcolors=10**7)
    assert any(count < 1000 for count, _ in pixels), '文字区域应为非纯背景'
    composed.close()
    # 失败残留的 image_scene_* 目录被清理
    assert not (tmp_path / 'project-1' / 'image-scenes' / 'page-1').exists()
    source.close()
