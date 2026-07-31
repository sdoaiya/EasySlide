import io
import hashlib
import json
from pathlib import Path
from unittest.mock import patch

import pytest
from PIL import Image

from conftest import assert_success_response
from models import Page, Project, Settings, Task, db
from services.file_service import FileService
from services.native_scene_bundle import load_native_scene_bundle, save_native_scene_bundles
from services.scene_manifest import load_scene_manifest, save_scene_manifests
from services.task_manager import export_video_task
from services.video_export_snapshot import create_video_export_snapshot, load_video_export_snapshot


def _png_bytes(color):
    output = io.BytesIO()
    Image.new('RGB', (4, 4), color).save(output, format='PNG')
    output.seek(0)
    return output


def _scene_manifest(page_id):
    return {
        'schema_version': 1,
        'page_id': page_id,
        'render_mode': 'native',
        'width': 1920,
        'height': 1080,
        'visual_style': {'theme_id': 'core01', 'colors': [], 'font_families': []},
        'elements': [{
            'id': 'title',
            'kind': 'title',
            'role': 'headline',
            'bbox': [100, 80, 600, 100],
            'z_index': 1,
            'asset_path': None,
            'text': '标题',
            'motion_capabilities': ['reveal', 'highlight'],
        }],
        'fallback_preview_path': None,
        'quality': {'score': 1, 'warnings': []},
    }


def _canonical_sha256(payload):
    content = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
    return hashlib.sha256(content).hexdigest()


def _scene_bundle(page_id, scene_sha):
    return {
        'schema_version': 1,
        'page_id': page_id,
        'scene_manifest_sha256': scene_sha,
        'width': 1920,
        'height': 1080,
        'html': (
            f'<div class="native-slide" data-page-id="{page_id}">'
            '<h1 data-motion-id="title">标题</h1></div>'
        ),
        'css': '.native-slide{background:#fff}',
        'assets': [],
        'warnings': [],
    }


def test_native_video_export_saves_browser_frames_without_overwriting_page_images(client, app):
    project = Project(id='native-video-project', creation_type='idea', render_mode='native')
    pages = [
        Page(id='native-video-page-1', project_id=project.id, order_index=0, narration_text='第一页旁白'),
        Page(id='native-video-page-2', project_id=project.id, order_index=1, narration_text='第二页旁白'),
    ]
    pages[0].set_native_props({
        '__animation': {'elementEnter': 'fade', 'elementDuration': 420},
    })
    db.session.add(project)
    db.session.add_all(pages)
    db.session.commit()
    scene_manifests = [_scene_manifest(page.id) for page in pages]
    scene_bundles = [
        _scene_bundle(page.id, _canonical_sha256(manifest))
        for page, manifest in zip(pages, scene_manifests)
    ]

    with patch('services.task_manager.task_manager.submit_task') as submit_task:
        response = client.post(
            f'/api/projects/{project.id}/export/native-video',
            data={
                'page_ids': json.dumps([page.id for page in pages]),
                'frame_counts': json.dumps([2, 1]),
                'director_config': json.dumps({'preset': 'launch'}),
                'scene_manifests': json.dumps(scene_manifests),
                'native_scene_bundles': json.dumps(scene_bundles),
                'frames': [
                    (_png_bytes('red'), 'frame-1.png'),
                    (_png_bytes('blue'), 'frame-2.png'),
                    (_png_bytes('green'), 'frame-3.png'),
                ],
            },
            content_type='multipart/form-data',
        )

    data = assert_success_response(response)
    task = db.session.get(Task, data['data']['task_id'])
    resume_kwargs = task.get_progress()['_resume']['kwargs']
    frame_sequences = resume_kwargs['frame_sequences']
    frame_paths = [path for sequence in frame_sequences for path in sequence]
    snapshot = load_video_export_snapshot(
        resume_kwargs['narration_snapshot_path'],
        resume_kwargs['narration_snapshot_hash'],
    )
    scene_manifest_refs = snapshot['scene_manifests']
    native_scene_bundle_refs = snapshot['native_scene_bundles']

    assert task.task_type == 'EXPORT_VIDEO'
    assert [len(sequence) for sequence in frame_sequences] == [2, 1]
    assert len(frame_paths) == 3
    assert all(Path(path).is_file() for path in frame_paths)
    assert all(page.generated_image_path is None for page in pages)
    assert submit_task.call_args.kwargs['frame_sequences'] == frame_sequences
    assert 'scene_manifests' not in resume_kwargs
    assert 'scene_manifests' not in submit_task.call_args.kwargs
    assert [reference['page_id'] for reference in scene_manifest_refs] == [page.id for page in pages]
    assert all(set(reference) == {'page_id', 'path', 'sha256'} for reference in scene_manifest_refs)
    assert all(Path(reference['path']).is_file() for reference in scene_manifest_refs)
    assert load_scene_manifest(scene_manifest_refs[0], pages[0].id)['elements'][0]['id'] == 'title'
    assert [reference['page_id'] for reference in native_scene_bundle_refs] == [page.id for page in pages]
    assert all(Path(reference['path']).is_file() for reference in native_scene_bundle_refs)
    assert load_native_scene_bundle(
        native_scene_bundle_refs[0],
        pages[0].id,
        scene_manifest_refs[0]['sha256'],
    )['html'].startswith('<div')
    director_plan = resume_kwargs['director_plan']
    assert director_plan['preset'] == 'launch'
    assert director_plan['pages'][0]['element_timeline'][0]['enter'] == 'fade'


@pytest.mark.parametrize(
    ('case', 'error_fragment'),
    [
        ('not-array', 'scene_manifests 必须是 JSON 数组'),
        ('wrong-page', '场景清单页面不匹配'),
        ('duplicate-id', 'ID 重复'),
        ('out-of-bounds', 'bbox 越界'),
    ],
)
def test_native_video_export_rejects_invalid_scene_manifests_and_cleans_task_dir(
    client,
    app,
    case,
    error_fragment,
):
    project = Project(id=f'native-video-invalid-{case}', creation_type='idea', render_mode='native')
    page = Page(
        id=f'native-video-invalid-page-{case}',
        project_id=project.id,
        order_index=0,
        narration_text='已确认旁白',
    )
    db.session.add_all([project, page])
    db.session.commit()

    manifest = _scene_manifest(page.id)
    if case == 'not-array':
        submitted_manifests = {'manifest': manifest}
    elif case == 'wrong-page':
        manifest['page_id'] = 'another-page'
        submitted_manifests = [manifest]
    elif case == 'duplicate-id':
        manifest['elements'].append(dict(manifest['elements'][0]))
        submitted_manifests = [manifest]
    else:
        manifest['elements'][0]['bbox'] = [1900, 0, 100, 50]
        submitted_manifests = [manifest]

    response = client.post(
        f'/api/projects/{project.id}/export/native-video',
        data={
            'page_ids': json.dumps([page.id]),
            'scene_manifests': json.dumps(submitted_manifests),
            'frames': [(_png_bytes('red'), 'frame.png')],
        },
        content_type='multipart/form-data',
    )

    exports_dir = Path(app.config['UPLOAD_FOLDER']) / project.id / 'exports'
    assert response.status_code == 400
    assert error_fragment in json.dumps(response.get_json(), ensure_ascii=False)
    assert Task.query.filter_by(project_id=project.id, task_type='EXPORT_VIDEO').count() == 0
    assert not exports_dir.exists() or not list(exports_dir.glob('_native_video_*'))


def test_native_video_export_marks_the_committed_task_failed_when_submission_fails(client):
    project = Project(id='native-video-submit-failure', creation_type='idea', render_mode='native')
    page = Page(id='native-video-submit-page', project_id=project.id, order_index=0, narration_text='旁白')
    db.session.add_all([project, page])
    db.session.commit()

    with patch('services.task_manager.task_manager.submit_task', side_effect=RuntimeError('queue unavailable')):
        response = client.post(
            f'/api/projects/{project.id}/export/native-video',
            data={
                'page_ids': json.dumps([page.id]),
                'frames': [(_png_bytes('red'), 'frame.png')],
            },
            content_type='multipart/form-data',
        )

    task = Task.query.filter_by(project_id=project.id, task_type='EXPORT_VIDEO').one()
    frames_dir = Path(client.application.config['UPLOAD_FOLDER']) / project.id / 'exports' / f'_native_video_{task.id}'
    assert response.status_code == 500
    assert task.status == 'FAILED'
    assert 'queue unavailable' in task.error_message
    assert not frames_dir.exists()


def test_video_worker_prefers_browser_frames_and_retains_reproducibility_inputs(client, app):
    project = Project(id='native-video-worker-project', creation_type='idea', render_mode='native')
    page = Page(
        id='native-video-worker-page',
        project_id=project.id,
        order_index=0,
        narration_text='已准备好的旁白',
        generated_image_path='missing-generated-image.png',
    )
    task = Task(project_id=project.id, task_type='EXPORT_VIDEO', status='PENDING')
    db.session.add_all([project, page, task])
    db.session.commit()
    settings = Settings.get_settings()
    db.session.commit()

    frames_dir = Path(app.config['UPLOAD_FOLDER']) / project.id / 'exports' / f'_native_video_{task.id}'
    frames_dir.mkdir(parents=True)
    frame_path = frames_dir / 'frame_0000.png'
    frame_path.write_bytes(_png_bytes('green').getvalue())
    scene_manifest_refs = save_scene_manifests([_scene_manifest(page.id)], frames_dir, [page.id])
    native_scene_bundle_refs = save_native_scene_bundles(
        [_scene_bundle(page.id, scene_manifest_refs[0]['sha256'])],
        frames_dir,
        scene_manifest_refs,
        [page.id],
    )
    snapshot = create_video_export_snapshot(
        project=project,
        pages=[page],
        upload_root=app.config['UPLOAD_FOLDER'],
        narration_policy='export_only_auto_fill',
        scene_manifest_refs=scene_manifest_refs,
        native_scene_bundle_refs=native_scene_bundle_refs,
    )
    db.session.commit()
    captured = {}

    def fake_generate_narration_video(*, pages_data, output_path, **_kwargs):
        captured['pages_data'] = pages_data
        captured['artifact_directory'] = _kwargs.get('artifact_directory')
        Path(output_path).write_bytes(b'video')

    with patch('services.tts_video_service.check_ffmpeg_available', return_value=True), \
         patch('services.tts_video_service.check_ffmpeg_ass_filter_available', return_value=True), \
         patch('services.tts_video_service.generate_narration_video', side_effect=fake_generate_narration_video):
        export_video_task(
            task.id,
            project.id,
            'native-video.mp4',
            FileService(app.config['UPLOAD_FOLDER']),
            generate_narration=False,
            page_ids=[page.id],
            frame_paths=[str(frame_path)],
            narration_snapshot_path=snapshot['path'],
            narration_snapshot_hash=snapshot['sha256'],
            app=app,
        )

    db.session.refresh(task)
    assert captured['pages_data'][0]['image_path'] == str(frame_path)
    assert captured['pages_data'][0]['scene_manifest_ref'] == scene_manifest_refs[0]
    assert captured['pages_data'][0]['native_scene_bundle_ref'] == native_scene_bundle_refs[0]
    assert captured['artifact_directory'] == str(frames_dir)
    assert task.status == 'COMPLETED'
    assert frames_dir.exists()


def test_video_worker_revalidates_scene_manifest_and_retains_failed_task_inputs(client, app):
    project = Project(id='native-video-scene-tamper', creation_type='idea', render_mode='native')
    page = Page(
        id='native-video-scene-tamper-page',
        project_id=project.id,
        order_index=0,
        narration_text='已确认旁白',
    )
    task = Task(project_id=project.id, task_type='EXPORT_VIDEO', status='PENDING')
    db.session.add_all([project, page, task])
    db.session.commit()
    Settings.get_settings()
    db.session.commit()

    frames_dir = Path(app.config['UPLOAD_FOLDER']) / project.id / 'exports' / f'_native_video_{task.id}'
    frames_dir.mkdir(parents=True)
    frame_path = frames_dir / 'frame_0000.png'
    frame_path.write_bytes(_png_bytes('green').getvalue())
    scene_manifest_refs = save_scene_manifests([_scene_manifest(page.id)], frames_dir, [page.id])
    snapshot = create_video_export_snapshot(
        project=project,
        pages=[page],
        upload_root=app.config['UPLOAD_FOLDER'],
        narration_policy='export_only_auto_fill',
        scene_manifest_refs=scene_manifest_refs,
    )
    db.session.commit()
    Path(scene_manifest_refs[0]['path']).write_text('{}', encoding='utf-8')

    export_video_task(
        task.id,
        project.id,
        'native-video.mp4',
        FileService(app.config['UPLOAD_FOLDER']),
        generate_narration=False,
        page_ids=[page.id],
        frame_paths=[str(frame_path)],
        narration_snapshot_path=snapshot['path'],
        narration_snapshot_hash=snapshot['sha256'],
        app=app,
    )

    db.session.refresh(task)
    assert task.status == 'FAILED'
    assert '场景清单校验失败' in task.error_message
    assert frames_dir.exists()


def test_video_worker_rejects_scene_refs_that_disagree_with_snapshot(client, app):
    project = Project(id='native-video-scene-ref-mismatch', creation_type='idea', render_mode='native')
    page = Page(
        id='native-video-scene-ref-mismatch-page',
        project_id=project.id,
        order_index=0,
        narration_text='已确认旁白',
    )
    task = Task(project_id=project.id, task_type='EXPORT_VIDEO', status='PENDING')
    db.session.add_all([project, page, task])
    db.session.commit()
    Settings.get_settings()
    db.session.commit()

    frames_dir = Path(app.config['UPLOAD_FOLDER']) / project.id / 'exports' / f'_native_video_{task.id}'
    frames_dir.mkdir(parents=True)
    frame_path = frames_dir / 'frame_0000.png'
    frame_path.write_bytes(_png_bytes('green').getvalue())
    scene_manifest_refs = save_scene_manifests([_scene_manifest(page.id)], frames_dir, [page.id])
    snapshot = create_video_export_snapshot(
        project=project,
        pages=[page],
        upload_root=app.config['UPLOAD_FOLDER'],
        narration_policy='export_only_auto_fill',
        scene_manifest_refs=scene_manifest_refs,
    )
    db.session.commit()
    mismatched_refs = [{**scene_manifest_refs[0], 'sha256': '0' * 64}]

    export_video_task(
        task.id,
        project.id,
        'native-video.mp4',
        FileService(app.config['UPLOAD_FOLDER']),
        generate_narration=False,
        page_ids=[page.id],
        frame_paths=[str(frame_path)],
        scene_manifests=mismatched_refs,
        narration_snapshot_path=snapshot['path'],
        narration_snapshot_hash=snapshot['sha256'],
        app=app,
    )

    db.session.refresh(task)
    assert task.status == 'FAILED'
    assert '场景清单引用与视频导出快照不一致' in task.error_message
    assert frames_dir.exists()
