"""Deterministic pre-workspace SQLite database used by migration tests."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path


CREATED_AT = "2026-01-02 03:04:05"
PROJECT_IDS = {
    "blank": "00000000-0000-4000-8000-000000000001",
    "image": "00000000-0000-4000-8000-000000000002",
    "native": "00000000-0000-4000-8000-000000000003",
    "renovation": "00000000-0000-4000-8000-000000000004",
    "complex": "00000000-0000-4000-8000-000000000005",
}


def _id(group: int, item: int) -> str:
    return f"10000000-0000-4{group:03d}-8000-{item:012d}"


def expected_legacy_counts() -> dict[str, int]:
    return {
        "projects": 5,
        "pages": 7,
        "page_image_versions": 4,
        "narration_versions": 1,
        "tasks": 1,
        "materials": 1,
        "reference_files": 1,
    }


def build_legacy_content_projects_database(database_path: Path) -> Path:
    """Create the same rich legacy database for every invocation."""
    database_path = Path(database_path)
    database_path.parent.mkdir(parents=True, exist_ok=True)
    if database_path.exists():
        database_path.unlink()

    assets = database_path.parent / "legacy-content-project-assets"
    assets.mkdir(parents=True, exist_ok=True)
    for name, content in {
        "image-slide.png": b"legacy-image-slide",
        "renovated-slide.png": b"legacy-renovated-slide",
        "complex-slide.png": b"legacy-complex-slide",
        "material.png": b"legacy-material",
        "reference.md": b"# Legacy reference\n\nEvidence.",
        "source-template.png": b"legacy-source-template",
    }.items():
        (assets / name).write_bytes(content)

    connection = sqlite3.connect(database_path)
    connection.execute("PRAGMA foreign_keys = ON")
    connection.executescript(
        """
        CREATE TABLE projects (
            id TEXT PRIMARY KEY, project_title TEXT, idea_prompt TEXT,
            outline_text TEXT, description_text TEXT, extra_requirements TEXT,
            outline_requirements TEXT, description_requirements TEXT,
            creation_type TEXT NOT NULL, render_mode TEXT NOT NULL,
            native_theme TEXT, native_image_settings TEXT,
            pronunciation_lexicon TEXT, narration_preferences TEXT,
            template_image_path TEXT, template_style TEXT, template_pack_id TEXT,
            image_aspect_ratio TEXT NOT NULL, status TEXT NOT NULL,
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE pages (
            id TEXT PRIMARY KEY, project_id TEXT NOT NULL, order_index INTEGER NOT NULL,
            part TEXT, outline_content TEXT, description_content TEXT,
            generated_image_path TEXT, template_image_path TEXT,
            template_selection_source TEXT, narration_text TEXT,
            narration_segments TEXT, current_narration_version_id TEXT,
            narration_locked INTEGER NOT NULL DEFAULT 0,
            narration_revision INTEGER NOT NULL DEFAULT 0,
            native_layout TEXT, native_props TEXT, native_versions TEXT,
            status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
            FOREIGN KEY(project_id) REFERENCES projects(id),
            FOREIGN KEY(current_narration_version_id) REFERENCES narration_versions(id)
        );
        CREATE TABLE page_image_versions (
            id TEXT PRIMARY KEY, page_id TEXT NOT NULL, image_path TEXT NOT NULL,
            version_number INTEGER NOT NULL, is_current INTEGER NOT NULL,
            created_at TEXT NOT NULL, FOREIGN KEY(page_id) REFERENCES pages(id)
        );
        CREATE TABLE narration_versions (
            id TEXT PRIMARY KEY, page_id TEXT NOT NULL, version_number INTEGER NOT NULL,
            mode TEXT NOT NULL, language TEXT NOT NULL, text TEXT NOT NULL,
            segments_json TEXT, source_type TEXT NOT NULL, status TEXT NOT NULL,
            parent_version_id TEXT, content_hash TEXT NOT NULL,
            created_by TEXT NOT NULL, created_at TEXT NOT NULL,
            UNIQUE(page_id, version_number),
            FOREIGN KEY(page_id) REFERENCES pages(id),
            FOREIGN KEY(parent_version_id) REFERENCES narration_versions(id)
        );
        CREATE TABLE tasks (
            id TEXT PRIMARY KEY, project_id TEXT NOT NULL, task_type TEXT NOT NULL,
            status TEXT NOT NULL, progress TEXT, error_message TEXT,
            created_at TEXT NOT NULL, completed_at TEXT,
            FOREIGN KEY(project_id) REFERENCES projects(id)
        );
        CREATE TABLE materials (
            id TEXT PRIMARY KEY, project_id TEXT, filename TEXT NOT NULL,
            relative_path TEXT NOT NULL, url TEXT NOT NULL, caption TEXT,
            original_filename TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
            FOREIGN KEY(project_id) REFERENCES projects(id)
        );
        CREATE TABLE reference_files (
            id TEXT PRIMARY KEY, project_id TEXT, filename TEXT NOT NULL,
            file_path TEXT NOT NULL, file_size INTEGER NOT NULL, file_type TEXT NOT NULL,
            parse_status TEXT NOT NULL, markdown_content TEXT, error_message TEXT,
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
            FOREIGN KEY(project_id) REFERENCES projects(id)
        );
        CREATE TABLE alembic_version (version_num TEXT PRIMARY KEY);
        INSERT INTO alembic_version VALUES ('033_image_scene_fields');
        """
    )

    projects = [
        (PROJECT_IDS["blank"], "空白项目", "", None, None, None, None, None, "idea", "image", None, None, None, None, None, None, None, "16:9", "DRAFT", CREATED_AT, CREATED_AT),
        (PROJECT_IDS["image"], "图片项目", "季度经营复盘", None, None, "突出结论", None, None, "idea", "image", None, None, None, None, None, "冷静专业", "gorden-data-viz-deck", "16:9", "COMPLETED", CREATED_AT, CREATED_AT),
        (PROJECT_IDS["native"], "原生项目", None, "第一章\n第二章", None, None, None, None, "outline", "native", "theme03", json.dumps({"density": "standard"}), None, None, None, None, None, "16:9", "COMPLETED", CREATED_AT, CREATED_AT),
        (PROJECT_IDS["renovation"], "翻新项目", None, None, "旧稿翻新", None, None, None, "descriptions", "image", None, None, None, None, str(assets / "source-template.png"), None, None, "16:9", "COMPLETED", CREATED_AT, CREATED_AT),
        (PROJECT_IDS["complex"], "复杂项目", "供应链韧性", None, None, "面向管理层", "三部分", "引用证据", "idea", "image", None, None, json.dumps([{"source": "AI", "target": "人工智能"}], ensure_ascii=False), json.dumps({"mode": "dialogue"}), None, "编辑部风格", None, "16:9", "GENERATING", CREATED_AT, CREATED_AT),
    ]
    connection.executemany("INSERT INTO projects VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", projects)

    pages = [
        (_id(1, 1), PROJECT_IDS["image"], 0, "经营", json.dumps({"title": "结论"}, ensure_ascii=False), json.dumps({"text": "增长"}, ensure_ascii=False), str(assets / "image-slide.png"), None, None, None, None, None, 0, 0, None, None, None, "COMPLETED", CREATED_AT, CREATED_AT),
        (_id(1, 2), PROJECT_IDS["image"], 1, "经营", json.dumps({"title": "原因"}, ensure_ascii=False), None, None, None, None, None, None, None, 0, 0, None, None, None, "DRAFT", CREATED_AT, CREATED_AT),
        (_id(2, 1), PROJECT_IDS["native"], 0, "第一章", json.dumps({"title": "原生一"}, ensure_ascii=False), None, None, None, None, None, None, None, 0, 0, "core01", json.dumps({"title": "原生一"}, ensure_ascii=False), "[]", "COMPLETED", CREATED_AT, CREATED_AT),
        (_id(2, 2), PROJECT_IDS["native"], 1, "第二章", json.dumps({"title": "原生二"}, ensure_ascii=False), None, None, None, None, None, None, None, 0, 0, "core01", json.dumps({"title": "原生二"}, ensure_ascii=False), "[]", "COMPLETED", CREATED_AT, CREATED_AT),
        (_id(3, 1), PROJECT_IDS["renovation"], 0, None, json.dumps({"title": "翻新"}, ensure_ascii=False), json.dumps({"text": "保留原意"}, ensure_ascii=False), str(assets / "renovated-slide.png"), str(assets / "source-template.png"), "renovation", None, None, None, 0, 0, None, None, None, "COMPLETED", CREATED_AT, CREATED_AT),
        (_id(4, 1), PROJECT_IDS["complex"], 0, "洞察", json.dumps({"title": "风险"}, ensure_ascii=False), json.dumps({"text": "风险证据"}, ensure_ascii=False), str(assets / "complex-slide.png"), None, None, "主持人与嘉宾讨论供应链风险。", json.dumps([{"speaker_id": "host", "text": "欢迎"}, {"speaker_id": "guest", "text": "谢谢"}], ensure_ascii=False), None, 1, 1, None, None, None, "COMPLETED", CREATED_AT, CREATED_AT),
        (_id(4, 2), PROJECT_IDS["complex"], 1, "方案", json.dumps({"title": "行动"}, ensure_ascii=False), None, None, None, None, None, None, None, 0, 0, None, None, None, "DRAFT", CREATED_AT, CREATED_AT),
    ]
    connection.executemany("INSERT INTO pages VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", pages)

    image_versions = [
        (_id(5, 1), _id(1, 1), str(assets / "image-slide.png"), 1, 1, CREATED_AT),
        (_id(5, 2), _id(3, 1), str(assets / "renovated-slide.png"), 1, 1, CREATED_AT),
        (_id(5, 3), _id(4, 1), str(assets / "complex-slide.png"), 1, 0, CREATED_AT),
        (_id(5, 4), _id(4, 1), str(assets / "complex-slide.png"), 2, 1, CREATED_AT),
    ]
    connection.executemany("INSERT INTO page_image_versions VALUES (?,?,?,?,?,?)", image_versions)

    narration_id = _id(6, 1)
    connection.execute(
        "INSERT INTO narration_versions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (narration_id, _id(4, 1), 1, "dialogue", "zh-CN", "主持人与嘉宾讨论供应链风险。", pages[5][10], "legacy", "applied", None, "a" * 64, "migration-fixture", CREATED_AT),
    )
    connection.execute("UPDATE pages SET current_narration_version_id = ? WHERE id = ?", (narration_id, _id(4, 1)))
    connection.execute("INSERT INTO tasks VALUES (?,?,?,?,?,?,?,?)", (_id(7, 1), PROJECT_IDS["complex"], "GENERATE_IMAGES", "RUNNING", json.dumps({"total": 2, "completed": 1, "failed": 0}), None, CREATED_AT, None))
    connection.execute("INSERT INTO materials VALUES (?,?,?,?,?,?,?,?,?)", (_id(8, 1), PROJECT_IDS["complex"], "material.png", str(assets / "material.png"), "/files/material.png", "供应链示意图", "material.png", CREATED_AT, CREATED_AT))
    connection.execute("INSERT INTO reference_files VALUES (?,?,?,?,?,?,?,?,?,?,?)", (_id(9, 1), PROJECT_IDS["complex"], "reference.md", str(assets / "reference.md"), 30, "md", "completed", "# Legacy reference\n\nEvidence.", None, CREATED_AT, CREATED_AT))
    connection.commit()
    connection.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    connection.close()
    return database_path


def read_legacy_counts(database_path: Path) -> dict[str, int]:
    connection = sqlite3.connect(database_path)
    try:
        return {
            table: connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            for table in expected_legacy_counts()
        }
    finally:
        connection.close()


def build_legacy_content_projects_benchmark_database(
    database_path: Path,
    *,
    project_count: int = 100,
    pages_per_project: int = 20,
) -> Path:
    """Expand the semantic fixtures into a deterministic migration benchmark."""
    if project_count < len(PROJECT_IDS) or pages_per_project < 2:
        raise ValueError('benchmark must retain all semantic fixtures and at least two pages')
    database_path = build_legacy_content_projects_database(database_path)
    connection = sqlite3.connect(database_path)
    try:
        projects = connection.execute('SELECT id FROM projects ORDER BY id').fetchall()
        for project_index, (project_id,) in enumerate(projects, start=1):
            current = connection.execute(
                'SELECT COUNT(*) FROM pages WHERE project_id = ?', (project_id,),
            ).fetchone()[0]
            for page_index in range(current, pages_per_project):
                page_id = f'30000000-{project_index:04d}-4000-8000-{page_index + 1:012d}'
                connection.execute(
                    '''INSERT INTO pages VALUES (
                        ?, ?, ?, NULL, ?, ?, NULL, NULL, NULL, NULL, NULL,
                        NULL, 0, 0, NULL, NULL, NULL, 'DRAFT', ?, ?
                    )''',
                    (page_id, project_id, page_index,
                     json.dumps({'title': f'Page {page_index + 1}', 'points': ['baseline']}),
                     json.dumps({'text': 'benchmark'}), CREATED_AT, CREATED_AT),
                )

        for project_index in range(len(projects) + 1, project_count + 1):
            project_id = f'20000000-{project_index:04d}-4000-8000-{project_index:012d}'
            connection.execute(
                'INSERT INTO projects VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                (project_id, f'Benchmark {project_index}', f'Topic {project_index}', None,
                 None, None, None, None, 'idea', 'image', None, None, None, None,
                 None, None, None, '16:9', 'DRAFT', CREATED_AT, CREATED_AT),
            )
            for page_index in range(pages_per_project):
                page_id = f'40000000-{project_index:04d}-4000-8000-{page_index + 1:012d}'
                connection.execute(
                    '''INSERT INTO pages VALUES (
                        ?, ?, ?, NULL, ?, ?, NULL, NULL, NULL, NULL, NULL,
                        NULL, 0, 0, NULL, NULL, NULL, 'DRAFT', ?, ?
                    )''',
                    (page_id, project_id, page_index,
                     json.dumps({'title': f'Page {page_index + 1}', 'points': ['baseline']}),
                     json.dumps({'text': 'benchmark'}), CREATED_AT, CREATED_AT),
                )
        connection.commit()
    finally:
        connection.close()
    return database_path
