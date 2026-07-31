from pathlib import Path

from PIL import Image

from conftest import assert_error_response, assert_success_response
from models import Page, Project, Task, db
from services.narration_service import save_manual_narration_version
from services.video_export_snapshot import load_video_export_snapshot


def _project_with_page(app, *, confirmed):
    project = Project(id=f'snapshot-endpoint-{confirmed}', creation_type='idea', render_mode='image')
    relative_image = f'{project.id}/pages/slide.png'
    absolute_image = Path(app.config['UPLOAD_FOLDER']) / relative_image
    absolute_image.parent.mkdir(parents=True, exist_ok=True)
    Image.new('RGB', (64, 36), color='navy').save(absolute_image)
    page = Page(
        id=f'snapshot-endpoint-page-{confirmed}',
        project_id=project.id,
        order_index=0,
        generated_image_path=relative_image,
    )
    db.session.add_all([project, page])
    db.session.flush()
    version = None
    if confirmed:
        version = save_manual_narration_version(page, {
            'base_revision': 0,
            'text': '冻结到任务的确认稿',
            'language': 'zh-CN',
        })
    db.session.commit()
    return project, page, version


def test_export_endpoint_creates_snapshot_before_task(client, app, monkeypatch):
    project, page, version = _project_with_page(app, confirmed=True)
    submitted = {}
    monkeypatch.setattr(
        'services.task_manager.task_manager.submit_task',
        lambda *args, **kwargs: submitted.update(kwargs),
    )

    response = client.post(f'/api/projects/{project.id}/export/video', json={
        'generate_narration': False,
        'narration_policy': 'confirmed_only',
        'narration_version_map': {page.id: version.id},
        'voice': 'zh-CN-XiaoxiaoNeural',
    })

    data = assert_success_response(response)['data']
    task = db.session.get(Task, data['task_id'])
    resume = task.get_progress()['_resume']['kwargs']
    snapshot = load_video_export_snapshot(
        resume['narration_snapshot_path'],
        resume['narration_snapshot_hash'],
    )
    assert Path(resume['narration_snapshot_path']).is_file()
    assert snapshot['pages'][0]['text'] == '冻结到任务的确认稿'
    assert submitted['narration_snapshot_path'] == resume['narration_snapshot_path']


def test_export_endpoint_freezes_image_scene_refs_into_snapshot(client, app, monkeypatch):
    project, page, version = _project_with_page(app, confirmed=True)
    scene_ref = {
        'page_id': page.id,
        'path': str(Path(app.config['UPLOAD_FOLDER']) / 'scene.json'),
        'sha256': 'a' * 64,
    }
    bundle_ref = {
        'page_id': page.id,
        'path': str(Path(app.config['UPLOAD_FOLDER']) / 'bundle.json'),
        'sha256': 'b' * 64,
    }
    monkeypatch.setattr(
        'controllers.export_controller._snapshot_current_image_scenes',
        lambda *_args, **_kwargs: (
            [scene_ref],
            [bundle_ref],
            [{'page_id': page.id, 'level': 'L1', 'reason': '部分元素恢复'}],
        ),
    )
    monkeypatch.setattr(
        'services.task_manager.task_manager.submit_task',
        lambda *_args, **_kwargs: None,
    )

    response = client.post(f'/api/projects/{project.id}/export/video', json={
        'generate_narration': False,
        'narration_policy': 'confirmed_only',
        'narration_version_map': {page.id: version.id},
    })

    data = assert_success_response(response)['data']
    task = db.session.get(Task, data['task_id'])
    resume = task.get_progress()['_resume']['kwargs']
    snapshot = load_video_export_snapshot(
        resume['narration_snapshot_path'],
        resume['narration_snapshot_hash'],
    )
    assert snapshot['scene_manifests'] == [scene_ref]
    assert snapshot['native_scene_bundles'] == [bundle_ref]
    assert snapshot['scene_levels'][0]['level'] == 'L1'


def test_confirmed_policy_rejects_missing_before_task_creation(client, app, monkeypatch):
    project, _page, _version = _project_with_page(app, confirmed=False)
    monkeypatch.setattr(
        'services.task_manager.task_manager.submit_task',
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError('must not submit')),
    )

    response = client.post(f'/api/projects/{project.id}/export/video', json={
        'generate_narration': False,
        'narration_policy': 'confirmed_only',
    })

    error = assert_error_response(response, 400)
    assert '缺少已确认旁白' in error['error']['message']
    assert Task.query.filter_by(project_id=project.id).count() == 0


def test_worker_reads_frozen_snapshot_instead_of_mutated_page(client, app, monkeypatch):
    project, page, version = _project_with_page(app, confirmed=True)
    submitted = {}

    def capture(*args, **kwargs):
        submitted['function'] = args[1]
        submitted['task_id'] = args[0]
        submitted['kwargs'] = kwargs

    monkeypatch.setattr('services.task_manager.task_manager.submit_task', capture)
    response = client.post(f'/api/projects/{project.id}/export/video', json={
        'generate_narration': False,
        'narration_policy': 'confirmed_only',
        'narration_version_map': {page.id: version.id},
    })
    assert_success_response(response)

    page.narration_text = '提交任务后被修改的当前稿'
    db.session.commit()
    rendered = {}

    def fake_generate(**kwargs):
        rendered['pages'] = kwargs['pages_data']
        Path(kwargs['output_path']).write_bytes(b'fake-mp4')
        return {'warnings': []}

    import services.tts_video_service as tts_video_service

    monkeypatch.setattr(tts_video_service, 'check_ffmpeg_available', lambda *_: True)
    monkeypatch.setattr(tts_video_service, 'check_ffmpeg_ass_filter_available', lambda *_: True)
    monkeypatch.setattr(tts_video_service, 'generate_narration_video', fake_generate)
    submitted['function'](
        submitted['task_id'],
        file_service=submitted['kwargs']['file_service'],
        app=app,
        **{
            key: value
            for key, value in submitted['kwargs'].items()
            if key not in {'file_service', 'app'}
        },
    )

    assert rendered['pages'][0]['narration_text'] == '冻结到任务的确认稿'
