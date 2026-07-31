from pathlib import Path
from types import SimpleNamespace

from PIL import Image

from models import Page, PageImageVersion, Project, db
from services.task_manager import recover_historical_image_scenes_task, save_image_with_version


class _FileService:
    def save_generated_image(self, *_args, **_kwargs):
        return 'projects/project-1/pages/page-1-v2.png'

    def save_cached_image(self, *_args, **_kwargs):
        return 'projects/project-1/pages/page-1-v2-thumb.jpg'


def _create_page():
    project = Project(id='project-1', creation_type='idea', status='DRAFT')
    page = Page(id='page-1', project_id=project.id, order_index=0, status='DRAFT')
    db.session.add_all([project, page])
    db.session.commit()
    return project, page


def test_saved_image_version_binds_hash_verified_scene_metadata(client):
    _project, page = _create_page()
    scene_ref = {
        'page_id': page.id,
        'path': 'projects/project-1/pages/page-1-scene.json',
        'sha256': 'a' * 64,
    }

    save_image_with_version(
        Image.new('RGB', (32, 18)),
        'project-1',
        page.id,
        _FileService(),
        page_obj=page,
        scene_manifest_ref=scene_ref,
        scene_quality_score=0.96,
        scene_schema_version=1,
    )

    version = PageImageVersion.query.filter_by(page_id=page.id).one()
    payload = version.to_dict()
    assert payload['scene_manifest_ref'] == scene_ref
    assert payload['scene_status'] == 'ready'
    assert payload['scene_quality_score'] == 0.96
    assert payload['scene_schema_version'] == 1


def test_switching_image_version_switches_returned_scene_binding(client):
    project, page = _create_page()
    first = PageImageVersion(
        id='version-1', page_id=page.id, image_path='page-1-v1.png',
        version_number=1, is_current=True,
        scene_manifest_path='page-1-scene-v1.json', scene_manifest_sha256='1' * 64,
        scene_status='ready', scene_quality_score=0.9, scene_schema_version=1,
    )
    second = PageImageVersion(
        id='version-2', page_id=page.id, image_path='page-1-v2.png',
        version_number=2, is_current=False,
        scene_manifest_path='page-1-scene-v2.json', scene_manifest_sha256='2' * 64,
        scene_status='ready', scene_quality_score=0.95, scene_schema_version=1,
    )
    page.generated_image_path = first.image_path
    db.session.add_all([first, second])
    db.session.commit()

    response = client.post(
        f'/api/projects/{project.id}/pages/{page.id}/image-versions/{second.id}/set-current'
    )

    assert response.status_code == 200
    payload = response.get_json()['data']
    current = next(item for item in payload['image_versions'] if item['is_current'])
    assert current['version_id'] == second.id
    assert current['scene_manifest_ref']['path'] == second.scene_manifest_path
    assert current['scene_manifest_ref']['sha256'] == second.scene_manifest_sha256


def test_invalid_scene_reference_fails_before_image_write(client):
    class FailingIfCalledFileService(_FileService):
        def save_generated_image(self, *_args, **_kwargs):
            raise AssertionError('image write must not start')

    _project, page = _create_page()

    try:
        save_image_with_version(
            Image.new('RGB', (32, 18)),
            'project-1',
            page.id,
            FailingIfCalledFileService(),
            scene_manifest_ref={'page_id': page.id, 'path': 'scene.json', 'sha256': 'bad'},
        )
    except ValueError as exc:
        assert 'SHA-256' in str(exc)
    else:
        raise AssertionError('invalid Scene Manifest reference was accepted')


def test_historical_scene_recovery_creates_resumable_task(client, monkeypatch):
    project, page = _create_page()
    version = PageImageVersion(
        id='version-history',
        page_id=page.id,
        image_path='project-1/pages/history.png',
        version_number=1,
        is_current=True,
    )
    db.session.add(version)
    db.session.commit()
    submitted = []
    monkeypatch.setattr(
        'controllers.page_controller.task_manager.submit_task',
        lambda *args, **kwargs: submitted.append((args, kwargs)),
    )

    response = client.post(
        f'/api/projects/{project.id}/pages/{page.id}/image-versions/{version.id}/recover-scene',
        json={'force': True},
    )

    assert response.status_code == 202
    task_id = response.get_json()['data']['task_id']
    from models import Task

    task = db.session.get(Task, task_id)
    resume = task.get_progress()['_resume']
    assert task.task_type == 'RECOVER_IMAGE_SCENES'
    assert resume['kind'] == 'historical-image-scenes'
    assert resume['kwargs']['version_ids'] == [version.id]
    assert submitted[0][0][0] == task.id

    paused = client.post(f'/api/projects/{project.id}/tasks/{task.id}/pause')
    assert paused.status_code == 200
    assert paused.get_json()['data']['status'] == 'PAUSED'
    monkeypatch.setattr('controllers.project_controller.task_manager.is_task_active', lambda _id: True)
    resumed = client.post(f'/api/projects/{project.id}/tasks/{task.id}/resume')
    assert resumed.status_code == 200
    assert resumed.get_json()['data']['status'] == 'PROCESSING'


def test_project_historical_scene_recovery_batches_current_versions(client, monkeypatch):
    project, page = _create_page()
    version = PageImageVersion(
        id='version-current',
        page_id=page.id,
        image_path='project-1/pages/current.png',
        version_number=1,
        is_current=True,
    )
    db.session.add(version)
    db.session.commit()
    submitted = []
    monkeypatch.setattr(
        'controllers.project_controller.task_manager.submit_task',
        lambda *args, **kwargs: submitted.append((args, kwargs)),
    )

    response = client.post(
        f'/api/projects/{project.id}/recover-image-scenes',
        json={'page_ids': [page.id]},
    )

    assert response.status_code == 202
    assert response.get_json()['data']['total_pages'] == 1
    assert submitted[0][1]['version_ids'] == [version.id]


def test_unavailable_recovery_service_degrades_without_blocking_export(client, monkeypatch, tmp_path):
    project, page = _create_page()
    version = PageImageVersion(
        id='version-degraded',
        page_id=page.id,
        image_path='project-1/pages/current.png',
        version_number=1,
        is_current=True,
    )
    from models import Task

    task = Task(id='recover-task', project_id=project.id, task_type='RECOVER_IMAGE_SCENES', status='PENDING')
    db.session.add_all([version, task])
    db.session.commit()
    monkeypatch.setattr(
        'services.image_editability.ServiceConfig.from_defaults',
        lambda **_kwargs: (_ for _ in ()).throw(RuntimeError('OCR unavailable')),
    )

    recover_historical_image_scenes_task(
        task.id,
        project.id,
        [version.id],
        SimpleNamespace(upload_folder=Path(tmp_path)),
        client.application,
    )

    db.session.refresh(task)
    db.session.refresh(version)
    assert task.status == 'COMPLETED'
    assert version.scene_status == 'degraded'
    assert version.scene_manifest_path is None
    assert version.scene_error.startswith('L3:')
