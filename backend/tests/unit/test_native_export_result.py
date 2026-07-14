import io
import json
import zipfile
from pathlib import Path

from models import Page, Project, Task, db


def _project(project_id='native-export-project'):
    project = Project(id=project_id, creation_type='idea', render_mode='native')
    page = Page(project=project, order_index=0, native_layout='core01_cover')
    page.set_native_props({'title': '标题'})
    db.session.add(project)
    db.session.commit()
    return project


def _pptx_bytes():
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w') as package:
        package.writestr('[Content_Types].xml', '<Types/>')
        package.writestr('ppt/presentation.xml', '<p:presentation/>')
    return output.getvalue()


def _create_native_task(project, export_format):
    task = Task(
        project=project,
        task_type=f'EXPORT_NATIVE_{export_format.upper()}',
        status='PROCESSING',
    )
    task.set_progress({'_resume': {'kind': 'native-export', 'format': export_format, 'kwargs': {}}})
    db.session.add(task)
    db.session.commit()
    return task


def test_creates_native_browser_export_task(client):
    project = _project()

    response = client.post(f'/api/projects/{project.id}/export/native-pptx')

    assert response.status_code == 202
    task = response.get_json()['data']
    assert task['task_type'] == 'EXPORT_NATIVE_PPTX'
    assert task['status'] == 'PENDING'
    assert task['progress']['_resume']['kind'] == 'native-pptx'


def test_creates_pdf_and_html_export_tasks(client):
    project = _project()

    pdf = client.post(f'/api/projects/{project.id}/export/native-pptx', json={'format': 'pdf'})
    html = client.post(f'/api/projects/{project.id}/export/native-pptx', json={'format': 'html'})

    assert pdf.get_json()['data']['task_type'] == 'EXPORT_NATIVE_PDF'
    assert html.get_json()['data']['task_type'] == 'EXPORT_NATIVE_HTML'


def test_updates_native_export_progress(client):
    project = _project()
    task = Task(project=project, task_type='EXPORT_NATIVE_PPTX', status='PENDING')
    task.set_progress({'_resume': {'kind': 'native-pptx', 'kwargs': {}}})
    db.session.add(task)
    db.session.commit()

    response = client.put(
        f'/api/projects/{project.id}/export/native-pptx/{task.id}/progress',
        json={'total': 2, 'completed': 1, 'percent': 50, 'current_step': '采集第 1 页'},
    )

    assert response.status_code == 200
    db.session.refresh(task)
    assert task.status == 'PROCESSING'
    assert task.get_progress()['completed'] == 1
    assert task.get_progress()['_resume']['kind'] == 'native-pptx'


def test_rejects_invalid_native_pptx_upload(client):
    project = _project()
    task = Task(project=project, task_type='EXPORT_NATIVE_PPTX', status='PROCESSING')
    db.session.add(task)
    db.session.commit()

    response = client.post(
        f'/api/projects/{project.id}/export/native-pptx/{task.id}/complete',
        data={
            'file': (io.BytesIO(b'not a zip'), 'deck.pptx'),
            'report': json.dumps({'slideCount': 1}),
        },
        content_type='multipart/form-data',
    )

    assert response.status_code == 400


def test_saves_valid_native_pptx_and_quality_report(client):
    project = _project()
    task = Task(project=project, task_type='EXPORT_NATIVE_PPTX', status='PROCESSING')
    db.session.add(task)
    db.session.commit()
    report = {
        'slideCount': 1,
        'textObjects': 2,
        'shapeObjects': 1,
        'imageObjects': 0,
        'slideSummaries': [{'index': 1, 'renderedTextObjects': 2}],
        'warnings': [],
    }

    response = client.post(
        f'/api/projects/{project.id}/export/native-pptx/{task.id}/complete',
        data={
            'file': (io.BytesIO(_pptx_bytes()), 'native deck.pptx'),
            'report': json.dumps(report),
        },
        content_type='multipart/form-data',
    )

    assert response.status_code == 200
    data = response.get_json()['data']
    assert data['status'] == 'COMPLETED'
    assert data['progress']['download_url'].endswith('/native_deck.pptx')
    assert data['progress']['quality_report'] == report
    assert (Path(client.application.config['UPLOAD_FOLDER']) / project.id / 'exports' / 'native_deck.pptx').is_file()


def test_native_export_defaults_to_project_title_filename(client):
    project = _project()
    project.project_title = '年度增长复盘'
    task = Task(project=project, task_type='EXPORT_NATIVE_PPTX', status='PROCESSING')
    db.session.add(task)
    db.session.commit()

    response = client.post(
        f'/api/projects/{project.id}/export/native-pptx/{task.id}/complete',
        data={
            'file': (io.BytesIO(_pptx_bytes()), 'native deck.pptx'),
            'report': json.dumps({'slideCount': 1, 'warnings': []}),
        },
        content_type='multipart/form-data',
    )

    assert response.status_code == 200
    data = response.get_json()['data']
    assert data['progress']['filename'] == '年度增长复盘.pptx'
    assert (Path(client.application.config['UPLOAD_FOLDER']) / project.id / 'exports' / '年度增长复盘.pptx').is_file()


def test_rejects_task_from_another_project(client):
    project = _project('native-project-a')
    other = _project('native-project-b')
    task = Task(project=other, task_type='EXPORT_NATIVE_PPTX', status='PROCESSING')
    db.session.add(task)
    db.session.commit()

    response = client.post(
        f'/api/projects/{project.id}/export/native-pptx/{task.id}/complete',
        data={'file': (io.BytesIO(_pptx_bytes()), 'deck.pptx'), 'report': '{}'},
        content_type='multipart/form-data',
    )

    assert response.status_code == 404


def test_saves_valid_native_pdf(client):
    project = _project()
    task = _create_native_task(project, 'pdf')

    response = client.post(
        f'/api/projects/{project.id}/export/native-pptx/{task.id}/complete',
        data={
            'file': (io.BytesIO(b'%PDF-1.7\n%%EOF'), 'deck.pdf'),
            'report': json.dumps({'slideCount': 1, 'warnings': []}),
        },
        content_type='multipart/form-data',
    )

    assert response.status_code == 200
    assert response.get_json()['data']['progress']['download_url'].endswith('/deck.pdf')


def test_saves_self_contained_native_html_and_rejects_external_urls(client):
    project = _project()
    task = _create_native_task(project, 'html')
    valid = b'<!doctype html><html><body><section class="slide">ok</section></body></html>'

    response = client.post(
        f'/api/projects/{project.id}/export/native-pptx/{task.id}/complete',
        data={'file': (io.BytesIO(valid), 'deck.html'), 'report': json.dumps({'slideCount': 1, 'warnings': []})},
        content_type='multipart/form-data',
    )
    assert response.status_code == 200

    rejected_task = _create_native_task(project, 'html')
    rejected = client.post(
        f'/api/projects/{project.id}/export/native-pptx/{rejected_task.id}/complete',
        data={
            'file': (io.BytesIO(b'<html><img src="https://example.com/a.png"></html>'), 'bad.html'),
            'report': '{}',
        },
        content_type='multipart/form-data',
    )
    assert rejected.status_code == 400
