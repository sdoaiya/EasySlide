"""
项目管理API单元测试
"""

import json
from pathlib import Path

import pytest
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
from conftest import assert_success_response, assert_error_response


class TestProjectCreate:
    """项目创建测试"""

    def test_desktop_schema_backfills_template_pack_id(self, app, monkeypatch):
        from app import _ensure_desktop_sqlite_schema
        from models import db

        monkeypatch.setenv('DATABASE_PATH', 'legacy-test.db')
        with app.app_context():
            db.session.execute(db.text('ALTER TABLE projects DROP COLUMN template_pack_id'))
            db.session.commit()
            _ensure_desktop_sqlite_schema(app)
            columns = {
                row[1]
                for row in db.session.execute(db.text('PRAGMA table_info(projects)')).fetchall()
            }

        assert 'template_pack_id' in columns
    
    def test_create_project_idea_mode(self, client):
        """测试从想法创建项目"""
        response = client.post('/api/projects', json={
            'creation_type': 'idea',
            'idea_prompt': '生成一份关于AI的PPT'
        })
        
        data = assert_success_response(response, 201)
        assert 'project_id' in data['data']
        assert data['data']['status'] == 'DRAFT'

    def test_create_and_update_template_pack_id(self, client):
        response = client.post('/api/projects', json={
            'creation_type': 'idea',
            'idea_prompt': '生成一份模板包测试 PPT',
            'template_pack_id': 'gorden-data-viz-deck',
        })

        data = assert_success_response(response, 201)
        project_id = data['data']['project_id']

        project = assert_success_response(client.get(f'/api/projects/{project_id}'))
        assert project['data']['template_pack_id'] == 'gorden-data-viz-deck'

        updated = assert_success_response(client.put(
            f'/api/projects/{project_id}',
            json={'template_pack_id': None},
        ))
        assert updated['data']['template_pack_id'] is None
    
    def test_create_project_outline_mode(self, client):
        """测试从大纲创建项目"""
        response = client.post('/api/projects', json={
            'creation_type': 'outline',
            'outline': [
                {'title': '第一页', 'points': ['要点1']},
                {'title': '第二页', 'points': ['要点2']}
            ]
        })
        
        data = assert_success_response(response, 201)
        assert 'project_id' in data['data']
    
    def test_create_project_missing_type(self, client):
        """测试缺少creation_type参数"""
        response = client.post('/api/projects', json={
            'idea_prompt': '测试'
        })
        
        # 应该返回错误
        assert response.status_code in [400, 422]
    
    def test_create_project_invalid_type(self, client):
        """测试无效的creation_type"""
        response = client.post('/api/projects', json={
            'creation_type': 'invalid_type',
            'idea_prompt': '测试'
        })
        
        assert response.status_code in [400, 422]

    def test_create_project_defaults_to_image_mode(self, client):
        response = client.post('/api/projects', json={
            'creation_type': 'idea',
            'idea_prompt': '测试默认模式'
        })

        created = assert_success_response(response, 201)['data']
        project = assert_success_response(
            client.get(f"/api/projects/{created['project_id']}")
        )['data']
        assert project['render_mode'] == 'image'

    def test_create_native_project_defaults_to_dashiai_theme(self, client):
        response = client.post('/api/projects', json={
            'creation_type': 'idea',
            'idea_prompt': '测试原生模式',
            'render_mode': 'native'
        })

        created = assert_success_response(response, 201)['data']
        project = assert_success_response(
            client.get(f"/api/projects/{created['project_id']}")
        )['data']
        assert project['render_mode'] == 'native'
        assert project['native_theme'] == 'theme01'

    def test_create_classic_native_project_uses_core_layouts(self, client):
        response = client.post('/api/projects', json={
            'creation_type': 'idea',
            'idea_prompt': '测试经典原生模式',
            'render_mode': 'native',
            'native_theme': 'core01',
        })

        created = assert_success_response(response, 201)['data']
        project = assert_success_response(
            client.get(f"/api/projects/{created['project_id']}")
        )['data']
        assert project['render_mode'] == 'native'
        assert project['native_theme'] == 'core01'

    def test_create_project_rejects_invalid_render_mode(self, client):
        response = client.post('/api/projects', json={
            'creation_type': 'idea',
            'idea_prompt': '测试非法模式',
            'render_mode': 'editable'
        })

        data = assert_error_response(response, 400)
        assert data['error']['message'] == 'Invalid render_mode'

    def test_update_native_image_settings(self, client):
        created = assert_success_response(client.post('/api/projects', json={
            'creation_type': 'idea',
            'idea_prompt': '原生配图设置',
            'render_mode': 'native',
        }), 201)['data']

        response = client.put(f"/api/projects/{created['project_id']}", json={
            'native_image_settings': {
                'density': 'custom',
                'style': 'custom',
                'composition': 'text-right',
                'custom_prompt': '水彩质感，留出标题空间',
                'custom_counts': {'page-1': 2},
            },
        })

        settings = assert_success_response(response)['data']['native_image_settings']
        assert settings == {
            'density': 'custom',
            'style': 'custom',
            'composition': 'text-right',
            'custom_prompt': '水彩质感，留出标题空间',
            'custom_counts': {'page-1': 2},
        }

    def test_rejects_invalid_native_image_settings(self, client):
        created = assert_success_response(client.post('/api/projects', json={
            'creation_type': 'idea',
            'idea_prompt': '原生配图设置',
            'render_mode': 'native',
        }), 201)['data']

        response = client.put(f"/api/projects/{created['project_id']}", json={
            'native_image_settings': {'density': 'everywhere', 'style': 'theme', 'custom_prompt': ''},
        })

        assert response.status_code == 400


class TestProjectGet:
    """项目获取测试"""

    def test_legacy_project_without_render_mode_defaults_to_image(self):
        from models import Project

        project = Project(idea_prompt='旧项目')
        project.render_mode = None

        assert project.to_dict()['render_mode'] == 'image'
    
    def test_get_project_success(self, client, sample_project):
        """测试获取项目成功"""
        if not sample_project:
            pytest.skip("项目创建失败")
        
        project_id = sample_project['project_id']
        response = client.get(f'/api/projects/{project_id}')
        
        data = assert_success_response(response)
        assert data['data']['project_id'] == project_id
    
    def test_get_project_not_found(self, client):
        """测试获取不存在的项目"""
        response = client.get('/api/projects/non-existent-id')
        
        assert response.status_code == 404
    
    def test_get_project_invalid_id_format(self, client):
        """测试无效的项目ID格式"""
        response = client.get('/api/projects/invalid!@#$%id')
        
        # 可能返回404或400
        assert response.status_code in [400, 404]


class TestProjectList:
    def test_project_stats_cover_all_projects_not_only_current_page(self, client):
        from models import db, Page, Project

        completed = Project(id='stats-completed', creation_type='idea', status='COMPLETED')
        completed_page = Page(
            id='stats-completed-page',
            project_id=completed.id,
            order_index=0,
            status='COMPLETED',
            generated_image_path='generated/completed.png',
        )
        generating = Project(id='stats-generating', creation_type='idea', status='GENERATING_IMAGES')
        generating_page = Page(
            id='stats-generating-page',
            project_id=generating.id,
            order_index=0,
            status='QUEUED',
        )
        draft = Project(id='stats-draft', creation_type='idea', status='DRAFT')
        draft_page = Page(id='stats-draft-page', project_id=draft.id, order_index=0, status='DRAFT')
        described = Project(id='stats-described', creation_type='idea', status='DESCRIPTIONS_GENERATED')
        described_page = Page(
            id='stats-described-page',
            project_id=described.id,
            order_index=0,
            status='DESCRIPTION_GENERATED',
        )
        partial = Project(id='stats-partial', creation_type='idea', status='DESCRIPTIONS_GENERATED')
        partial_page_with_image = Page(
            id='stats-partial-image-page',
            project_id=partial.id,
            order_index=0,
            status='COMPLETED',
            generated_image_path='generated/partial.png',
        )
        partial_page_without_image = Page(
            id='stats-partial-pending-page',
            project_id=partial.id,
            order_index=1,
            status='DESCRIPTION_GENERATED',
        )
        db.session.add_all([
            completed, completed_page,
            generating, generating_page,
            draft, draft_page,
            described, described_page,
            partial, partial_page_with_image, partial_page_without_image,
        ])
        db.session.commit()

        data = assert_success_response(client.get('/api/projects?limit=1&offset=0'))['data']

        assert len(data['projects']) == 1
        assert data['total'] == 5
        assert data['stats'] == {
            'total': 5,
            'completed': 1,
            'generating': 1,
            'in_progress': 3,
        }

    def test_project_list_pauses_stale_image_generation_tasks_before_counting(self, client):
        from models import db, Page, Project, Task

        project = Project(id='stats-stale-image-task', creation_type='idea', status='GENERATING_IMAGES')
        page = Page(
            id='stats-stale-image-page',
            project_id=project.id,
            order_index=0,
            status='GENERATING',
        )
        page.set_description_content({'text': 'ready to generate'})
        task = Task(
            id='stats-stale-image-task-id',
            project_id=project.id,
            task_type='GENERATE_IMAGES',
            status='PROCESSING',
        )
        task.set_progress({
            'page_ids': [page.id],
            'image_options': {'use_template': False},
            'pages': [{'page_id': page.id, 'status': 'running'}],
        })
        db.session.add_all([project, page, task])
        db.session.commit()

        data = assert_success_response(client.get('/api/projects?limit=10&offset=0'))['data']

        db.session.refresh(project)
        db.session.refresh(page)
        db.session.refresh(task)
        listed_project = next(item for item in data['projects'] if item['project_id'] == project.id)

        assert task.status == 'PAUSED'
        assert task.get_progress()['status'] == 'paused'
        assert page.status == 'DESCRIPTION_GENERATED'
        assert project.status == 'DESCRIPTIONS_GENERATED'
        assert listed_project['active_image_tasks'][0]['status'] == 'PAUSED'
        assert data['stats'] == {
            'total': 1,
            'completed': 0,
            'generating': 0,
            'in_progress': 1,
        }


class TestImageGenerationConcurrency:
    def test_batch_image_generation_caps_workers_at_four(self):
        from controllers.project_controller import _resolve_image_generation_workers

        assert _resolve_image_generation_workers(20, 20) == 4
        assert _resolve_image_generation_workers(2, 20) == 2
        assert _resolve_image_generation_workers(None, 20) == 4

    def test_batch_image_generation_skips_pages_with_existing_images(self, app):
        from models import db, Page, Project, Task
        from controllers import project_controller as project_controller_module

        with app.app_context():
            project = Project(
                id='proj-skip-existing-images',
                creation_type='idea',
                idea_prompt='test',
                template_style='clean',
                image_aspect_ratio='16:9',
                status='DESCRIPTIONS_GENERATED',
            )
            completed_page = Page(
                id='page-already-generated',
                project_id=project.id,
                order_index=0,
                status='COMPLETED',
                generated_image_path='generated/existing.png',
            )
            pending_page = Page(
                id='page-needs-generation',
                project_id=project.id,
                order_index=1,
                status='DESCRIPTION_GENERATED',
            )
            for page in (completed_page, pending_page):
                page.set_outline_content({'title': page.id, 'points': []})
                page.set_description_content({'text': page.id})
            db.session.add_all([project, completed_page, pending_page])
            db.session.commit()

            with (
                patch.object(project_controller_module, 'get_ai_service', return_value=object()),
                patch.object(project_controller_module.task_manager, 'submit_task') as submit_task,
            ):
                response = app.test_client().post(f'/api/projects/{project.id}/generate/images', json={})

            data = assert_success_response(response, 202)['data']
            task = Task.query.get(data['task_id'])
            db.session.refresh(completed_page)
            db.session.refresh(pending_page)

            assert data['total_pages'] == 1
            progress = task.get_progress()
            assert progress['page_ids'] == [pending_page.id]
            assert progress['generation_id'] == task.id
            assert progress['manifest_version'] == 1
            assert progress['style_snapshot']['template_style'] == 'clean'
            assert progress['pages'] == [
                {
                    'page_id': pending_page.id,
                    'page_index': 2,
                    'status': 'queued',
                    'attempt': 1,
                    'current_version': 0,
                    'protected': False,
                }
            ]
            assert progress['manifest_path'].endswith(f'{task.id}/manifest.json')
            assert completed_page.generated_image_path == 'generated/existing.png'
            assert completed_page.status == 'COMPLETED'
            assert pending_page.status == 'QUEUED'
            submit_task.assert_called_once()

    def test_batch_image_generation_accepts_gorden_template_pack_without_style_text(self, app):
        from models import db, Page, Project, Task
        from controllers import project_controller as project_controller_module

        with app.app_context():
            project = Project(
                id='proj-batch-gorden-pack-only',
                creation_type='idea',
                idea_prompt='test',
                template_pack_id='gorden-data-viz-deck',
                image_aspect_ratio='16:9',
                status='DESCRIPTIONS_GENERATED',
            )
            page = Page(
                id='page-gorden-pack-only',
                project_id=project.id,
                order_index=0,
                status='DESCRIPTION_GENERATED',
            )
            page.set_outline_content({'title': page.id, 'points': []})
            page.set_description_content({'text': page.id})
            db.session.add_all([project, page])
            db.session.commit()

            with (
                patch.object(project_controller_module, 'get_ai_service', return_value=object()),
                patch.object(project_controller_module.task_manager, 'submit_task') as submit_task,
            ):
                response = app.test_client().post(
                    f'/api/projects/{project.id}/generate/images',
                    json={'page_ids': [page.id]},
                )

            data = assert_success_response(response, 202)['data']
            task = Task.query.get(data['task_id'])

            assert data['total_pages'] == 1
            assert task.get_progress()['style_snapshot']['template_pack_id'] == 'gorden-data-viz-deck'
            submit_task.assert_called_once()

    def test_batch_image_generation_applies_image_generation_settings_to_prompt(self, app):
        from models import db, Page, Project, Task
        from controllers import project_controller as project_controller_module

        with app.app_context():
            project = Project(
                id='proj-image-settings',
                creation_type='idea',
                idea_prompt='test',
                template_style='clean',
                image_aspect_ratio='16:9',
                status='DESCRIPTIONS_GENERATED',
            )
            page = Page(
                id='page-image-settings',
                project_id=project.id,
                order_index=0,
                status='DESCRIPTION_GENERATED',
            )
            page.set_outline_content({'title': page.id, 'points': []})
            page.set_description_content({'text': page.id})
            db.session.add_all([project, page])
            db.session.commit()

            with (
                patch.object(project_controller_module, 'get_ai_service', return_value=object()),
                patch.object(project_controller_module.task_manager, 'submit_task') as submit_task,
            ):
                response = app.test_client().post(
                    f'/api/projects/{project.id}/generate/images',
                    json={
                        'page_ids': [page.id],
                        'image_density': 'rich',
                        'image_style': 'tech',
                        'image_style_prompt': '蓝绿色科技感，少量发光线条',
                    },
                )

            data = assert_success_response(response, 202)['data']
            task = Task.query.get(data['task_id'])
            progress = task.get_progress()
            submit_args = submit_task.call_args.args

            assert progress['image_options']['image_density'] == 'rich'
            assert progress['image_options']['image_style'] == 'tech'
            assert progress['image_options']['image_style_prompt'] == '蓝绿色科技感，少量发光线条'
            assert '信息密度：丰富' in submit_args[11]
            assert '视觉风格：科技感' in submit_args[11]
            assert '蓝绿色科技感，少量发光线条' in submit_args[11]

    def test_single_page_image_generation_applies_image_generation_settings_to_prompt(self, app):
        from models import db, Page, Project, Task
        from controllers import page_controller as page_controller_module

        class MinimalAIService:
            def extract_image_urls_from_markdown(self, _text):
                return []

        with app.app_context():
            project = Project(
                id='proj-single-image-settings',
                creation_type='idea',
                idea_prompt='test',
                template_style='clean',
                image_aspect_ratio='16:9',
                status='DESCRIPTIONS_GENERATED',
            )
            page = Page(
                id='page-single-image-settings',
                project_id=project.id,
                order_index=0,
                status='DESCRIPTION_GENERATED',
            )
            page.set_outline_content({'title': page.id, 'points': []})
            page.set_description_content({'text': page.id})
            db.session.add_all([project, page])
            db.session.commit()

            with (
                patch.object(page_controller_module, 'get_ai_service', return_value=MinimalAIService()),
                patch.object(page_controller_module.task_manager, 'submit_task') as submit_task,
            ):
                response = app.test_client().post(
                    f'/api/projects/{project.id}/pages/{page.id}/generate/image',
                    json={
                        'force_regenerate': True,
                        'image_density': 'rich',
                        'image_style': 'tech',
                        'image_style_prompt': '蓝绿色科技感，少量发光线条',
                    },
                )

            data = assert_success_response(response, 202)['data']
            task = Task.query.get(data['task_id'])
            progress = task.get_progress()
            submit_args = submit_task.call_args.args

            assert progress['image_options']['image_density'] == 'rich'
            assert progress['image_options']['image_style'] == 'tech'
            assert progress['image_options']['image_style_prompt'] == '蓝绿色科技感，少量发光线条'
            assert '信息密度：丰富' in submit_args[11]
            assert '视觉风格：科技感' in submit_args[11]
            assert '蓝绿色科技感，少量发光线条' in submit_args[11]

    def test_single_page_image_generation_accepts_gorden_template_pack_without_style_text(self, app):
        from models import db, Page, Project
        from controllers import page_controller as page_controller_module

        class MinimalAIService:
            def extract_image_urls_from_markdown(self, _text):
                return []

        with app.app_context():
            project = Project(
                id='proj-single-gorden-pack-only',
                creation_type='idea',
                idea_prompt='test',
                template_pack_id='gorden-data-viz-deck',
                image_aspect_ratio='16:9',
                status='DESCRIPTIONS_GENERATED',
            )
            page = Page(
                id='page-single-gorden-pack-only',
                project_id=project.id,
                order_index=0,
                status='DESCRIPTION_GENERATED',
            )
            page.set_outline_content({'title': page.id, 'points': []})
            page.set_description_content({'text': page.id})
            db.session.add_all([project, page])
            db.session.commit()

            with (
                patch.object(page_controller_module, 'get_ai_service', return_value=MinimalAIService()),
                patch.object(page_controller_module.task_manager, 'submit_task') as submit_task,
            ):
                response = app.test_client().post(
                    f'/api/projects/{project.id}/pages/{page.id}/generate/image',
                    json={'force_regenerate': True},
                )

            data = assert_success_response(response, 202)['data']

            assert data['page_id'] == page.id
            submit_task.assert_called_once()

    def test_batch_image_generation_can_resolve_template_pack_per_page(self, app):
        from PIL import Image
        from models import db, Page, Project
        from controllers import project_controller as project_controller_module
        from services import task_manager as task_manager_module

        class BatchAIService:
            prompt_requirements = []

            def flatten_outline(self, outline):
                return outline

            def extract_image_urls_from_markdown(self, _text):
                return []

            def generate_image_prompt(self, *args, **kwargs):
                self.prompt_requirements.append(kwargs.get('extra_requirements') or '')
                return 'prompt'

            def generate_image(self, *args, **kwargs):
                return Image.new('RGB', (32, 32), color='blue')

        with app.app_context():
            project = Project(
                id='proj-batch-template-pack',
                creation_type='idea',
                idea_prompt='test',
                template_style='clean',
                template_pack_id='gorden-data-viz-deck',
                image_aspect_ratio='16:9',
                status='DESCRIPTIONS_GENERATED',
            )
            page = Page(project_id=project.id, order_index=0, status='DESCRIPTION_GENERATED')
            page.set_outline_content({'title': 'Page 1', 'points': []})
            page.set_description_content({'text': 'Description 1'})
            db.session.add_all([project, page])
            db.session.commit()

            def fake_save_image_with_version(_image, _project_id, _page_id, _file_service, page_obj=None, image_format='PNG'):
                if page_obj:
                    page_obj.generated_image_path = f'generated/{_page_id}.png'
                    page_obj.status = 'COMPLETED'
                    db.session.commit()
                return (f'generated/{_page_id}.png', 1)

            with (
                patch.object(project_controller_module, 'get_ai_service', return_value=BatchAIService()),
                patch.object(task_manager_module, 'save_image_with_version', side_effect=fake_save_image_with_version),
            ):
                client = app.test_client()
                response = client.post(
                    f'/api/projects/{project.id}/generate/images',
                    json={'page_ids': [page.id]},
                )
                data = assert_success_response(response, 202)
                task_id = data['data']['task_id']

                deadline = time.time() + 3
                task = None
                while time.time() < deadline:
                    task = client.get(f'/api/projects/{project.id}/tasks/{task_id}').get_json()['data']
                    if task['status'] in {'COMPLETED', 'FAILED'}:
                        break
                    time.sleep(0.05)

                assert task['status'] == 'COMPLETED'
                assert task['progress']['completed'] == 1
                assert task['progress']['failed'] == 0
                assert task['progress']['status'] == 'completed'
                page_manifest = task['progress']['pages'][0]
                assert page_manifest['status'] == 'completed'
                assert page_manifest['version_number'] == 1
                assert page_manifest['output_path'] == f'generated/{page.id}.png'
                assert len(page_manifest['prompt_hash']) == 64
                assert page_manifest['prompt_path'].endswith(f'{page.id}_attempt-1.txt')
                manifest_path = Path(app.config['UPLOAD_FOLDER']) / task['progress']['manifest_path']
                persisted_manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
                assert persisted_manifest['pages'][0]['status'] == 'completed'
                assert any('模板视觉DNA' in item for item in BatchAIService.prompt_requirements)
                assert any('数据仪表盘' in item for item in BatchAIService.prompt_requirements)


class TestResourceConcurrency:
    def test_image_limiter_allows_more_than_global_four_workers(self, app):
        """图片资源并发应由 image limiter 控制，而不是被旧的全局 4 worker 提前卡住。"""
        from services.task_manager import (
            TaskManager,
            ResourceLimiter,
        )

        limiter = ResourceLimiter("image-test", 8)
        executor = ThreadPoolExecutor(max_workers=10)
        started = []
        active = 0
        peak_active = 0
        gate = threading.Event()
        state_lock = threading.Lock()

        def worker(i: int):
            nonlocal active, peak_active
            with limiter.slot(f"page-{i}"):
                with state_lock:
                    started.append(i)
                    active += 1
                    peak_active = max(peak_active, active)
                gate.wait(timeout=5)
                with state_lock:
                    active -= 1

        futures = [executor.submit(worker, i) for i in range(8)]

        deadline = time.time() + 2
        while time.time() < deadline:
            with state_lock:
                if len(started) == 8:
                    break
            time.sleep(0.05)

        gate.set()
        for future in futures:
            future.result(timeout=5)
        executor.shutdown(wait=True)

        assert len(started) == 8
        assert peak_active == 8

    def test_shared_task_pool_no_longer_caps_single_page_image_tasks_at_four(self, app):
        """即使共享后台池只有 4 个旧行为，图片任务也应由 image limiter 决定并发。"""
        from models import db, Project, Page
        from controllers import page_controller as page_controller_module
        from services import task_manager as task_manager_module
        from services.task_manager import sync_resource_limits

        class SlowAIService:
            def extract_image_urls_from_markdown(self, _text):
                return []

            def generate_image_prompt(self, *args, **kwargs):
                return "prompt"

            def generate_image(self, *args, **kwargs):
                time.sleep(0.3)
                from PIL import Image
                return Image.new('RGB', (32, 32), color='blue')

        with app.app_context():
            app.config['MAX_IMAGE_WORKERS'] = 8
            app.config['MAX_DESCRIPTION_WORKERS'] = 2
            sync_resource_limits(2, 8)

            project = Project(
                id='proj-concurrency',
                creation_type='idea',
                idea_prompt='test',
                template_style='clean',
                image_aspect_ratio='16:9',
                status='DRAFT',
            )
            db.session.add(project)

            pages = []
            for i in range(5):
                page = Page(project_id=project.id, order_index=i, status='DESCRIPTION_GENERATED')
                page.set_outline_content({'title': f'Page {i+1}', 'points': []})
                page.set_description_content({'text': f'Description {i+1}'})
                db.session.add(page)
                pages.append(page)

            db.session.commit()

            client = app.test_client()
            task_ids = []

            def fake_save_image_with_version(_image, _project_id, _page_id, _file_service, page_obj=None, image_format='PNG'):
                if page_obj:
                    page_obj.generated_image_path = f"generated/{_page_id}.png"
                    page_obj.status = 'COMPLETED'
                return (f"generated/{_page_id}.png", 1)

            with (
                patch.object(page_controller_module, 'get_ai_service', return_value=SlowAIService()),
                patch.object(task_manager_module, 'save_image_with_version', side_effect=fake_save_image_with_version),
            ):
                for page in pages:
                    response = client.post(
                        f'/api/projects/{project.id}/pages/{page.id}/generate/image',
                        json={'force_regenerate': True},
                    )
                    data = assert_success_response(response, 202)
                    task_ids.append(data['data']['task_id'])

                deadline = time.time() + 1.5
                processed = 0
                while time.time() < deadline:
                    statuses = [client.get(f'/api/projects/{project.id}/tasks/{task_id}').get_json()['data']['status'] for task_id in task_ids]
                    processed = sum(status in {'PROCESSING', 'COMPLETED'} for status in statuses)
                    if processed >= 5:
                        break
                    time.sleep(0.05)

                assert processed >= 5

                completion_deadline = time.time() + 3
                while time.time() < completion_deadline:
                    statuses = [client.get(f'/api/projects/{project.id}/tasks/{task_id}').get_json()['data']['status'] for task_id in task_ids]
                    if all(status == 'COMPLETED' for status in statuses):
                        break
                    time.sleep(0.05)

                assert all(status == 'COMPLETED' for status in statuses)
                first_task = client.get(
                    f'/api/projects/{project.id}/tasks/{task_ids[0]}'
                ).get_json()['data']
                assert first_task['progress']['generation_id'] == task_ids[0]
                assert first_task['progress']['status'] == 'completed'
                assert first_task['progress']['pages'][0]['status'] == 'completed'
                assert first_task['progress']['pages'][0]['version_number'] == 1
                assert len(first_task['progress']['pages'][0]['prompt_hash']) == 64


class TestProjectOutlineStream:
    """流式大纲生成测试"""

    def test_description_stream_prompt_uses_latest_description_format(self):
        """从描述生成的 SSE prompt 应对齐最新页面描述格式，而不是旧版页面标题/页面文字格式"""
        from services.ai_service import ProjectContext
        from services.prompts import get_description_to_outline_prompt_markdown

        context = ProjectContext({
            'creation_type': 'descriptions',
            'description_text': '第一页：介绍主题',
        })

        prompt = get_description_to_outline_prompt_markdown(
            context,
            language='zh',
            extra_fields=['视觉元素'],
        )

        assert '<!-- PAGE_DESCRIPTION -->' in prompt
        assert '--- 页面文字 ---' in prompt
        assert '--- 页面文字结束 ---' in prompt
        assert '图片素材：' in prompt
        assert '视觉元素：' in prompt
        assert '页面标题：' not in prompt

    def test_outline_stream_parses_legacy_outline_only_markdown(self):
        """普通大纲 SSE 仍兼容只含标题和要点的 Markdown 输出"""
        from services.ai_service import AIService, ProjectContext

        class FakeTextProvider:
            def generate_text_stream(self, prompt, thinking_budget=0):
                yield '# 第一章\n## 第一页\n- 要点1\n一句补充\n## 第二页\n- 要点2\n<!-- END -->'

        service = AIService(text_provider=FakeTextProvider(), image_provider=None, caption_provider=None)
        context = ProjectContext({
            'creation_type': 'outline',
            'outline_text': '第一页\n- 要点1\n第二页\n- 要点2',
        })

        pages = list(service.generate_outline_stream(context, language='zh'))

        assert pages[:-1] == [
            {'title': '第一页', 'points': ['要点1', '一句补充'], 'part': '第一章'},
            {'title': '第二页', 'points': ['要点2'], 'part': '第一章'},
        ]
        assert pages[-1] == {'__stream_complete__': True}

    def test_description_stream_parser_binds_description_to_same_page(self):
        """描述 SSE 新格式应把同一页的大纲和页面描述绑定在同一个结果里"""
        from services.ai_service import AIService, ProjectContext

        class FakeTextProvider:
            def generate_text_stream(self, prompt, thinking_budget=0):
                yield (
                    '## 第一页\n'
                    '<!-- OUTLINE_POINTS -->\n'
                    '- Establish the page purpose and connect the audience from context to the main argument.\n'
                    '<!-- PAGE_DESCRIPTION -->\n'
                    '--- 页面文字 ---\n'
                    '- 背景和目标\n'
                    '\n--- 页面文字结束 ---\n'
                    '\n图片素材：\n'
                    '使用一张简洁的背景图\n'
                    '\n视觉元素：关键指标卡片\n'
                    '<!-- PAGE_END -->\n'
                    '<!-- END -->'
                )

        service = AIService(text_provider=FakeTextProvider(), image_provider=None, caption_provider=None)
        context = ProjectContext({
            'creation_type': 'descriptions',
            'description_text': '第一页：背景和目标',
        })

        pages = list(service.generate_outline_stream(context, language='zh'))

        assert pages[0]['title'] == '第一页'
        assert pages[0]['points'] == ['Establish the page purpose and connect the audience from context to the main argument.']
        assert '--- 页面文字 ---' in pages[0]['description_text']
        assert '页面标题：' not in pages[0]['description_text']
        assert pages[0]['extra_fields']['视觉元素'] == '关键指标卡片'
        assert pages[-1] == {'__stream_complete__': True}

    def test_description_stream_persists_outline_and_description(self, client, app, monkeypatch):
        """从描述生成应通过同一条 SSE 流落库大纲和页面描述，避免两次拆分页数不一致"""
        response = client.post('/api/projects', json={
            'creation_type': 'descriptions',
            'description_text': '第一页：介绍主题。第二页：展开方案。'
        })
        data = assert_success_response(response, 201)
        project_id = data['data']['project_id']

        class FakeAIService:
            def generate_outline_stream(self, project_context, language=None):
                yield {
                    'title': '介绍主题',
                    'points': ['背景', '目标'],
                    'description_text': '--- 页面文字 ---\n- 背景\n- 目标\n\n--- 页面文字结束 ---',
                    'extra_fields': {'视觉元素': '背景图'},
                }
                yield {
                    'title': '展开方案',
                    'points': ['路径', '结果'],
                    'description_text': '--- 页面文字 ---\n- 路径\n- 结果\n\n--- 页面文字结束 ---',
                }
                yield {'__stream_complete__': True}

        monkeypatch.setattr('controllers.project_controller.get_ai_service', lambda: FakeAIService())

        stream_response = client.post(
            f'/api/projects/{project_id}/generate/outline/stream',
            json={'language': 'zh'},
            buffered=True,
        )
        assert stream_response.status_code == 200
        body = stream_response.get_data(as_text=True)

        assert 'event: page' in body
        assert 'description_text' in body
        assert 'event: done' in body

        with app.app_context():
            from models import Page, Project
            project = Project.query.get(project_id)
            pages = Page.query.filter_by(project_id=project_id).order_by(Page.order_index).all()

            assert project.status == 'DESCRIPTIONS_GENERATED'
            assert len(pages) == 2
            assert pages[0].get_outline_content() == {'title': '介绍主题', 'points': ['背景', '目标']}
            assert pages[0].get_description_content()['text'].startswith('--- 页面文字 ---')
            assert pages[0].get_description_content()['extra_fields'] == {'视觉元素': '背景图'}
            assert pages[1].get_outline_content()['title'] == '展开方案'


class TestProjectUpdate:
    """项目更新测试"""
    
    def test_update_project_status(self, client, sample_project):
        """测试更新项目状态"""
        if not sample_project:
            pytest.skip("项目创建失败")
        
        project_id = sample_project['project_id']
        response = client.put(f'/api/projects/{project_id}', json={
            'status': 'GENERATING'
        })
        
        # 状态更新应该成功
        assert response.status_code == 200
        data = response.get_json()
        assert data['success'] is True

    def test_update_project_title(self, client, sample_project):
        """测试更新项目标题不影响 idea_prompt"""
        if not sample_project:
            pytest.skip("项目创建失败")

        project_id = sample_project['project_id']
        get_before = client.get(f'/api/projects/{project_id}')
        before_data = assert_success_response(get_before)

        response = client.put(f'/api/projects/{project_id}', json={
            'project_title': '新的项目标题'
        })

        data = assert_success_response(response)
        assert data['data']['project_title'] == '新的项目标题'
        assert data['data']['idea_prompt'] == before_data['data']['idea_prompt']

    @pytest.mark.parametrize('field', [
        'export_allow_partial',
        'export_high_fidelity_editable',
    ])
    @pytest.mark.parametrize('value', [True, False])
    def test_update_project_accepts_boolean_export_settings(self, client, sample_project, field, value):
        project_id = sample_project['project_id']

        response = client.put(f'/api/projects/{project_id}', json={field: value})

        data = assert_success_response(response)
        assert data['data'][field] is value

    @pytest.mark.parametrize('field', [
        'export_allow_partial',
        'export_high_fidelity_editable',
    ])
    def test_update_project_rejects_string_export_settings(self, client, sample_project, field):
        project_id = sample_project['project_id']

        response = client.put(f'/api/projects/{project_id}', json={field: 'false'})

        data = assert_error_response(response, 400)
        assert data['error']['message'] == f'{field} must be a boolean'

    def test_update_project_rejects_render_mode_switch(self, client, sample_project):
        project_id = sample_project['project_id']

        response = client.put(f'/api/projects/{project_id}', json={
            'render_mode': 'native'
        })

        data = assert_error_response(response, 400)
        assert data['error']['message'] == 'render_mode cannot be changed after project creation'


class TestProjectDelete:
    """项目删除测试"""
    
    def test_delete_project_success(self, client, sample_project):
        """测试删除项目成功"""
        if not sample_project:
            pytest.skip("项目创建失败")
        
        project_id = sample_project['project_id']
        response = client.delete(f'/api/projects/{project_id}')
        
        data = assert_success_response(response)
        
        # 确认项目已删除
        get_response = client.get(f'/api/projects/{project_id}')
        assert get_response.status_code == 404
    
    def test_delete_project_not_found(self, client):
        """测试删除不存在的项目"""
        response = client.delete('/api/projects/non-existent-id')
        
        assert response.status_code == 404
