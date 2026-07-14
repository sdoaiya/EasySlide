import re
from unittest.mock import patch

from models import Page, Project, Task, db
from services.task_manager import generate_native_deck_task


def _native_project(page_count=1, allow_partial=False):
    project = Project(
        idea_prompt='demo',
        render_mode='native',
        native_theme='core01',
        export_allow_partial=allow_partial,
    )
    for index in range(page_count):
        page = Page(project=project, order_index=index)
        page.set_outline_content({'title': f'第 {index + 1} 页', 'points': ['要点']})
    db.session.add(project)
    db.session.commit()
    return project


def test_lists_native_layouts(client):
    response = client.get('/api/native-deck/layouts?role=cover&theme=core01')

    assert response.status_code == 200
    layouts = response.get_json()['data']['layouts']
    assert [item['layout'] for item in layouts] == ['core01_cover']

    dashi = client.get('/api/native-deck/layouts?role=cover&theme=theme01').get_json()['data']['layouts']
    assert dashi[0]['layout'] == 'theme01_page001'
    assert all(item['theme'] == 'theme01' for item in dashi)


def test_saves_only_validated_native_page_data(client):
    with client.application.app_context():
        project = _native_project()
        page = project.pages[0]
        project_id, page_id = project.id, page.id

    response = client.put(
        f'/api/projects/{project_id}/pages/{page_id}/native',
        json={'layout': 'core01_cover', 'props': {'title': '标题', 'subtitle': '副标题'}},
    )

    assert response.status_code == 200
    assert response.get_json()['data']['native_props']['title'] == '标题'

    rejected = client.put(
        f'/api/projects/{project_id}/pages/{page_id}/native',
        json={'layout': 'core01_cover', 'props': {'title': '标题'}, 'html': '<script />'},
    )
    assert rejected.status_code == 400


def test_starts_native_generation_task(client):
    with client.application.app_context():
        project = _native_project(page_count=2)
        project_id = project.id

    with patch('controllers.native_deck_controller.get_ai_service', return_value=object()), \
         patch('controllers.native_deck_controller.task_manager.submit_task') as submit:
        response = client.post(f'/api/projects/{project_id}/generate/native-deck')

    assert response.status_code == 202
    data = response.get_json()['data']
    assert data['task_type'] == 'GENERATE_NATIVE_DECK'
    assert data['progress']['total'] == 2
    submit.assert_called_once()


def test_generation_keeps_failed_page_when_partial_results_are_allowed(client):
    class FakeAI:
        calls = 0

        def generate_json(self, _prompt):
            self.calls += 1
            if self.calls == 1:
                return {'layout': 'core01_cover', 'props': {'title': '生成标题'}}
            return {'layout': 'core01_cover', 'props': {'className': 'not-allowed'}}

    with client.application.app_context():
        project = _native_project(page_count=2, allow_partial=True)
        project.pages[1].native_layout = 'core01_end'
        project.pages[1].set_native_props({'title': '保留标题'})
        task = Task(project=project, task_type='GENERATE_NATIVE_DECK')
        db.session.add(task)
        db.session.commit()
        task_id, project_id = task.id, project.id

    generate_native_deck_task(task_id, project_id, FakeAI(), app=client.application)

    with client.application.app_context():
        task = db.session.get(Task, task_id)
        pages = Page.query.filter_by(project_id=project_id).order_by(Page.order_index).all()
        assert task.status == 'COMPLETED'
        assert task.get_progress()['failed'] == 1
        assert pages[0].get_native_props()['title'] == '生成标题'
        assert pages[1].native_layout == 'core01_end'
        assert pages[1].get_native_props()['title'] == '保留标题'


def test_generation_fails_fast_when_partial_results_are_disabled(client):
    class InvalidAI:
        def generate_json(self, _prompt):
            return {'layout': 'core01_cover', 'props': {'className': 'not-allowed'}}

    with client.application.app_context():
        project = _native_project(allow_partial=False)
        task = Task(project=project, task_type='GENERATE_NATIVE_DECK')
        db.session.add(task)
        db.session.commit()
        task_id, project_id = task.id, project.id

    generate_native_deck_task(task_id, project_id, InvalidAI(), app=client.application)

    with client.application.app_context():
        task = db.session.get(Task, task_id)
        assert task.status == 'FAILED'
        assert '未知字段' in task.error_message


def test_generation_uses_selected_dashiai_theme_without_repeating_layouts(client):
    class FirstCandidateAI:
        def generate_json(self, prompt):
            layout = re.search(r'theme01_page\d{3}', prompt).group(0)
            return {'layout': layout, 'props': {}}

    with client.application.app_context():
        project = _native_project(page_count=4)
        project.native_theme = 'theme01'
        task = Task(project=project, task_type='GENERATE_NATIVE_DECK')
        db.session.add(task)
        db.session.commit()
        task_id, project_id = task.id, project.id

    generate_native_deck_task(task_id, project_id, FirstCandidateAI(), app=client.application)

    with client.application.app_context():
        pages = Page.query.filter_by(project_id=project_id).order_by(Page.order_index).all()
        layouts = [page.native_layout for page in pages]
        assert len(set(layouts)) == len(layouts)
        assert all(layout.startswith('theme01_') for layout in layouts)


def test_generation_passes_text_style_hint_to_native_prompt(client):
    prompts = []

    class PromptCapturingAI:
        def generate_json(self, prompt):
            prompts.append(prompt)
            return {'layout': 'core01_cover', 'props': {'title': '生成标题'}}

    with client.application.app_context():
        project = _native_project()
        project.template_style = '科技蓝、少量霓虹线条'
        task = Task(project=project, task_type='GENERATE_NATIVE_DECK')
        db.session.add(task)
        db.session.commit()
        task_id, project_id = task.id, project.id

    generate_native_deck_task(task_id, project_id, PromptCapturingAI(), app=client.application)

    assert '科技蓝、少量霓虹线条' in prompts[0]
