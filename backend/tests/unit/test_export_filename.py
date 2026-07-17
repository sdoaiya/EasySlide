from pathlib import Path
from types import SimpleNamespace

from controllers.export_controller import _project_title_filename
from models import db, Page, Project


def test_export_filename_uses_project_theme_when_title_is_empty():
    project = SimpleNamespace(
        project_title='',
        idea_prompt='人工智能在制造业的应用\n补充说明',
        outline_text='',
        description_text='',
    )

    assert _project_title_filename(project, 'pptx', 'presentation_demo.pptx') == '人工智能在制造业的应用.pptx'


def test_export_filename_extracts_topic_from_generation_prompt():
    project = SimpleNamespace(
        project_title='',
        idea_prompt='生成一份关于人工智能基础的简短PPT，包含3页内容：什么是AI、AI的应用、AI的未来',
        outline_text='',
        description_text='',
    )

    assert _project_title_filename(project, 'pptx', 'presentation_demo.pptx') == '人工智能基础.pptx'


def test_export_filename_falls_back_to_project_id_name_without_topic():
    project = SimpleNamespace(project_title='', idea_prompt='', outline_text='', description_text='')

    assert _project_title_filename(project, 'pdf', 'presentation_demo.pdf') == 'presentation_demo.pdf'


def test_video_export_filename_uses_project_theme():
    project = SimpleNamespace(
        project_title='',
        idea_prompt='年度经营复盘',
        outline_text='',
        description_text='',
    )

    assert _project_title_filename(project, 'mp4', 'narration_demo.mp4') == '年度经营复盘.mp4'


def test_export_filename_falls_back_to_first_page_title():
    first = Page(id='filename-page-1', project_id='filename-project', order_index=0)
    first.set_outline_content({'title': '产业带出海计划', 'points': []})
    second = Page(id='filename-page-2', project_id='filename-project', order_index=1)
    second.set_outline_content({'title': '执行路径', 'points': []})
    project = SimpleNamespace(
        project_title='',
        idea_prompt='',
        outline_text='',
        description_text='',
        pages=[second, first],
    )

    assert _project_title_filename(project, 'pptx', 'presentation_demo.pptx') == '产业带出海计划.pptx'


def test_image_zip_export_filename_uses_project_theme(client, app):
    project = Project(
        id='image-zip-topic-project',
        creation_type='idea',
        idea_prompt='季度销售分析',
    )
    first = Page(
        id='image-zip-page-1',
        project_id=project.id,
        order_index=0,
        generated_image_path=f'{project.id}/pages/page-1.png',
    )
    second = Page(
        id='image-zip-page-2',
        project_id=project.id,
        order_index=1,
        generated_image_path=f'{project.id}/pages/page-2.png',
    )
    db.session.add_all([project, first, second])
    db.session.commit()

    upload_root = Path(app.config['UPLOAD_FOLDER'])
    page_dir = upload_root / project.id / 'pages'
    page_dir.mkdir(parents=True, exist_ok=True)
    (page_dir / 'page-1.png').write_bytes(b'first')
    (page_dir / 'page-2.png').write_bytes(b'second')

    response = client.get(f'/api/projects/{project.id}/export/images')

    assert response.status_code == 200
    data = response.get_json()['data']
    assert data['filename'] == '季度销售分析.zip'
    assert data['download_url'].endswith('/exports/季度销售分析.zip')
