import io
import json
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from conftest import assert_success_response
from models import Page, Project, Settings, Task, db
from services.file_service import FileService
from services.task_manager import export_video_task


def _png_bytes(color):
    output = io.BytesIO()
    Image.new('RGB', (4, 4), color).save(output, format='PNG')
    output.seek(0)
    return output


def test_native_video_export_saves_browser_frames_without_overwriting_page_images(client, app):
    project = Project(id='native-video-project', creation_type='idea', render_mode='native')
    pages = [
        Page(id='native-video-page-1', project_id=project.id, order_index=0, narration_text='第一页旁白'),
        Page(id='native-video-page-2', project_id=project.id, order_index=1, narration_text='第二页旁白'),
    ]
    db.session.add(project)
    db.session.add_all(pages)
    db.session.commit()

    with patch('services.task_manager.task_manager.submit_task') as submit_task:
        response = client.post(
            f'/api/projects/{project.id}/export/native-video',
            data={
                'page_ids': json.dumps([page.id for page in pages]),
                'frames': [
                    (_png_bytes('red'), 'frame-1.png'),
                    (_png_bytes('blue'), 'frame-2.png'),
                ],
            },
            content_type='multipart/form-data',
        )

    data = assert_success_response(response)
    task = db.session.get(Task, data['data']['task_id'])
    frame_paths = task.get_progress()['_resume']['kwargs']['frame_paths']

    assert task.task_type == 'EXPORT_VIDEO'
    assert len(frame_paths) == 2
    assert all(Path(path).is_file() for path in frame_paths)
    assert all(page.generated_image_path is None for page in pages)
    assert submit_task.call_args.kwargs['frame_paths'] == frame_paths


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


def test_video_worker_prefers_browser_frames_and_cleans_them_after_completion(client, app):
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
    settings.elevenlabs_enabled = True
    settings.elevenlabs_api_key = 'test-key'
    settings.elevenlabs_voice_id = 'configured-elevenlabs-voice'
    db.session.commit()

    frames_dir = Path(app.config['UPLOAD_FOLDER']) / project.id / 'exports' / f'_native_video_{task.id}'
    frames_dir.mkdir(parents=True)
    frame_path = frames_dir / 'frame_0000.png'
    frame_path.write_bytes(_png_bytes('green').getvalue())
    captured = {}

    def fake_generate_narration_video(*, pages_data, output_path, **_kwargs):
        captured['pages_data'] = pages_data
        captured['elevenlabs_config'] = _kwargs['elevenlabs_config']
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
            app=app,
        )

    db.session.refresh(task)
    assert captured['pages_data'][0]['image_path'] == str(frame_path)
    assert captured['elevenlabs_config']['voice_id'] == 'configured-elevenlabs-voice'
    assert task.status == 'COMPLETED'
    assert not frames_dir.exists()
