import io
from pathlib import Path
from unittest.mock import patch

from PIL import Image


def _png_bytes():
    data = io.BytesIO()
    Image.new('RGB', (16, 9), color='red').save(data, format='PNG')
    data.seek(0)
    return data


def test_page_template_binding_upload_style_and_clear(client, app):
    project_response = client.post('/api/projects', json={'creation_type': 'blank'})
    project_id = project_response.get_json()['data']['project_id']
    page_response = client.post(f'/api/projects/{project_id}/pages', json={
        'order_index': 0,
        'outline_content': {'title': 'One', 'points': []},
    })
    page_id = page_response.get_json()['data']['page_id']

    upload = client.post(
        f'/api/projects/{project_id}/pages/{page_id}/template',
        data={'template_image': (_png_bytes(), 'page-style.png')},
        content_type='multipart/form-data',
    )
    assert upload.status_code == 200
    page = upload.get_json()['data']
    assert page['template_image_url'].endswith(f'/template/{page_id}_template.png')

    saved_path = Path(app.config['UPLOAD_FOLDER']) / project_id / 'template' / f'{page_id}_template.png'
    with Image.open(saved_path) as image:
        assert image.size == (16, 9)

    style = client.patch(
        f'/api/projects/{project_id}/pages/{page_id}/template',
        json={'template_style_text': 'Use dense comparison layout.'},
    )
    assert style.status_code == 200
    assert style.get_json()['data']['template_style_text'] == 'Use dense comparison layout.'

    cleared = client.delete(f'/api/projects/{project_id}/pages/{page_id}/template')
    assert cleared.status_code == 200
    page = cleared.get_json()['data']
    assert page['template_image_url'] is None
    assert page['template_style_text'] is None


def test_auto_match_page_templates_persists_match_fields(client, app):
    from models import db, Project, Page

    project_response = client.post('/api/projects', json={'creation_type': 'blank'})
    project_id = project_response.get_json()['data']['project_id']
    with app.app_context():
        project = Project.query.get(project_id)
        project.template_pack_id = 'gorden-minimal-business-summary'
        db.session.commit()

    page_ids = []
    for index, title in enumerate(('Annual Review', 'Revenue KPI')):
        page_response = client.post(f'/api/projects/{project_id}/pages', json={
            'order_index': index,
            'outline_content': {'title': title, 'points': ['KPI growth']},
        })
        page_ids.append(page_response.get_json()['data']['page_id'])

    response = client.post(f'/api/projects/{project_id}/pages/templates/auto-match', json={})

    assert response.status_code == 200
    payload = response.get_json()['data']
    assert payload['matched'] == 2
    with app.app_context():
        pages = Page.query.filter(Page.id.in_(page_ids)).order_by(Page.order_index.asc()).all()
        assert [page.template_selection_source for page in pages] == ['template_pack', 'template_pack']
        assert pages[0].template_selection_role == 'cover'
        assert pages[1].template_selection_role == 'ending'
        assert pages[0].to_dict()['template_selection_layout']


def test_edit_image_template_context_uses_matched_template_role(client, app, tmp_path, monkeypatch):
    from models import db, Project, Page
    from controllers import page_controller as page_controller_module

    pack = tmp_path / 'gorden' / 'data-viz-deck'
    pack.mkdir(parents=True)
    data_asset = pack / 'data.png'
    Image.new('RGB', (32, 18), color='blue').save(data_asset)
    monkeypatch.setenv('TEMPLATE_PACKS_DIR', str(tmp_path / 'gorden'))

    with app.app_context():
        project = Project(
            id='project-edit-template-match',
            creation_type='idea',
            idea_prompt='test',
            template_pack_id='gorden-data-viz-deck',
            image_aspect_ratio='16:9',
            status='COMPLETED',
        )
        page = Page(
            id='page-edit-template-match',
            project_id=project.id,
            order_index=0,
            generated_image_path='generated/current.png',
            template_selection_role='data',
            status='COMPLETED',
        )
        page.set_outline_content({'title': 'Metrics', 'points': ['KPI']})
        page.set_description_content({'text': 'Metrics'})
        current = Path(app.config['UPLOAD_FOLDER']) / project.id / 'pages' / 'current.png'
        current.parent.mkdir(parents=True, exist_ok=True)
        Image.new('RGB', (32, 18), color='red').save(current)
        db.session.add_all([project, page])
        db.session.commit()

    with (
        patch.object(page_controller_module, 'get_ai_service', return_value=object()),
        patch.object(page_controller_module.task_manager, 'submit_task') as submit_task,
    ):
        response = client.post(
            '/api/projects/project-edit-template-match/pages/page-edit-template-match/edit/image',
            json={'edit_instruction': 'refresh', 'context_images': {'use_template': True}},
        )

    assert response.status_code == 202
    assert submit_task.call_args.args[10] == [str(data_asset)]
