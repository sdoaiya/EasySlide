import hashlib
import json
import sqlite3
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from backend.tests.fixtures.legacy_content_projects import (
    PROJECT_IDS,
    build_legacy_content_projects_database,
)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_verification_migrates_a_copy_without_touching_the_source(tmp_path):
    from services.content_project_migration import verify_sqlite_database_copy

    source = build_legacy_content_projects_database(tmp_path / 'legacy.db')
    source_hash = _sha256(source)

    report = verify_sqlite_database_copy(
        source,
        output_dir=tmp_path / 'verification',
        file_root=tmp_path / 'legacy-content-project-assets',
    )

    assert _sha256(source) == source_hash
    assert report['source_unchanged_sha256'] == source_hash
    assert report['status'] == 'migrated'
    migrated_copy = Path(report['verification_copy_path'])
    assert migrated_copy.is_file()
    connection = sqlite3.connect(migrated_copy)
    try:
        assert connection.execute('SELECT COUNT(*) FROM project_workspaces').fetchone()[0] == 15
        assert connection.execute(
            "SELECT COUNT(*) FROM project_workspaces WHERE kind = 'ppt' AND stage IS NOT NULL"
        ).fetchone()[0] == 5
        assert connection.execute(
            "SELECT COUNT(*) FROM projects WHERE status = 'active'"
        ).fetchone()[0] == 5
        assert connection.execute('PRAGMA foreign_key_check').fetchall() == []
        def source_content(project_id):
            document = json.loads(connection.execute(
                'SELECT document_json FROM content_spines WHERE project_id = ?',
                (project_id,),
            ).fetchone()[0])
            return {item['kind']: item.get('content') for item in document['sources']}

        assert source_content(PROJECT_IDS['complex'])['prompt'] == '供应链韧性'
        assert source_content(PROJECT_IDS['native'])['outline'] == '第一章\n第二章'
        assert source_content(PROJECT_IDS['renovation'])['description'] == '旧稿翻新'
    finally:
        connection.close()

    from models import Project

    engine = create_engine(f'sqlite:///{migrated_copy}')
    with Session(engine) as session:
        project = session.get(Project, PROJECT_IDS['complex'])
        payload = project.to_dict(include_pages=True)
        assert payload['idea_prompt'] == '供应链韧性'
        assert payload['render_mode'] == 'image'
        assert payload['status'] == 'GENERATING'
        assert len(payload['pages']) == 2
    engine.dispose()
