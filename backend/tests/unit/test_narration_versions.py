import json
import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from models import NarrationVersion, Page, Project, db


def test_narration_version_round_trip_and_page_serialization(client):
    with client.application.app_context():
        project = Project(idea_prompt='narration versions')
        page = Page(
            project=project,
            order_index=0,
            narration_text='兼容旧版旁白',
            narration_segments=json.dumps([{'speaker': 'A', 'text': '兼容旧片段'}], ensure_ascii=False),
            narration_locked=True,
            narration_revision=3,
        )
        version = NarrationVersion(
            page=page,
            version_number=1,
            mode='dialogue',
            language='zh-CN',
            text='主持人：你好\n嘉宾：你好',
            source_type='ai_polished',
            status='applied',
            ai_operation='polish',
            content_hash='content-hash',
            created_by='ai',
        )
        version.set_segments([
            {'segment_id': 'seg-1', 'speaker_id': 'host', 'text': '你好'},
            {'segment_id': 'seg-2', 'speaker_id': 'guest', 'text': '你好'},
        ])
        version.set_ai_config({'tone': 'natural'})
        page.current_narration_version = version

        db.session.add(project)
        db.session.commit()

        assert version.page is page
        assert page.narration_versions.one() is version
        assert page.current_narration_version is version

        version_data = version.to_dict()
        assert version_data == {
            'version_id': version.id,
            'page_id': page.id,
            'version_number': 1,
            'mode': 'dialogue',
            'language': 'zh-CN',
            'text': '主持人：你好\n嘉宾：你好',
            'segments': [
                {'segment_id': 'seg-1', 'speaker_id': 'host', 'text': '你好'},
                {'segment_id': 'seg-2', 'speaker_id': 'guest', 'text': '你好'},
            ],
            'source_type': 'ai_polished',
            'status': 'applied',
            'parent_version_id': None,
            'ai_operation': 'polish',
            'ai_config': {'tone': 'natural'},
            'content_hash': 'content-hash',
            'created_by': 'ai',
            'created_at': version.created_at.isoformat(),
        }

        page_data = page.to_dict(include_versions=True)
        assert page_data['current_narration_version_id'] == version.id
        assert page_data['narration_locked'] is True
        assert page_data['narration_revision'] == 3
        assert page_data['narration_versions'] == [version_data]
        assert page_data['narration_text'] == '兼容旧版旁白'
        assert page_data['narration_segments'] == [{'speaker': 'A', 'text': '兼容旧片段'}]


def test_narration_version_parent_and_json_fallbacks(client):
    with client.application.app_context():
        project = Project(idea_prompt='narration parent')
        page = Page(project=project, order_index=0)
        parent = NarrationVersion(
            page=page,
            version_number=1,
            mode='single',
            language='auto',
            text='第一版',
            source_type='manual',
            status='archived',
            content_hash='v1',
            created_by='user',
        )
        child = NarrationVersion(
            page=page,
            version_number=2,
            mode='single',
            language='auto',
            text='第二版',
            segments_json='{broken',
            source_type='manual',
            status='candidate',
            parent_version=parent,
            ai_config_json='[]',
            content_hash='v2',
            created_by='user',
        )
        db.session.add(project)
        db.session.commit()

        assert child.parent_version is parent
        assert child.to_dict()['segments'] == []
        assert child.to_dict()['ai_config'] == {}


def test_page_narration_defaults_keep_legacy_projection(client):
    with client.application.app_context():
        project = Project(idea_prompt='legacy narration')
        page = Page(project=project, order_index=0, narration_text='旧项目仍可导出')
        page.set_narration_segments([{'speaker': 'A', 'text': '旧数据'}])
        db.session.add(project)
        db.session.commit()

        data = page.to_dict(include_versions=True)
        assert data['current_narration_version_id'] is None
        assert data['narration_locked'] is False
        assert data['narration_revision'] == 0
        assert data['narration_versions'] == []
        assert data['narration_text'] == '旧项目仍可导出'
        assert data['narration_segments'] == [{'speaker': 'A', 'text': '旧数据'}]


def test_032_migration_upgrades_and_downgrades_legacy_pages(tmp_path):
    migration_path = (
        Path(__file__).parents[2]
        / 'migrations'
        / 'versions'
        / '032_add_narration_versions.py'
    )
    spec = importlib.util.spec_from_file_location('migration_032_narration_versions', migration_path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)

    engine = sa.create_engine(f"sqlite:///{tmp_path / 'migration.db'}")
    metadata = sa.MetaData()
    pages = sa.Table(
        'pages',
        metadata,
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('narration_text', sa.Text(), nullable=True),
        sa.Column('narration_segments', sa.Text(), nullable=True),
    )
    metadata.create_all(engine)

    with engine.begin() as connection:
        connection.execute(pages.insert().values(
            id='legacy-page',
            narration_text='旧旁白',
            narration_segments='[{"text":"旧片段"}]',
        ))
        context = MigrationContext.configure(connection, opts={'render_as_batch': True})
        migration.op = Operations(context)
        migration.upgrade()

        inspector = sa.inspect(connection)
        assert 'narration_versions' in inspector.get_table_names()
        assert {
            'current_narration_version_id', 'narration_locked', 'narration_revision'
        }.issubset({column['name'] for column in inspector.get_columns('pages')})
        legacy = connection.execute(sa.text(
            'SELECT narration_text, narration_segments, current_narration_version_id, '
            'narration_locked, narration_revision FROM pages WHERE id = :id'
        ), {'id': 'legacy-page'}).mappings().one()
        assert dict(legacy) == {
            'narration_text': '旧旁白',
            'narration_segments': '[{"text":"旧片段"}]',
            'current_narration_version_id': None,
            'narration_locked': 0,
            'narration_revision': 0,
        }

        migration.downgrade()
        inspector = sa.inspect(connection)
        assert 'narration_versions' not in inspector.get_table_names()
        assert {
            'current_narration_version_id', 'narration_locked', 'narration_revision'
        }.isdisjoint({column['name'] for column in inspector.get_columns('pages')})
        assert connection.execute(sa.text(
            'SELECT narration_text FROM pages WHERE id = :id'
        ), {'id': 'legacy-page'}).scalar_one() == '旧旁白'
