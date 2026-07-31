import sqlite3
import time

from backend.tests.fixtures.legacy_content_projects import (
    build_legacy_content_projects_benchmark_database,
)
from services.content_project_migration import migrate_sqlite_database


def test_migrates_100_projects_and_2000_pages_baseline(tmp_path):
    database = build_legacy_content_projects_benchmark_database(
        tmp_path / 'legacy-benchmark.db',
        project_count=100,
        pages_per_project=20,
    )

    started = time.perf_counter()
    report = migrate_sqlite_database(database)
    elapsed_ms = (time.perf_counter() - started) * 1000

    connection = sqlite3.connect(database)
    try:
        assert connection.execute('SELECT COUNT(*) FROM projects').fetchone()[0] == 100
        assert connection.execute('SELECT COUNT(*) FROM pages').fetchone()[0] == 2000
        assert connection.execute('SELECT COUNT(*) FROM content_spines').fetchone()[0] == 100
        assert connection.execute('SELECT COUNT(*) FROM project_workspaces').fetchone()[0] == 300
        assert connection.execute('SELECT COUNT(*) FROM workspace_versions').fetchone()[0] == 100
        assert connection.execute('PRAGMA foreign_key_check').fetchall() == []
    finally:
        connection.close()

    print(f'CP1_MIGRATION_100_PROJECTS_2000_PAGES_MS={elapsed_ms:.3f}')
    assert report['status'] == 'migrated'
    assert elapsed_ms < 60_000
