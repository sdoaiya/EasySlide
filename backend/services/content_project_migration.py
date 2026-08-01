"""Offline SQLite migration for the unified content-project data model."""

from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable


CONTENT_PROJECT_SCHEMA_VERSION = 1
CONTENT_PROJECT_ALEMBIC_REVISION = '037_remove_legacy_project_fields'
WORKSPACE_KINDS = ('ppt', 'video', 'podcast')
LEGACY_PROJECT_COLUMNS = (
    'idea_prompt', 'outline_text', 'description_text',
    'render_mode', 'native_theme', 'native_image_settings',
    'pronunciation_lexicon', 'narration_preferences', 'image_aspect_ratio',
)
DESKTOP_LEGACY_PROJECT_COLUMN_DEFINITIONS = {
    'render_mode': "VARCHAR(20) NOT NULL DEFAULT 'image'",
    'native_theme': 'VARCHAR(100)',
    'native_image_settings': 'TEXT',
    'pronunciation_lexicon': 'TEXT',
    'narration_preferences': 'TEXT',
    'image_aspect_ratio': "VARCHAR(10) DEFAULT '16:9'",
}
LEGACY_COUNT_TABLES = (
    'projects', 'pages', 'page_image_versions', 'narration_versions',
    'tasks', 'materials', 'reference_files',
)


class MigrationFailure(RuntimeError):
    """Raised when a temporary migration cannot be safely switched in."""


def desktop_legacy_project_columns(*, cutover_enabled: bool) -> dict[str, str]:
    """Return desktop compatibility columns only before the unified cutover."""
    if cutover_enabled:
        return {}
    return dict(DESKTOP_LEGACY_PROJECT_COLUMN_DEFINITIONS)


def prepare_content_project_database(
    database_uri: str,
    upload_folder: str | Path,
    *,
    enabled: bool,
):
    """Run the desktop cutover without importing the Flask application module."""
    if not enabled:
        return None
    from sqlalchemy.engine import make_url

    url = make_url(database_uri)
    if url.get_backend_name() != 'sqlite' or not url.database:
        raise RuntimeError(
            'CONTENT_PROJECT_CUTOVER currently requires a SQLite database. '
            'Use explicit Alembic migration for other database engines.'
        )
    database_path = Path(url.database).resolve()
    if not database_path.exists():
        return None
    return migrate_sqlite_database(
        database_path,
        file_root=Path(upload_folder).resolve(),
    )


def _canonical_json(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def _content_hash(document, settings=None) -> str:
    payload = {'document': document, 'settings': settings or {}}
    return hashlib.sha256(_canonical_json(payload).encode('utf-8')).hexdigest()


def _file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def _logical_database_hash(path: Path) -> str:
    connection = sqlite3.connect(path)
    try:
        dump = '\n'.join(connection.iterdump()).encode('utf-8')
        return hashlib.sha256(dump).hexdigest()
    finally:
        connection.close()


def _table_names(connection: sqlite3.Connection) -> set[str]:
    return {
        row[0] for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        )
    }


def _columns(connection: sqlite3.Connection, table: str) -> set[str]:
    return {row[1] for row in connection.execute(f'PRAGMA table_info({table})')}


def _add_column(connection: sqlite3.Connection, table: str, name: str, definition: str) -> None:
    if name not in _columns(connection, table):
        connection.execute(f'ALTER TABLE {table} ADD COLUMN {name} {definition}')


def ensure_sqlite_content_project_schema(connection: sqlite3.Connection) -> None:
    """Create CP1 tables and additive legacy columns, idempotently."""
    _add_column(connection, 'projects', 'export_extractor_method', 'TEXT')
    _add_column(connection, 'projects', 'export_inpaint_method', 'TEXT')
    _add_column(connection, 'projects', 'export_allow_partial', 'BOOLEAN DEFAULT 0')
    _add_column(connection, 'projects', 'export_high_fidelity_editable', 'BOOLEAN NOT NULL DEFAULT 0')
    _add_column(connection, 'projects', 'enable_icon_subject_extraction', 'BOOLEAN DEFAULT 0')
    _add_column(connection, 'projects', 'schema_version', 'INTEGER NOT NULL DEFAULT 1')
    _add_column(connection, 'projects', 'last_workspace', 'TEXT')
    _add_column(connection, 'projects', 'migration_state', 'TEXT')
    _add_column(connection, 'projects', 'project_settings_json', 'TEXT')
    _add_column(connection, 'materials', 'media_kind', "TEXT NOT NULL DEFAULT 'image'")
    _add_column(connection, 'materials', 'purpose', "TEXT NOT NULL DEFAULT 'image'")
    _add_column(connection, 'materials', 'mime_type', 'TEXT')
    _add_column(connection, 'materials', 'duration_ms', 'INTEGER')
    _add_column(connection, 'materials', 'source_note', 'TEXT')
    _add_column(connection, 'materials', 'license_status', 'TEXT')
    _add_column(connection, 'pages', 'cached_image_path', 'TEXT')
    _add_column(connection, 'pages', 'template_style_text', 'TEXT')
    _add_column(connection, 'pages', 'template_selection_role', 'TEXT')
    _add_column(connection, 'pages', 'template_selection_layout', 'TEXT')
    _add_column(connection, 'pages', 'template_match_reason', 'TEXT')
    _add_column(connection, 'pages', 'narration_source_hash', 'TEXT')
    _add_column(connection, 'pages', 'narration_config_hash', 'TEXT')
    _add_column(connection, 'pages', 'narration_status', 'TEXT')
    _add_column(connection, 'pages', 'narration_audio_manifest', 'TEXT')
    _add_column(connection, 'pages', 'narration_error', 'TEXT')
    _add_column(connection, 'page_image_versions', 'scene_manifest_path', 'TEXT')
    _add_column(connection, 'page_image_versions', 'scene_manifest_sha256', 'TEXT')
    _add_column(connection, 'page_image_versions', 'scene_status', "TEXT NOT NULL DEFAULT 'missing'")
    _add_column(connection, 'page_image_versions', 'scene_quality_score', 'REAL')
    _add_column(connection, 'page_image_versions', 'scene_schema_version', 'INTEGER')
    _add_column(connection, 'page_image_versions', 'scene_error', 'TEXT')
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS content_spines (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL UNIQUE,
            revision INTEGER NOT NULL,
            confirmed_revision INTEGER NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('draft', 'confirmed', 'stale')),
            document_json TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS ix_content_spines_project_id ON content_spines(project_id);

        CREATE TABLE IF NOT EXISTS project_workspaces (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            kind TEXT NOT NULL CHECK(kind IN ('ppt', 'video', 'podcast')),
            state TEXT NOT NULL CHECK(state IN ('uninitialized', 'draft', 'ready', 'stale')),
            stage TEXT,
            revision INTEGER NOT NULL,
            current_version_id TEXT,
            source_kind TEXT NOT NULL CHECK(source_kind IN ('spine', 'ppt', 'migration', 'manual')),
            source_revision INTEGER,
            source_ref TEXT,
            settings_json TEXT,
            document_json TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(project_id, kind),
            FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY(current_version_id) REFERENCES workspace_versions(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS ix_project_workspaces_project_id ON project_workspaces(project_id);

        CREATE TABLE IF NOT EXISTS workspace_versions (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            revision INTEGER NOT NULL,
            document_json TEXT NOT NULL,
            settings_json TEXT,
            content_hash TEXT NOT NULL,
            source_type TEXT NOT NULL CHECK(source_type IN ('manual', 'ai', 'sync', 'migration', 'restore')),
            parent_version_id TEXT,
            created_at TEXT NOT NULL,
            UNIQUE(workspace_id, revision),
            FOREIGN KEY(workspace_id) REFERENCES project_workspaces(id) ON DELETE CASCADE,
            FOREIGN KEY(parent_version_id) REFERENCES workspace_versions(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS ix_workspace_versions_workspace_id ON workspace_versions(workspace_id);

        CREATE TABLE IF NOT EXISTS content_sync_proposals (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            source_kind TEXT NOT NULL CHECK(source_kind IN ('spine', 'ppt', 'video', 'podcast')),
            target_kind TEXT NOT NULL CHECK(target_kind IN ('spine', 'ppt', 'video', 'podcast')),
            source_revision INTEGER NOT NULL,
            target_base_revision INTEGER NOT NULL,
            diff_json TEXT NOT NULL,
            resolution_json TEXT NOT NULL,
            reason TEXT,
            status TEXT NOT NULL CHECK(status IN ('pending', 'partially_applied', 'applied', 'rejected', 'stale')),
            created_at TEXT NOT NULL,
            resolved_at TEXT,
            FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS ix_content_sync_proposals_project_id ON content_sync_proposals(project_id);

        CREATE TABLE IF NOT EXISTS workspace_generation_runs (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            target_workspace_kind TEXT NOT NULL CHECK(target_workspace_kind IN ('video', 'podcast')),
            source_kind TEXT NOT NULL CHECK(source_kind IN ('brief', 'ppt')),
            source_workspace_id TEXT,
            source_version_id TEXT,
            source_revision INTEGER NOT NULL,
            source_snapshot_json TEXT NOT NULL,
            source_snapshot_hash TEXT NOT NULL,
            parent_run_id TEXT,
            mode TEXT NOT NULL CHECK(mode IN ('direct', 'preserve', 'ai_adapt')),
            operation TEXT NOT NULL CHECK(operation IN ('generate', 'polish', 'shorten', 'expand', 'regenerate')),
            options_json TEXT,
            candidate_document_json TEXT,
            candidate_hash TEXT,
            status TEXT NOT NULL CHECK(status IN ('PENDING', 'RUNNING', 'PAUSED', 'REVIEW_READY', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED', 'STALE')),
            task_id TEXT,
            target_workspace_id TEXT NOT NULL,
            published_version_id TEXT,
            error_code TEXT,
            error_message TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            published_at TEXT,
            FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS ix_workspace_generation_runs_project_id ON workspace_generation_runs(project_id);
        CREATE INDEX IF NOT EXISTS ix_workspace_generation_runs_task_id ON workspace_generation_runs(task_id);
        CREATE INDEX IF NOT EXISTS ix_workspace_generation_runs_parent_run_id ON workspace_generation_runs(parent_run_id);
        CREATE INDEX IF NOT EXISTS ix_workspace_generation_runs_project_target_status
            ON workspace_generation_runs(project_id, target_workspace_kind, status);

        CREATE TABLE IF NOT EXISTS orphan_task_archive (
            original_task_id TEXT PRIMARY KEY,
            original_project_id TEXT NOT NULL,
            task_type TEXT NOT NULL,
            status TEXT NOT NULL,
            progress TEXT,
            error_message TEXT,
            created_at TEXT NOT NULL,
            completed_at TEXT,
            archived_at TEXT NOT NULL,
            reason TEXT NOT NULL
        );
        """
    )
    _add_column(connection, 'project_workspaces', 'stage', 'TEXT')


def _stable_id(project_id: str, object_kind: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f'easyslide:{project_id}:{object_kind}'))


def _row_value(row, field: str, fallback=None):
    mapping = row._mapping if hasattr(row, '_mapping') else row
    try:
        value = mapping[field]
    except (KeyError, TypeError, IndexError):
        return fallback
    return fallback if value is None else value


def _project_sources(project, references) -> list[dict]:
    sources = []
    for field, kind in (
        ('idea_prompt', 'prompt'),
        ('outline_text', 'outline'),
        ('description_text', 'description'),
    ):
        value = _row_value(project, field)
        if value:
            sources.append({
                'source_id': f'project.{field}', 'kind': kind,
                'ref': f'projects/{project["id"]}/{field}', 'title': field,
                'content': str(value),
            })
    for row in references:
        reference_id = _row_value(row, 'id')
        sources.append({
            'source_id': f'reference.{reference_id}', 'kind': 'reference_file',
            'ref': reference_id, 'title': _row_value(row, 'filename', ''),
        })
    return sources


def _content_spine_document(project, pages, references) -> dict:
    topic = (
        _row_value(project, 'idea_prompt')
        or _row_value(project, 'project_title')
        or 'Untitled project'
    )
    sections = []
    for index, row in enumerate(pages):
        outline_content = _row_value(row, 'outline_content')
        try:
            outline = json.loads(outline_content) if outline_content else {}
        except (TypeError, json.JSONDecodeError):
            outline = {}
        title = outline.get('title') if isinstance(outline, dict) else None
        sections.append({
            'section_id': f'section.{_row_value(row, "id")}',
            'title': title or f'Section {index + 1}',
            'summary': '',
            'key_points': outline.get('points', []) if isinstance(outline, dict) else [],
            'fact_refs': [],
            'source_refs': [],
        })
    return {
        'schema_version': 1,
        'topic': {'value': topic, 'needs_confirmation': not bool(_row_value(project, 'idea_prompt'))},
        'audience': {'value': '', 'needs_confirmation': True},
        'goal': {'value': '', 'needs_confirmation': True},
        'sources': _project_sources(project, references),
        'research': [],
        'viewpoints': [],
        'facts': [],
        'sections': sections,
        'narrative': {
            'opening': '',
            'progression': [section['section_id'] for section in sections],
            'conclusion': '',
        },
        'needs_confirmation': ['/audience', '/goal'],
    }


def _json_value(project, field: str, fallback):
    raw_value = _row_value(project, field)
    if not raw_value:
        return fallback
    try:
        value = json.loads(raw_value)
        return value
    except (TypeError, json.JSONDecodeError):
        return fallback


def _project_migration_rows(project, pages, references, now):
    """Build deterministic rows shared by SQLite and explicit Alembic paths."""
    project_id = _row_value(project, 'id')
    spine = _content_spine_document(project, pages, references)
    spine_json = _canonical_json(spine)
    project_settings = {
        'pronunciation_lexicon': _json_value(project, 'pronunciation_lexicon', []),
        'narration_preferences': _json_value(project, 'narration_preferences', {}),
    }
    page_ids = [_row_value(row, 'id') for row in pages]
    ppt_document = {'schema_version': 1, 'page_refs': page_ids}
    ppt_settings = {
        'render_mode': _row_value(project, 'render_mode', 'image'),
        'native_theme': _row_value(project, 'native_theme'),
        'native_image_settings': _json_value(project, 'native_image_settings', {}),
        'image_aspect_ratio': _row_value(project, 'image_aspect_ratio', '16:9'),
    }
    ready_statuses = {'COMPLETED', 'NATIVE_DECK_GENERATED', 'IMAGES_GENERATED'}
    ppt_state = 'ready' if _row_value(project, 'status') in ready_statuses else 'draft'
    workspaces = []
    version = None
    for kind in WORKSPACE_KINDS:
        workspace_id = _stable_id(project_id, f'workspace:{kind}')
        is_ppt = kind == 'ppt'
        document = ppt_document if is_ppt else None
        settings = ppt_settings if is_ppt else {}
        workspaces.append({
            'id': workspace_id,
            'project_id': project_id,
            'kind': kind,
            'state': ppt_state if is_ppt else 'uninitialized',
            'stage': _row_value(project, 'status', 'DRAFT') if is_ppt else None,
            'revision': 1 if is_ppt else 0,
            'current_version_id': None,
            'source_kind': 'migration',
            'source_revision': 1,
            'source_ref': project_id,
            'settings_json': _canonical_json(settings),
            'document_json': _canonical_json(document) if document is not None else None,
            'created_at': now,
            'updated_at': now,
        })
        if is_ppt:
            version_id = _stable_id(project_id, 'workspace:ppt:version:1')
            version = {
                'id': version_id,
                'workspace_id': workspace_id,
                'revision': 1,
                'document_json': _canonical_json(document),
                'settings_json': _canonical_json(settings),
                'content_hash': _content_hash(document, settings),
                'source_type': 'migration',
                'parent_version_id': None,
                'created_at': now,
            }
            workspaces[-1]['current_version_id'] = version_id
    return {
        'spine': {
            'id': _stable_id(project_id, 'spine'),
            'project_id': project_id,
            'revision': 1,
            'confirmed_revision': 0,
            'status': 'draft',
            'document_json': spine_json,
            'content_hash': hashlib.sha256(spine_json.encode('utf-8')).hexdigest(),
            'created_at': now,
            'updated_at': now,
        },
        'project_settings_json': _canonical_json(project_settings),
        'workspaces': workspaces,
        'version': version,
    }


def _migrate_project(connection: sqlite3.Connection, project: sqlite3.Row, now: str) -> None:
    project_id = _row_value(project, 'id')
    existing = connection.execute(
        'SELECT COUNT(*) FROM project_workspaces WHERE project_id = ?', (project_id,),
    ).fetchone()[0]
    if existing == 3:
        connection.execute(
            "UPDATE project_workspaces SET stage = ? WHERE project_id = ? AND kind = 'ppt' AND stage IS NULL",
            (_row_value(project, 'status', 'DRAFT'), project_id),
        )
        connection.execute(
            "UPDATE projects SET schema_version = 1, last_workspace = COALESCE(last_workspace, 'ppt'), migration_state = 'migrated', status = 'active' WHERE id = ?",
            (project_id,),
        )
        return
    if existing:
        raise ValueError(f'project {project_id} has partial workspace migration')

    pages = connection.execute(
        'SELECT id, outline_content, description_content FROM pages WHERE project_id = ? ORDER BY order_index',
        (project_id,),
    ).fetchall()
    references = []
    if 'reference_files' in _table_names(connection):
        references = connection.execute(
            'SELECT id, filename FROM reference_files WHERE project_id = ? ORDER BY id',
            (project_id,),
        ).fetchall()
    rows = _project_migration_rows(project, pages, references, now)
    spine = rows['spine']
    connection.execute(
        'INSERT INTO content_spines VALUES (?, ?, 1, 0, ?, ?, ?, ?, ?)',
        (spine['id'], project_id, spine['status'], spine['document_json'],
         spine['content_hash'], now, now),
    )
    connection.execute(
        "UPDATE projects SET schema_version = 1, last_workspace = 'ppt', migration_state = 'migrated', project_settings_json = ?, status = 'active' WHERE id = ?",
        (rows['project_settings_json'], project_id),
    )
    for workspace in rows['workspaces']:
        connection.execute(
            '''INSERT INTO project_workspaces (
                id, project_id, kind, state, stage, revision, current_version_id,
                source_kind, source_revision, source_ref, settings_json,
                document_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'migration', 1, ?, ?, ?, ?, ?)''',
            (workspace['id'], project_id, workspace['kind'], workspace['state'],
             workspace['stage'], workspace['revision'], project_id, workspace['settings_json'],
             workspace['document_json'], now, now),
        )
        if workspace['kind'] == 'ppt':
            version = rows['version']
            connection.execute(
                '''INSERT INTO workspace_versions (
                    id, workspace_id, revision, document_json, settings_json,
                    content_hash, source_type, parent_version_id, created_at
                ) VALUES (?, ?, 1, ?, ?, ?, 'migration', NULL, ?)''',
                (version['id'], workspace['id'], version['document_json'],
                 version['settings_json'], version['content_hash'], now),
            )
            connection.execute(
                'UPDATE project_workspaces SET current_version_id = ? WHERE id = ?',
                (version['id'], workspace['id']),
            )


def migrate_sqlalchemy_connection(connection) -> None:
    """Migrate legacy rows through SQLAlchemy Core for non-SQLite Alembic binds."""
    from sqlalchemy import MetaData, func, select, update

    metadata = MetaData()
    metadata.reflect(bind=connection)
    tables = metadata.tables
    required = {'projects', 'pages', 'materials', 'content_spines',
                'project_workspaces', 'workspace_versions'}
    missing = required - set(tables)
    if missing:
        raise ValueError(f'missing migration tables: {", ".join(sorted(missing))}')
    projects = tables['projects']
    pages = tables['pages']
    references = tables.get('reference_files')
    workspaces = tables['project_workspaces']
    versions = tables['workspace_versions']
    spines = tables['content_spines']
    now = (
        datetime.now(timezone.utc).isoformat()
        if connection.dialect.name == 'sqlite'
        else datetime.utcnow()
    )

    for project in connection.execute(select(projects).order_by(projects.c.id)).mappings():
        project_id = project['id']
        existing = connection.execute(
            select(workspaces.c.id).where(workspaces.c.project_id == project_id)
        ).all()
        if len(existing) == 3:
            connection.execute(
                update(projects).where(projects.c.id == project_id).values(
                    schema_version=1,
                    last_workspace=project.get('last_workspace') or 'ppt',
                    migration_state='migrated',
                    status='active',
                )
            )
            continue
        if existing:
            raise ValueError(f'project {project_id} has partial workspace migration')
        page_rows = connection.execute(
            select(pages).where(pages.c.project_id == project_id).order_by(pages.c.order_index)
        ).mappings().all()
        reference_rows = []
        if references is not None:
            reference_rows = connection.execute(
                select(references).where(references.c.project_id == project_id).order_by(references.c.id)
            ).mappings().all()
        rows = _project_migration_rows(project, page_rows, reference_rows, now)
        connection.execute(spines.insert().values(**rows['spine']))
        connection.execute(
            update(projects).where(projects.c.id == project_id).values(
                schema_version=1,
                last_workspace='ppt',
                migration_state='migrated',
                project_settings_json=rows['project_settings_json'],
                status='active',
            )
        )
        for workspace_row in rows['workspaces']:
            workspace = dict(workspace_row)
            initial_current_version = workspace.pop('current_version_id')
            connection.execute(workspaces.insert().values(**workspace))
            if workspace['kind'] == 'ppt':
                connection.execute(versions.insert().values(**rows['version']))
                connection.execute(
                    update(workspaces).where(workspaces.c.id == workspace['id']).values(
                        current_version_id=initial_current_version,
                    )
                )
    materials = tables['materials']
    connection.execute(
        update(materials).values(
            media_kind=func.coalesce(materials.c.media_kind, 'image'),
            purpose=func.coalesce(materials.c.purpose, 'image'),
        )
    )


def _archive_orphan_tasks(connection: sqlite3.Connection, archived_at: str) -> int:
    rows = connection.execute(
        '''SELECT t.id, t.project_id, t.task_type, t.status, t.progress,
                  t.error_message, t.created_at, t.completed_at
           FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
           WHERE p.id IS NULL ORDER BY t.id'''
    ).fetchall()
    if not rows:
        return 0
    connection.executemany(
        '''INSERT OR REPLACE INTO orphan_task_archive (
               original_task_id, original_project_id, task_type, status,
               progress, error_message, created_at, completed_at,
               archived_at, reason
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
        [tuple(row) + (archived_at, 'missing_project') for row in rows],
    )
    connection.executemany('DELETE FROM tasks WHERE id = ?', [(row[0],) for row in rows])
    return len(rows)


def _drop_legacy_project_columns(connection: sqlite3.Connection) -> None:
    columns = _columns(connection, 'projects')
    for name in LEGACY_PROJECT_COLUMNS:
        if name in columns:
            connection.execute(f'ALTER TABLE projects DROP COLUMN {name}')


def migrate_connection(connection: sqlite3.Connection, *, update_alembic: bool = True) -> int:
    """Apply the additive schema and deterministic legacy mapping in one transaction."""
    connection.row_factory = sqlite3.Row
    connection.execute('PRAGMA foreign_keys = ON')
    ensure_sqlite_content_project_schema(connection)
    now = datetime.now(timezone.utc).isoformat()
    archived_orphan_tasks = _archive_orphan_tasks(connection, now)
    for project in connection.execute('SELECT * FROM projects ORDER BY id').fetchall():
        _migrate_project(connection, project, now)
    connection.execute("UPDATE materials SET media_kind = COALESCE(media_kind, 'image'), purpose = COALESCE(purpose, 'image')")
    _drop_legacy_project_columns(connection)
    if update_alembic and 'alembic_version' in _table_names(connection):
        connection.execute('UPDATE alembic_version SET version_num = ?', (CONTENT_PROJECT_ALEMBIC_REVISION,))
    return archived_orphan_tasks


def _counts(connection: sqlite3.Connection, tables) -> dict[str, int]:
    existing = _table_names(connection)
    return {
        table: connection.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]
        for table in tables if table in existing
    }


def _foreign_key_errors(connection: sqlite3.Connection) -> list[tuple]:
    return [tuple(row) for row in connection.execute('PRAGMA foreign_key_check')]


def _resolve_file(database_path: Path, value: str, file_root: Path | None = None) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path
    candidates = [database_path.parent / path]
    if file_root is not None:
        candidates.append(file_root / path)
    return next((candidate for candidate in candidates if candidate.exists()), candidates[0])


def _validate_file_references(
    connection: sqlite3.Connection,
    database_path: Path,
    file_root: Path | None = None,
) -> int:
    checks = (
        ('projects', ('template_image_path',)),
        ('pages', ('generated_image_path', 'cached_image_path', 'template_image_path')),
        ('page_image_versions', ('image_path', 'scene_manifest_path')),
        ('materials', ('relative_path',)),
        ('reference_files', ('file_path',)),
    )
    tables = _table_names(connection)
    checked = 0
    for table, requested_columns in checks:
        if table not in tables:
            continue
        available = [column for column in requested_columns if column in _columns(connection, table)]
        if not available:
            continue
        for row in connection.execute(f"SELECT {', '.join(available)} FROM {table}"):
            for value in row:
                if value:
                    checked += 1
                    if not _resolve_file(database_path, value, file_root).exists():
                        raise ValueError(f'missing file reference: {table}.{value}')
    return checked


def _validate_version_ownership(connection: sqlite3.Connection) -> int:
    invalid_workspace_pointers = connection.execute(
        '''SELECT COUNT(*) FROM project_workspaces w
           JOIN workspace_versions v ON v.id = w.current_version_id
           WHERE v.workspace_id != w.id'''
    ).fetchone()[0]
    if invalid_workspace_pointers:
        raise ValueError('current workspace version belongs to another workspace')

    checked = connection.execute(
        'SELECT COUNT(*) FROM project_workspaces WHERE current_version_id IS NOT NULL'
    ).fetchone()[0]
    if {'pages', 'narration_versions'} <= _table_names(connection):
        page_columns = _columns(connection, 'pages')
        if 'current_narration_version_id' in page_columns:
            invalid_narration_pointers = connection.execute(
                '''SELECT COUNT(*) FROM pages p
                   JOIN narration_versions v ON v.id = p.current_narration_version_id
                   WHERE v.page_id != p.id'''
            ).fetchone()[0]
            if invalid_narration_pointers:
                raise ValueError('current narration version belongs to another page')
            checked += connection.execute(
                'SELECT COUNT(*) FROM pages WHERE current_narration_version_id IS NOT NULL'
            ).fetchone()[0]
    return checked


def _validate_content_hashes(connection: sqlite3.Connection) -> int:
    checked = 0
    for row in connection.execute('SELECT id, document_json, content_hash FROM content_spines'):
        document = json.loads(row[1])
        actual = hashlib.sha256(_canonical_json(document).encode('utf-8')).hexdigest()
        if actual != row[2]:
            raise ValueError(f'content spine hash mismatch: {row[0]}')
        checked += 1
    for row in connection.execute(
        'SELECT id, document_json, settings_json, content_hash FROM workspace_versions'
    ):
        document = json.loads(row[1])
        settings = json.loads(row[2] or '{}')
        if _content_hash(document, settings) != row[3]:
            raise ValueError(f'workspace version hash mismatch: {row[0]}')
        checked += 1
    return checked


def _project_validation_summaries(connection: sqlite3.Connection) -> list[dict]:
    summaries = []
    for row in connection.execute(
        '''SELECT p.id, s.status, s.document_json
           FROM projects p JOIN content_spines s ON s.project_id = p.id
           ORDER BY p.id'''
    ):
        document = json.loads(row[2])
        workspaces = connection.execute(
            '''SELECT kind, state, stage, revision FROM project_workspaces
               WHERE project_id = ? ORDER BY kind''',
            (row[0],),
        ).fetchall()
        summaries.append({
            'project_id': row[0],
            'spine_status': row[1],
            'needs_confirmation_count': len(document.get('needs_confirmation') or []),
            'workspaces': [
                {'kind': item[0], 'state': item[1], 'stage': item[2], 'revision': item[3]}
                for item in workspaces
            ],
        })
    return summaries


def _resolve_download_url(file_root: Path, value: str) -> Path:
    prefix = '/files/'
    if not value.startswith(prefix):
        raise ValueError(f'unsupported task file URL: {value}')
    root = file_root.resolve()
    candidate = (root / value[len(prefix):]).resolve()
    if os.path.commonpath([str(root), str(candidate)]) != str(root):
        raise ValueError(f'task file reference escapes upload root: {value}')
    return candidate


def _validate_task_references(
    connection: sqlite3.Connection,
    database_path: Path,
    file_root: Path | None,
) -> tuple[int, list[dict]]:
    checked = 0
    missing_completed_exports = []
    for task_id, task_status, raw_progress in connection.execute(
        'SELECT id, status, progress FROM tasks WHERE progress IS NOT NULL'
    ):
        try:
            progress = json.loads(raw_progress)
        except (TypeError, json.JSONDecodeError) as exc:
            raise ValueError(f'invalid task progress JSON: {task_id}') from exc
        if not isinstance(progress, dict):
            raise ValueError(f'invalid task progress object: {task_id}')
        kwargs = progress.get('_resume', {}).get('kwargs', {})
        for path_key, hash_key in (
            ('snapshot_path', 'snapshot_hash'),
            ('narration_snapshot_path', 'narration_snapshot_hash'),
        ):
            value = kwargs.get(path_key)
            if not value:
                continue
            path = _resolve_file(database_path, value, file_root)
            if not path.is_file():
                raise ValueError(f'missing task snapshot: {task_id}.{path_key}')
            expected_hash = kwargs.get(hash_key)
            if expected_hash and _file_hash(path) != expected_hash:
                raise ValueError(f'task snapshot hash mismatch: {task_id}.{path_key}')
            checked += 1
        for sequence in kwargs.get('frame_sequences') or []:
            for value in sequence:
                if not _resolve_file(database_path, value, file_root).is_file():
                    raise ValueError(f'missing task frame: {task_id}.{value}')
                checked += 1
        if file_root is None:
            continue
        urls = []
        if progress.get('download_url'):
            urls.append(progress['download_url'])
        sidecars = progress.get('sidecars') or {}
        if isinstance(sidecars, dict):
            urls.extend(sidecars.values())
        for value in urls:
            exists = isinstance(value, str) and _resolve_download_url(file_root, value).is_file()
            if not exists:
                if task_status == 'COMPLETED':
                    missing_completed_exports.append({'task_id': task_id, 'url': value})
                    continue
                raise ValueError(f'missing task export reference: {task_id}.{value}')
            checked += 1
    return checked, missing_completed_exports


def validate_migrated_connection(
    connection: sqlite3.Connection,
    database_path: Path,
    before_counts: dict[str, int],
    file_root: Path | None = None,
    validation_report: dict | None = None,
    archived_orphan_tasks: int = 0,
) -> dict[str, int]:
    after_counts = _counts(connection, (*LEGACY_COUNT_TABLES, 'content_spines', 'project_workspaces', 'workspace_versions', 'content_sync_proposals'))
    for table, count in before_counts.items():
        preserved_count = after_counts.get(table, 0)
        if table == 'tasks':
            preserved_count += archived_orphan_tasks
        if preserved_count != count:
            raise ValueError(f'count mismatch for {table}: {count} -> {after_counts.get(table)}')
    if archived_orphan_tasks:
        archive_count = connection.execute('SELECT COUNT(*) FROM orphan_task_archive').fetchone()[0]
        if archive_count < archived_orphan_tasks:
            raise ValueError('orphan task archive count mismatch')
    project_count = after_counts.get('projects', 0)
    if after_counts.get('content_spines') != project_count:
        raise ValueError('content spine count mismatch')
    if after_counts.get('project_workspaces') != project_count * 3:
        raise ValueError('workspace count mismatch')
    missing_ppt_stages = connection.execute(
        "SELECT COUNT(*) FROM project_workspaces WHERE kind = 'ppt' AND stage IS NULL"
    ).fetchone()[0]
    if missing_ppt_stages:
        raise ValueError('PPT workspace stage is missing')
    duplicates = connection.execute(
        '''SELECT project_id, kind FROM project_workspaces
           GROUP BY project_id, kind HAVING COUNT(*) > 1'''
    ).fetchall()
    if duplicates:
        raise ValueError('duplicate project workspace kind')
    broken_pointers = connection.execute(
        '''SELECT COUNT(*) FROM project_workspaces w
           LEFT JOIN workspace_versions v ON v.id = w.current_version_id
           WHERE w.current_version_id IS NOT NULL AND v.id IS NULL'''
    ).fetchone()[0]
    if broken_pointers:
        raise ValueError('missing current workspace version')
    foreign_key_errors = _foreign_key_errors(connection)
    if foreign_key_errors:
        raise ValueError(f'foreign key validation failed: {foreign_key_errors[:3]}')
    reference_count = _validate_file_references(connection, database_path, file_root)
    ownership_count = _validate_version_ownership(connection)
    hash_count = _validate_content_hashes(connection)
    task_reference_count, missing_completed_exports = _validate_task_references(
        connection, database_path, file_root,
    )
    if validation_report is not None:
        validation_report['reference_checks'] = {
            'direct_file_references': reference_count,
            'task_references': task_reference_count,
            'missing_completed_exports': missing_completed_exports,
        }
        validation_report['hash_checks'] = {'content_records': hash_count}
        validation_report['ownership_checks'] = {'current_version_pointers': ownership_count}
        validation_report['projects'] = _project_validation_summaries(connection)
    return after_counts


def _sqlite_backup(source_path: Path, target_path: Path) -> None:
    source = sqlite3.connect(source_path)
    target = sqlite3.connect(target_path)
    try:
        source.backup(target)
    finally:
        target.close()
        source.close()


def migrate_sqlite_database(
    database_path: Path,
    *,
    backup_dir: Path | None = None,
    file_root: Path | None = None,
    fault_injector: Callable[[str], None] | None = None,
) -> dict:
    """Migrate a temporary copy, validate it, then atomically replace the source."""
    database_path = Path(database_path).resolve()
    if not database_path.is_file():
        raise MigrationFailure(f'database does not exist: {database_path}')
    report_path = database_path.with_suffix(database_path.suffix + '.content-project-migration.json')
    fault = fault_injector or (lambda _step: None)
    source_hash = _file_hash(database_path)
    report = {
        'status': 'failed',
        'database_path': str(database_path),
        'source_sha256': source_hash,
        'source_logical_sha256': None,
        'backup_path': None,
        'backup_sha256': None,
        'backup_logical_sha256': None,
        'before_counts': {},
        'after_counts': {},
        'before_foreign_key_errors': [],
        'after_foreign_key_errors': [],
        'projects': [],
        'reference_checks': {},
        'hash_checks': {},
        'ownership_checks': {},
        'archived_orphan_tasks': 0,
        'failed_projects': [],
        'report_path': str(report_path),
        'error': None,
    }
    temporary_path = database_path.parent / f'.{database_path.name}.{uuid.uuid4().hex}.migrating'
    try:
        source = sqlite3.connect(database_path)
        source.row_factory = sqlite3.Row
        try:
            tables = _table_names(source)
            project_count = source.execute('SELECT COUNT(*) FROM projects').fetchone()[0]
            already_migrated = (
                'project_workspaces' in tables
                and 'orphan_task_archive' in tables
                and 'stage' in _columns(source, 'project_workspaces')
                and not (set(LEGACY_PROJECT_COLUMNS) & _columns(source, 'projects'))
                and 'schema_version' in _columns(source, 'projects')
                and source.execute(
                    'SELECT COUNT(*) FROM projects WHERE schema_version != ?',
                    (CONTENT_PROJECT_SCHEMA_VERSION,),
                ).fetchone()[0] == 0
                and source.execute('SELECT COUNT(*) FROM project_workspaces').fetchone()[0]
                == project_count * 3
                and (
                    'alembic_version' not in tables
                    or source.execute('SELECT version_num FROM alembic_version').fetchone()[0]
                    == CONTENT_PROJECT_ALEMBIC_REVISION
                )
                and not _foreign_key_errors(source)
            )
            if already_migrated:
                report['before_counts'] = _counts(source, LEGACY_COUNT_TABLES)
                report['before_foreign_key_errors'] = _foreign_key_errors(source)
                report['after_counts'] = validate_migrated_connection(
                    source, database_path, report['before_counts'],
                    Path(file_root).resolve() if file_root else None,
                    report,
                )
                report['after_foreign_key_errors'] = _foreign_key_errors(source)
                report['source_logical_sha256'] = _logical_database_hash(database_path)
                report['status'] = 'already_migrated'
                report_path.write_text(
                    json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8'
                )
                return report
        finally:
            source.close()

        timestamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        backup_root = Path(backup_dir).resolve() if backup_dir else database_path.parent / 'backups'
        backup_root.mkdir(parents=True, exist_ok=True)
        backup_path = backup_root / f'{database_path.stem}.{timestamp}.pre-content-project.db'
        report['backup_path'] = str(backup_path)
        fault('before_backup')
        _sqlite_backup(database_path, backup_path)
        backup_hash = _file_hash(backup_path)
        source_logical_hash = _logical_database_hash(database_path)
        backup_logical_hash = _logical_database_hash(backup_path)
        report['backup_sha256'] = backup_hash
        report['source_logical_sha256'] = source_logical_hash
        report['backup_logical_sha256'] = backup_logical_hash
        if backup_logical_hash != source_logical_hash:
            raise ValueError('backup logical SHA-256 does not match source database')
        fault('after_backup')
        _sqlite_backup(database_path, temporary_path)

        connection = sqlite3.connect(temporary_path)
        connection.row_factory = sqlite3.Row
        try:
            report['before_counts'] = _counts(connection, LEGACY_COUNT_TABLES)
            report['before_foreign_key_errors'] = _foreign_key_errors(connection)
            orphan_tasks = [
                error for error in report['before_foreign_key_errors']
                if error[0] == 'tasks' and error[2] == 'projects'
            ]
            unexpected_errors = [
                error for error in report['before_foreign_key_errors']
                if error not in orphan_tasks
            ]
            if unexpected_errors:
                raise ValueError(
                    'preexisting foreign key validation failed: '
                    f'{unexpected_errors[:3]}'
                )
            with connection:
                report['archived_orphan_tasks'] = migrate_connection(connection)
            fault('after_migration')
            report['after_counts'] = validate_migrated_connection(
                connection, database_path, report['before_counts'],
                Path(file_root).resolve() if file_root else None,
                report,
                report['archived_orphan_tasks'],
            )
            report['after_foreign_key_errors'] = _foreign_key_errors(connection)
        finally:
            connection.close()
        fault('after_validation')
        fault('before_switch')
        os.replace(temporary_path, database_path)
        report['status'] = 'migrated'
        report['error'] = None
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        return report
    except Exception as exc:
        if temporary_path.exists():
            temporary_path.unlink()
        report['error'] = str(exc)
        report['failed_projects'].append({'project_id': None, 'error': str(exc)})
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        raise MigrationFailure(str(exc)) from exc


def verify_sqlite_database_copy(
    database_path: Path,
    *,
    output_dir: Path,
    file_root: Path | None = None,
) -> dict:
    """Migrate and validate an isolated copy while proving the source is unchanged."""
    source = Path(database_path).resolve()
    if not source.is_file():
        raise MigrationFailure(f'database does not exist: {source}')
    destination_root = Path(output_dir).resolve()
    destination_root.mkdir(parents=True, exist_ok=True)
    verification_copy = destination_root / f'{source.stem}.{uuid.uuid4().hex}.verification{source.suffix}'
    source_hash = _file_hash(source)
    _sqlite_backup(source, verification_copy)
    try:
        report = migrate_sqlite_database(
            verification_copy,
            backup_dir=destination_root / 'backups',
            file_root=file_root,
        )
    finally:
        current_source_hash = _file_hash(source)
        if current_source_hash != source_hash:
            raise MigrationFailure('source database changed during copy verification')
    report['verification_copy_path'] = str(verification_copy)
    report['source_unchanged_sha256'] = current_source_hash
    Path(report['report_path']).write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding='utf-8',
    )
    return report


def _main() -> int:
    import argparse

    parser = argparse.ArgumentParser(description='Verify the content-project migration on an isolated SQLite copy.')
    parser.add_argument('database_path', type=Path)
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--file-root', type=Path)
    args = parser.parse_args()
    report = verify_sqlite_database_copy(
        args.database_path,
        output_dir=args.output_dir,
        file_root=args.file_root,
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(_main())
