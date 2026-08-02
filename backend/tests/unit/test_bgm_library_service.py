"""内置 BGM 库：程序化合成、全局素材注册与幂等性。"""

import subprocess

import pytest

from backend.tests.content_project_factory import add_content_project

_BACKEND = __import__('pathlib').Path(__file__).resolve().parents[2]


def _ffmpeg_available() -> bool:
    try:
        subprocess.run(
            ['ffmpeg', '-version'], capture_output=True, timeout=10,
        )
        return True
    except (OSError, subprocess.SubprocessError):
        return False


@pytest.mark.skipif(not _ffmpeg_available(), reason='ffmpeg not available')
def test_bgm_library_generates_tracks_and_registers_global_materials(app):
    from models import Material

    with app.app_context():
        from services.bgm_library_service import ensure_bgm_library

        tracks = ensure_bgm_library(app.config['UPLOAD_FOLDER'], 'ffmpeg')
        assert len(tracks) >= 5
        for track in tracks:
            assert track['url'].startswith('/files/bgm_library/')
            assert track['duration_ms'] > 0
            material = Material.query.filter_by(
                url=track['url'], project_id=None,
            ).one_or_none()
            assert material is not None
            assert material.media_kind == 'audio'
            assert material.purpose == 'bgm'
            assert material.license_status == 'builtin'
            output = __import__('os').path.join(
                app.config['UPLOAD_FOLDER'], track['url'].removeprefix('/files/'),
            )
            assert __import__('os').path.isfile(output)
            assert __import__('os').path.getsize(output) > 0
        # 幂等：二次调用不重复注册
        again = ensure_bgm_library(app.config['UPLOAD_FOLDER'], 'ffmpeg')
        assert [item['url'] for item in again] == [item['url'] for item in tracks]
        assert Material.query.filter_by(
            project_id=None, purpose='bgm', license_status='builtin',
        ).count() == len(tracks)


def test_bgm_library_endpoint_returns_tracks(client, app, monkeypatch):
    monkeypatch.setattr(
        'services.bgm_library_service.ensure_bgm_library',
        lambda _upload_root, _ffmpeg_path: [
            {
                'id': 'bgm.calm', 'name': '轻松舒缓', 'note': 'n',
                'url': '/files/bgm_library/bgm.calm.mp3', 'duration_ms': 48000,
                'material_id': 'm-1',
            },
        ],
    )
    response = client.get('/api/content-projects/bgm-library')
    assert response.status_code == 200, response.get_json()
    tracks = response.get_json()['data']['tracks']
    assert tracks[0]['id'] == 'bgm.calm'
    assert tracks[0]['url'].startswith('/files/')


def test_bgm_library_endpoint_failure_is_503(client, app, monkeypatch):
    monkeypatch.setattr(
        'services.bgm_library_service.ensure_bgm_library',
        lambda _upload_root, _ffmpeg_path: (_ for _ in ()).throw(RuntimeError('ffmpeg missing')),
    )
    response = client.get('/api/content-projects/bgm-library')
    assert response.status_code == 503
    assert response.get_json()['error']['code'] == 'BGM_LIBRARY_FAILED'


def test_bgm_track_file_is_served_over_http(client, app):
    """修复：/files/bgm_library/<id>.mp3 必须有可用的静态路由（试听/下载）。"""
    from pathlib import Path

    bgm_dir = Path(app.config['UPLOAD_FOLDER']) / 'bgm_library'
    bgm_dir.mkdir(parents=True, exist_ok=True)
    (bgm_dir / 'bgm.calm.mp3').write_bytes(b'ID3-fake-mp3')

    response = client.get('/files/bgm_library/bgm.calm.mp3')
    assert response.status_code == 200
    assert response.data == b'ID3-fake-mp3'
    assert response.content_type.startswith('audio/')

    # 路径穿越防护：不得越出 bgm_library 目录
    response = client.get('/files/bgm_library/..%2F..%2Fapp.py')
    assert response.status_code in {403, 404}
