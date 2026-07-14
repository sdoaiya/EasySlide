from models import Page, Project, db


def test_native_project_and_page_round_trip(client):
    with client.application.app_context():
        project = Project(
            idea_prompt='demo',
            render_mode='native',
            native_theme='core01',
        )
        page = Page(project=project, order_index=0, native_layout='core01_cover')
        page.set_native_props({'title': '原生标题', 'subtitle': '可编辑'})

        db.session.add(project)
        db.session.commit()

        data = project.to_dict(include_pages=True)
        assert data['render_mode'] == 'native'
        assert data['native_theme'] == 'core01'
        assert data['pages'][0]['native_layout'] == 'core01_cover'
        assert data['pages'][0]['native_props']['title'] == '原生标题'


def test_existing_project_defaults_to_image_mode(client):
    with client.application.app_context():
        project = Project(idea_prompt='legacy')
        db.session.add(project)
        db.session.commit()

        assert project.to_dict()['render_mode'] == 'image'
        assert project.to_dict()['native_image_settings'] == {
            'density': 'standard',
            'style': 'theme',
            'custom_prompt': '',
            'custom_counts': {},
        }


def test_native_image_settings_round_trip(client):
    with client.application.app_context():
        project = Project(idea_prompt='demo', render_mode='native')
        project.set_native_image_settings({
            'density': 'rich',
            'style': '3d',
            'custom_prompt': '主体居中，背景简洁',
            'custom_counts': {'page-1': 2},
        })
        db.session.add(project)
        db.session.commit()

        assert project.to_dict()['native_image_settings'] == {
            'density': 'rich',
            'style': '3d',
            'custom_prompt': '主体居中，背景简洁',
            'custom_counts': {'page-1': 2},
        }


def test_invalid_native_props_do_not_break_serialization(client):
    with client.application.app_context():
        project = Project(idea_prompt='demo')
        page = Page(project=project, order_index=0, native_props='{broken')
        db.session.add(project)
        db.session.commit()

        assert page.to_dict()['native_props'] == {}
