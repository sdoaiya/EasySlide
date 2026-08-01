import hashlib
import importlib.util
import json
import sqlite3
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from jsonschema import Draft202012Validator

from backend.tests.fixtures.legacy_content_projects import (
    PROJECT_IDS,
    build_legacy_content_projects_database,
    expected_legacy_counts,
)


def file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def table_count(connection, table):
    return connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]


def test_offline_migration_backs_up_validates_and_switches_all_legacy_shapes(tmp_path):
    from services.content_project_migration import migrate_sqlite_database

    database = build_legacy_content_projects_database(tmp_path / "legacy.db")
    original_hash = file_hash(database)

    report = migrate_sqlite_database(database)

    assert report["status"] == "migrated"
    assert report["source_sha256"] == original_hash
    assert Path(report["backup_path"]).exists()
    assert report["backup_sha256"] == file_hash(Path(report["backup_path"]))
    assert report["source_logical_sha256"] == report["backup_logical_sha256"]
    assert Path(report["report_path"]).exists()
    assert json.loads(Path(report["report_path"]).read_text(encoding="utf-8"))["status"] == "migrated"
    assert report["before_counts"] == expected_legacy_counts()
    assert len(report['projects']) == 5
    assert report['reference_checks']['direct_file_references'] > 0
    assert report['reference_checks']['task_references'] == 0
    assert report['hash_checks'] == {'content_records': 10}
    assert report['ownership_checks']['current_version_pointers'] == 6

    connection = sqlite3.connect(database)
    try:
        assert table_count(connection, "content_spines") == 5
        assert table_count(connection, "project_workspaces") == 15
        assert table_count(connection, "workspace_versions") == 5
        assert table_count(connection, "orphan_task_archive") == 0
        assert table_count(connection, "content_sync_proposals") == 0
        assert table_count(connection, "workspace_generation_runs") == 0
        assert connection.execute(
            "SELECT COUNT(*) FROM project_workspaces WHERE kind = 'ppt' AND current_version_id IS NOT NULL"
        ).fetchone()[0] == 5
        assert connection.execute(
            "SELECT COUNT(*) FROM project_workspaces WHERE kind IN ('video', 'podcast') AND state = 'uninitialized'"
        ).fetchone()[0] == 10
        assert connection.execute(
            "SELECT last_workspace, migration_state, status FROM projects WHERE id = ?",
            (PROJECT_IDS["complex"],),
        ).fetchone() == ("ppt", "migrated", "active")
        assert connection.execute(
            "SELECT stage FROM project_workspaces WHERE project_id = ? AND kind = 'ppt'",
            (PROJECT_IDS["complex"],),
        ).fetchone() == ("GENERATING",)
        schema = json.loads(
            (Path(__file__).parents[3] / "shared" / "content" / "content-spine.schema.json")
            .read_text(encoding="utf-8")
        )
        validator = Draft202012Validator(schema)
        for row in connection.execute("SELECT document_json FROM content_spines"):
            validator.validate(json.loads(row[0]))
        assert connection.execute("PRAGMA foreign_key_check").fetchall() == []
        project_columns = {row[1] for row in connection.execute('PRAGMA table_info(projects)')}
        assert not {
            'idea_prompt', 'outline_text', 'description_text', 'render_mode',
            'native_theme', 'native_image_settings', 'pronunciation_lexicon',
            'narration_preferences', 'image_aspect_ratio',
        } & project_columns
    finally:
        connection.close()


def test_offline_migration_is_idempotent(tmp_path):
    from services.content_project_migration import migrate_sqlite_database

    database = build_legacy_content_projects_database(tmp_path / "legacy.db")
    migrate_sqlite_database(database)
    migrated_hash = file_hash(database)
    backups = set((tmp_path / "backups").iterdir())
    second = migrate_sqlite_database(database)

    connection = sqlite3.connect(database)
    try:
        assert second["status"] == "already_migrated"
        assert second["backup_path"] is None
        assert file_hash(database) == migrated_hash
        assert set((tmp_path / "backups").iterdir()) == backups
        assert table_count(connection, "content_spines") == 5
        assert table_count(connection, "project_workspaces") == 15
        assert table_count(connection, "workspace_versions") == 5
    finally:
        connection.close()


def test_offline_migration_failure_before_switch_preserves_original(tmp_path):
    from services.content_project_migration import MigrationFailure, migrate_sqlite_database

    database = build_legacy_content_projects_database(tmp_path / "legacy.db")
    original_hash = file_hash(database)

    def fail(step):
        if step == "before_switch":
            raise RuntimeError("injected switch failure")

    with pytest.raises(MigrationFailure, match="injected switch failure"):
        migrate_sqlite_database(database, fault_injector=fail)

    assert file_hash(database) == original_hash
    connection = sqlite3.connect(database)
    try:
        assert connection.execute(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'project_workspaces'"
        ).fetchone()[0] == 0
    finally:
        connection.close()


def test_offline_migration_backup_directory_failure_preserves_original(tmp_path):
    from services.content_project_migration import MigrationFailure, migrate_sqlite_database

    database = build_legacy_content_projects_database(tmp_path / 'legacy.db')
    original_hash = file_hash(database)
    invalid_backup_directory = tmp_path / 'not-a-directory'
    invalid_backup_directory.write_text('occupied', encoding='utf-8')

    with pytest.raises(MigrationFailure):
        migrate_sqlite_database(database, backup_dir=invalid_backup_directory)

    assert file_hash(database) == original_hash


def test_offline_migration_rejects_missing_file_reference_without_switching(tmp_path):
    from services.content_project_migration import MigrationFailure, migrate_sqlite_database

    database = build_legacy_content_projects_database(tmp_path / "legacy.db")
    connection = sqlite3.connect(database)
    missing_path = tmp_path / "missing.png"
    connection.execute(
        "UPDATE materials SET relative_path = ? WHERE project_id = ?",
        (str(missing_path), PROJECT_IDS["complex"]),
    )
    connection.commit()
    connection.close()
    original_hash = file_hash(database)

    with pytest.raises(MigrationFailure, match="missing file reference"):
        migrate_sqlite_database(database)

    assert file_hash(database) == original_hash


def test_offline_migration_archives_orphan_runtime_tasks_without_data_loss(tmp_path):
    from services.content_project_migration import migrate_sqlite_database

    database = build_legacy_content_projects_database(tmp_path / "legacy.db")
    connection = sqlite3.connect(database)
    connection.execute(
        """
        INSERT INTO tasks (id, project_id, task_type, status, created_at)
        VALUES ('orphan-task', 'missing-project', 'TEST_TEXT_MODEL', 'FAILED', '2026-07-26')
        """
    )
    connection.commit()
    connection.close()
    report = migrate_sqlite_database(database)

    assert report['archived_orphan_tasks'] == 1
    connection = sqlite3.connect(database)
    try:
        assert table_count(connection, "tasks") == 1
        archived = connection.execute(
            '''SELECT original_task_id, original_project_id, task_type, status, reason
               FROM orphan_task_archive'''
        ).fetchone()
        assert archived == (
            'orphan-task', 'missing-project', 'TEST_TEXT_MODEL', 'FAILED', 'missing_project',
        )
        assert connection.execute('PRAGMA foreign_key_check').fetchall() == []
    finally:
        connection.close()


def test_migration_validation_rejects_cross_workspace_current_version(tmp_path):
    from services.content_project_migration import (
        LEGACY_COUNT_TABLES,
        _counts,
        migrate_sqlite_database,
        validate_migrated_connection,
    )

    database = build_legacy_content_projects_database(tmp_path / 'legacy.db')
    migrate_sqlite_database(database)
    connection = sqlite3.connect(database)
    try:
        workspace_id = connection.execute(
            "SELECT id FROM project_workspaces WHERE kind = 'video' ORDER BY id LIMIT 1"
        ).fetchone()[0]
        version_id = connection.execute(
            'SELECT id FROM workspace_versions ORDER BY id LIMIT 1'
        ).fetchone()[0]
        connection.execute(
            "UPDATE project_workspaces SET current_version_id = ?, state = 'draft' WHERE id = ?",
            (version_id, workspace_id),
        )
        connection.commit()
        with pytest.raises(ValueError, match='belongs to another workspace'):
            validate_migrated_connection(connection, database, _counts(connection, LEGACY_COUNT_TABLES))
    finally:
        connection.close()


def test_migration_validation_rejects_content_hash_drift(tmp_path):
    from services.content_project_migration import (
        LEGACY_COUNT_TABLES,
        _counts,
        migrate_sqlite_database,
        validate_migrated_connection,
    )

    database = build_legacy_content_projects_database(tmp_path / 'legacy.db')
    migrate_sqlite_database(database)
    connection = sqlite3.connect(database)
    try:
        connection.execute("UPDATE content_spines SET content_hash = ?", ('0' * 64,))
        connection.commit()
        with pytest.raises(ValueError, match='content spine hash mismatch'):
            validate_migrated_connection(connection, database, _counts(connection, LEGACY_COUNT_TABLES))
    finally:
        connection.close()


def test_offline_migration_rejects_missing_task_snapshot_without_switching(tmp_path):
    from services.content_project_migration import MigrationFailure, migrate_sqlite_database

    database = build_legacy_content_projects_database(tmp_path / 'legacy.db')
    connection = sqlite3.connect(database)
    connection.execute(
        'UPDATE tasks SET progress = ?',
        (json.dumps({'_resume': {'kind': 'video', 'kwargs': {
            'narration_snapshot_path': str(tmp_path / 'missing-snapshot.json'),
            'narration_snapshot_hash': '0' * 64,
        }}}),),
    )
    connection.commit()
    connection.close()
    original_hash = file_hash(database)

    with pytest.raises(MigrationFailure, match='missing task snapshot'):
        migrate_sqlite_database(database)

    assert file_hash(database) == original_hash


def test_offline_migration_reports_missing_completed_export_without_blocking(tmp_path):
    from services.content_project_migration import migrate_sqlite_database

    database = build_legacy_content_projects_database(tmp_path / 'legacy.db')
    connection = sqlite3.connect(database)
    connection.execute(
        'UPDATE tasks SET status = ?, progress = ?',
        ('COMPLETED', json.dumps({'download_url': f'/files/{PROJECT_IDS["complex"]}/exports/missing.mp4'})),
    )
    connection.commit()
    connection.close()

    report = migrate_sqlite_database(database, file_root=tmp_path / 'assets')

    assert report['status'] == 'migrated'
    assert report['reference_checks']['missing_completed_exports'][0]['url'].endswith('/missing.mp4')


def test_034_alembic_revision_uses_the_shared_migration_core(tmp_path):
    database = build_legacy_content_projects_database(tmp_path / "legacy.db")
    migration_path = (
        Path(__file__).parents[2]
        / "migrations"
        / "versions"
        / "034_add_content_workspaces.py"
    )
    spec = importlib.util.spec_from_file_location("migration_034_content_workspaces", migration_path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = sa.create_engine(f"sqlite:///{database}")

    with engine.connect() as connection:
        context = MigrationContext.configure(connection)
        operations = Operations(context)
        migration.op = operations
        migration.upgrade()
        archive_path = migration_path.with_name('036_add_orphan_task_archive.py')
        archive_spec = importlib.util.spec_from_file_location('migration_036_orphan_archive', archive_path)
        archive_migration = importlib.util.module_from_spec(archive_spec)
        archive_spec.loader.exec_module(archive_migration)
        archive_migration.op = operations
        archive_migration.upgrade()
        connection.commit()

    connection = sqlite3.connect(database)
    try:
        assert table_count(connection, "content_spines") == 5
        assert table_count(connection, "project_workspaces") == 15
        assert table_count(connection, "workspace_versions") == 5
    finally:
        connection.close()


def test_sqlalchemy_migration_core_uses_the_same_deterministic_mapping(tmp_path):
    from services.content_project_migration import (
        ensure_sqlite_content_project_schema,
        migrate_sqlalchemy_connection,
    )

    database = build_legacy_content_projects_database(tmp_path / "legacy.db")
    raw_connection = sqlite3.connect(database)
    try:
        ensure_sqlite_content_project_schema(raw_connection)
        raw_connection.commit()
    finally:
        raw_connection.close()

    engine = sa.create_engine(f"sqlite:///{database}")
    with engine.begin() as connection:
        migrate_sqlalchemy_connection(connection)

    connection = sqlite3.connect(database)
    try:
        assert table_count(connection, "content_spines") == 5
        assert table_count(connection, "project_workspaces") == 15
        assert table_count(connection, "workspace_versions") == 5
        assert connection.execute(
            "SELECT COUNT(*) FROM project_workspaces WHERE kind IN ('video', 'podcast') AND state = 'uninitialized'"
        ).fetchone()[0] == 10
    finally:
        connection.close()


def test_034_alembic_revision_builds_explicit_non_sqlite_schema(tmp_path, monkeypatch):
    migration_path = (
        Path(__file__).parents[2]
        / "migrations"
        / "versions"
        / "034_add_content_workspaces.py"
    )
    spec = importlib.util.spec_from_file_location("migration_034_non_sqlite", migration_path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)

    class FakeBind:
        dialect = type("Dialect", (), {"name": "postgresql"})()

    class RecordingOperations:
        def __init__(self):
            self.bind = FakeBind()
            self.tables = []
            self.columns = []
            self.foreign_keys = []

        def get_bind(self):
            return self.bind

        def add_column(self, table, column):
            self.columns.append((table, column.name))

        def create_table(self, name, *args, **kwargs):
            self.tables.append(name)

        def create_index(self, *args, **kwargs):
            return None

        def create_foreign_key(self, name, *args, **kwargs):
            self.foreign_keys.append(name)

    operations = RecordingOperations()
    migrated = []
    import services.content_project_migration as migration_service

    monkeypatch.setattr(
        migration_service,
        "migrate_sqlalchemy_connection",
        lambda bind: migrated.append(bind),
    )
    migration.op = operations
    migration.upgrade()

    assert operations.tables == [
        "content_spines",
        "project_workspaces",
        "workspace_versions",
        "content_sync_proposals",
    ]
    assert ("projects", "schema_version") in operations.columns
    assert ("materials", "media_kind") in operations.columns
    assert operations.foreign_keys == ["fk_project_workspaces_current_version_id"]
    assert migrated == [operations.bind]


def test_cutover_flag_migrates_before_flask_opens_the_legacy_database(tmp_path, monkeypatch):
    database = build_legacy_content_projects_database(tmp_path / "legacy.db")
    monkeypatch.setenv("CONTENT_PROJECT_CUTOVER", "true")

    from services.content_project_migration import prepare_content_project_database

    report = prepare_content_project_database(
        f"sqlite:///{database}",
        tmp_path / "legacy-content-project-assets",
        enabled=True,
    )

    assert report["status"] == "migrated"
    connection = sqlite3.connect(database)
    try:
        assert table_count(connection, "project_workspaces") == 15
        assert connection.execute(
            "SELECT COUNT(*) FROM project_workspaces WHERE kind = 'ppt'"
        ).fetchone()[0] == 5
    finally:
        connection.close()


def test_cutover_flag_is_disabled_by_default(tmp_path, monkeypatch):
    database = build_legacy_content_projects_database(tmp_path / "legacy.db")
    monkeypatch.setenv("DATABASE_PATH", str(database))
    monkeypatch.delenv("CONTENT_PROJECT_CUTOVER", raising=False)

    from services.content_project_migration import prepare_content_project_database

    assert prepare_content_project_database(
        f"sqlite:///{database}",
        tmp_path,
        enabled=False,
    ) is None
    connection = sqlite3.connect(database)
    try:
        assert connection.execute(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'project_workspaces'"
        ).fetchone()[0] == 0
    finally:
        connection.close()


def test_desktop_schema_keeps_legacy_columns_only_before_cutover():
    from services.content_project_migration import desktop_legacy_project_columns

    expected = {
        'render_mode',
        'native_theme',
        'native_image_settings',
        'pronunciation_lexicon',
        'narration_preferences',
        'image_aspect_ratio',
    }

    assert set(desktop_legacy_project_columns(cutover_enabled=False)) == expected
    assert desktop_legacy_project_columns(cutover_enabled=True) == {}
